/*
 * Copyright 2017, OpenRemote Inc.
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
package org.openremote.manager.asset;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.apache.camel.builder.RouteBuilder;
import org.openremote.container.message.MessageBrokerService;
import org.openremote.container.persistence.PersistenceService;
import org.openremote.container.security.AuthContext;
import org.openremote.container.timer.TimerService;
import org.openremote.container.util.MapAccess;
import org.openremote.manager.agent.AgentService;
import org.openremote.manager.datapoint.AssetDatapointService;
import org.openremote.manager.event.AttributeEventInterceptor;
import org.openremote.manager.event.ClientEventService;
import org.openremote.manager.event.EventSubscriptionAuthorizer;
import org.openremote.manager.gateway.GatewayService;
import org.openremote.manager.rules.RulesService;
import org.openremote.manager.security.ManagerIdentityService;
import org.openremote.model.Constants;
import org.openremote.model.Container;
import org.openremote.model.ContainerService;
import org.openremote.model.asset.Asset;
import org.openremote.model.asset.AssetResource;
import org.openremote.model.asset.agent.Protocol;
import org.openremote.model.attribute.*;
import org.openremote.model.security.ClientRole;
import org.openremote.model.util.ValueUtil;
import org.openremote.model.validation.AssetStateStore;
import org.openremote.model.value.MetaItemType;
import org.openremote.model.value.ValueType;

import java.util.*;
import java.util.stream.IntStream;

import static org.openremote.model.attribute.AttributeWriteFailure.*;

/**
 * Receives {@link AttributeEvent} from {@link Source} and processes them.
 * <dl>
 * <dt>{@link Source#CLIENT}</dt>
 * <dd><p>Client events published through event bus or sent by web service. These exchanges must contain an {@link AuthContext}
 * header named {@link Constants#AUTH_CONTEXT}.</dd>
 * <dt>{@link Source#INTERNAL}</dt>
 * <dd><p>Events sent to {@link #ATTRIBUTE_EVENT_QUEUE} or through {@link #sendAttributeEvent} convenience method by processors.</dd>
 * <dt>{@link Source#SENSOR}</dt>
 * <dd><p>Protocol sensor updates sent to {@link Protocol#SENSOR_QUEUE}.</dd>
 * </dl>
 * NOTE: An attribute value can be changed during Asset<?> CRUD but this does not come through
 * this route but is handled separately, see {@link AssetResource}. Any attribute values
 * assigned during Asset<?> CRUD can be thought of as the attributes initial value.
 * <p>
 * The {@link AttributeEvent}s are first validated depending on their source, and if validation fails
 * at any point then an {@link AssetProcessingException} will be logged as a warning with an
 * {@link AttributeWriteFailure}.
 * <p>
 * Once successfully validated a chain of {@link AttributeEventInterceptor}s is handling the update message:
 * <ul>
 * <li>{@link AgentService}</li>
 * <li>{@link RulesService}</li>
 * <li>{@link AssetStorageService}</li>
 * <li>{@link AssetDatapointService}</li>
 * </ul>
 * <h2>Agent service processing logic</h2>
 * <p>
 * The agent service's role is to communicate asset attribute writes to actuators, through protocols.
 * When the update messages' source is {@link Source#SENSOR}, the agent service ignores the message.
 * The message will also be ignored if the updated attribute is not linked to an agent.
 * <p>
 * If the updated attribute has a valid agent link, an {@link AttributeEvent} is sent on the {@link Protocol#ACTUATOR_TOPIC},
 * for execution on an actual device or service 'things'. The update is then considered complete, and no further processing
 * is necessary. The update will not reach the rules engine or the database.
 * <p>
 * This means that a protocol implementation is responsible for producing a new {@link AttributeEvent} to
 * indicate to the rules and database memory that the attribute value has/has not changed. The protocol should know
 * best when to do this and it will vary from protocol to protocol; some 'things' might respond to an actuator write
 * immediately with a new sensor read, or they might send a later "sensor value changed" message or both or neither
 * (the actuator is "fire and forget"). The protocol must decide what the best course of action is based on the
 * 'things' it communicates with and the transport layer it uses etc.
 * <h2>Rules Service processing logic</h2>
 * <p>
 * Checks if attribute has {@link MetaItemType#RULE_STATE} and/or {@link MetaItemType#RULE_EVENT} {@link MetaItem}s,
 * and if so the message is passed through the rule engines that are in scope for the asset.
 * <p>
 * <h2>Asset Storage Service processing logic</h2>
 * <p>
 * Always tries to persist the attribute value in the database and allows the message to continue if the commit was
 * successful.
 * <h2>Asset Datapoint Service processing logic</h2>
 * <p>
 * Checks if attribute has {@link MetaItemType#STORE_DATA_POINTS} set to false or if the attribute does not have an
 * {@link org.openremote.model.asset.agent.AgentLink} meta, and if so the {@link AttributeEvent}
 * is not stored in a time series DB of historical data, otherwise the value is stored. Then allows the message to
 * continue if the commit was successful.
 */
