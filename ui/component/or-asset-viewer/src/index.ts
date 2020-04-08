import {customElement, html, LitElement, property, PropertyValues, TemplateResult} from "lit-element";
import "@openremote/or-icon";
import "@openremote/or-input";
import "@openremote/or-attribute-input";
import "@openremote/or-attribute-history";
import "@openremote/or-chart";
import "@openremote/or-translate";
import {translate} from "@openremote/or-translate";
import {InputType, OrInput, OrInputChangedEvent} from "@openremote/or-input";
import "@openremote/or-map";
import manager, {AssetModelUtil, subscribe, Util} from "@openremote/core";
import "@openremote/or-panel";
import "@openremote/or-table";
import {OrChartConfig, OrChartEvent} from "@openremote/or-chart";
import {HistoryConfig, OrAttributeHistory, OrAttributeHistoryEvent} from "@openremote/or-attribute-history";
import {Type as MapType, Util as MapUtil} from "@openremote/or-map";
import {
    Asset,
    AssetAttribute,
    AssetEvent,
    AssetType,
    Attribute,
    AttributeEvent,
    AttributeType,
    MetaItemType,
    MetaItem
} from "@openremote/model";
import {style} from "./style";
import i18next from "i18next";
import {styleMap} from "lit-html/directives/style-map";
import {classMap} from "lit-html/directives/class-map";

export type PanelType = "property" | "location" | "attribute" | "history" | "chart" | "group";

export interface PanelConfig {
    type?: PanelType;
    hide?: boolean;
    hideOnMobile?: boolean;
    defaults?: string[];
    include?: string[];
    exclude?: string[];
    readonly?: string[];
    panelStyles?: { [style: string]: string };
    fieldStyles?: { [field: string]: { [style: string]: string } };
}

