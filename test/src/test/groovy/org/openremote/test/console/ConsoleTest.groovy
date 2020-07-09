package org.openremote.test.console


import com.google.firebase.messaging.Message
import org.openremote.container.util.UniqueIdentifierGenerator
import org.openremote.manager.asset.AssetStorageService
import org.openremote.manager.notification.NotificationService
import org.openremote.manager.notification.PushNotificationHandler
import org.openremote.manager.rules.RulesEngine
import org.openremote.manager.rules.RulesService
import org.openremote.manager.rules.RulesetStorageService
import org.openremote.manager.rules.geofence.ORConsoleGeofenceAssetAdapter
import org.openremote.manager.setup.SetupService
import org.openremote.manager.setup.builtin.KeycloakDemoSetup
import org.openremote.manager.setup.builtin.ManagerDemoSetup
import org.openremote.model.asset.Asset
import org.openremote.model.asset.AssetResource
import org.openremote.model.attribute.AttributeRef
import org.openremote.model.console.ConsoleConfiguration
import org.openremote.model.console.ConsoleProvider
import org.openremote.model.console.ConsoleRegistration
import org.openremote.model.console.ConsoleResource
import org.openremote.model.geo.GeoJSONPoint
import org.openremote.model.notification.AbstractNotificationMessage
import org.openremote.model.notification.Notification
import org.openremote.model.notification.NotificationSendResult
import org.openremote.model.notification.PushNotificationMessage
import org.openremote.model.query.filter.RadialGeofencePredicate
import org.openremote.model.rules.AssetRuleset
import org.openremote.model.rules.RulesResource
import org.openremote.model.rules.Ruleset
import org.openremote.model.rules.TenantRuleset
import org.openremote.model.value.ObjectValue
import org.openremote.model.value.Values
import org.openremote.test.ManagerContainerTrait
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import javax.ws.rs.WebApplicationException
import java.util.concurrent.TimeUnit
import java.util.stream.IntStream

import static org.openremote.manager.setup.builtin.ManagerDemoSetup.DEMO_RULE_STATES_SMART_BUILDING
import static org.openremote.manager.setup.builtin.ManagerDemoSetup.SMART_BUILDING_LOCATION
import static org.openremote.model.Constants.KEYCLOAK_CLIENT_ID
import static org.openremote.model.asset.AssetResource.Util.WRITE_ATTRIBUTE_HTTP_METHOD
import static org.openremote.model.asset.AssetResource.Util.getWriteAttributeUrl
import static org.openremote.model.attribute.AttributeType.LOCATION
import static org.openremote.model.attribute.MetaItemType.RULE_STATE
import static org.openremote.model.rules.RulesetStatus.DEPLOYED
import static org.openremote.model.util.TextUtil.isNullOrEmpty
import static org.openremote.model.value.Values.parse

class ConsoleTest extends Specification implements ManagerContainerTrait {

