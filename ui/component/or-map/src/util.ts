import {LngLat, LngLatBounds, LngLatBoundsLike, LngLatLike} from "maplibre-gl";
import {Asset, AssetDescriptor, Attribute, GeoJSONPoint, ValueHolder, WellknownAttributes} from "@openremote/model";
import { AssetModelUtil } from "@openremote/core";
import { AttributeMarkerColours, AttributeMarkerColoursRange, RangeAttributeMarkerColours } from "./markers/or-map-marker-asset";

export function getLngLat(lngLatLike?: LngLatLike | Asset | ValueHolder<any> | GeoJSONPoint): { lng: number, lat: number } | undefined {
    if (!lngLatLike) {
        return;
    }

    if (lngLatLike instanceof LngLat) {
        return lngLatLike as LngLat;
    }

    if ((lngLatLike as LngLat).lat) {
        if ((lngLatLike as any).lon) {
            return {lng: (lngLatLike as any).lon, lat: (lngLatLike as LngLat).lat};
        }
        return {lng: (lngLatLike as LngLat).lng, lat: (lngLatLike as LngLat).lat};
    }

    if (Array.isArray(lngLatLike)) {
        return {lng: (lngLatLike as number[])[0], lat: (lngLatLike as number[])[1]};
    }

    if ((lngLatLike as GeoJSONPoint).coordinates && Array.isArray((lngLatLike as GeoJSONPoint).coordinates) && ((lngLatLike as GeoJSONPoint).coordinates as number[]).length >= 2) {
        return getLngLat((lngLatLike as GeoJSONPoint).coordinates as LngLatLike);
    }

    if ((lngLatLike as Asset).attributes) {
        // This is an asset
        const locationAttribute = (lngLatLike as Asset).attributes![WellknownAttributes.LOCATION];
        if (!locationAttribute) {
            return;
        }
        if (locationAttribute.value) {
            return getLngLat(locationAttribute.value);
        }
        return;
    }

    if ((lngLatLike as ValueHolder<any>).value) {
        return getLngLat((lngLatLike as Attribute<any>).value as GeoJSONPoint);
    }
}

export function getGeoJSONPoint(lngLat: LngLatLike | undefined): GeoJSONPoint | undefined {
    if (!lngLat) {
        return;
    }

    return Array.isArray(lngLat) ? {type: "Point", coordinates: lngLat as number[]} : {type: "Point", coordinates: [(lngLat as any).hasOwnProperty("lng") ? (lngLat as LngLat).lng : (lngLat as any).lon, lngLat.lat]};
}

export function getLngLatBounds(lngLatBoundsLike?: LngLatBoundsLike): LngLatBounds | undefined {
    if (lngLatBoundsLike) {

        if (lngLatBoundsLike instanceof LngLatBounds) {
            return lngLatBoundsLike as LngLatBounds;
        }

        const arr = lngLatBoundsLike as any[];
        if (arr.length === 2) {
            const sw = getLngLat(arr[0]);
            const ne = getLngLat(arr[1]);
            if (sw && ne) {
                return new LngLatBounds(sw, ne);
            }
        }
        
        if (arr.length === 4) {
            return new LngLatBounds([arr[0], arr[1], arr[2], arr[3]]);
        }
    }
}

export function getLatLngBounds(lngLatBoundsLike?: LngLatBoundsLike): L.LatLngBounds | undefined {
    const lngLatBounds = getLngLatBounds(lngLatBoundsLike);
    if (lngLatBounds) {
        return L.latLngBounds(lngLatBounds.getNorthEast()!, lngLatBounds.getSouthWest()!);
    }
}

interface OverrideConfigSettings {
    markerConfig: AttributeMarkerColours | RangeAttributeMarkerColours;
    attributeValue: number | string | boolean;
}

export function getMarkerIconAndColorFromAssetType(
    type: AssetDescriptor | string | undefined,
    configOverrideSettings?: OverrideConfigSettings
): {icon: string, color: string | undefined | AttributeMarkerColoursRange[]} | undefined {

    if (!type) {
        return;
    }

    const descriptor = typeof(type) === "string" ? AssetModelUtil.getAssetDescriptor(type) : type;

    let colourOverride: string | AttributeMarkerColoursRange[] | undefined;
    if (configOverrideSettings) {
        if (configOverrideSettings.markerConfig && descriptor) {
            const markerConfig = configOverrideSettings.markerConfig;
            const attrVal = configOverrideSettings.attributeValue;
            if (markerConfig.type === 'range' && attrVal) {
                const ranges = markerConfig.ranges;
                // see in what range the attrVal fits and if not, what the setting for the highest range is
                const colourFromRange = ranges.find(r => attrVal < r.max) || ranges.reduce((a, b) => (a.max > b.max) ? a : b);
                colourOverride = colourFromRange.colour || undefined;
            } else if (markerConfig.type === 'boolean') {
                const value = attrVal ? 'true' : 'false';
                colourOverride = markerConfig[value] || undefined;
            }
        }
        // todo icon override
    }

    const icon = descriptor && descriptor.icon ? descriptor.icon : "help-circle";

    let color: string | undefined | AttributeMarkerColoursRange[];
    if (colourOverride) {
        color = colourOverride as AttributeMarkerColoursRange[];
    } else if (descriptor && descriptor.colour) {
        color = descriptor.colour as string;
    }

    return {
        color: color,
        icon: icon
    };
}