@SuppressWarnings("unchecked")
public class AssetProcessingService extends RouteBuilder implements ContainerService {

    public static final int PRIORITY = AssetStorageService.PRIORITY + 1000;
    // Single threaded attribute event queue (event order has to be maintained)
    public static final String ATTRIBUTE_EVENT_QUEUE = "seda://AttributeEventQueue?waitForTaskToComplete=IfReplyExpected&timeout=10000&purgeWhenStopping=true&discardIfNoConsumers=false&size=25000";
    public static final String OR_ATTRIBUTE_EVENT_THREADS = "OR_ATTRIBUTE_EVENT_THREADS";
    public static final int OR_ATTRIBUTE_EVENT_THREADS_DEFAULT = 3;
    protected static final String EVENT_ROUTE_COUNT_HEADER = "EVENT_ROUTE_COUNT_HEADER";
    protected static final String EVENT_ROUTE_URI_PREFIX = "seda://AttributeEventProcessor";
    private static final System.Logger LOG = System.getLogger(AssetProcessingService.class.getName());
    final protected List<AttributeEventInterceptor> eventInterceptors = new ArrayList<>();
    protected TimerService timerService;
    protected ManagerIdentityService identityService;
    protected PersistenceService persistenceService;
    protected RulesService rulesService;
    protected AgentService agentService;
    protected GatewayService gatewayService;
    protected AssetStorageService assetStorageService;
    protected AssetDatapointService assetDatapointService;
    protected AttributeLinkingService assetAttributeLinkingService;
    protected MessageBrokerService messageBrokerService;
    protected ClientEventService clientEventService;
    // Used in testing to detect if initial/startup processing has completed
    protected long lastProcessedEventTimestamp = System.currentTimeMillis();
    protected int eventProcessingThreadCount;

    protected static Processor handleAssetProcessingException() {
        return exchange -> {
            AttributeEvent event = exchange.getIn().getBody(AttributeEvent.class);
            Exception exception = (Exception) exchange.getProperty(Exchange.EXCEPTION_CAUGHT);

            StringBuilder error = new StringBuilder();

            Source source = exchange.getIn().getHeader(HEADER_SOURCE, CLIENT, Source.class);
            if (source != null) {
                error.append("Error processing from ").append(source);
            }

            String protocolName = exchange.getIn().getHeader(Protocol.SENSOR_QUEUE_SOURCE_PROTOCOL, String.class);
            if (protocolName != null) {
                error.append(" (protocol: ").append(protocolName).append(")");
            }

            // TODO Better exception handling - dead letter queue?
            if (exception instanceof AssetProcessingException processingException) {
                error.append(" - ").append(processingException.getMessage());
                error.append(": ").append(event.toString());
                LOG.log(System.Logger.Level.WARNING, error::toString);
            } else {
                error.append(": ").append(event.toString());
                LOG.log(System.Logger.Level.WARNING, error::toString, exception);
            }

            // Make the exception available if MEP is InOut
            exchange.getMessage().setBody(exception);
        };
    }

