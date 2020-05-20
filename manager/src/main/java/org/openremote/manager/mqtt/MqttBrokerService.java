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
package org.openremote.manager.mqtt;

import com.google.inject.internal.cglib.proxy.$FixedValue;
import io.moquette.BrokerConstants;
import io.moquette.broker.Server;
import io.moquette.broker.config.MemoryConfig;
import io.moquette.interception.InterceptHandler;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.handler.codec.mqtt.*;
import org.apache.camel.builder.RouteBuilder;
import org.openremote.container.Container;
import org.openremote.container.ContainerService;
import org.openremote.container.message.MessageBrokerService;
import org.openremote.manager.event.ClientEventService;
import org.openremote.manager.security.ManagerIdentityService;
import org.openremote.manager.security.ManagerKeycloakIdentityProvider;
import org.openremote.model.attribute.AttributeEvent;
import org.openremote.model.event.TriggeredEventSubscription;
import org.openremote.model.value.ArrayValue;
import org.openremote.model.value.ObjectValue;
import org.openremote.model.value.Value;
import org.openremote.model.value.Values;

import java.nio.charset.Charset;
import java.util.*;
import java.util.logging.Logger;

import static org.openremote.container.util.MapAccess.getInteger;
import static org.openremote.container.util.MapAccess.getString;
import static org.openremote.manager.event.ClientEventService.getSessionKey;

public class MqttBrokerService implements ContainerService {

    private static final Logger LOG = Logger.getLogger(MqttBrokerService.class.getName());

    public static final String MQTT_CLIENT_QUEUE = "seda://MqttClientQueue?waitForTaskToComplete=IfReplyExpected&timeout=10000&purgeWhenStopping=true&discardIfNoConsumers=false&size=25000";

    public static final String MQTT_CLIENT_ID_PREFIX = "mqtt-";
    public static final String MQTT_SERVER_LISTEN_HOST = "MQTT_SERVER_LISTEN_HOST";
    public static final String MQTT_SERVER_LISTEN_PORT = "MQTT_SERVER_LISTEN_PORT";

    public static final String ASSETS_TOPIC = "assets";
    public static final String TOPIC_SEPARATOR = "/";

    public static final String PAYLOAD_SEPARATOR = ":";

    protected ManagerKeycloakIdentityProvider identityProvider;
    protected ClientEventService clientEventService;
    protected MessageBrokerService messageBrokerService;

    protected Map<String, MqttConnection> mqttConnectionMap;

    protected boolean active;
    protected String host;
    protected int port;
    protected Server mqttBroker;

    @Override
    public int getPriority() {
        return DEFAULT_PRIORITY;
    }

    @Override
    public void init(Container container) throws Exception {
        host = getString(container.getConfig(), MQTT_SERVER_LISTEN_HOST, BrokerConstants.HOST);
        port = getInteger(container.getConfig(), MQTT_SERVER_LISTEN_PORT, BrokerConstants.PORT);

        mqttConnectionMap = new HashMap<>();

        clientEventService = container.getService(ClientEventService.class);
        ManagerIdentityService identityService = container.getService(ManagerIdentityService.class);
        messageBrokerService = container.getService(MessageBrokerService.class);

        if (!identityService.isKeycloakEnabled()) {
            LOG.warning("MQTT connections are not supported when not using Keycloak identity provider");
            active = false;
        } else {
            active = true;
            identityProvider = (ManagerKeycloakIdentityProvider) identityService.getIdentityProvider();
        }

        mqttBroker = new Server();

        messageBrokerService.getContext().addRoutes(new RouteBuilder() {
            @Override
            public void configure() throws Exception {

                from(MQTT_CLIENT_QUEUE)
                        .routeId("MqttClientEvents")
                        .choice()
                        .when(body().isInstanceOf(TriggeredEventSubscription.class))
                        .process(exchange -> {
                            String sessionKey = getSessionKey(exchange);
                            TriggeredEventSubscription<AttributeEvent> triggeredEventSubscription = exchange.getIn().getBody(TriggeredEventSubscription.class);
                            triggeredEventSubscription.getEvents()
                                    .forEach(event -> sendAttributeEvent(sessionKey, event));
                        })
                        .end();

            }
        });
    }

    @Override
    public void start(Container container) throws Exception {
        Properties properties = new Properties();
        properties.setProperty(BrokerConstants.HOST_PROPERTY_NAME, host);
        properties.setProperty(BrokerConstants.PORT_PROPERTY_NAME, String.valueOf(port));
        properties.setProperty(BrokerConstants.ALLOW_ANONYMOUS_PROPERTY_NAME, String.valueOf(false));
        List<? extends InterceptHandler> interceptHandlers = Collections.singletonList(new EventInterceptHandler(identityProvider, messageBrokerService, mqttConnectionMap));
        mqttBroker.startServer(new MemoryConfig(properties), interceptHandlers, null, new KeycloakAuthenticator(identityProvider), new KeycloakAuthorizatorPolicy(identityProvider, clientEventService, mqttConnectionMap));
        LOG.fine("Started MQTT broker");
    }

    @Override
    public void stop(Container container) throws Exception {
        mqttBroker.stopServer();
        LOG.fine("Stopped MQTT broker");
    }

    public void sendAttributeEvent(String clientId, AttributeEvent attributeEvent) {
        ByteBuf payload = Unpooled.copiedBuffer(attributeEvent.getAttributeName() + PAYLOAD_SEPARATOR, Charset.defaultCharset());
        attributeEvent.getValue().ifPresent(value -> payload.writeCharSequence(value.toJson(), Charset.defaultCharset()));

        MqttPublishMessage publishMessage = MqttMessageBuilders.publish()
                .qos(MqttQoS.AT_MOST_ONCE)
                .topicName(ASSETS_TOPIC + TOPIC_SEPARATOR + attributeEvent.getEntityId())
                .payload(payload)
                .build();

        mqttBroker.internalPublish(publishMessage, clientId);
    }
}
