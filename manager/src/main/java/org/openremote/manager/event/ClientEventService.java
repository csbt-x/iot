/*
 * Copyright 2016, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.openremote.manager.event;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.openremote.container.Container;
import org.openremote.container.ContainerService;
import org.openremote.container.message.MessageBrokerService;
import org.openremote.container.security.AuthContext;
import org.openremote.container.timer.TimerService;
import org.openremote.container.web.ConnectionConstants;
import org.openremote.manager.concurrent.ManagerExecutorService;
import org.openremote.manager.gateway.GatewayService;
import org.openremote.manager.mqtt.MqttBrokerService;
import org.openremote.manager.security.ManagerIdentityService;
import org.openremote.model.Constants;
import org.openremote.model.event.shared.*;
import org.openremote.model.syslog.SyslogEvent;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.logging.Logger;

import static org.apache.camel.builder.PredicateBuilder.*;
import static org.openremote.manager.gateway.GatewayService.isGatewayClientId;

/**
 * Receives and publishes messages, handles the client/server event bus.
 * <p>
 * Messages always start with a message discriminator in all uppercase letters, followed
 * by an optional JSON payload.
 * <p>
 * The following messages can be sent by a client:
 * <dl>
 * <dt><code>SUBSCRIBE:{...}</code><dt>
 * <dd><p>
 * The payload is a serialized representation of {@link EventSubscription} with an optional
 * {@link org.openremote.model.event.shared.EventFilter}. Clients can subscribe to receive {@link SharedEvent}s
 * when they are published on the server. Subscriptions are handled by {@link SharedEvent#getEventType}, there
 * can only be one active subscription for a particular event type and any new subscription for the same event
 * type will replace any currently active subscription. The <code>SUBSCRIBE</code> message must be send
 * repeatedly to renew the subscription,or the server will expire the subscription. The default expiration
 * time is {@link EventSubscription#RENEWAL_PERIOD_SECONDS}; it is recommended clients renew the subscription
 * in shorter periods to allow for processing time of the renewal.
 * </p></dd>
 * <dt><code>UNSUBSCRIBE:{...}</code></dt>
 * <dd><p>
 * The payload is a serialized representation of {@link CancelEventSubscription}. If a client
 * does not want to wait for expiration of its subscriptions, it can cancel a subscription.
 * </p></dd>
 * <dt><code>EVENT:{...}</code></dt>
 * <dd><p>
 * The payload is a serialized representation of a subtype of {@link SharedEvent}. If the server
 * does not recognize the event, it is silently ignored.
 * </p></dd>
 * </dl>
 * <p>
 * The following messages can be published/returned by the server:
 * <dl>
 * <dt><code>UNAUTHORIZED:{...}</code></dt>
 * <dd><p>
 * The payload is a serialized representation of {@link UnauthorizedEventSubscription}.
 * </p></dd>
 * <dt><code>EVENT:{...}</code></dt>
 * <dd><p>
 * The payload is a serialized representation of a subtype of {@link SharedEvent}.
 * </p></dd>
 * <dt><code>EVENT:[...]</code></dt>
 * <dd><p>
 * The payload is an array of {@link SharedEvent}s.
 * </p></dd>
 * </dl>
 */
public class ClientEventService implements ContainerService {

    private static final Logger LOG = Logger.getLogger(ClientEventService.class.getName());

    public static final String WEBSOCKET_EVENTS = "events";

    // TODO: Some of these options should be configurable depending on expected load etc.
    public static final String CLIENT_EVENT_TOPIC = "seda://ClientEventTopic?multipleConsumers=true&concurrentConsumers=1&waitForTaskToComplete=NEVER&purgeWhenStopping=true&discardIfNoConsumers=true&limitConcurrentConsumers=false&size=1000";

    public static final String CLIENT_EVENT_QUEUE = "seda://ClientEventQueue?multipleConsumers=false&waitForTaskToComplete=NEVER&purgeWhenStopping=true&discardIfNoConsumers=true&size=25000";

    public static final String HEADER_ACCESS_RESTRICTED = ClientEventService.class.getName() + ".HEADER_ACCESS_RESTRICTED";
    public static final String HEADER_CONNECTION_TYPE = ClientEventService.class.getName() + ".HEADER_CONNECTION_TYPE";
    public static final String HEADER_CONNECTION_TYPE_WEBSOCKET = ClientEventService.class.getName() + ".HEADER_CONNECTION_TYPE_WEBSOCKET";
    public static final String HEADER_CONNECTION_TYPE_MQTT = ClientEventService.class.getName() + ".HEADER_CONNECTION_TYPE_MQTT";