    def "Check full console behaviour"() {
        def notificationIds = []
        def targetTypes = []
        def targetIds = []
        def messages = []

        given: "the container environment is started"
        def conditions = new PollingConditions(timeout: 20, delay: 0.2)
        ORConsoleGeofenceAssetAdapter.NOTIFY_ASSETS_DEBOUNCE_MILLIS = 100
        ORConsoleGeofenceAssetAdapter.NOTIFY_ASSETS_BATCH_MILLIS = 200
        def container = startContainer(defaultConfig(), defaultServices())
        def pushNotificationHandler = container.getService(PushNotificationHandler.class)
        def notificationService = container.getService(NotificationService.class)
        def assetStorageService = container.getService(AssetStorageService.class)
        def keycloakDemoSetup = container.getService(SetupService.class).getTaskOfType(KeycloakDemoSetup.class)
        def managerDemoSetup = container.getService(SetupService.class).getTaskOfType(ManagerDemoSetup.class)
        def rulesService = container.getService(RulesService.class)
        def rulesetStorageService = container.getService(RulesetStorageService.class)

        and: "a mock push notification handler is injected"
        PushNotificationHandler mockPushNotificationHandler = Spy(pushNotificationHandler)
        mockPushNotificationHandler.isValid() >> true
        mockPushNotificationHandler.sendMessage(_ as Long, _ as Notification.Source, _ as String, _ as Notification.Target, _ as AbstractNotificationMessage) >> {
                id, source, sourceId, target, message ->
                    notificationIds << id
                    targetTypes << target.type
                    targetIds << target.id
                    messages << message
                    callRealMethod()
            }
        // Assume sent to FCM
        mockPushNotificationHandler.sendMessage(_ as Message) >> {
                message -> return NotificationSendResult.success()
            }
        notificationService.notificationHandlerMap.put(pushNotificationHandler.getTypeName(), mockPushNotificationHandler)

        def geofenceAdapter = (ORConsoleGeofenceAssetAdapter) rulesService.geofenceAssetAdapters.find {
            it.name == "ORConsole"
        }
        Asset testUser3Console1, testUser3Console2, anonymousConsole1

        and: "the demo location predicate console rules are loaded"
        Ruleset ruleset = new TenantRuleset(
            keycloakDemoSetup.tenantBuilding.realm,
            "Demo Tenant Building - Console Location",
            Ruleset.Lang.GROOVY,
            getClass().getResource("/demo/rules/DemoConsoleLocation.groovy").text)
        rulesetStorageService.merge(ruleset)

        expect: "the rule engine to become available and be running"
        conditions.eventually {
            def tenantBuildingEngine = rulesService.tenantEngines.get(keycloakDemoSetup.tenantBuilding.realm)
            assert tenantBuildingEngine != null
            assert tenantBuildingEngine.isRunning()
            assert tenantBuildingEngine.assetStates.size() == DEMO_RULE_STATES_SMART_BUILDING
        }

        and: "an authenticated user"
        def accessToken = authenticate(
                container,
                keycloakDemoSetup.tenantBuilding.realm,
                KEYCLOAK_CLIENT_ID,
                "testuser3",
                "testuser3"
        ).token

        and: "authenticated and anonymous console, rules and asset resources"
        def authenticatedConsoleResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm, accessToken).proxy(ConsoleResource.class)
        def authenticatedRulesResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm, accessToken).proxy(RulesResource.class)
        def authenticatedAssetResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm, accessToken).proxy(AssetResource.class)
        def anonymousConsoleResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm).proxy(ConsoleResource.class)
        def anonymousRulesResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm).proxy(RulesResource.class)
        def anonymousAssetResource = getClientApiTarget(serverUri(serverPort), keycloakDemoSetup.tenantBuilding.realm).proxy(AssetResource.class)

        when: "a console registers with an authenticated user"
        def consoleRegistration = new ConsoleRegistration(null,
                "Test Console",
                "1.0",
                "Android 7.0",
                new HashMap<String, ConsoleProvider>() {
                    {
                        put("geofence", new ConsoleProvider(
                                ORConsoleGeofenceAssetAdapter.NAME,
                                true,
                                false,
                                false,
                                false,
                                false,
                                null
                        ))
                        put("push", new ConsoleProvider(
                                "fcm",
                                true,
                                true,
                                true,
                                true,
                                false,
                                (ObjectValue) parse("{token: \"23123213ad2313b0897efd\"}").orElse(null)
                        ))
                    }
                },
                "",
                ["manager"] as String)
        def returnedConsoleRegistration = authenticatedConsoleResource.register(null, consoleRegistration)
        def consoleId = returnedConsoleRegistration.getId()
        def console = assetStorageService.find(consoleId, true)

        then: "the console asset should have been created and be correctly configured"
        assert console != null
        assert ConsoleConfiguration.getConsoleName(console).orElse(null) == "Test Console"
        assert ConsoleConfiguration.getConsoleVersion(console).orElse(null) == "1.0"
        assert ConsoleConfiguration.getConsolePlatform(console).orElse(null) == "Android 7.0"
        def consoleGeofenceProvider = ConsoleConfiguration.getConsoleProvider(console, "geofence").orElse(null)
        def consolePushProvider = ConsoleConfiguration.getConsoleProvider(console, "push").orElse(null)
        assert consoleGeofenceProvider != null
        assert consoleGeofenceProvider.version == ORConsoleGeofenceAssetAdapter.NAME
        assert consoleGeofenceProvider.requiresPermission
        assert !consoleGeofenceProvider.hasPermission
        assert !consoleGeofenceProvider.disabled
        assert consoleGeofenceProvider.data == null
        assert consolePushProvider != null
        assert consolePushProvider.version == "fcm"
        assert consolePushProvider.requiresPermission
        assert consolePushProvider.hasPermission
        assert !consolePushProvider.disabled
        assert consolePushProvider.data.get("token").flatMap {
            Values.getString(it)
        }.orElse(null) == "23123213ad2313b0897efd"

        and: "the console should have been linked to the authenticated user"
        def userAssets = assetStorageService.findUserAssets(keycloakDemoSetup.tenantBuilding.realm, keycloakDemoSetup.testuser3Id, consoleId)
        assert userAssets.size() == 1
        assert userAssets.get(0).assetName == "Test Console"

        when: "the console registration is updated"
        returnedConsoleRegistration.providers.get("geofence").hasPermission = true
        returnedConsoleRegistration.providers.put("test", new ConsoleProvider(
                "Test 1.0",
                false,
                false,
                false,
                false,
                true,
                null,
        ))
        returnedConsoleRegistration = authenticatedConsoleResource.register(null, returnedConsoleRegistration)
        console = assetStorageService.find(consoleId, true)
        testUser3Console1 = console
        consoleGeofenceProvider = ConsoleConfiguration.getConsoleProvider(console, "geofence").orElse(null)
        consolePushProvider = ConsoleConfiguration.getConsoleProvider(console, "push").orElse(null)
        def consoleTestProvider = ConsoleConfiguration.getConsoleProvider(console, "test").orElse(null)

        then: "the returned console should contain the updated data and have the same id"
        assert returnedConsoleRegistration.getId() == consoleId
        assert console != null
        assert consoleGeofenceProvider != null
        assert consoleGeofenceProvider.version == ORConsoleGeofenceAssetAdapter.NAME
        assert consoleGeofenceProvider.requiresPermission
        assert consoleGeofenceProvider.hasPermission
        assert !consoleGeofenceProvider.disabled
        assert consoleGeofenceProvider.data == null
        assert consolePushProvider != null
        assert consolePushProvider.version == "fcm"
        assert consolePushProvider.requiresPermission
        assert consolePushProvider.hasPermission
        assert !consolePushProvider.disabled
        assert consolePushProvider.data.get("token").flatMap {
            Values.getString(it)
        }.orElse(null) == "23123213ad2313b0897efd"
        assert consoleTestProvider != null
        assert consoleTestProvider.version == "Test 1.0"
        assert !consoleTestProvider.requiresPermission
        assert !consoleTestProvider.hasPermission
        assert consoleTestProvider.disabled
        assert consoleTestProvider.data == null

        when: "the console registration is updated anonymously"
        returnedConsoleRegistration.providers.get("test").disabled = false
        returnedConsoleRegistration = anonymousConsoleResource.register(null, returnedConsoleRegistration)
        console = assetStorageService.find(consoleId, true)
        consoleTestProvider = ConsoleConfiguration.getConsoleProvider(console, "test").orElse(null)

        then: "the returned console should contain the updated data and have the same id"
        assert returnedConsoleRegistration.getId() == consoleId
        assert console != null
        assert consoleGeofenceProvider != null
        assert consoleGeofenceProvider.version == ORConsoleGeofenceAssetAdapter.NAME
        assert consoleGeofenceProvider.requiresPermission
        assert consoleGeofenceProvider.hasPermission
        assert !consoleGeofenceProvider.disabled
        assert consoleGeofenceProvider.data == null
        assert consolePushProvider != null
        assert consolePushProvider.version == "fcm"
        assert consolePushProvider.requiresPermission
        assert consolePushProvider.hasPermission
        assert !consolePushProvider.disabled
        assert consolePushProvider.data.get("token").flatMap {
            Values.getString(it)
        }.orElse(null) == "23123213ad2313b0897efd"
        assert consoleTestProvider != null
        assert consoleTestProvider.version == "Test 1.0"
        assert !consoleTestProvider.requiresPermission
        assert !consoleTestProvider.hasPermission
        assert !consoleTestProvider.disabled
        assert consoleTestProvider.data == null

        when: "a console registers with the id of another existing asset"
        consoleRegistration.setId(managerDemoSetup.thingId)
        authenticatedConsoleResource.register(null, consoleRegistration)

        then: "the result should be bad request"
        WebApplicationException ex = thrown()
        ex.response.status == 400

        when: "a console registers with an id that doesn't exist"
        def unusedId = UniqueIdentifierGenerator.generateId("UnusedConsoleId")
        consoleRegistration.setId(unusedId)
        authenticatedConsoleResource.register(null, consoleRegistration)
        console = assetStorageService.find(unusedId, true)
        testUser3Console2 = console
        consoleGeofenceProvider = ConsoleConfiguration.getConsoleProvider(console, "geofence").orElse(null)
        consolePushProvider = ConsoleConfiguration.getConsoleProvider(console, "push").orElse(null)

        then: "the console should be registered successfully and the returned console should match the supplied console"
        assert console != null
        assert ConsoleConfiguration.getConsoleName(console).orElse(null) == "Test Console"
        assert ConsoleConfiguration.getConsoleVersion(console).orElse(null) == "1.0"
        assert ConsoleConfiguration.getConsolePlatform(console).orElse(null) == "Android 7.0"
        assert consoleGeofenceProvider != null
        assert consoleGeofenceProvider.version == ORConsoleGeofenceAssetAdapter.NAME
        assert consoleGeofenceProvider.requiresPermission
        assert !consoleGeofenceProvider.hasPermission
        assert !consoleGeofenceProvider.disabled
        assert consoleGeofenceProvider.data == null
        assert consolePushProvider != null
        assert consolePushProvider.version == "fcm"
        assert consolePushProvider.requiresPermission
        assert consolePushProvider.hasPermission
        assert !consolePushProvider.disabled
        assert consolePushProvider.data.get("token").flatMap {
            Values.getString(it)
        }.orElse(null) == "23123213ad2313b0897efd"

        when: "an invalid console registration is registered"
        def invalidRegistration = new ConsoleRegistration(null, null, "1.0", null, null, null, null)
        authenticatedConsoleResource.register(null, invalidRegistration)

        then: "the result should be bad request"
        ex = thrown()
        ex.response.status == 400

        when: "a console is registered anonymously"
        consoleRegistration.id = null
        returnedConsoleRegistration = anonymousConsoleResource.register(null, consoleRegistration)
        consoleId = returnedConsoleRegistration.getId()
        console = assetStorageService.find(consoleId, true)
        anonymousConsole1 = console
        consoleGeofenceProvider = ConsoleConfiguration.getConsoleProvider(console, "geofence").orElse(null)
        consolePushProvider = ConsoleConfiguration.getConsoleProvider(console, "push").orElse(null)
        userAssets = assetStorageService.findUserAssets(null, null, consoleId)

        then: "the console asset should have been created and be correctly configured"
        assert !isNullOrEmpty(consoleId)
        assert console != null
        assert ConsoleConfiguration.getConsoleName(console).orElse(null) == "Test Console"
        assert ConsoleConfiguration.getConsoleVersion(console).orElse(null) == "1.0"
        assert ConsoleConfiguration.getConsolePlatform(console).orElse(null) == "Android 7.0"
        assert consoleGeofenceProvider != null
        assert consoleGeofenceProvider.version == ORConsoleGeofenceAssetAdapter.NAME
        assert consoleGeofenceProvider.requiresPermission
        assert !consoleGeofenceProvider.hasPermission
        assert !consoleGeofenceProvider.disabled
        assert consoleGeofenceProvider.data == null
        assert consolePushProvider != null
        assert consolePushProvider.version == "fcm"
        assert consolePushProvider.requiresPermission
        assert consolePushProvider.hasPermission
        assert !consolePushProvider.disabled
        assert consolePushProvider.data.get("token").flatMap {
            Values.getString(it)
        }.orElse(null) == "23123213ad2313b0897efd"

        and: "the console should not have been linked to any users"
        assert userAssets.isEmpty()

        and: "each created consoles should have been sent notifications to refresh their geofences"
        conditions.eventually {
            assert notificationIds.size() == 3
            assert messages.count { ((PushNotificationMessage) it).data.get("GEOFENCE_REFRESH") != null } == 3
        }

        ////////////////////////////////////////////////////
        // LOCATION PREDICATE AND ALERT NOTIFICATION TESTS
        ////////////////////////////////////////////////////

        when: "notifications are cleared"
        notificationIds.clear()
        targetIds.clear()
        targetTypes.clear()
        messages.clear()

        and: "an authenticated user updates the location of a linked console"
        authenticatedAssetResource.writeAttributeValue(null, testUser3Console1.id, LOCATION.attributeName, new GeoJSONPoint(0d, 0d, 0d).toValue().toJson())

        then: "the consoles location should have been updated"
        conditions.eventually {
            testUser3Console1 = assetStorageService.find(testUser3Console1.id, true)
            assert testUser3Console1 != null
            def assetLocation = testUser3Console1.getAttribute(LOCATION.attributeName).flatMap { it.value }.flatMap {
                GeoJSONPoint.fromValue(it)
            }.orElse(null)
            assert assetLocation != null
            assert assetLocation.x == 0d
            assert assetLocation.y == 0d
            assert assetLocation.z == 0d
        }