export interface AssetViewerConfig {
    panels: {[name: string]: PanelConfig};
    viewerStyles?: { [style: string]: string };
    propertyViewProvider?: (property: string, value: any, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    attributeViewProvider?: (attribute: Attribute, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    panelViewProvider?: (attributes: AssetAttribute[], panelName: string, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    mapType?: MapType;
    historyConfig?: HistoryConfig;
    chartConfig?: OrChartConfig;
}

export interface ViewerConfig {
    default?: AssetViewerConfig;
    assetTypes?: { [assetType: string]: AssetViewerConfig };
    propertyViewProvider?: (property: string, value: any, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    attributeViewProvider?: (attribute: Attribute, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    panelViewProvider?: (attributes: AssetAttribute[], panelName: string, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) => TemplateResult | undefined;
    mapType?: MapType;
    historyConfig?: HistoryConfig;
}

class EventHandler {
    _callbacks: Function[];

    constructor() {
        this._callbacks = [];
    }

    startCallbacks() {
        return new Promise((resolve, reject) => {
            if (this._callbacks && this._callbacks.length > 0) {
                this._callbacks.forEach(cb => cb());
            }
            resolve();
        })

    }

    addCallback(callback: Function) {
        this._callbacks.push(callback);
    }
}
const onRenderComplete = new EventHandler();

@customElement("or-asset-viewer")
export class OrAssetViewer extends subscribe(manager)(translate(i18next)(LitElement)) {

    public static DEFAULT_MAP_TYPE = MapType.VECTOR;
    public static DEFAULT_PANEL_TYPE: PanelType = "attribute";

    public static DEFAULT_CONFIG: AssetViewerConfig = {
        viewerStyles: {

        },
        panels: {
            "underlying assets": {
                type: "group",
                panelStyles: {}
            },
            "info": {
                type: "attribute",
                hideOnMobile: true,
                include: ["userNotes", "manufacturer", "model"],
                panelStyles: {
                },
                fieldStyles: {
                    name: {
                        width: "60%"
                    },
                    createdOn: {
                        width: "40%",
                        paddingLeft: "20px",
                        boxSizing: "border-box"
                    }
                }
            },
            "location": {
                type: "location",
                include: ["location"],
                panelStyles: {
                },
                fieldStyles: {
                    location: {
                    }
                }
            },
            "attributes": {
                type: "attribute",
                panelStyles: {
                }
            },
            "history": {
                type: "history",
                panelStyles: {
                }
            },
            "chart": {
                type: "chart",
                hideOnMobile: true,
                panelStyles: {
                    gridColumn: "1 / -1",
                    gridRowStart: "1"
                }
            }
        }
    };

    public static DEFAULT_INFO_PROPERTIES = [
        "name",
        "createdOn",
        "type",
        "path",
        "accessPublicRead"
    ];

    static get styles() {
        return [
            style
        ];
    }

    @property({type: Object, reflect: false})
    public asset?: Asset;

    @property({type: String})
    public assetId?: string;

    @property({type: Object})
    public config?: ViewerConfig;

    @property()
    protected _loading: boolean = false;

    protected _viewerConfig?: AssetViewerConfig;
    protected _attributes?: AssetAttribute[];


    constructor() {
        super();
        window.addEventListener('resize', () => OrAssetViewer.generateGrid(this.shadowRoot));
        
        this.addEventListener(OrChartEvent.NAME,() => OrAssetViewer.generateGrid(this.shadowRoot));
        this.addEventListener(OrAttributeHistoryEvent.NAME,() => OrAssetViewer.generateGrid(this.shadowRoot));
    }

    shouldUpdate(changedProperties: PropertyValues): boolean {

        if (changedProperties.has("asset")) {
            this._viewerConfig = undefined;
            this._attributes = undefined;

            if (this.asset) {
                this._viewerConfig = this._getPanelConfig(this.asset);
                this._attributes = Util.getAssetAttributes(this.asset);
            }
        }

        return super.shouldUpdate(changedProperties);
    }

    protected render() {

        if (this._loading) {
            return html`
                <div class="msg"><or-translate value="loading"></or-translate></div>
            `;
        }

        if (!this.asset && !this.assetId) {
            return html`
                <div class="msg"><or-translate value="noAssetSelected"></or-translate></div>
            `;
        }

        if (!this.asset) {
            return html`
                <div><or-translate value="notFound"></or-translate></div>
            `;
        }

        if (!this._attributes || !this._viewerConfig) {
            return html``;
        }

        const descriptor = AssetModelUtil.getAssetDescriptor(this.asset!.type!);

        return html`
            <div id="wrapper">
                <div id="asset-header">
                    <a class="back-navigation" @click="${() => window.history.back()}">
                        <or-icon icon="chevron-left"></or-icon>
                    </a>
                    <div id="title">
                        <or-icon title="${descriptor && descriptor.type ? descriptor.type : "unset"}" style="--or-icon-fill: ${descriptor && descriptor.color ? "#" + descriptor.color : "unset"}" icon="${descriptor && descriptor.icon ? descriptor.icon : AssetType.THING.icon}"></or-icon>${this.asset.name}
                    </div>
                    <div id="created" class="mobileHidden"><or-translate value="createdOnWithDate" .options="${{ date: new Date(this.asset!.createdOn!) } as i18next.TOptions<i18next.InitOptions>}"></or-translate></div>
                </div>
                <div id="container" style="${this._viewerConfig.viewerStyles ? styleMap(this._viewerConfig.viewerStyles) : ""}">
                    ${html`${Object.entries(this._viewerConfig.panels).map(([name, panelConfig]) => {
                        const panelTemplate = OrAssetViewer.getPanel(name, this.asset!, this._attributes!, this._viewerConfig!, panelConfig, this.shadowRoot);
                        return panelTemplate || ``;
                    })}`}
                </div>
            </div>
        `;
    }

    protected updated(_changedProperties: PropertyValues) {
        super.updated(_changedProperties);

        if (_changedProperties.has("assetId")) {
            this.asset = undefined;
            if (this.assetId) {
                this._loading = true;
                super.assetIds = [this.assetId];
            } else {
                super.assetIds = undefined;
            }
        }

        this.onCompleted().then(() => {
            onRenderComplete.startCallbacks().then(() => {
                OrAssetViewer.generateGrid(this.shadowRoot);
            });
        });

    }

    async onCompleted() {
        await this.updateComplete;
    }

    public static generateGrid(shadowRoot: ShadowRoot | null) {
        if (shadowRoot) {
            const grid = shadowRoot.querySelector('#container');
            if (grid) {
                const rowHeight = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-auto-rows'));
                const rowGap = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-row-gap'));
                const items = shadowRoot.querySelectorAll('.panel');
                if (items) {
                    items.forEach((item) => {
                        const content = item.querySelector('.panel-content-wrapper');
                        if (content) {
                            const rowSpan = Math.ceil((content.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap));
                            (item as HTMLElement).style.gridRowEnd = "span " + rowSpan;
                        }
                    });
                }
            }
        }
    }

    public static getInfoProperties(config?: PanelConfig): string[] {
        let properties = config && config.include ? config.include : OrAssetViewer.DEFAULT_INFO_PROPERTIES;

        if (config && config.exclude) {
            properties = properties.filter((p) => !config.exclude!.find((excluded) => excluded === p))
        }

        return properties;
    }

    public static getPanel(name: string, asset: Asset, attributes: AssetAttribute[], viewerConfig: AssetViewerConfig, panelConfig: PanelConfig, shadowRoot: ShadowRoot | null) {
        const content = OrAssetViewer.getPanelContent(name, asset, attributes, viewerConfig, panelConfig, shadowRoot);
        if (!content) {
            return;
        }

        return html`
            <div class=${classMap({"panel": true, mobileHidden: panelConfig.hideOnMobile === true})} id="${name}-panel" style="${panelConfig && panelConfig.panelStyles ? styleMap(panelConfig.panelStyles) : ""}">
                <div class="panel-content-wrapper">
                    <div class="panel-title">
                        <or-translate value="${name}"></or-translate>
                    </div>
                    <div class="panel-content">
                        ${content}
                    </div>
                </div>
            </div>
        `;
    }

    public static getPanelContent(panelName: string, asset: Asset, attributes: AssetAttribute[], viewerConfig: AssetViewerConfig, panelConfig: PanelConfig, shadowRoot: ShadowRoot | null): TemplateResult | undefined {
        if (panelConfig.hide || attributes.length === 0) {
            return;
        }

        if (viewerConfig.panelViewProvider) {
            const template = viewerConfig.panelViewProvider(attributes, panelName, viewerConfig, panelConfig);
            if (template) {
                return template;
            }
        }

        let styles = panelConfig ? panelConfig.fieldStyles : undefined;
        const defaultAttributes = panelConfig && panelConfig.defaults ? panelConfig.defaults : undefined;
        const includedAttributes = panelConfig && panelConfig.include ? panelConfig.include : undefined;
        const excludedAttributes = panelConfig && panelConfig.exclude ? panelConfig.exclude : [];
        const attrs = attributes.filter((attr) =>
            (!includedAttributes || includedAttributes.indexOf(attr.name!) >= 0)
            && (!excludedAttributes || excludedAttributes.indexOf(attr.name!) < 0));

        let content: TemplateResult | undefined;


        // if (panelConfig && panelConfig.type === "property") {
        //     // Special handling for info panel which only shows properties
        //     let properties = OrAssetViewer.getInfoProperties(panelConfig);

        //     if (properties.length === 0) {
        //         return;
        //     }

        //     content = html`
        //         ${properties.map((prop) => {
        //         let style = styles ? styles[prop!] : undefined;
        //         return prop === "attributes" ? `` : OrAssetViewer.getField(prop, true, style, OrAssetViewer.getPropertyTemplate(prop, (asset as { [index: string]: any })[prop], viewerConfig, panelConfig, shadowRoot));
        //     })}
        //     `;
        // } else
        if (panelConfig && panelConfig.type === "history") {
            // Special handling for history panel which shows an attribute selector and a graph/data table of historical values
            const historyAttrs = attrs.filter((attr) => Util.getFirstMetaItem(attr, MetaItemType.STORE_DATA_POINTS.urn!));
            if (historyAttrs.length > 0) {

                const attributeChanged = (attributeName: string) => {
                    if (shadowRoot) {
                        const attributeHistory = shadowRoot.getElementById("attribute-history") as OrAttributeHistory;

                        if (attributeHistory) {

                            let attribute: AssetAttribute | undefined;

                            if (attributeName) {
                                attribute = Util.getAssetAttribute(asset, attributeName);
                            }

                            attributeHistory.attribute = attribute;
                        }
                    }
                };


                const options = historyAttrs.map((attr) => {
                    const attributeDescriptor = AssetModelUtil.getAttributeDescriptorFromAsset(attr.name!);
                    let label = Util.getAttributeLabel(attr, attributeDescriptor);
                    let unit = Util.getMetaValue(MetaItemType.UNIT_TYPE, attr, attributeDescriptor);
                    if(unit) {
                        label = label + " ("+i18next.t(unit)+")";
                    }
                    return [attr.name, label]
                });
                const attrName: string = historyAttrs[0].name!;
                onRenderComplete.addCallback(() => attributeChanged(attrName));
                content = html`
                    <style>
                       or-attribute-history{
                            min-height: 70px;
                            width: 100%;
                       }
                        #history-controls {
                            flex: 0;
                            margin-bottom: 10px;
                            position: absolute;
                        }
                        
                        #history-attribute-picker {
                            flex: 0;
                            width: 200px;
                        }
                        
                        or-attribute-history {
                            --or-attribute-history-controls-margin: 0 0 20px 204px;  
                        }
                        
                        @media screen and (max-width: 2028px) {
                          #history-controls {
                                position: unset;
                                margin: 0 0 10px 0;
                          }
                          
                          or-attribute-history {
                                --or-attribute-history-controls-margin: 10px 0 0 0;  
                                --or-attribute-history-controls-margin-children: 0 20px 20px 0;
                          }
                        }
                    </style>
                    <div id="history-controls">
                        <or-input id="history-attribute-picker" value="${historyAttrs[0].name}" .label="${i18next.t("attribute")}" @or-input-changed="${(evt: OrInputChangedEvent) => attributeChanged(evt.detail.value)}" .type="${InputType.SELECT}" .options="${options}"></or-input>
                    </div>        
                    <or-attribute-history id="attribute-history" .config="${viewerConfig.historyConfig}" .assetType="${asset.type}"></or-attribute-history>

                `;
            }

        } else if (panelConfig && panelConfig.type === "chart") {

            if (asset.type === "urn:openremote:asset:group") {
                return;
            }

            content = html`
                <or-chart id="chart" .config="${viewerConfig.chartConfig}" activeAssetId="${asset.id}" .activeAsset="${asset}" ></or-chart>
            `;

        } else if (panelConfig && panelConfig.type === "location") {

            if (asset.type === "urn:openremote:asset:group") {
                return;
            }

            const attribute = attrs.find((attr) => attr.name === AttributeType.LOCATION.attributeName);
            if (attribute) {
                // Special handling for location panel which shows an attribute selector and a map showing the location of the attribute
                const mapType = viewerConfig.mapType || OrAssetViewer.DEFAULT_MAP_TYPE;
                const lngLat = MapUtil.getLngLat(attribute);
                const center = lngLat ? lngLat.toArray() : undefined;
                const showOnMapMeta = Util.getFirstMetaItem(attribute, MetaItemType.SHOW_ON_DASHBOARD.urn!);
                const attributeMetaChanged = async (value: string) => {
                    if (shadowRoot) {

                        if (attribute) {

                            if(asset.id && asset.attributes && asset.attributes.location){

                                const showOnMapMeta = Util.getFirstMetaItem(attribute, MetaItemType.SHOW_ON_DASHBOARD.urn!);
                                if(showOnMapMeta) {
                                    showOnMapMeta.value = value;
                                } else {
                                    const meta:MetaItem = {
                                        name: MetaItemType.SHOW_ON_DASHBOARD.urn,
                                        value: value
                                    }

                                    if(attribute.meta){
                                        attribute.meta.push(meta);
                                    }
                                }
                                asset.attributes.location = {...attribute};
                                const response = await manager.rest.api.AssetResource.update(asset.id, asset);

                                if (response.status !== 200) {
                                }
                            }


                        }
                    }
                };


                content = html`
                    <style>
                        or-map {
                            border: #e5e5e5 1px solid;
                        }
                        
                        #location-map-input {
                            padding: 20px 0 0 0;
                        }
                    </style>
                    <or-map id="location-map" class="or-map" .center="${center}" type="${mapType}">
                         <or-map-marker-asset active .asset="${asset}"></or-map-marker-asset>
                    </or-map>
                    ${attribute.name === AttributeType.LOCATION.attributeName ? html`
                        <or-input id="location-map-input" type="${InputType.SWITCH}" @or-input-changed="${(evt: OrInputChangedEvent) => attributeMetaChanged(evt.detail.value)}" dense .value="${showOnMapMeta ? showOnMapMeta.value : undefined}" label="${i18next.t("showOnMap")}"></or-input>
                    ` : ``}                    
                `;
            }
        } else if (panelConfig && panelConfig.type === "group") {

            if (asset.type !== "urn:openremote:asset:group") {
                return;
            }

            content = html`
                <or-table 
                    headers='["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"]'
                    rows='[
                        ["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"],
                        ["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"],
                        ["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"],
                        ["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"],
                        ["Name","Version","Temperature","Vault","Latest cleansing (mins ago)"]]'
                ></or-table> 
            `;

        } else if (panelConfig && panelConfig.type === "attribute") {

            if (asset.type !== "urn:openremote:asset:group") {
                return;
            }
        } else {
            if(attrs.length === 0) {
                return undefined;
            }

            content = html`
                ${attrs.sort((attr1, attr2) => attr1.name! < attr2.name! ? -1 : attr1.name! > attr2.name! ? 1 : 0).map((attr) => {
                    let style = styles ? styles[attr.name!] : undefined;
                    return this.getField(attr.name!, false, style, OrAssetViewer.getAttributeTemplate(asset, attr, viewerConfig, panelConfig));
                })}
            `;
        }

        return content;
    }

    // public static getPropertyTemplate(property: string, value: any, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig, shadowRoot: ShadowRoot | null) {
    //     let type = InputType.TEXT;
    //     let minLength: number | undefined;
    //     let maxLength: number | undefined;

    //     if (viewerConfig.propertyViewProvider) {
    //         const result = viewerConfig.propertyViewProvider(property, value, viewerConfig, panelConfig);
    //         if (result) {
    //             return result;
    //         }
    //     }

    //     switch (property) {
    //         case "path":
    //             if (!value || !(Array.isArray(value))) {
    //                 return;
    //             }

    //             // Populate value when we get the response
    //             OrAssetViewer.getAssetNames(value as string[]).then(
    //                 (names) => {
    //                     if (shadowRoot) {
    //                         const pathField = shadowRoot.getElementById("property-path") as OrInput;
    //                         if (pathField) {
    //                             pathField.value = names.reverse().join(" > ");
    //                         }
    //                     }
    //                 }
    //             );
    //             value = i18next.t("loading");
    //             break;
    //         case "createdOn":
    //             type = InputType.DATETIME;
    //             break;
    //         case "accessPublicRead":
    //             type = InputType.CHECKBOX;
    //             break;
    //         case "name":
    //             minLength = 1;
    //             maxLength = 1023;
    //             break;
    //     }

    //     return html`<or-input id="property-${property}" type="${type}" .minLength="${minLength}" .maxLength="${maxLength}" dense .value="${value}" readonly label="${i18next.t(property)}"></or-input>`;
    // }

    public static getAttributeTemplate(asset: Asset, attribute: AssetAttribute, viewerConfig: AssetViewerConfig, panelConfig: PanelConfig) {
        if (viewerConfig.attributeViewProvider) {
            const result = viewerConfig.attributeViewProvider(attribute, viewerConfig, panelConfig);
            if (result) {
                return result;
            }
        }
        return html`
            <or-attribute-input dense .assetType="${asset!.type}" .attribute="${attribute}" .label="${i18next.t(attribute.name!)}"></or-attribute-input>
        `;
    }

    public static getField(name: string, isProperty: boolean, styles: { [style: string]: string } | undefined, content: TemplateResult | undefined) {
        if (!content) {
            return ``;
        }
        return html`
            <div id="field-${name}" style="${styles ? styleMap(styles) : ""}" class="field ${isProperty ? "field-property" : "field-attribute"}">
                ${content}
            </div>
        `;
    }

    // TODO: Add debounce in here to minimise render calls
    onAttributeEvent(event: AttributeEvent) {
        const attrName = event.attributeState!.attributeRef!.attributeName!;

        if (this.asset && this.asset.attributes && this.asset.attributes.hasOwnProperty(attrName)) {
            if (event.attributeState!.deleted) {
                delete this.asset.attributes[attrName];
                this.asset = {...this.asset}
            }
        }
    }

    onAssetEvent(event: AssetEvent) {
        this.asset = event.asset;
        this._loading = false;
    }

    protected _getPanelConfig(asset: Asset): AssetViewerConfig {
        let config = {...OrAssetViewer.DEFAULT_CONFIG};

        if (this.config) {

            config.viewerStyles = {...config.viewerStyles};
            config.panels = {...config.panels};
            const assetConfig = this.config.assetTypes && this.config.assetTypes.hasOwnProperty(asset.type!) ? this.config.assetTypes[asset.type!] : this.config.default;

            if (assetConfig) {

                if (assetConfig.viewerStyles) {
                    Object.assign(config.viewerStyles, assetConfig.viewerStyles);
                }

                if (assetConfig.panels) {
                    Object.entries(assetConfig.panels).forEach(([name, assetPanelConfig]) => {
                        if (config.panels.hasOwnProperty(name)) {
                            const panelStyles = {...config.panels[name].panelStyles};
                            const fieldStyles = {...config.panels[name].fieldStyles};
                            config.panels[name] = Object.assign(config.panels[name], {...assetPanelConfig});
                            config.panels[name].panelStyles = Object.assign(panelStyles, assetPanelConfig.panelStyles);
                            config.panels[name].fieldStyles = Object.assign(fieldStyles, assetPanelConfig.fieldStyles);
                        } else {
                            config.panels[name] = {...assetPanelConfig};
                        }
                    });
                }

                config.attributeViewProvider = assetConfig.attributeViewProvider || this.config.attributeViewProvider;
                config.panelViewProvider = assetConfig.panelViewProvider || this.config.panelViewProvider;
                config.propertyViewProvider = assetConfig.propertyViewProvider || this.config.propertyViewProvider;
                config.mapType = assetConfig.mapType || this.config.mapType;
                config.historyConfig = assetConfig.historyConfig || this.config.historyConfig;
            }
        }
        return config;
    }

    public static async getAssetNames(ids: string[]): Promise<string[]> {
        const response = await manager.rest.api.AssetResource.queryAssets({
            select: {
                excludePath: true,
                excludeParentInfo: true
            },
            ids: ids
        });

        if (response.status !== 200 || !response.data || response.data.length !== ids.length) {
            return ids;
        }

        return ids.map((id) => response.data.find((asset) => asset.id === id)!.name!);
    }
}
