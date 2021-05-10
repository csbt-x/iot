/*
 * Copyright 2020, OpenRemote Inc.
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
package org.openremote.test.setup;

import org.keycloak.representations.idm.ClientRepresentation;
import org.openremote.model.Container;
import org.openremote.container.util.UniqueIdentifierGenerator;
import org.openremote.manager.mqtt.MqttBrokerService;
import org.openremote.manager.setup.AbstractKeycloakSetup;
import org.openremote.model.Constants;
import org.openremote.model.security.ClientRole;
import org.openremote.model.security.Tenant;
import org.openremote.model.security.User;

import java.util.Arrays;
import java.util.List;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import static org.openremote.container.util.MapAccess.getString;
import static org.openremote.model.Constants.KEYCLOAK_CLIENT_ID;
import static org.openremote.model.Constants.MASTER_REALM;

/**
 * We have the following demo users:
 * <ul>
 * <li><code>admin</code> - The superuser in the "master" realm with all access</li>
 * <li><code>testuser1</code> - (Password: testuser1) A user in the "master" realm with read/write access to assets and rules</li>
 * <li><code>testuser2</code> - (Password: testuser2) A user in the "building" realm with only read access to assets</li>
 * <li><code>testuser3</code> - (Password: testuser3) A user in the "building" realm with read/write access to a restricted set of assets and their rules</li>
 * <li><code>building</code> - (Password: building) A user in the "building" realm with read/write access to the building apartment 1 assets and their rules</li>
 * <li><code>testuser4</code> - (Password: testuser4) A user in the "smartcity" realm with read/write access to a restricted set of assets and their rules</li>
 *
 * </ul>
 */
public class KeycloakTestSetup extends AbstractKeycloakSetup {

    private static final Logger LOG = Logger.getLogger(KeycloakTestSetup.class.getName());

    public String testuser1Id;
    public String testuser2Id;
    public String testuser3Id;
    public String smartCityUserId;
    public String buildingUserId;
    public Tenant masterTenant;
    public Tenant tenantBuilding;
    public Tenant energyTenant;
    public Tenant tenantCity;

    public KeycloakTestSetup(Container container) {
        super(container);
    }

    @Override
    public void onStart() throws Exception {
        super.onStart();

        // Tenants
        masterTenant = identityService.getIdentityProvider().getTenant(Constants.MASTER_REALM);
        tenantBuilding = createTenant("building", "Building");
        tenantCity = createTenant("smartcity", "Smart City");
        energyTenant = createTenant("energy", "Energy Test");

        // Don't allow demo users to write assets
        ClientRole[] demoUserRoles = Arrays.stream(REGULAR_USER_ROLES)
            .filter(clientRole -> clientRole != ClientRole.WRITE_ASSETS)
            .toArray(ClientRole[]::new);


        // Users
        User testuser1 = createUser(MASTER_REALM, "testuser1", "testuser1", "DemoMaster", "DemoLast", null, true, container.isDevMode() ? REGULAR_USER_ROLES : demoUserRoles);
        this.testuser1Id = testuser1.getId();
        keycloakProvider.updateUserRoles(MASTER_REALM, testuser1Id, "account"); // Remove all roles for account client
        User testuser2 = createUser(tenantBuilding.getRealm(), "testuser2", "testuser2", "DemoA2", "DemoLast", "testuser2@openremote.local", true, new ClientRole[] {
            ClientRole.WRITE_USER,
            ClientRole.READ_MAP,
            ClientRole.READ_ASSETS
        });
        this.testuser2Id = testuser2.getId();
        keycloakProvider.updateUserRoles(tenantBuilding.getRealm(), testuser2Id, "account"); // Remove all roles for account client
        User testuser3 = createUser(tenantBuilding.getRealm(), "testuser3", "testuser3", "DemoA3", "DemoLast", "testuser3@openremote.local", true, container.isDevMode() ? REGULAR_USER_ROLES : demoUserRoles);
        this.testuser3Id = testuser3.getId();
        keycloakProvider.updateUserRoles(tenantBuilding.getRealm(), testuser3Id, "account"); // Remove all roles for account client
        User buildingUser = createUser(tenantBuilding.getRealm(), "building", "building", "Building", "User", "building@openremote.local", true, demoUserRoles);
        this.buildingUserId = buildingUser.getId();
        keycloakProvider.updateUserRoles(tenantBuilding.getRealm(), buildingUserId, "account"); // Remove all roles for account client
        User smartCityUser = createUser(tenantCity.getRealm(), "smartcity", "smartcity", "Smart", "City", null, true, demoUserRoles);
        this.smartCityUserId = smartCityUser.getId();
        keycloakProvider.updateUserRoles(tenantCity.getRealm(), smartCityUserId, "account"); // Remove all roles for account client

        /*
         * MQTT Client
         */
        ClientRepresentation mqttClient = new ClientRepresentation();
        String buildingMqttClientId = MqttBrokerService.MQTT_CLIENT_ID_PREFIX + UniqueIdentifierGenerator.generateId(tenantBuilding.getRealm());
        mqttClient.setClientId(buildingMqttClientId);
        mqttClient.setName("MQTT");
        mqttClient.setStandardFlowEnabled(false);
        mqttClient.setImplicitFlowEnabled(false);
        mqttClient.setDirectAccessGrantsEnabled(false);
        mqttClient.setServiceAccountsEnabled(true);
        mqttClient.setSecret(UniqueIdentifierGenerator.generateId(tenantBuilding.getRealm()));
        mqttClient = keycloakProvider.createClient(tenantBuilding.getRealm(), mqttClient);

        // Add asset RW roles to service user
        User serviceUser = keycloakProvider.getClientServiceUser(tenantBuilding.getRealm(), mqttClient.getClientId());
        keycloakProvider.updateUserRoles(tenantBuilding.getRealm(), serviceUser.getId(), buildingMqttClientId, ClientRole.READ_ASSETS.getValue(), ClientRole.WRITE_ASSETS.getValue(), ClientRole.WRITE_ATTRIBUTES.getValue());
    }
}
