import {Dashboard, DashboardAccess, DashboardScreenPreset, DashboardScalingPreset } from "@openremote/model";
import {css, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import {style} from './style';
import { i18next } from "@openremote/or-translate";
import {unsafeHTML} from 'lit/directives/unsafe-html.js';
import {
    dashboardAccessToString,
    scalingPresetToString,
    sortScreenPresets
} from ".";

//language=css
const boardSettingsStyling = css`
    .label {
        margin-bottom: 4px;
    }
`

@customElement("or-dashboard-boardsettings")
export class OrDashboardBoardsettings extends LitElement {

    @property()
    protected readonly dashboard?: Dashboard;

    @property()
    protected readonly showPerms?: boolean;

    @state()
    protected expandedPanels: string[] = [i18next.t('permissions'), i18next.t('layout'), i18next.t('display'), "Breakpoints"];

    constructor() {
        super();
        this.updateComplete.then(() => {
            if(this.shadowRoot != null) {
                this.shadowRoot.querySelectorAll(".displayInput").forEach(element => {
                    (element.shadowRoot?.querySelector(".mdc-menu") as HTMLElement).style.minWidth = "250px"; // small fix for dropdown menu's to be the correct width
                })
                this.shadowRoot.querySelectorAll(".permissionInput").forEach(element => {
                    (element.shadowRoot?.querySelector(".mdc-menu") as HTMLElement).style.minWidth = "250px"; // small fix for dropdown menu's to be the correct width
                })
            }
        })
    }
    /* ------------------------- */

    static get styles() {
        return [boardSettingsStyling, style]
    }

    forceParentUpdate(force: boolean = false) {
        this.dispatchEvent(new CustomEvent('update', { detail: { force: force }}));
    }

    /* ------------------------- */

    // Method when a user opens or closes an expansion panel. (UI related)
    expandPanel(panelName: string): void {
        if(this.expandedPanels.includes(panelName)) {
            const indexOf = this.expandedPanels.indexOf(panelName, 0);
            if(indexOf > -1) { this.expandedPanels.splice(indexOf, 1); }
        } else {
            this.expandedPanels.push(panelName);
        }
        this.requestUpdate();
    }

    /* -------------------------------- */

    private setViewAccess(access: DashboardAccess) {
        this.dashboard!.viewAccess = access;
        if(access == DashboardAccess.PRIVATE) {
            this.dashboard!.editAccess = DashboardAccess.PRIVATE;
        } else if(this.dashboard?.editAccess == DashboardAccess.PRIVATE) {
            this.dashboard.editAccess = access;
        }
        this.requestUpdate();
        this.forceParentUpdate(false);
    }
    private setEditAccess(access: DashboardAccess) {
        this.dashboard!.editAccess = access;
        this.requestUpdate();
        this.forceParentUpdate(false);
    }
    private setBreakpoint(presetIndex: number, value: number) {
        this.dashboard!.template!.screenPresets![presetIndex].breakpoint = value;
        this.requestUpdate();
        this.forceParentUpdate(true);
    }

    protected render() {
        if(this.dashboard?.template?.screenPresets != null) {
            const screenPresets = sortScreenPresets(this.dashboard.template.screenPresets, true);
            const accessOptions: {key: DashboardAccess, value: string}[] = [];
            [DashboardAccess.PRIVATE, DashboardAccess.SHARED, DashboardAccess.PUBLIC].forEach((access) => {
                accessOptions.push({key: access, value: dashboardAccessToString(access)})
            })
            const scalingPresets: {key: DashboardScalingPreset, value: string}[] = [];
            [DashboardScalingPreset.KEEP_LAYOUT, DashboardScalingPreset.WRAP_TO_SINGLE_COLUMN, /*DashboardScalingPreset.REDIRECT,*/ DashboardScalingPreset.BLOCK_DEVICE].forEach((preset: DashboardScalingPreset) => {
                scalingPresets.push({key: preset, value: scalingPresetToString(preset) });
            });
            return html`
                <!-------------------->
                <div>${this.showPerms ? this.generateExpandableHeader(i18next.t('permissions')) : undefined}</div>
                <div>
                    ${this.showPerms && this.expandedPanels.includes(i18next.t('permissions')) ? html`
                        <div style="padding: 12px 24px 24px 24px;">
                            <div style="margin-bottom: 24px;">
                                <div class="label">
                                    ${html`<span>${unsafeHTML(i18next.t('dashboard.whoCanView').toString())}</span>`}
                                </div>
                                <or-mwc-input class="permissionInput" comfortable type="${InputType.SELECT}" style="width: 250px;"
                                              .options="${accessOptions.map((access) => access.value)}"
                                              .value="${dashboardAccessToString(this.dashboard.viewAccess!)}"
                                              @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.setViewAccess(accessOptions.find((access) => access.value == event.detail.value)?.key!); }}"
                                ></or-mwc-input>
                            </div>
                            <div style="margin-bottom: 24px;">
                                <div class="label">
                                    ${html`<span>${unsafeHTML(i18next.t('dashboard.whoCanEdit').toString())}</span>`}
                                </div>
                                <or-mwc-input class="permissionInput" comfortable type="${InputType.SELECT}" style="width: 250px;"
                                              .disabled="${(this.dashboard.viewAccess == DashboardAccess.PRIVATE)}" 
                                              .options="${accessOptions.map((access) => access.value)}" 
                                              .value="${dashboardAccessToString(this.dashboard.editAccess!)}" 
                                              @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.setEditAccess(accessOptions.find((access) => access.value == event.detail.value)?.key!); }}"
                                ></or-mwc-input>
                            </div>
                        </div>
                    ` : null}
                </div>
                <!-------------------->
                <div>${this.generateExpandableHeader(i18next.t('layout'))}</div>
                <div>
                    ${this.expandedPanels.includes(i18next.t('layout')) ? html`
                        <div style="padding: 12px 24px 24px 24px;">
                            <!-- Number of Columns control -->
                            <div style="margin-bottom: 24px; display: flex; align-items: center;">
                                <span style="min-width: 180px;">${i18next.t("dashboard.numberOfColumns")}</span>
                                <or-mwc-input type="${InputType.NUMBER}" comfortable .value="${this.dashboard.template.columns}" min="1" max="24" @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                    if(this.dashboard?.template != null && event.detail.value as number <= 24 && event.detail.value as number >= 1) {
                                        this.dashboard.template.columns = event.detail.value as number; this.forceParentUpdate(true); 
                                    }
                                }}"></or-mwc-input>
                            </div>
                            ${screenPresets.length == 1 ? html`
                                ${this.scalingPresetTemplate(screenPresets, scalingPresets)}
                            ` : undefined}
                            ${screenPresets.length == 1 ? html`
                                ${this.screenPresetTemplate(screenPresets, ['Mobile breakpoint'])}
                            ` : undefined}
                            <!-- Max Screen Width control-->
                            <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
                                <span style="min-width: 150px;">${i18next.t('dashboard.maxScreenWidth')}</span>
                                <div>
                                    <or-mwc-input type="${InputType.NUMBER}" comfortable .value="${this.dashboard.template.maxScreenWidth}" disabled style="width: 70px;"
                                                  @or-mwc-input-changed="${(event: OrInputChangedEvent) => { if(this.dashboard?.template != null) {
                                                      this.dashboard.template.maxScreenWidth = event.detail.value as number; this.forceParentUpdate(false);
                                                  }}}">
                                    </or-mwc-input>
                                    <span style="margin-left: 2px;">px</span>                                    
                                </div>
                            </div>
                        </div>
                    ` : null}
                </div>
                <!-------------------->
                ${screenPresets.length > 1 ? html`
                    <div>${this.generateExpandableHeader(i18next.t('display'))}</div>
                    <div>
                        ${this.expandedPanels.includes(i18next.t('display')) ? html`
                            <div style="padding: 24px 24px 24px 24px;">
                                ${this.scalingPresetTemplate(screenPresets, scalingPresets)}
                            </div>
                        ` : null}
                    </div>
                ` : undefined}
                <!-------------------->
                ${screenPresets.length > 1 ? html`
                    <div>${this.generateExpandableHeader('Breakpoints')}</div>
                    <div>
                        ${this.expandedPanels.includes('Breakpoints') ? html`
                            <div style="padding: 24px 24px 24px 24px;">
                                ${this.screenPresetTemplate(screenPresets)}
                            </div>
                        ` : null}
                    </div>
                ` : undefined}
                <!-------------------->
            `
        } else {
            return html`
                <div style="padding: 24px;">
                    <span>${i18next.t('errorOccured')}</span><br/>
                    <span>${i18next.t('noDashboardFound')}</span>
                </div>
            `
        }
    }




    /* ======================== */

    // UI generation of an expandable panel header.
    generateExpandableHeader(name: string): TemplateResult {
        return html`
            <span class="expandableHeader panel-title" @click="${() => { this.expandPanel(name); }}">
                <or-icon icon="${this.expandedPanels.includes(name) ? 'chevron-down' : 'chevron-right'}"></or-icon>
                <span style="margin-left: 6px; height: 25px; line-height: 25px;">${name}</span>
            </span>
        `
    }
    scalingPresetTemplate(screenPresets: DashboardScreenPreset[], scalingPresets: {key: DashboardScalingPreset, value: string}[]) {
        return html`
            ${screenPresets.map((preset) => {
                return html`
                    <div style="margin-bottom: ${screenPresets.length > 1 ? '24px' : '16px'}">
                        <div class="label">
                            ${html`<span>${unsafeHTML(i18next.t("dashboard.onScreenMyBoardShould").replace("{{size}}", ("<b>" + i18next.t(preset.displayName!) + "</b>")))}</span>`}
                        </div>
                        <or-mwc-input class="displayInput" type="${InputType.SELECT}" comfortable style="width: 100%;"
                                      .options="${scalingPresets.map((x) => x.value)}"
                                      .value="${scalingPresets.find((p) => p.key == preset.scalingPreset)?.value}"
                                      @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                          preset.scalingPreset = scalingPresets.find((p) => p.value == event.detail.value)?.key;
                                          this.forceParentUpdate(true);
                                      }}"
                        ></or-mwc-input>
                    </div>
                `
            })}
        `
    }
    screenPresetTemplate(screenPresets: DashboardScreenPreset[], customLabels?: string[]) {
        return html`
            ${screenPresets.map((preset, index) => {
                return html`
                    <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                        <span style="min-width: 140px;">${customLabels ? customLabels[index] : (preset.displayName + " " + i18next.t('screen'))}</span>
                        <div>
                            <span style="margin-right: 4px;">${(screenPresets.indexOf(preset) == 0) ? '>' : '<'}</span>
                            <or-mwc-input type="${InputType.NUMBER}" comfortable .disabled="${(screenPresets.length > 1 && screenPresets.indexOf(preset) == 0)}" style="width: 70px;" 
                                          .value="${(screenPresets.length > 1 && screenPresets.indexOf(preset) == 0 ? screenPresets[1].breakpoint : preset.breakpoint)}" 
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.setBreakpoint(screenPresets.indexOf(preset), event.detail.value)}}"
                            ></or-mwc-input>
                            <span style="margin-left: 2px;">px</span>
                        </div>
                    </div>
                `
            })}
        `
    }


    /* ------------------------- */

}