// TODO: Update once console permissions model finalised
//        when: "an anonymous user updates the location of a console linked to users"
//        anonymousAssetResource.writeAttributeValue(null, testUser3Console1.id, LOCATION.name, new GeoJSONPoint(0d, 0d, 0d).objectToValue().toJson())
//
//        then: "the result should be forbidden"
//        ex = thrown()
//        ex.response.status == 403

        when: "a console's location is updated to be at the Smart Building"
        authenticatedAssetResource.writeAttributeValue(null, testUser3Console2.id, LOCATION.attributeName, SMART_BUILDING_LOCATION.toValue().toJson())
        long timestamp = Long.MAX_VALUE

        then: "a welcome home alert should be sent to the console"
        conditions.eventually {
            assert notificationIds.size() == 1
            def asset = assetStorageService.find(testUser3Console2.id, true)
            assert asset != null
            timestamp = asset.getAttribute(LOCATION.attributeName).flatMap { it.valueTimestamp }.orElse(Long.MAX_VALUE)
        }

        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "a console's location is updated to be at the Smart Building again"
        authenticatedAssetResource.writeAttributeValue(null, testUser3Console2.id, LOCATION.attributeName, SMART_BUILDING_LOCATION.toValue().toJson())

        then: "no more alerts should have been sent"
        conditions.eventually {
            def asset = assetStorageService.find(testUser3Console2.id, true)
            assert asset != null
            assert asset.getAttribute(LOCATION.attributeName).flatMap { it.valueTimestamp }.orElse(Long.MIN_VALUE) > timestamp
            timestamp = asset.getAttribute(LOCATION.attributeName).flatMap { it.valueTimestamp }.orElse(Long.MIN_VALUE)
            assert notificationIds.size() == 1
        }

        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "a console's location is updated to be null"
        authenticatedAssetResource.writeAttributeValue(null, testUser3Console2.id, LOCATION.attributeName, "null")

        then: "no more alerts should have been sent and the welcome reset rule should have fired on the tenant rule engine"
        conditions.eventually {
            def asset = assetStorageService.find(testUser3Console2.id, true)
            assert asset != null
            assert asset.getAttribute(LOCATION.attributeName).flatMap { it.valueTimestamp }.orElse(Long.MIN_VALUE) > timestamp
            assert notificationIds.size() == 1
            def tenantBuildingEngine = rulesService.tenantEngines.get(keycloakDemoSetup.tenantBuilding.realm)
            assert tenantBuildingEngine != null
            assert tenantBuildingEngine.isRunning()
            assert !tenantBuildingEngine.facts.getOptional("welcomeHome_${testUser3Console2.id}").isPresent()
        }


        when: "time advances"
        advancePseudoClock(1, TimeUnit.SECONDS, container)

        and: "a console's location is updated to be at the Smart Building again"
        authenticatedAssetResource.writeAttributeValue(null, testUser3Console2.id, LOCATION.attributeName, SMART_BUILDING_LOCATION.toValue().toJson())

        then: "another alert should have been sent"
        conditions.eventually {
            assert notificationIds.size() == 2
        }

        ///////////////////////////////////////
        // GEOFENCE PROVIDER TESTS
        ///////////////////////////////////////

        when: "the geofences of a user linked console are requested by the authenticated user"
        def geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console1.id)
        def expectedLocationPredicate = new RadialGeofencePredicate(100, SMART_BUILDING_LOCATION.y, SMART_BUILDING_LOCATION.x)

        then: "the welcome home geofence should be retrieved"
        assert expectedLocationPredicate.centrePoint.size() == 2
        assert expectedLocationPredicate.centrePoint[0] == expectedLocationPredicate.lng
        assert expectedLocationPredicate.centrePoint[1] == expectedLocationPredicate.lat
        assert geofences.size() == 1
        assert geofences[0].id == testUser3Console1.id + "_" + Integer.toString(expectedLocationPredicate.hashCode())
        assert geofences[0].lat == expectedLocationPredicate.lat
        assert geofences[0].lng == expectedLocationPredicate.lng
        assert geofences[0].radius == expectedLocationPredicate.radius
        assert geofences[0].httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
        assert geofences[0].url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))