    @Override
    public int getPriority() {
        return PRIORITY;
    }

    @Override
    public void init(Container container) throws Exception {
        timerService = container.getService(TimerService.class);
        identityService = container.getService(ManagerIdentityService.class);
        persistenceService = container.getService(PersistenceService.class);
        rulesService = container.getService(RulesService.class);
        agentService = container.getService(AgentService.class);
        gatewayService = container.getService(GatewayService.class);
        assetStorageService = container.getService(AssetStorageService.class);
        assetDatapointService = container.getService(AssetDatapointService.class);
        assetAttributeLinkingService = container.getService(AttributeLinkingService.class);
        messageBrokerService = container.getService(MessageBrokerService.class);
        clientEventService = container.getService(ClientEventService.class);
        EventSubscriptionAuthorizer assetEventAuthorizer = AssetStorageService.assetInfoAuthorizer(identityService, assetStorageService);
        MeterRegistry meterRegistry = container.getMeterRegistry();

        clientEventService.addSubscriptionAuthorizer((requestedRealm, auth, subscription) -> {
            if (!subscription.isEventType(AttributeEvent.class)) {
                return false;
            }
            return assetEventAuthorizer.authorise(requestedRealm, auth, subscription);
        });

        // TODO: Introduce caching here similar to ActiveMQ auth caching
        clientEventService.addEventAuthorizer((requestedRealm, authContext, event) -> {

            if (!(event instanceof AttributeEvent attributeEvent)) {
                return false;
            }

            if (authContext != null && authContext.isSuperUser()) {
                return true;
            }

            // Check realm against user
            if (!identityService.getIdentityProvider().isRealmActiveAndAccessible(authContext,
                requestedRealm)) {
                LOG.log(System.Logger.Level.INFO, "Realm is inactive, inaccessible or nonexistent: " + requestedRealm);
                return false;
            }

            // Users must have write attributes role
            if (authContext != null && !authContext.hasResourceRoleOrIsSuperUser(ClientRole.WRITE_ATTRIBUTES.getValue(),
                Constants.KEYCLOAK_CLIENT_ID)) {
                LOG.log(System.Logger.Level.DEBUG, "User doesn't have required role '" + ClientRole.WRITE_ATTRIBUTES + "': username=" + authContext.getUsername() + ", userRealm=" + authContext.getAuthenticatedRealmName());
                return false;
            }

            // Have to load the asset and attribute to perform additional checks - should permissions be moved out of the
            // asset model (possibly if the performance is determined to be not good enough)
            // TODO: Use a targeted query to retrieve just the info we need
            Asset<?> asset = assetStorageService.find(attributeEvent.getId());
            Attribute<?> attribute = asset != null ? asset.getAttribute(attributeEvent.getName()).orElse(null) : null;

            if (asset == null || !asset.hasAttribute(attributeEvent.getName())) {
                LOG.log(System.Logger.Level.INFO, () -> "Cannot authorize asset event as asset and/or attribute doesn't exist: " + attributeEvent.getAttributeRef());
                return false;
            } else if (!Objects.equals(requestedRealm, asset.getRealm())) {
                LOG.log(System.Logger.Level.INFO, () -> "Asset is not in the requested realm: requestedRealm=" + requestedRealm + ", ref=" + attributeEvent.getAttributeRef());
                return false;
            }

            if (authContext != null) {
                // Check restricted user
                if (identityService.getIdentityProvider().isRestrictedUser(authContext)) {
                    // Must be asset linked to user
                    if (!assetStorageService.isUserAsset(authContext.getUserId(),
                        attributeEvent.getId())) {
                        LOG.log(System.Logger.Level.DEBUG, () -> "Restricted user is not linked to asset '" + attributeEvent.getId() + "': username=" + authContext.getUsername() + ", userRealm=" + authContext.getAuthenticatedRealmName());
                        return false;
                    }

                    if (attribute == null || !attribute.getMetaValue(MetaItemType.ACCESS_RESTRICTED_WRITE).orElse(false)) {
                        LOG.log(System.Logger.Level.DEBUG, () -> "Asset attribute doesn't support restricted write on '" + attributeEvent.getAttributeRef() + "': username=" + authContext.getUsername() + ", userRealm=" + authContext.getAuthenticatedRealmName());
                        return false;
                    }
                }
            } else {
                // Check attribute has public write flag for anonymous write
                if (attribute == null || !attribute.hasMeta(MetaItemType.ACCESS_PUBLIC_WRITE)) {
                    LOG.log(System.Logger.Level.DEBUG, () -> "Asset doesn't support public write on '" + attributeEvent.getAttributeRef() + "': username=null");
                    return false;
                }
            }

            return true;
        });

        // Get dynamic route count for event processing (multithreaded event processing but guaranteeing events for the same asset end up in the same route)
        eventProcessingThreadCount = MapAccess.getInteger(container.getConfig(), OR_ATTRIBUTE_EVENT_THREADS, OR_ATTRIBUTE_EVENT_THREADS_DEFAULT);
        if (eventProcessingThreadCount < 1) {
            LOG.log(System.Logger.Level.WARNING, OR_ATTRIBUTE_EVENT_THREADS + " value " + eventProcessingThreadCount + " is less than 1; forcing to 1");
            eventProcessingThreadCount = 1;
        } else if (eventProcessingThreadCount > 20) {
            LOG.log(System.Logger.Level.WARNING, OR_ATTRIBUTE_EVENT_THREADS + " value " + eventProcessingThreadCount + " is greater than max value of 20; forcing to 20");
            eventProcessingThreadCount = 20;
        }

        container.getService(MessageBrokerService.class).getContext().addRoutes(this);
    }

