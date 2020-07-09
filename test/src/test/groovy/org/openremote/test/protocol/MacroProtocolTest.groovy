package org.openremote.test.protocol

import org.openremote.container.timer.TimerService
import org.openremote.manager.asset.AssetProcessingService
import org.openremote.manager.asset.AssetStorageService
import org.openremote.manager.setup.SetupService
import org.openremote.manager.setup.builtin.ManagerDemoSetup
import org.openremote.model.attribute.AttributeEvent
import org.openremote.model.attribute.AttributeExecuteStatus
import org.openremote.model.value.Values
import org.openremote.test.ManagerContainerTrait
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import java.util.concurrent.TimeUnit

class MacroProtocolTest extends Specification implements ManagerContainerTrait {
    def "Check macro agent and device asset deployment"() {

        given: "expected conditions"
        def conditions = new PollingConditions(timeout: 15, initialDelay: 0)

        when: "the container starts"
        def container = startContainerWithDemoScenesAndRules(defaultConfig(), defaultServices())
        def assetStorageService = container.getService(AssetStorageService.class)
        def assetProcessingService = container.getService(AssetProcessingService.class)
        def managerDemoSetup = container.getService(SetupService.class).getTaskOfType(ManagerDemoSetup.class)

        then: "the container should be running and attributes linked"
        conditions.eventually {
            assert noEventProcessedIn(assetProcessingService, 500)

            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert apartment1.getAttribute("morningScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.READY.toString()
            assert apartment1.getAttribute("dayScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.READY.toString()
            assert apartment1.getAttribute("eveningScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.READY.toString()
            assert apartment1.getAttribute("nightScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.READY.toString()
            assert !apartment1.getAttribute("morningSceneAlarmEnabled").get().getValueAsBoolean().orElse(true)
            assert apartment1.getAttribute("morningSceneTargetTemperature").get().getValueAsNumber().orElse(0d) == 21d
        }

        when: "Apartment 1 home scene is executed"
        def macroExecute = new AttributeEvent(managerDemoSetup.apartment1Id, "morningScene", AttributeExecuteStatus.REQUEST_START.asValue())
        assetProcessingService.sendAttributeEvent(macroExecute)

        then: "Apartment 1 alarm enabled, last scene and living room target temp attribute values should be updated to match the scene"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            def livingRoom = assetStorageService.find(managerDemoSetup.apartment1LivingroomId, true)
            assert !apartment1.getAttribute("alarmEnabled").get().getValueAsBoolean().orElse(true)
            assert apartment1.getAttribute("lastExecutedScene").get().getValueAsString().orElse("") == "MORNING"
            assert livingRoom.getAttribute("targetTemperature").get().getValueAsNumber().orElse(0d) == 21d
        }

        then: "Apartment 1 home scene attribute status should show as COMPLETED"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert apartment1.getAttribute("morningScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.COMPLETED.toString()
        }

        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "Apartment 1 away scene is executed"
        macroExecute = new AttributeEvent(managerDemoSetup.apartment1Id, "dayScene", AttributeExecuteStatus.REQUEST_START.asValue())
        assetProcessingService.sendAttributeEvent(macroExecute)

        then: "Apartment 1 alarm enabled, last scene and living room target temp attribute values should be update to match the scene"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            def livingRoom = assetStorageService.find(managerDemoSetup.apartment1LivingroomId, true)
            assert apartment1.getAttribute("alarmEnabled").get().getValueAsBoolean().orElse(false)
            assert apartment1.getAttribute("lastExecutedScene").get().getValueAsString().orElse("") == "DAY"
            assert livingRoom.getAttribute("targetTemperature").get().getValueAsNumber().orElse(0d) == 15d
        }

        then: "Apartment 1 away scene attribute status should show as COMPLETED"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert apartment1.getAttribute("dayScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.COMPLETED.toString()
        }

        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "The target temperature of the home scene is modified via the apartment attribute"
        def updateTargetTemp = new AttributeEvent(managerDemoSetup.apartment1Id, "morningSceneTargetTemperature", Values.create(10d))
        assetProcessingService.sendAttributeEvent(updateTargetTemp)

        then: "Apartment 1 home scene attribute status should reset to show as READY and home target temp should show new value"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert apartment1.getAttribute("morningScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.READY.toString()
            assert apartment1.getAttribute("morningSceneTargetTemperature").get().getValueAsNumber().orElse(0d) == 10d
            assert !apartment1.getAttribute("morningSceneAlarmEnabled").get().getValueAsBoolean().orElse(true)
        }

        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "Apartment 1 home scene is executed"
        macroExecute = new AttributeEvent(managerDemoSetup.apartment1Id, "morningScene", AttributeExecuteStatus.REQUEST_START.asValue())
        assetProcessingService.sendAttributeEvent(macroExecute)

        then: "Apartment 1 alarm enabled, last scene and living room target temp attribute values should be updated to match the scene"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            def livingRoom = assetStorageService.find(managerDemoSetup.apartment1LivingroomId, true)
            assert !apartment1.getAttribute("alarmEnabled").get().getValueAsBoolean().orElse(true)
            assert apartment1.getAttribute("lastExecutedScene").get().getValueAsString().orElse("") == "MORNING"
            assert livingRoom.getAttribute("targetTemperature").get().getValueAsNumber().orElse(0d) == 10d
        }

        then: "Apartment 1 home scene attribute status should show as COMPLETED"
        conditions.eventually {
            def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id, true)
            assert apartment1.getAttribute("morningScene").get().getValueAsString().orElse("") == AttributeExecuteStatus.COMPLETED.toString()
        }
    }
}
