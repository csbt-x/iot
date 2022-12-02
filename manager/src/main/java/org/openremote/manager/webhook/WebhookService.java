/*
 * Copyright 2022, OpenRemote Inc.
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
package org.openremote.manager.webhook;

import org.apache.camel.builder.RouteBuilder;
import org.jboss.resteasy.client.jaxrs.ResteasyClient;
import org.jboss.resteasy.client.jaxrs.ResteasyClientBuilder;
import org.jboss.resteasy.client.jaxrs.ResteasyWebTarget;
import org.openremote.container.web.WebClient;
import org.openremote.container.web.WebTargetBuilder;
import org.openremote.model.Container;
import org.openremote.model.ContainerService;
import org.openremote.model.http.HTTPMethod;
import org.openremote.model.webhook.Webhook;

import javax.ws.rs.client.Entity;
import javax.ws.rs.client.WebTarget;
import javax.ws.rs.core.Response;
import java.net.URI;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

import static org.openremote.container.util.MapAccess.getInteger;

public class WebhookService extends RouteBuilder implements ContainerService {

    private static final Logger LOG = Logger.getLogger(WebhookService.class.getName());
    protected ResteasyClientBuilder clientBuilder;

    public static final String WEBHOOK_CONNECT_TIMEOUT = "WEBHOOK_CONNECT_TIMEOUT";
    public static final int WEBHOOK_CONNECT_TIMEOUT_DEFAULT = 2000;
    public static final String WEBHOOK_REQUEST_TIMEOUT = "WEBHOOK_REQUEST_TIMEOUT";
    public static final int WEBHOOK_REQUEST_TIMEOUT_DEFAULT = 10000;

    @Override
    public void init(Container container) throws Exception {
        this.clientBuilder = new ResteasyClientBuilder()
                .connectTimeout(
                        getInteger(container.getConfig(), WEBHOOK_CONNECT_TIMEOUT, WEBHOOK_CONNECT_TIMEOUT_DEFAULT),
                        TimeUnit.MILLISECONDS
                )
                .readTimeout(
                        getInteger(container.getConfig(), WEBHOOK_REQUEST_TIMEOUT, WEBHOOK_REQUEST_TIMEOUT_DEFAULT),
                        TimeUnit.MILLISECONDS
                );
    }

    @Override
    public int getPriority() {
        return ContainerService.DEFAULT_PRIORITY;
    }

    @Override
    public void configure() throws Exception {
        // empty
    }

    @Override
    public void start(Container container) throws Exception {
        // empty
    }

    @Override
    public void stop(Container container) throws Exception {
        // empty
    }

    public void sendHttpRequest(Webhook webhook, WebTarget target) {
        Response response = null;
        try {
            ResteasyWebTarget webTarget = (ResteasyWebTarget) target;
            response = this.buildResponse(webTarget, webhook.getHttpMethod(), webhook.getPayload());
            response.readEntity(String.class);
        } catch (Exception e) {
            LOG.warning(e.getMessage());
            throw e;
        } finally {
            if (response != null) {
                response.close();
            }
        }
    }

    public WebTarget buildWebTarget(Webhook webhook) {
        ResteasyClient client = WebClient.registerDefaults(clientBuilder).build();
        WebTargetBuilder builder = new WebTargetBuilder(client, URI.create(webhook.getUrl()));

        // Authentication
        if (webhook.getUsernamePassword() != null) {
            builder.setBasicAuthentication(webhook.getUsernamePassword().getUsername(), webhook.getUsernamePassword().getPassword());
        } else if (webhook.getOAuthGrant() != null) {
            builder.setOAuthAuthentication(webhook.getOAuthGrant());
        }
        if (webhook.getHeaders() != null && webhook.getHeaders().size() > 0) {
            builder.setInjectHeaders(webhook.getHeaders());
        }
        return builder.build();
    }

    private Response buildResponse(ResteasyWebTarget target, HTTPMethod method, String payload) {
        Response response = target.request().method(method.name());
        if (payload != null) {
            return target.request().method(method.name(), Entity.entity(payload, response.getMediaType()));
        } else {
            return response;
        }
    }
}