    @Override
    public void start(Container container) throws Exception {
    }

    @Override
    public void stop(Container container) throws Exception {
    }

    @SuppressWarnings("rawtypes")
    @Override
    public void configure() throws Exception {

        // Process attribute events
        // TODO: Make SENDER much more granular (switch to microservices with RBAC)
        /* TODO This message consumer should be transactionally consistent with the database, this is currently not the case

         Our "if I have not processed this message before" duplicate detection:

          - discard events with source time greater than server processing time (future events)
          - discard events with source time less than last applied/stored event source time
          - allow the rest (also events with same source time, order of application undefined)

         Possible improvements moving towards at-least-once:

         - Make AttributeEventInterceptor transactional with a two-phase commit API
         - Replace at-most-once ClientEventService with at-least-once capable, embeddable message broker/protocol
         - See pseudocode here: http://activemq.apache.org/should-i-use-xa.html
        */
        // All user authorisation checks MUST have been carried out before events reach this queue
        from(ATTRIBUTE_EVENT_QUEUE)
            .routeId("AttributeEventProcessor")
            .doTry()
            .process(exchange -> {
                AttributeEvent event = exchange.getIn().getBody(AttributeEvent.class);

                if (event.getId() == null || event.getId().isEmpty())
                    return; // Ignore events with no asset ID
                if (event.getName() == null || event.getName().isEmpty())
                    return; // Ignore events with no attribute name

                if (event.getTimestamp() <= 0) {
                    // Set timestamp if not set
                    event.setTimestamp(timerService.getCurrentTimeMillis());
                } else if (event.getTimestamp() > timerService.getCurrentTimeMillis()) {
                    // Use system time if event time is in the future (clock issue)
                    event.setTimestamp(timerService.getCurrentTimeMillis());
                }

                Source source = exchange.getIn().getHeader(HEADER_SOURCE, () -> null, Source.class);

                if (source == null) {
                    throw new AssetProcessingException(MISSING_SOURCE);
                }

                exchange.getIn().setHeader(EVENT_ROUTE_COUNT_HEADER, getEventProcessingRouteNumber(event.getId()));
            })
            .toD(EVENT_ROUTE_URI_PREFIX + "${header." + EVENT_ROUTE_COUNT_HEADER + "}")
            .endDoTry()
            .doCatch(AssetProcessingException.class)
            .process(handleAssetProcessingException());

        // Create the event processor routes
        IntStream.rangeClosed(1, eventProcessingThreadCount).forEach(processorCount -> {
            String camelRouteURI = getEventProcessingRouteURI(processorCount);

            from(camelRouteURI)
                .routeId("AttributeEventProcessor" + processorCount)
                .doTry()
                .process(exchange -> {
                    AttributeEvent event = exchange.getIn().getBody(AttributeEvent.class);
                    LOG.log(System.Logger.Level.TRACE, () -> ">>> Attribute event processing start: processor=" + processorCount + ", event=" + event);

                    Source source = exchange.getIn().getHeader(HEADER_SOURCE, () -> null, Source.class);
                    long startMillis = System.currentTimeMillis();

                    boolean processed = processAttributeEvent(event, source);

                    // Need to record time here otherwise an infinite loop generated inside one of the interceptors means the timestamp
                    // is not updated so tests can't then detect the problem.
                    lastProcessedEventTimestamp = startMillis;

                    long processingMillis = System.currentTimeMillis() - startMillis;

                    if (processingMillis > 50) {
                        LOG.log(System.Logger.Level.INFO, () -> "<<< Attribute event processing took a long time " + processingMillis + "ms: processor=" + processorCount + ", event=" + event);
                    } else {
                        LOG.log(System.Logger.Level.DEBUG, () -> "<<< Attribute event processed in " + processingMillis + "ms: processor=" + processorCount + ", event=" + event);
                    }

                    exchange.getIn().setBody(processed);
                })
                .endDoTry()
                .doCatch(AssetProcessingException.class)
                .process(handleAssetProcessingException());
        });
    }

