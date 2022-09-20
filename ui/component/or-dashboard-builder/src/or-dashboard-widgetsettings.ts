import {Asset, AssetModelUtil, AttributeRef, DashboardWidget, DashboardWidgetType } from "@openremote/model";
import {css, html, LitElement, TemplateResult, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import { showDialog } from "@openremote/or-mwc-components/or-mwc-dialog";
import {OrAttributePicker, OrAttributePickerPickedEvent } from "@openremote/or-attribute-picker";
import {style} from './style';
import { getAssetDescriptorIconTemplate } from "@openremote/or-icon";
import {DefaultColor5, manager } from "@openremote/core";
import {showSnackbar} from "@openremote/or-mwc-components/or-mwc-snackbar";
import { i18next } from "@openremote/or-translate";
import {ChartWidgetConfig, KPIWidgetConfig} from "./or-dashboard-widget";

const tableStyle = require("@material/data-table/dist/mdc.data-table.css");

//language=css
const widgetSettingsStyling = css`
    
    /* ------------------------------- */
    .switchMwcInputContainer {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    /* ---------------------------- */
    #attribute-list {
        overflow: auto;
        flex: 1 1 0;
        min-height: 150px;
        width: 100%;
        display: flex;
        flex-direction: column;
    }

    .attribute-list-item {
        cursor: pointer;
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 0;
        min-height: 50px;
    }

    .attribute-list-item-label {
        display: flex;
        flex: 1 1 0;
        line-height: 16px;
        flex-direction: column;
    }

    .attribute-list-item-bullet {
        width: 14px;
        height: 14px;
        border-radius: 7px;
        margin-right: 10px;
    }

    .attribute-list-item .button.delete {
        display: none;
    }

    .attribute-list-item:hover .button.delete {
        display: block;
    }

    /* ---------------------------- */
    .button-clear {
        background: none;
        visibility: hidden;
        color: ${unsafeCSS(DefaultColor5)};
        --or-icon-fill: ${unsafeCSS(DefaultColor5)};
        display: inline-block;
        border: none;
        padding: 0;
        cursor: pointer;
    }

    .attribute-list-item:hover .button-clear {
        visibility: visible;
    }

    .button-clear:hover {
        --or-icon-fill: var(--or-app-color4);
    }
    /* ---------------------------- */
`

/* ------------------------------------ */

@customElement("or-dashboard-widgetsettings")
export class OrDashboardWidgetsettings extends LitElement {

    static get styles() {
        return [unsafeCSS(tableStyle), widgetSettingsStyling, style]
    }

    @property({type: Object})
    protected selectedWidget: DashboardWidget | undefined;

    @state() // list of assets that are loaded in the list
    protected loadedAssets: Asset[] | undefined;

    @state()
    protected expandedPanels: string[];

    constructor() {
        super();
        this.expandedPanels = [];
        this.updateComplete.then(() => {

            // Setting what panels are expanded, depending on WidgetType
            switch (this.selectedWidget?.widgetType) {
                case DashboardWidgetType.LINE_CHART: {
                    this.expandedPanels = [i18next.t('attributes'), i18next.t('display')]; break;
                }
                case DashboardWidgetType.KPI: {
                    this.expandedPanels = [i18next.t('attributes'), i18next.t('display'), i18next.t('settings')]; break;
                }
            }
        })
    }

    updated(changedProperties: Map<string, any>) {
        super.updated(changedProperties);
        console.log(changedProperties);
        if(changedProperties.has("selectedWidget")) {
            if(this.selectedWidget != null) {
                this.fetchAssets();
            }
        }
    }

    /* ------------------------------------ */


    // Method to update the Grid. For example after changing a setting.
    forceParentUpdate(force: boolean = false) {
        this.dispatchEvent(new CustomEvent('update', { detail: { force: force }}));
    }

    deleteSelectedWidget() {
        this.dispatchEvent(new CustomEvent("delete", {detail: this.selectedWidget }));
    }

    /* --------------------------------------- */

    // Fetching the assets according to the AttributeRef[] input in DashboardWidget if required.
    fetchAssets() {
        if(this.selectedWidget?.widgetConfig?.attributeRefs != null) {
            manager.rest.api.AssetResource.queryAssets({
                ids: this.selectedWidget?.widgetConfig?.attributeRefs?.map((x: AttributeRef) => { return x.id; }) as string[]
            }).then(response => {
                this.loadedAssets = response.data;
            }).catch((reason) => {
                console.error(reason);
                showSnackbar(undefined, i18next.t('errorOccurred'));
            })
        }
    }

    protected render() {
        if(this.selectedWidget?.widgetType != null && this.selectedWidget.widgetConfig != null) {
            return this.generateHTML(this.selectedWidget.widgetType, this.selectedWidget.widgetConfig);
        }
        return html`<span>${i18next.t('errorOccurred')}</span>`
    }




    /* ----------------------------------- */

    // UI generation of all settings fields. Depending on the WidgetType it will
    // return different HTML containing different settings.
    generateHTML(widgetType: DashboardWidgetType, widgetConfig: any): TemplateResult {
        let htmlGeneral: TemplateResult;
        let htmlContent: TemplateResult;
        htmlGeneral = html`
            <div style="padding: 12px;">
                <div>
                    <or-mwc-input .type="${InputType.TEXT}" style="width: 100%;" .value="${this.selectedWidget?.displayName}" label="${i18next.t('name')}" 
                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.selectedWidget!.displayName = event.detail.value; this.forceParentUpdate(); }}"
                    ></or-mwc-input>
                </div>
            </div>
        `
        switch (widgetType) {

            case DashboardWidgetType.LINE_CHART: {
                const chartConfig = widgetConfig as ChartWidgetConfig;
                htmlContent = html`
                    <div>
                        ${this.generateExpandableHeader(i18next.t('attributes'))}
                    </div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('attributes')) ? html`
                            <div style="padding: 0 14px 12px 14px;">
                                ${(chartConfig.attributeRefs == null || chartConfig.attributeRefs.length == 0) ? html`
                                    <span>${i18next.t('noAttributesConnected')}</span>
                                ` : undefined}
                                <div id="attribute-list">
                                    ${(chartConfig.attributeRefs != null && this.loadedAssets != null) ? chartConfig.attributeRefs.map((attributeRef: AttributeRef) => {
                                        const asset = this.loadedAssets?.find((x: Asset) => { return x.id == attributeRef.id; }) as Asset;
                                        return (asset != null) ? html`
                                            <div class="attribute-list-item">
                                                <span style="margin-right: 10px; --or-icon-width: 20px;">${getAssetDescriptorIconTemplate(AssetModelUtil.getAssetDescriptor(asset.type))}</span>
                                                <div class="attribute-list-item-label">
                                                    <span>${asset.name}</span>
                                                    <span style="font-size:14px; color:grey;">${attributeRef.name}</span>
                                                </div>
                                                <button class="button-clear" @click="${() => this.removeWidgetAttribute(attributeRef)}">
                                                    <or-icon icon="close-circle" ></or-icon>
                                                </button>
                                            </div>
                                        ` : undefined;
                                    }) : undefined}
                                </div>
                                <or-mwc-input .type="${InputType.BUTTON}" label="${i18next.t('attribute')}" icon="plus" style="margin-top: 24px; margin-left: -7px;" @or-mwc-input-changed="${() => this.openDialog(chartConfig.attributeRefs, true)}"></or-mwc-input>
                            </div>
                        ` : null}
                    </div>
                    <div>
                        ${this.generateExpandableHeader(i18next.t('display'))}
                    </div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('display')) ? html`
                            <div style="padding: 24px 24px 48px 24px;">
                                <div>
                                    <or-mwc-input .type="${InputType.SELECT}" style="width: 100%;" .options="${['year', 'month', 'week', 'day', 'hour', 'minute', 'second']}" .value="${chartConfig.period}" label="${i18next.t('timeframe')}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { (this.selectedWidget?.widgetConfig as ChartWidgetConfig).period = event.detail.value; this.requestUpdate(); this.forceParentUpdate(); }}"
                                    ></or-mwc-input>
                                </div>
                                <div class="switchMwcInputContainer" style="margin-top: 18px;">
                                    <span>${i18next.t('dashboard.showTimestampControls')}</span>
                                    <or-mwc-input .type="${InputType.SWITCH}" style="width: 70px;" .value="${chartConfig.showTimestampControls}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { (this.selectedWidget?.widgetConfig as ChartWidgetConfig).showTimestampControls = event.detail.value; this.requestUpdate(); this.forceParentUpdate(false); }}"
                                    ></or-mwc-input>
                                </div>
                                <div class="switchMwcInputContainer">
                                    <span>${i18next.t('dashboard.showLegend')}</span>
                                    <or-mwc-input .type="${InputType.SWITCH}" style="width: 70px;" .value="${chartConfig.showLegend}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { (this.selectedWidget?.widgetConfig as ChartWidgetConfig).showLegend = event.detail.value; this.requestUpdate(); this.forceParentUpdate(false); }}"
                                    ></or-mwc-input>
                                </div>
                            </div>
                        ` : null}
                    </div>
                    <div>
                        ${this.generateExpandableHeader(i18next.t('settings'))}
                    </div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('settings')) ? html`
                            <div style="padding: 24px 24px 48px 24px;">
                                <div>
                                    <or-mwc-input .type="${InputType.SELECT}" style="width: 100%;" .options="${['absolute', 'percentage']}" .value="${chartConfig.deltaFormat}" label="${i18next.t('dashboard.showValueAs')}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { (this.selectedWidget?.widgetConfig as ChartWidgetConfig).deltaFormat = event.detail.value; this.requestUpdate(); this.forceParentUpdate(); }}"
                                    ></or-mwc-input>
                                </div>
                                <div style="margin-top: 18px;">
                                    <or-mwc-input .type="${InputType.NUMBER}" style="width: 100%;" .value="${chartConfig.decimals}" label="${i18next.t('decimals')}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { (this.selectedWidget?.widgetConfig as ChartWidgetConfig).decimals = event.detail.value; this.requestUpdate(); this.forceParentUpdate(); }}"
                                    ></or-mwc-input>
                                </div>
                            </div>
                        ` : undefined}
                    </div>
                `
                break;
            }

            case DashboardWidgetType.KPI: {
                const kpiConfig = widgetConfig as KPIWidgetConfig;
                htmlContent = html`
                    <div>
                        ${this.generateExpandableHeader(i18next.t('attributes'))}
                    </div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('attributes')) ? html`
                            <div style="padding: 12px;">
                                ${kpiConfig.attributeRefs && kpiConfig.attributeRefs.length > 0 ? html`
                                    <div id="attribute-list" style="min-height: 0px;">
                                        <div class="attribute-list-item">
                                            ${(this.loadedAssets && this.loadedAssets[0] != null) ? html`
                                                <span style="margin-right: 10px; --or-icon-width: 20px;">${getAssetDescriptorIconTemplate(AssetModelUtil.getAssetDescriptor(this.loadedAssets[0].type))}</span>
                                                <div class="attribute-list-item-label">
                                                    <span>${this.loadedAssets[0].name}</span>
                                                    <span style="font-size:14px; color:grey;">${kpiConfig.attributeRefs[0].name}</span>
                                                </div>
                                                <button class="button-clear" @click="${() => this.removeWidgetAttribute(kpiConfig.attributeRefs[0])}">
                                                    <or-icon icon="close-circle" ></or-icon>
                                                </button>
                                            ` : undefined}
                                        </div>
                                    </div>
                                ` : html`
                                    <or-mwc-input class="button" .type="${InputType.BUTTON}" label="${i18next.t("selectAttribute")}" icon="plus" @or-mwc-input-changed="${() => this.openDialog(kpiConfig.attributeRefs, false)}"></or-mwc-input>
                                `}
                            </div>
                        ` : null}
                    </div>
                    <div>
                        ${this.generateExpandableHeader(i18next.t('display'))}
                    </div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('display')) ? html`
                            <div style="padding: 24px 24px 48px 24px;">
                                <div>
                                    <or-mwc-input .type="${InputType.SELECT}" style="width: 100%;" .options="${['year', 'month', 'week', 'day', 'hour', 'minute', 'second']}" .value="${kpiConfig.period}" label="${i18next.t('timeframe')}"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => {(this.selectedWidget?.widgetConfig as KPIWidgetConfig).period = event.detail.value; this.requestUpdate(); this.forceParentUpdate(); }}"
                                    ></or-mwc-input>
                                </div>
                            </div>
                        ` : null}
                    </div>
                    <div>
                        ${this.generateExpandableHeader(i18next.t('settings'))}
                    </div>
                `
                break;
            }
            default: {
                htmlContent = html`<span>${i18next.t('errorOccurred')}</span>`
            }
        }
        return html`
            <div>
                ${htmlGeneral}
                ${htmlContent}
            </div>
        `
    }


    // UI generation of an expandable panel header.
    generateExpandableHeader(name: string): TemplateResult {
        return html`
            <span class="expandableHeader panel-title" @click="${() => { this.expandPanel(name); }}">
                <or-icon icon="${this.expandedPanels.includes(name) ? 'chevron-down' : 'chevron-right'}"></or-icon>
                <span style="margin-left: 6px; height: 25px; line-height: 25px;">${name}</span>
            </span>
        `
    }



    /* -------------------------------------------- */

    // Methods for changing the list of attributes. They get triggered when
    // the attribute picker returns a new list of attributes, or someone
    // removes an item from the list.

    setWidgetAttributes(selectedAttrs?: AttributeRef[]) {
        if(this.selectedWidget?.widgetConfig != null) {
            this.selectedWidget.widgetConfig.attributeRefs = selectedAttrs;
            this.fetchAssets();
            this.requestUpdate("selectedWidget");
            this.forceParentUpdate();
        }
    }

    removeWidgetAttribute(attributeRef: AttributeRef) {
        if(this.selectedWidget?.widgetConfig?.attributeRefs != null) {
            this.selectedWidget.widgetConfig.attributeRefs.splice(this.selectedWidget.widgetConfig.attributeRefs.indexOf(attributeRef), 1);
            this.fetchAssets();
            this.requestUpdate("selectedWidget");
            this.forceParentUpdate();
        }
    }



    /* ---------------------------------------- */

    // Method when a user opens or closes a expansion panel. (UI related)
    expandPanel(panelName: string): void {
        if(this.expandedPanels.includes(panelName)) {
            const indexOf = this.expandedPanels.indexOf(panelName, 0);
            if(indexOf > -1) { this.expandedPanels.splice(indexOf, 1); }
        } else {
            this.expandedPanels.push(panelName);
        }
        this.requestUpdate();
    }

    // Opening the attribute picker dialog, and listening to its result. (UI related)
    openDialog(attributeRefs: AttributeRef[], multi: boolean) {
        let dialog: OrAttributePicker;
        if(attributeRefs != null) {
            dialog = showDialog(new OrAttributePicker().setMultiSelect(multi).setSelectedAttributes(attributeRefs).setShowOnlyDatapointAttrs(true));
        } else {
            dialog = showDialog(new OrAttributePicker().setMultiSelect(multi).setShowOnlyDatapointAttrs(true))
        }
        dialog.addEventListener(OrAttributePickerPickedEvent.NAME, (event: CustomEvent) => {
            this.setWidgetAttributes(event.detail);
        })
    }
}
