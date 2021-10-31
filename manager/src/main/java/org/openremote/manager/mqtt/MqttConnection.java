package org.openremote.manager.mqtt;

import org.keycloak.adapters.rotation.AdapterTokenVerifier;
import org.keycloak.common.VerificationException;
import org.keycloak.representations.AccessToken;
import org.openremote.container.security.AuthContext;
import org.openremote.container.security.keycloak.AccessTokenAuthContext;
import org.openremote.manager.security.ManagerKeycloakIdentityProvider;
import org.openremote.model.auth.OAuthClientCredentialsGrant;
import org.openremote.model.auth.OAuthGrant;
import org.openremote.model.event.shared.SharedEvent;
import org.openremote.model.util.TextUtil;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

import static org.openremote.model.Constants.KEYCLOAK_CLIENT_ID;

/**
 * Handles access token generation and tracks all subscriptions for the connection
 */
public class MqttConnection {

    protected static final Logger LOG = Logger.getLogger(MqttConnection.class.getSimpleName());
    protected final String realm;
    protected String username; // This is OAuth clientId
    protected String password;
    protected boolean credentials;
    protected final String clientId;
    protected Supplier<String> tokenSupplier;
    protected ManagerKeycloakIdentityProvider identityProvider;

    public MqttConnection(ManagerKeycloakIdentityProvider identityProvider, String clientId, String realm, String username, String password) {
        this.realm = realm;
        this.clientId = clientId;
        this.identityProvider = identityProvider;
        setCredentials(username, password);
    }

    public String getRealm() {
        return this.realm;
    }

    public String getUsername() {
        return this.username;
    }

    public String getPassword() {
        return this.password;
    }

    public String getAccessToken() {
        if (tokenSupplier == null) {
            return null;
        }

        return tokenSupplier.get();
    }

    public AuthContext getAuthContext() {
        AuthContext authContext;

        if (!credentials) {
            return null;
        }

        try {
            AccessToken accessToken = AdapterTokenVerifier.verifyToken(getAccessToken(), identityProvider.getKeycloakDeployment(realm, KEYCLOAK_CLIENT_ID));
            authContext = accessToken != null ? new AccessTokenAuthContext(realm, accessToken) : null;
        } catch (VerificationException e) {
            LOG.log(Level.INFO, "Couldn't verify token: " + this, e);
            return null;
        }

        return authContext;
    }

    /**
     * This is MQTT client ID not to be confused with OAuth client ID
     */
    public String getClientId() {
        return clientId;
    }

    public boolean hasCredentials() {
        return credentials;
    }

    public void setCredentials(String username, String password) {

        this.username = username;
        this.password = password;

        credentials = !TextUtil.isNullOrEmpty(realm)
            && !TextUtil.isNullOrEmpty(username)
            && !TextUtil.isNullOrEmpty(password);

        if (credentials) {
            String tokenEndpointUri = identityProvider.getTokenUri(realm).toString();
            OAuthGrant grant = new OAuthClientCredentialsGrant(tokenEndpointUri, username, password, null);
            tokenSupplier = identityProvider.getAccessTokenSupplier(grant);
        } else {
            LOG.fine("MQTT connection with no credentials so will have limited capabilities: " + this);
        }
    }

    @Override
    public String toString() {
        return this.getClass().getSimpleName() + "{" +
            "realm='" + realm + '\'' +
            ", username='" + username + '\'' +
            ", clientId='" + clientId + '\'' +
            '}';
    }
}
