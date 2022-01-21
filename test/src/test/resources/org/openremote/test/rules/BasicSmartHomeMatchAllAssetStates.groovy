package org.openremote.test.rules

import org.openremote.manager.rules.RulesBuilder
import org.openremote.model.asset.impl.BuildingAsset
import org.openremote.model.asset.impl.RoomAsset
import org.openremote.model.query.AssetQuery
import static org.openremote.model.value.ValueType.*

RulesBuilder rules = binding.rules

rules.add()
        .name("Living Room All")
        .when(
        { facts ->
            !facts.matchFirst("Living Room All").isPresent() &&
                    facts.matchFirstAssetState(new AssetQuery().names("Living Room 1")).isPresent()
        })
        .then(
        { facts ->
            facts.put("Living Room All", "fired")
        })

rules.add()
        .name("Kitchen All")
        .when(
        { facts ->
            !facts.matchFirst("Kitchen All").isPresent() &&
                    facts.matchFirstAssetState(new AssetQuery().names("Kitchen 1")).isPresent()
        })
        .then(
        { facts ->
            facts.put("Kitchen All", "fired")
        })

rules.add()
        .name("Kitchen Number Attributes")
        .when(
        { facts ->
            !facts.matchFirst("Kitchen Number Attributes").isPresent() &&
                    facts.matchAssetState(new AssetQuery().names("Kitchen 1"))
                            .filter({ assetState -> assetState.type == NUMBER })
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Kitchen Number Attributes", "fired")
        })

rules.add()
        .name("Boolean attributes")
        .when(
        { facts ->
            !facts.matchFirst("Boolean attributes").isPresent() &&
                    facts.matchAssetState(new AssetQuery())
                            .filter({ assetState -> assetState.type == BOOLEAN })
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Boolean attributes", "fired")
        })

rules.add()
        .name("String attributes")
        .when(
        { facts ->
            !facts.matchFirst("String Attributes").isPresent() &&
                    facts.matchAssetState(new AssetQuery())
                            .filter({ assetState -> assetState.type == TEXT })
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("String Attributes", "fired")
        })

rules.add()
        .name("Number value types")
        .when(
        { facts ->
            !facts.matchFirst("Number value types").isPresent() &&
                    facts.matchAssetState(new AssetQuery())
                            .filter({ assetState -> assetState.value.isPresent() })
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Number value types", "fired")
        })

rules.add()
        .name("Parent Type Residence")
        .when(
        { facts ->
            !facts.matchFirst("Parent Type Residence").isPresent() &&
                    facts.matchAssetState(new AssetQuery().parents(BuildingAsset))
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Parent Type Residence", "fired")
        })

rules.add()
        .name("Asset Type Room")
        .when(
        { facts ->
            !facts.matchFirst("Asset Type Room").isPresent() &&
                    facts.matchAssetState(new AssetQuery().types(RoomAsset))
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Asset Type Room", "fired")
        })

// This is never matched, living room doesn't have child assets - testing negative
rules.add()
        .name("Living Room as Parent")
        .when(
        { facts ->
            !facts.matchFirst("Living Room as Parent").isPresent() &&
                    facts.matchAssetState(new AssetQuery())
                            .filter({ assetState -> assetState.parentName == "Living Room"})
                            .findFirst().isPresent()
        })
        .then(
        { facts ->
            facts.put("Living Room as Parent", "fired")
        })
