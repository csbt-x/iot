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
package org.openremote.manager.setup.builtin;

import org.apache.commons.io.IOUtils;
import org.openremote.container.Container;
import org.openremote.manager.setup.AbstractManagerSetup;
import org.openremote.model.rules.AssetRuleset;
import org.openremote.model.rules.Ruleset;
import org.openremote.model.rules.TenantRuleset;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.logging.Logger;

import static org.openremote.model.rules.Ruleset.Lang.GROOVY;

public class RulesDemoSetup extends AbstractManagerSetup {

    private static final Logger LOG = Logger.getLogger(RulesDemoSetup.class.getName());

    public RulesDemoSetup(Container container) {
        super(container);
    }

    public Long apartmentActionsRulesetId;
    public Long tenantBuildingRulesetId;

    @Override
    public void onStart() throws Exception {

        KeycloakDemoSetup keycloakDemoSetup = setupService.getTaskOfType(KeycloakDemoSetup.class);
        ManagerDemoSetup managerDemoSetup = setupService.getTaskOfType(ManagerDemoSetup.class);

        LOG.info("Importing demo rulesets");

        // ################################ Rules demo data ###################################

        // Apartment 1
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidencePresenceDetection.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment1Id, "Demo Residence - Presence Detection with motion and CO2 sensors", Ruleset.Lang.GROOVY, rules
            );
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidenceVacationMode.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment1Id, "Demo Residence - Vacation Mode", Ruleset.Lang.GROOVY, rules
            );
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidenceAutoVentilation.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment1Id, "Demo Residence - Auto Ventilation", Ruleset.Lang.GROOVY, rules
            );
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidenceNotifyAlarmTrigger.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment1Id, "Demo Residence - Notify Alarm Trigger", Ruleset.Lang.GROOVY, rules
            );
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidenceSmartSwitch.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment1Id, "Demo Residence - Smart Start Switch", Ruleset.Lang.GROOVY, rules
            );
            ruleset.setEnabled(false);
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }

        // Apartment 2
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoResidenceAllLightsOff.js")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.apartment2Id, "Demo Residence - All Lights Off", Ruleset.Lang.JAVASCRIPT, rules
            );
            apartmentActionsRulesetId = rulesetStorageService.merge(ruleset).getId();
        }

        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoConsoleLocation.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new TenantRuleset(
                keycloakDemoSetup.tenantBuilding.getRealm(), "Demo Console Location", Ruleset.Lang.GROOVY, rules
            ).setAccessPublicRead(true);
            tenantBuildingRulesetId = rulesetStorageService.merge(ruleset).getId();
        }

        // People counter
        try (InputStream inputStream = RulesDemoSetup.class.getResourceAsStream("/demo/rules/DemoSmartCityCamera.groovy")) {
            String rules = IOUtils.toString(inputStream, StandardCharsets.UTF_8);
            Ruleset ruleset = new AssetRuleset(
                managerDemoSetup.peopleCounter3AssetId, "PeopleCounter 3 Rules", GROOVY, rules
            );
            rulesetStorageService.merge(ruleset);
        }
    }
}