    final protected Collection<EventSubscriptionAuthorizer> eventSubscriptionAuthorizers = new CopyOnWriteArraySet<>();
    protected Map<String, String> sessionKeyConnectionTypeMap;
    protected TimerService timerService;
    protected MessageBrokerService messageBrokerService;
    protected ManagerIdentityService identityService;
    protected EventSubscriptions eventSubscriptions;
    protected GatewayService gatewayService;
    protected boolean stopped;

    @Override
    public int getPriority() {
        return ContainerService.DEFAULT_PRIORITY;
    }

    @Override
    public void init(Container container) throws Exception {
        timerService = container.getService(TimerService.class);
        messageBrokerService = container.getService(MessageBrokerService.class);
        identityService = container.getService(ManagerIdentityService.class);
        gatewayService = container.getService(GatewayService.class);

        sessionKeyConnectionTypeMap = new HashMap<>();

        eventSubscriptions = new EventSubscriptions(
            container.getService(TimerService.class),
            container.getService(ManagerExecutorService.class)
        );

        messageBrokerService.getContext().getTypeConverterRegistry().addTypeConverters(
            new EventTypeConverters()
        );

        // TODO: Remove prefix and just use event type then use a subscription wrapper to pass subscription ID around
        messageBrokerService.getContext().addRoutes(new RouteBuilder() {
            @Override
            public void configure() throws Exception {

                from("websocket://" + WEBSOCKET_EVENTS)
                    .routeId("FromClientWebsocketEvents")
                    .process(exchange -> exchange.getIn().setHeader(HEADER_CONNECTION_TYPE, HEADER_CONNECTION_TYPE_WEBSOCKET))
                    .to(ClientEventService.CLIENT_EVENT_QUEUE)
                    .end();

                from(ClientEventService.CLIENT_EVENT_QUEUE)
                    .routeId("ClientEvents")
                    .choice()
                    .when(header(ConnectionConstants.SESSION_OPEN))
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            sessionKeyConnectionTypeMap.put(sessionKey, (String) exchange.getIn().getHeader(HEADER_CONNECTION_TYPE));
                        })
                        .choice()
                        .when(exchange -> isGatewayClientId(getClientId(exchange)))
                            .to(GatewayService.GATEWAY_EVENT_TOPIC)
                        .endChoice()
                        .stop()
                    .when(or(
                        header(ConnectionConstants.SESSION_CLOSE),
                        header(ConnectionConstants.SESSION_CLOSE_ERROR)
                    ))
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            sessionKeyConnectionTypeMap.remove(sessionKey);
                            eventSubscriptions.cancelAll(sessionKey);
                        })
                        .choice()
                        .when(exchange -> isGatewayClientId(getClientId(exchange)))
                            .to(GatewayService.GATEWAY_EVENT_TOPIC)
                        .endChoice()
                        .stop()
                    .when(bodyAs(String.class).startsWith(EventSubscription.SUBSCRIBE_MESSAGE_PREFIX))
                        .convertBodyTo(EventSubscription.class)
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            EventSubscription subscription = exchange.getIn().getBody(EventSubscription.class);
                            AuthContext authContext = exchange.getIn().getHeader(Constants.AUTH_CONTEXT, AuthContext.class);
                            if (authorizeEventSubscription(authContext, subscription)) {
                                boolean restrictedUser = identityService.getIdentityProvider().isRestrictedUser(authContext.getUserId());
                                eventSubscriptions.createOrUpdate(sessionKey, restrictedUser, subscription);
                                subscription.setSubscribed(true);
                                sendToSession(sessionKey, subscription);
                            } else {
                                LOG.warning("Unauthorized subscription from '"
                                        + authContext.getUsername() + "' in realm '" + authContext.getAuthenticatedRealm()
                                        + "': " + subscription
                                );
                                sendToSession(sessionKey, new UnauthorizedEventSubscription(subscription));
                            }
                        })
                        .stop()
                    .when(or(
                            body().isInstanceOf(CancelEventSubscription.class),
                            bodyAs(String.class).startsWith(CancelEventSubscription.MESSAGE_PREFIX)
                    ))
                        .choice()
                        .when(bodyAs(String.class).startsWith(CancelEventSubscription.MESSAGE_PREFIX))
                            .convertBodyTo(CancelEventSubscription.class)
                        .endChoice()
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            eventSubscriptions.cancel(sessionKey, exchange.getIn().getBody(CancelEventSubscription.class));
                        })
                        .stop()
                    .when(or(
                            body().isInstanceOf(RenewEventSubscriptions.class),
                            bodyAs(String.class).startsWith(RenewEventSubscriptions.MESSAGE_PREFIX)
                    ))
                        .choice()
                            .when(bodyAs(String.class).startsWith(RenewEventSubscriptions.MESSAGE_PREFIX))
                            .convertBodyTo(RenewEventSubscriptions.class)
                        .endChoice()
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            AuthContext authContext = exchange.getIn().getHeader(Constants.AUTH_CONTEXT, AuthContext.class);
                            boolean restrictedUser = identityService.getIdentityProvider().isRestrictedUser(authContext.getUserId());
                            eventSubscriptions.update(sessionKey, restrictedUser,exchange.getIn().getBody(RenewEventSubscriptions.class).getSubscriptionIds());
                        })
                        .stop()
                    .when(or(
                        body().isInstanceOf(SharedEvent.class),
                        bodyAs(String.class).startsWith(SharedEvent.MESSAGE_PREFIX)
                    ))
                        .choice()
                            .when(bodyAs(String.class).startsWith(SharedEvent.MESSAGE_PREFIX))
                            .convertBodyTo(SharedEvent.class)
                        .endChoice()
                        .process(exchange -> {
                            SharedEvent event = exchange.getIn().getBody(SharedEvent.class);
                            // If there is no timestamp in event, set to system time
                            if (event.getTimestamp() <= 0) {
                                event.setTimestamp(timerService.getCurrentTimeMillis());
                            }
                        })
                        .choice()
                            .when(header(HEADER_CONNECTION_TYPE).isNotNull())
                            .choice()
                                .when(exchange -> isGatewayClientId(getClientId(exchange)))
                                    .to(GatewayService.GATEWAY_EVENT_TOPIC)
                                .otherwise()
                                    .to(ClientEventService.CLIENT_EVENT_TOPIC)
                            .endChoice()
                            .when(header(HEADER_CONNECTION_TYPE).isNull())
                                .split(method(eventSubscriptions, "splitForSubscribers"))
                                .process(exchange -> {
                                    String sessionKey = getSessionKey(exchange);
                                    sendToSession(sessionKey, exchange.getIn().getBody());
                                })
                        .endChoice()
                        .stop()
                    .otherwise()
                        .process(exchange -> LOG.fine("Unsupported message body: " + exchange.getIn().getBody()))
                    .end();
            }
        });
    }

    @Override
    public void start(Container container) {
        stopped = false;
    }

    @Override
    public void stop(Container container) {
        stopped = true;
    }

    public void addSubscriptionAuthorizer(EventSubscriptionAuthorizer authorizer) {
        this.eventSubscriptionAuthorizers.add(authorizer);
    }

    public boolean authorizeEventSubscription(AuthContext authContext, EventSubscription subscription) {
        return eventSubscriptionAuthorizers.stream()
                .anyMatch(authorizer -> authorizer.apply(authContext, subscription));
    }

    public void publishEvent(SharedEvent event) {
        publishEvent(true, event);
    }

    /**
     * @param accessRestricted <code>true</code> if this event can be received by restricted user sessions.
     */
    public void publishEvent(boolean accessRestricted, SharedEvent event) {
        // Only publish if service is not stopped
        if (stopped) {
            return;
        }

        if (messageBrokerService != null && messageBrokerService.getProducerTemplate() != null) {
            // Don't log that we are publishing a syslog event,
            if (!(event instanceof SyslogEvent)) {
                LOG.fine("Publishing: " + event);
            }
            messageBrokerService.getProducerTemplate()
                .sendBodyAndHeader(CLIENT_EVENT_QUEUE, event, HEADER_ACCESS_RESTRICTED, accessRestricted);
        }
    }

    public void sendToSession(String sessionKey, Object data) {
        if (messageBrokerService != null && messageBrokerService.getProducerTemplate() != null) {
            LOG.fine("Sending to session '" + sessionKey + "': " + data);
            String sessionConnectionType = sessionKeyConnectionTypeMap.get(sessionKey);
            if (sessionConnectionType.equals(HEADER_CONNECTION_TYPE_WEBSOCKET)) {
                messageBrokerService.getProducerTemplate().sendBodyAndHeader(
                        "websocket://" + WEBSOCKET_EVENTS,
                        data,
                        ConnectionConstants.SESSION_KEY, sessionKey
                );
            } else if (sessionConnectionType.equals(HEADER_CONNECTION_TYPE_MQTT)) {
                messageBrokerService.getProducerTemplate().sendBodyAndHeader(
                        MqttBrokerService.MQTT_CLIENT_QUEUE,
                        data,
                        ConnectionConstants.SESSION_KEY, sessionKey
                );
            }
        }
    }

    public static String getSessionKey(Exchange exchange) {
        return exchange.getIn().getHeader(ConnectionConstants.SESSION_KEY, String.class);
    }

    public EventSubscriptions getEventSubscriptions() {
        return eventSubscriptions;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
            '}';
    }

    public static String getClientId(Exchange exchange) {
        AuthContext authContext = exchange.getIn().getHeader(Constants.AUTH_CONTEXT, AuthContext.class);
        if(authContext != null) {
            return authContext.getClientId();
        }
        return null;
    }
}