    public void addEventInterceptor(AttributeEventInterceptor eventInterceptor) {
        eventInterceptors.add(eventInterceptor);
        eventInterceptors.sort(Comparator.comparingInt(AttributeEventInterceptor::getPriority));
    }

    /**
     * Send internal attribute change events into the {@link #ATTRIBUTE_EVENT_QUEUE}.
     */
    public void sendAttributeEvent(AttributeEvent attributeEvent) {
        sendAttributeEvent(attributeEvent, INTERNAL);
    }

    public void sendAttributeEvent(AttributeEvent attributeEvent, Source source) {
        // Set event source time if not already set
        if (attributeEvent.getTimestamp() <= 0) {
            attributeEvent.setTimestamp(timerService.getCurrentTimeMillis());
        }
        messageBrokerService.getFluentProducerTemplate()
                .withHeader(HEADER_SOURCE, source)
                .withBody(attributeEvent)
                .to(ATTRIBUTE_EVENT_QUEUE)
                .asyncSend();
    }

    /**
     * The {@link AttributeEvent} is passed to each registered {@link AttributeEventInterceptor} and if no interceptor
     * handles the event then the {@link Attribute} value is updated in the DB with the new event value and timestamp.
     */
    protected boolean processAttributeEvent(AttributeEvent event,
                                            Source source) throws AssetProcessingException {

        // TODO: Get asset lock so it cannot be modified during event processing
        persistenceService.doTransaction(em -> {

            // TODO: Retrieve optimised DTO rather than whole asset
            Asset<?> asset = assetStorageService.find(em, event.getId(), true);

            if (asset == null) {
                throw new AssetProcessingException(ASSET_NOT_FOUND, "Asset may have been deleted before event could be processed or it never existed");
            }

            Attribute attribute = asset.getAttribute(event.getName()).orElseThrow(() ->
                new AssetProcessingException(ATTRIBUTE_NOT_FOUND, "Attribute may have been deleted before event could be processed or it never existed"));

            long oldEventTime = attribute.getTimestamp().orElse(0L);
            Object oldValue = attribute.getValue().orElse(null);

            // Type coercion
            Object value = event.getValue().map(eventValue -> {
                Class<?> attributeValueType = attribute.getTypeClass();
                return ValueUtil.getValueCoerced(eventValue, attributeValueType).orElseThrow(() -> {
                    LOG.log(System.Logger.Level.INFO, "Event processing failed unable to coerce value into the correct value type: realm=" + event.getRealm() + ", attribute=" + event.getAttributeRef() + ", event value type=" + eventValue.getClass() + ", attribute value type=" + attributeValueType);
                    return new AssetProcessingException(INVALID_VALUE_FOR_WELL_KNOWN_ATTRIBUTE);
                });
            }).orElse(null);

            // Push value and timestamp into attribute
            attribute.setValue(value);
            attribute.setTimestamp(event.getTimestamp());

            // Value validation
            // TODO: Reuse AssetState and change validator over to that class
            // Do standard JSR-380 validation on the new value (needs attribute descriptor to do this)
            Set<ConstraintViolation<AssetStateStore>> validationFailures = ValueUtil.validate(new AssetStateStore(asset.getType(), attribute));

            if (!validationFailures.isEmpty()) {
                String msg = "Event processing failed as value failed constraint validation: attribute=" + attribute;
                ConstraintViolationException ex = new ConstraintViolationException(validationFailures);
                LOG.log(System.Logger.Level.WARNING, msg + ", exception=" + ex.getMessage());
                throw ex;
            }

            // For executable attributes, non-sensor sources can set a writable attribute execute status
            if (attribute.getType() == ValueType.EXECUTION_STATUS && source != SENSOR) {
                Optional<AttributeExecuteStatus> status = event.getValue()
                    .flatMap(ValueUtil::getString)
                    .flatMap(AttributeExecuteStatus::fromString);

                // TODO: Make this mechanism more generic with an interface
                if (status.isPresent() && !status.get().isWrite()) {
                    throw new AssetProcessingException(INVALID_ATTRIBUTE_EXECUTE_STATUS);
                }
            }

            long eventTime = event.getTimestamp();
            boolean outdated = oldEventTime - eventTime > 0;
            AssetState assetState = new AssetState<>(asset, attribute, source);

            if (outdated) {
                LOG.log(System.Logger.Level.TRACE, () -> "Event is older than current attribute timestamp so marking as outdated: ref=" + event.getAttributeRef() + ", timestamp=" + eventTime);


            }


            String interceptorName = null;
            boolean intercepted = false;

            for (AttributeEventInterceptor interceptor : eventInterceptors) {
                try {
                    intercepted = interceptor.intercept(em, asset, attribute, outdated, source);
                } catch (AssetProcessingException ex) {
                    throw ex;
                } catch (Throwable t) {
                    throw new AssetProcessingException(
                        INTERCEPTOR_FAILURE,
                        "interceptor '" + interceptor + "' threw an exception",
                        t
                    );
                }
                if (intercepted) {
                    interceptorName = interceptor.toString();
                    break;
                }
            }

            if (intercepted) {
                LOG.log(System.Logger.Level.TRACE, "Event intercepted: interceptor=" + interceptorName + ", ref=" + event.getAttributeRef() + ", source=" + source);
            } else {
                if (!assetStorageService.updateAttributeValue(em, event)) {
                    throw new AssetProcessingException(
                        STATE_STORAGE_FAILED, "database update failed, no rows updated"
                    );
                }
            }
        });

        return true;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
            '}';
    }

    protected int getEventProcessingRouteNumber(String assetId) {
        int charCode = Character.codePointAt(assetId, 0);
        return (charCode % eventProcessingThreadCount) + 1;
    }

    protected String getEventProcessingRouteURI(int routeNumber) {
        return EVENT_ROUTE_URI_PREFIX + routeNumber;
    }
}