// TODO: Update once console permissions model finalised
//        when: "an anonymous user tries to retrieve the geofences of a console linked to users"
//        geofences = anonymousRulesResource.getAssetGeofences(null, testUser3Console1.id)
//
//        then: "the result should be a forbidden request"
//        ex = thrown()
//        ex.response.status == 403

        when: "the geofences of testUser3Console2 are retrieved"
        geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console2.id)

        then: "the welcome home geofence should be retrieved"
        assert geofences.size() == 1
        assert geofences[0].id == testUser3Console2.id + "_" + Integer.toString(expectedLocationPredicate.hashCode())
        assert geofences[0].lat == expectedLocationPredicate.lat
        assert geofences[0].lng == expectedLocationPredicate.lng
        assert geofences[0].radius == expectedLocationPredicate.radius
        assert geofences[0].httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
        assert geofences[0].url == getWriteAttributeUrl(new AttributeRef(testUser3Console2.id, LOCATION.getAttributeName()))

        when: "the geofences of anonymousConsole1 are retrieved"
        geofences = anonymousRulesResource.getAssetGeofences(null, anonymousConsole1.id)

        then: "the welcome home geofence should be retrieved"
        assert geofences.size() == 1
        assert geofences[0].id == anonymousConsole1.id + "_" + Integer.toString(expectedLocationPredicate.hashCode())
        assert geofences[0].lat == expectedLocationPredicate.lat
        assert geofences[0].lng == expectedLocationPredicate.lng
        assert geofences[0].radius == expectedLocationPredicate.radius
        assert geofences[0].httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
        assert geofences[0].url == getWriteAttributeUrl(new AttributeRef(anonymousConsole1.id, LOCATION.getAttributeName()))

        when: "the geofences of a non-existent console are retrieved"
        geofences = anonymousRulesResource.getAssetGeofences(null, UniqueIdentifierGenerator.generateId("nonExistentConsole"))

        then: "an empty array should be returned"
        assert geofences.size() == 0

        when: "a console is deleted"
        assetStorageService.delete([testUser3Console2.id],false)

        then: "the deleted console should be removed from ORConsoleGeofenceAssetAdapter"
        conditions.eventually {
            assert !geofenceAdapter.consoleIdRealmMap.containsKey(testUser3Console2.id)
        }

        then: "no geofences should be returned for this deleted console"
        conditions.eventually {
            geofences = anonymousRulesResource.getAssetGeofences(null, testUser3Console2.id)
            assert geofences.size() == 0
        }

        when: "a new ruleset is deployed on the console parent asset with multiple location predicate rules (including a duplicate and a rectangular predicate)"
        def newRuleset = new AssetRuleset(
            testUser3Console1.parentId,
            "Console test location predicates",
            Ruleset.Lang.GROOVY,
            getClass().getResource("/org/openremote/test/rules/BasicLocationPredicates.groovy").text)
        newRuleset = rulesetStorageService.merge(newRuleset)
        RulesEngine consoleParentEngine = null
        def newLocationPredicate = new RadialGeofencePredicate(50, 0, -60)

        then: "the new rule engine should be created and be running"
        conditions.eventually {
            consoleParentEngine = rulesService.assetEngines.get(testUser3Console1.parentId)
            assert consoleParentEngine != null
            assert consoleParentEngine.isRunning()
            assert consoleParentEngine.deployments.size() == 1
            assert consoleParentEngine.deployments.values().any({
                it.name == "Console test location predicates" && it.status == DEPLOYED
            })
        }

        then: "a push notification should have been sent to the two remaining consoles telling them to refresh their geofences"
        conditions.eventually {
            assert notificationIds.size() == 4
            assert ((PushNotificationMessage) messages[2]).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
            assert ((PushNotificationMessage) messages[3]).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
        }

        then: "the geofences of testUser3Console1 should contain the welcome home geofence and new radial geofence (but not the rectangular and duplicate predicates)"
        conditions.eventually {
            geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console1.id)
            assert geofences.size() == 2
            def geofence1 = geofences.find {
                it.id == testUser3Console1.id + "_" + Integer.toString(
                        expectedLocationPredicate.hashCode())
            }
            def geofence2 = geofences.find {
                it.id == testUser3Console1.id + "_" + Integer.toString(
                        newLocationPredicate.hashCode())
            }
            assert geofence1 != null && geofence2 != null
            assert geofence1.lat == expectedLocationPredicate.lat
            assert geofence1.lng == expectedLocationPredicate.lng
            assert geofence1.radius == expectedLocationPredicate.radius
            assert geofence1.httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
            assert geofence1.url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))
            assert geofence2.lat == newLocationPredicate.lat
            assert geofence2.lng == newLocationPredicate.lng
            assert geofence2.radius == newLocationPredicate.radius
            assert geofence2.httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
            assert geofence2.url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))
        }

        when: "an existing ruleset containing a radial location predicate is updated"
        newRuleset.rules = getClass().getResource("/org/openremote/test/rules/BasicLocationPredicates2.groovy").text
        newRuleset = rulesetStorageService.merge(newRuleset)
        newLocationPredicate = new RadialGeofencePredicate(150, 10, 40)

        then: "a push notification should have been sent to the two remaining consoles telling them to refresh their geofences"
        conditions.eventually {
            assert notificationIds.size() == 6
            assert ((PushNotificationMessage) messages[4]).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
            assert ((PushNotificationMessage) messages[5]).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
        }

        then: "the geofences of testUser3Console1 should still contain two geofences but the location of the second should have been updated"
        conditions.eventually {
            geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console1.id)
            assert geofences.size() == 2
            def geofence1 = geofences.find {
                it.id == testUser3Console1.id + "_" + Integer.toString(
                        expectedLocationPredicate.hashCode())
            }
            def geofence2 = geofences.find {
                it.id == testUser3Console1.id + "_" + Integer.toString(
                        newLocationPredicate.hashCode())
            }
            assert geofence1 != null && geofence2 != null
            assert geofence1.lat == expectedLocationPredicate.lat
            assert geofence1.lng == expectedLocationPredicate.lng
            assert geofence1.radius == expectedLocationPredicate.radius
            assert geofence1.httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
            assert geofence1.url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))
            assert geofence2.lat == newLocationPredicate.lat
            assert geofence2.lng == newLocationPredicate.lng
            assert geofence2.radius == newLocationPredicate.radius
            assert geofence2.httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
            assert geofence2.url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))
        }

        when: "a location predicate ruleset is removed"
        rulesetStorageService.delete(AssetRuleset.class, newRuleset.id)

        and: "previous notification messages are cleared"
        notificationIds.clear()
        messages.clear()

        then: "only the welcome home geofence should remain"
        conditions.eventually {
            geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console1.id)
            assert geofences.size() == 1
            assert geofences[0].id == testUser3Console1.id + "_" + Integer.toString(
                    expectedLocationPredicate.hashCode())
            assert geofences[0].lat == expectedLocationPredicate.lat
            assert geofences[0].lng == expectedLocationPredicate.lng
            assert geofences[0].radius == expectedLocationPredicate.radius
            assert geofences[0].httpMethod == WRITE_ATTRIBUTE_HTTP_METHOD
            assert geofences[0].url == getWriteAttributeUrl(new AttributeRef(testUser3Console1.id, LOCATION.getAttributeName()))
        }

        and: "the consoles should have been notified to refresh their geofences"
        conditions.eventually {
            assert messages.stream()
                    .filter({ it instanceof PushNotificationMessage })
                    .filter({
                ((PushNotificationMessage) it).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
            })
                    .count() == 2
        }

        when: "previous notification messages are cleared"
        notificationIds.clear()
        messages.clear()

        and: "another 10 consoles are added to the system"
        def id = testUser3Console1.id
        def extraConsoles = IntStream.rangeClosed(3, 12).mapToObj({
            testUser3Console1.id = null
            testUser3Console1.name = "Test Console $it"
            return assetStorageService.merge(testUser3Console1)
        }).collect({ it })
        testUser3Console1.id = id

        then: "the extra consoles should have been added"
        assert extraConsoles.size == 10

        and: "a push notifications should have been sent to each new console to refresh their geofence rules"
        conditions.eventually {
            assert messages.stream()
                    .filter({it instanceof PushNotificationMessage})
                    .filter({((PushNotificationMessage)it).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"})
                    .count() == 10
        }

        when: "previous notification messages are cleared"
        notificationIds.clear()
        messages.clear()

        and: "an existing ruleset containing a radial location predicate is updated"
        newRuleset.rules = getClass().getResource("/org/openremote/test/rules/BasicLocationPredicates.groovy").text
        newRuleset = rulesetStorageService.merge(newRuleset)

        then: "a push notification should have been sent to all consoles telling them to refresh their geofences"
        conditions.eventually {
            assert messages.stream()
                    .filter({ it instanceof PushNotificationMessage })
                    .filter({
                ((PushNotificationMessage) it).data.getString("action").orElse(null) == "GEOFENCE_REFRESH"
            })
                    .count() == 12
        }

        when: "the RULE_STATE meta is removed from a console's location attribute"
        testUser3Console1 = assetStorageService.find(testUser3Console1.id, true)
        testUser3Console1.getAttribute(LOCATION.getAttributeName()).get().getMeta().removeIf({
            it.name.orElse(null) == RULE_STATE.urn
        })
        testUser3Console1 = assetStorageService.merge(testUser3Console1)

        then: "no geofences should remain for this console"
        conditions.eventually {
            geofences = authenticatedRulesResource.getAssetGeofences(null, testUser3Console1.id)
            assert geofences.size() == 0
        }

        cleanup: "the mock is removed"
        notificationService.notificationHandlerMap.put(pushNotificationHandler.getTypeName(), pushNotificationHandler)
    }
}
