import manager from "@openremote/core";
import {Asset, Attribute, AttributeRef, DashboardWidget } from "@openremote/model";
import { showSnackbar } from "@openremote/or-mwc-components/or-mwc-snackbar";
import { i18next } from "@openremote/or-translate";
import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {OrWidgetConfig, OrWidgetEntity} from "./or-base-widget";
import {style} from "../style";
import {SettingsPanelType, widgetSettingsStyling} from "../or-dashboard-settingspanel";
import {InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";

export interface KpiWidgetConfig extends OrWidgetConfig {
    displayName: string;
    attributeRefs: AttributeRef[];
    period?: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';
    decimals: number;
    deltaFormat: "absolute" | "percentage";
}

export class OrKpiWidget implements OrWidgetEntity {

    readonly DISPLAY_MDI_ICON: string = "label";
    readonly DISPLAY_NAME: string = "KPI";
    readonly MIN_COLUMN_WIDTH: number = 2;
    readonly MIN_PIXEL_HEIGHT: number = 150;
    readonly MIN_PIXEL_WIDTH: number = 150;

    getDefaultConfig(widget: DashboardWidget): OrWidgetConfig {
        return {
            displayName: widget.displayName,
            attributeRefs: [],
            period: "day",
            decimals: 0,
            deltaFormat: "absolute",
            showTimestampControls: false
        } as KpiWidgetConfig;
    }

    getSettingsHTML(widget: DashboardWidget, realm: string) {
        return html`<or-kpi-widgetsettings .widget="${widget}" realm="${realm}"></or-kpi-widgetsettings>`;
    }

    getWidgetHTML(widget: DashboardWidget, editMode: boolean, realm: string) {
        return html`<or-kpi-widget .widget="${widget}" .editMode="${editMode}" realm="${realm}" style="height: 100%; overflow: hidden;"></or-kpi-widget>`;
    }

}

@customElement("or-kpi-widget")
export class OrKpiWidgetContent extends LitElement {

    @property()
    public readonly widget?: DashboardWidget;

    @property()
    public editMode?: boolean;

    @property()
    public realm?: string;

    @state()
    private assets: Asset[] = [];

    @state()
    private assetAttributes: [number, Attribute<any>][] = [];

    render() {
        console.log("[or-kpi-widget] Rendering..");
        return html`
            <or-attribute-card .assets="${this.assets}" .assetAttributes="${this.assetAttributes}" .period="${this.widget?.widgetConfig?.period}"
                               .deltaFormat="${this.widget?.widgetConfig.deltaFormat}" .mainValueDecimals="${this.widget?.widgetConfig.decimals}"
                               showControls="${false}" showTitle="${false}" realm="${this.realm}" style="height: 100%;">
            </or-attribute-card>
        `
    }

    updated(changedProperties: Map<string, any>) {
        console.log(changedProperties);
        if(changedProperties.has("widget") || changedProperties.has("editMode")) {
            this.fetchAssets(this.widget?.widgetConfig).then((assets) => {
                this.assets = assets!;
                this.assetAttributes = this.widget?.widgetConfig.attributeRefs.map((attrRef: AttributeRef) => {
                    const assetIndex = assets!.findIndex((asset) => asset.id === attrRef.id);
                    const foundAsset = assetIndex >= 0 ? assets![assetIndex] : undefined;
                    return foundAsset && foundAsset.attributes ? [assetIndex, foundAsset.attributes[attrRef.name!]] : undefined;
                }).filter((indexAndAttr: any) => !!indexAndAttr) as [number, Attribute<any>][];
                this.requestUpdate();
            });
        }
    }

    // Fetching the assets according to the AttributeRef[] input in DashboardWidget if required. TODO: Simplify this to only request data needed for attribute list
    async fetchAssets(config: OrWidgetConfig | any): Promise<Asset[] | undefined> {
        if(config.attributeRefs && config.attributeRefs.length > 0) {
            let assets: Asset[] = [];
            await manager.rest.api.AssetResource.queryAssets({
                ids: config.attributeRefs?.map((x: AttributeRef) => x.id) as string[]
            }).then(response => {
                assets = response.data;
            }).catch((reason) => {
                console.error(reason);
                showSnackbar(undefined, i18next.t('errorOccurred'));
            });
            return assets;
        } else {
            console.error("Error: attributeRefs are not present in widget config!");
        }
    }
}



@customElement("or-kpi-widgetsettings")
export class OrKpiWidgetSettings extends LitElement {

    @property()
    public readonly widget?: DashboardWidget;

    // Default values
    private expandedPanels: string[] = [i18next.t('attributes'), i18next.t('display'), i18next.t('values')];
    private loadedAssets: Asset[] = [];


    static get styles() {
        return [style, widgetSettingsStyling];
    }

    // UI Rendering
    render() {
        console.log("[or-kpi-widgetsettings] Rendering..");
        const config = JSON.parse(JSON.stringify(this.widget!.widgetConfig)) as KpiWidgetConfig; // duplicate to edit, to prevent parent updates. Please trigger updateConfig()
        return html`
            <div>
                ${this.generateExpandableHeader(i18next.t('attributes'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('attributes')) ? html`
                    <or-dashboard-settingspanel .type="${SettingsPanelType.SINGLE_ATTRIBUTE}" .widgetConfig="${this.widget!.widgetConfig}"
                                                @updated="${(event: CustomEvent) => {
                                                    this.onAttributesUpdate(event.detail.changes);
                                                    this.updateConfig(this.widget!, event.detail.changes.get('config'));
                                                }}"
                    ></or-dashboard-settingspanel>
                ` : null}
            </div>
            <div>
                ${this.generateExpandableHeader(i18next.t('display'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('display')) ? html`
                    <div style="padding: 24px 24px 48px 24px;">
                        <div>
                            <or-mwc-input .type="${InputType.SELECT}" style="width: 100%;" 
                                          .options="${['year', 'month', 'week', 'day', 'hour', 'minute', 'second']}" 
                                          .value="${config.period}" label="${i18next.t('timeframe')}" 
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                              config.period = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                    </div>
                ` : null}
            </div>
            <div>
                ${this.generateExpandableHeader(i18next.t('values'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('values')) ? html`
                    <div style="padding: 24px 24px 48px 24px;">
                        <div>
                            <or-mwc-input .type="${InputType.SELECT}" style="width: 100%;" .options="${['absolute', 'percentage']}" .value="${config.deltaFormat}" label="${i18next.t('dashboard.showValueAs')}"
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                              config.deltaFormat = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                        <div style="margin-top: 18px;">
                            <or-mwc-input .type="${InputType.NUMBER}" style="width: 100%;" .value="${config.decimals}" label="${i18next.t('decimals')}"
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => { 
                                              config.decimals = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                    </div>
                ` : null}
            </div>
        `
    }

    updateConfig(widget: DashboardWidget, config: OrWidgetConfig | any, force: boolean = false) {
        const oldWidget = JSON.parse(JSON.stringify(widget)) as DashboardWidget;
        widget.widgetConfig = config;
        this.requestUpdate("widget", oldWidget);
        this.forceParentUpdate(new Map<string, any>([["widget", widget]]), force);
    }

    onAttributesUpdate(changes: Map<string, any>) {
        if(changes.has('loadedAssets')) {
            this.loadedAssets = changes.get('loadedAssets');
        }
        if(changes.has('config')) {
            const config = changes.get('config') as KpiWidgetConfig;
            if(config.attributeRefs.length > 0) {
                this.widget!.displayName = this.loadedAssets[0].name + " - " + this.loadedAssets[0].attributes![config.attributeRefs[0].name!].name;
            }
        }
    }

    // Method to update the Grid. For example after changing a setting.
    forceParentUpdate(changes: Map<string, any>, force: boolean = false) {
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent('updated', {detail: {changes: changes, force: force}}));
    }

    generateExpandableHeader(name: string): TemplateResult {
        return html`
            <span class="expandableHeader panel-title" @click="${() => { this.expandPanel(name); }}">
                <or-icon icon="${this.expandedPanels.includes(name) ? 'chevron-down' : 'chevron-right'}"></or-icon>
                <span style="margin-left: 6px; height: 25px; line-height: 25px;">${name}</span>
            </span>
        `
    }
    expandPanel(panelName: string): void {
        if (this.expandedPanels.includes(panelName)) {
            const indexOf = this.expandedPanels.indexOf(panelName, 0);
            if (indexOf > -1) {
                this.expandedPanels.splice(indexOf, 1);
            }
        } else {
            this.expandedPanels.push(panelName);
        }
        this.requestUpdate();
    }
}
