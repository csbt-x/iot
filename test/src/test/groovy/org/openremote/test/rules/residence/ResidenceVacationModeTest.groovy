package org.openremote.test.rules.residence

import org.openremote.manager.asset.AssetProcessingService
import org.openremote.manager.asset.AssetStorageService
import org.openremote.manager.rules.RulesEngine
import org.openremote.manager.rules.RulesService
import org.openremote.manager.rules.RulesetStorageService
import org.openremote.manager.setup.SetupService
import org.openremote.manager.setup.builtin.ManagerDemoSetup
import org.openremote.model.attribute.AttributeEvent
import org.openremote.model.attribute.AttributeExecuteStatus
import org.openremote.model.rules.AssetRuleset
import org.openremote.model.rules.Ruleset
import org.openremote.model.rules.TemporaryFact
import org.openremote.model.value.Values
import org.openremote.test.ManagerContainerTrait
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import java.time.DayOfWeek

import static java.util.concurrent.TimeUnit.DAYS
import static java.util.concurrent.TimeUnit.HOURS
import static org.openremote.manager.setup.builtin.ManagerDemoSetup.DEMO_RULE_STATES_APARTMENT_1_WITH_SCENES

class ResidenceVacationModeTest extends Specification implements ManagerContainerTrait {

    def "Start and end vacation mode"() {

        given: "the container environment is started"
        def conditions = new PollingConditions(timeout: 20, delay: 0.2)
        def expirationMillis = TemporaryFact.GUARANTEED_MIN_EXPIRATION_MILLIS
        TemporaryFact.GUARANTEED_MIN_EXPIRATION_MILLIS = 500
        def container = startContainer(defaultConfig(), defaultServices())
        def managerDemoSetup = container.getService(SetupService.class).getTaskOfType(ManagerDemoSetup.class)
        def rulesService = container.getService(RulesService.class)
        def assetProcessingService = container.getService(AssetProcessingService.class)
        def assetStorageService = container.getService(AssetStorageService.class)
        def rulesetStorageService = container.getService(RulesetStorageService.class)
        RulesEngine apartment1Engine

        and: "scenes are added to apartment1 rooms"
        def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id)
        def apartment1Livingroom = assetStorageService.find(managerDemoSetup.apartment1LivingroomId)
        def apartment1Kitchen = assetStorageService.find(managerDemoSetup.apartment1KitchenId)
        def apartment1Hallway = assetStorageService.find(managerDemoSetup.apartment1HallwayId)
        ManagerDemoSetup.createDemoApartmentScenes(
            assetStorageService,
            apartment1,
            ManagerDemoSetup.DEMO_APARTMENT_SCENES,
            apartment1Livingroom, apartment1Kitchen, apartment1Hallway)

        and: "some rules"
        Ruleset ruleset = new AssetRuleset(
            managerDemoSetup.apartment1Id,
            "Demo Apartment - Vacation Mode",
            Ruleset.Lang.GROOVY,
            getClass().getResource("/demo/rules/DemoResidenceVacationMode.groovy").text)
        rulesetStorageService.merge(ruleset)

        expect: "the rule engines to become available and be running"
        conditions.eventually {
            apartment1Engine = rulesService.assetEngines.get(managerDemoSetup.apartment1Id)
            assert apartment1Engine != null
            assert apartment1Engine.isRunning()
            assert apartment1Engine.assetStates.size() == DEMO_RULE_STATES_APARTMENT_1_WITH_SCENES

            // The macro should be ready
            def asset = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            def executionStatus = AttributeExecuteStatus.fromString(
                    asset.getAttribute("dayScene").get().getValueAsString().get()
            ).get()
            assert executionStatus == AttributeExecuteStatus.READY
        }

        when: "the vacation days are set to 5"
        double fiveDaysInFuture = getClockTimeOf(container) + (5 * 24 * 60 * 60 * 1000)
        assetProcessingService.sendAttributeEvent(new AttributeEvent(
                managerDemoSetup.apartment1Id, "vacationUntil", Values.create(fiveDaysInFuture)
        ))

        then: "the DAY scene should be executed and scene timers disabled"
        conditions.eventually {
            def asset = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            def executionStatus = AttributeExecuteStatus.fromString(
                    asset.getAttribute("dayScene").get().getValueAsString().get()
            ).get()
            assert executionStatus == AttributeExecuteStatus.COMPLETED
            assert !asset.getAttribute("sceneTimerEnabled").get().getValueAsBoolean().get()
            DayOfWeek.values().each {
                assert !asset.getAttribute("morningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("daySceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("eveningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("nightSceneEnabled" + it.name()).get().getValueAsBoolean().get()
            }
        }

        when: "time advanced to the next day"
        advancePseudoClock(24, HOURS, container)

        then: "vacation mode is still on"
        conditions.eventually {
            def asset = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert asset.getAttribute("vacationUntil").get().getValueAsNumber().get() == fiveDaysInFuture
            assert !asset.getAttribute("sceneTimerEnabled").get().getValueAsBoolean().get()
            DayOfWeek.values().each {
                assert !asset.getAttribute("morningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("daySceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("eveningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert !asset.getAttribute("nightSceneEnabled" + it.name()).get().getValueAsBoolean().get()
            }
        }

        when: "time advanced a few days"
        advancePseudoClock(5, DAYS, container)

        then: "vacation mode is off and scene timers are enabled"
        conditions.eventually {
            def asset = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert !asset.getAttribute("vacationUntil").get().getValue().isPresent()
            assert asset.getAttribute("sceneTimerEnabled").get().getValueAsBoolean().get()
            DayOfWeek.values().each {
                assert asset.getAttribute("morningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert asset.getAttribute("daySceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert asset.getAttribute("eveningSceneEnabled" + it.name()).get().getValueAsBoolean().get()
                assert asset.getAttribute("nightSceneEnabled" + it.name()).get().getValueAsBoolean().get()
            }
        }

        cleanup: "the static rules time variable is reset"
        TemporaryFact.GUARANTEED_MIN_EXPIRATION_MILLIS = expirationMillis
    }
}
