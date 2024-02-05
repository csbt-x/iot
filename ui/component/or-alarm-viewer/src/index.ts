
import {
    css,
    html,
    LitElement,
    PropertyValues,
    TemplateResult,
    unsafeCSS
} from "lit";
import {customElement, property, query, state} from "lit/decorators.js";
import i18next from "i18next";
import {translate} from "@openremote/or-translate";
import * as Model from "@openremote/model";
import manager, {DefaultColor2, DefaultColor3, Util} from "@openremote/core";
import "@openremote/or-mwc-components/or-mwc-input";
import "@openremote/or-components/or-panel";
import "@openremote/or-translate";
import {InputType, OrInputChangedEvent, OrInputChangedEventDetail, OrMwcInput} from "@openremote/or-mwc-components/or-mwc-input";
import {MDCDataTable} from "@material/data-table";
import moment from "moment";
import "@openremote/or-mwc-components/or-mwc-menu";
import {getContentWithMenuTemplate} from "@openremote/or-mwc-components/or-mwc-menu";
import {ListItem} from "@openremote/or-mwc-components/or-mwc-list";
import { GenericAxiosResponse } from "axios";
import {SentAlarm, AlarmSeverity, AlarmStatus, Alarm} from "@openremote/model";
import {OrMwcTableRowClickEvent, TableColumn, TableRow} from "@openremote/or-mwc-components/or-mwc-table";


// TODO: Add webpack/rollup to build so consumers aren't forced to use the same tooling
const linkParser = require("parse-link-header");
const tableStyle = require("@material/data-table/dist/mdc.data-table.css");

export interface ViewerConfig {
    initialFilter?: string;
    initialSeverity?: AlarmSeverity;
    hideControls?: boolean;
    assignOnly?: boolean;
}

// language=CSS
const style = css`
    :host {
        --internal-or-log-viewer-background-color: var(--or-log-viewer-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-or-log-viewer-text-color: var(--or-log-viewer-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
        --internal-or-log-viewer-controls-margin: var(--or-log-viewer-controls-margin, 0);
        
        display: block;                
    }
    
    :host([hidden]) {
        display: none;
    }
    
    #container {
        display: flex;
        min-width: 0;
        width: 100%;
        height: 100%;
        flex-direction: column;
    }
       
    #msg {
        height: 100%;
        width: 100%;
        justify-content: center;
        align-items: center;
        text-align: center;
    }
    
    #msg:not([hidden]) {
        display: flex;    
    }

            #status-select, #severity-select, #sort-select {
                width: 180px;
                padding: 0 10px;
            }
            
            #controls {
                flex: 0;
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                margin: var(--internal-or-log-viewer-controls-margin);
                padding: 0 10px 10px 10px;
            }
        
            #controls-left {
                display: flex;
                justify-content: flex-start;
                align-items: center;
            }
            
            #controls > * {
                margin-top: 0px;
            }
    
    .hidden {
        display: none !important;
    }
    
    #table-container {
        height: 100%;
        overflow: auto;
        margin-top: 10px;
    }
    
    #table {
        width: 100%;
        margin-bottom: 10px;
    }
    
    #table > table {
        width: 100%;
        table-layout: fixed;
    }
    
    #table th, #table td {
        word-wrap: break-word;
        white-space: pre-wrap;
    }

    th.mdc-data-table__header-cell {
        text-weight: var(--mdc-typography-body2-font-weight, 700);
    }

    #table td.mdc-data-table__cell.mdc-data-table__cell--clickable:nth-child(3) {
        color: green !important;
        font-weight: 700 !important;
    }
      
      td.mdc-data-table__cell:nth-child(3)[data-severity="MEDIUM"] {
        color: orange; /* change color to orange for "medium" severity */
        font-weight: 700;
      }
      
      td.mdc-data-table__cell:nth-child(3)[data-severity="HIGH"] {
        color: red; /* change color to red for "high" severity */
        font-weight: 700;
      }
`;

export interface OrAlarmTableRowClickDetail {
    alarm: SentAlarm | undefined;
}

export class OrAlarmTableRowClickEvent extends CustomEvent<OrAlarmTableRowClickDetail> {

    public static readonly NAME = "or-alarm-table-row-click";

    constructor(alarm: SentAlarm | undefined) {
        super(OrAlarmTableRowClickEvent.NAME, {
            detail: {
                alarm: alarm
            },
            bubbles: true,
            composed: true
        });
    }
}

@customElement("or-alarm-viewer")
export class OrAlarmViewer extends translate(i18next)(LitElement) {

    public static DEFAULT_LIMIT = 50;

    static get styles() {
        return [
            css`${unsafeCSS(tableStyle)}`,
            style
        ];
    }


    @property({type: Number})
    public limit?: number;

    @property({type: Array})
    public severities?: AlarmSeverity[];

    @property({type: Array})
    public statuses?: AlarmStatus[];

    @property({type: Array})
    public selected?: SentAlarm[];

    @state()
    public severity?: AlarmSeverity;

    @state()
    public status?: AlarmStatus;

    @state()
    public hide: boolean = false;

    @state()
    public assign: boolean = false;

    @property({type: Object})
    public config?: ViewerConfig;

    @property()
    protected _loading: boolean = false;

    @state()
    protected _data?: SentAlarm[];

    @query("#table")
    protected _tableElem!: HTMLDivElement;
    protected _table?: MDCDataTable;
    protected _refresh?: number;
    protected _pageCount?: number;
    protected _currentPage: number = 1;

    connectedCallback() {
        this._loadData();
        super.connectedCallback();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._cleanup();
    }

    renderedCallback(): void {
        // Find all table cells with a specific class or data attribute.
        const cells = document.querySelectorAll('.mdc-data-table__cell');

        // Loop through the cells and replace text with icons based on conditions.
        cells.forEach(cell => {
            const text = cell.textContent?.trim();
            if (text === 'LOW') {
                cell.innerHTML = '<i class="material-icons">check_circle</i>';
            } else if (text === 'MEDIUM') {
                cell.innerHTML = '<i class="material-icons">cancel</i>';
            }
        });
    }

    shouldUpdate(_changedProperties: PropertyValues): boolean {

        if (_changedProperties.has("severity")
            || _changedProperties.has("status")
            || _changedProperties.has("filter")
            || _changedProperties.has("sort")
            || _changedProperties.has("hide")) {
                this._pageCount = undefined;
                this._currentPage = 1;
                this._data = undefined;
        }

        if (!this._data) {
            this._loadData();
        }

        return super.shouldUpdate(_changedProperties);
    }

    render() {
        const disabled = this._loading;
        
        return html`
            <div id="container">
                ${disabled ? html`<div id="msg">${i18next.t("loading")}</div>` :
                    html`<div id="table-container">
                        ${this._data ? this.getAlarmsTable() : ``}
                    </div>`}
            </div>
        `;
    }

    protected getSeverityIcon(severity: AlarmSeverity){
        switch (severity) {
            case AlarmSeverity.LOW:
                return '<or-icon class="icon-low" icon="numeric-1-box"></or-icon>'
            case AlarmSeverity.MEDIUM:
                return '<or-icon class="icon-medium" icon="numeric-2-box"></or-icon>'
            case AlarmSeverity.HIGH:
                return '<or-icon class="icon-high" icon="numeric-3-box"></or-icon>'
            default:
                return;
        }
    }

    protected getAlarmsTable()  {
        // Content of Alarm Table
        const columns: TableColumn[] = [
            {title: i18next.t('alarm.severity')},
            {title: i18next.t('alarm.status')},
            {title: i18next.t('alarm.assignee')},
            {title: i18next.t('alarm.title')},
            {title: i18next.t('alarm.lastModified'), isSortable: true}
        ];

        const rows: TableRow[] = this._data!.map((alarm) => {
            return {
                content: [this.getSeverityIcon(alarm.severity!), alarm.status!.charAt(0) + alarm.status!.slice(1).toLowerCase(), alarm.assigneeUsername, alarm.title, new Date(alarm.lastModified!).toLocaleString()],
                clickable: true
            } as TableRow
        });

        // Configuration
        const config = {
            columnFilter: [],
            stickyFirstColumn: false,
            pagination: {
                enable: true
            },
            multiSelect: true
        }

        return html`
            <or-mwc-table .columns="${columns instanceof Array ? columns : undefined}"
                          .columnsTemplate="${!(columns instanceof Array) ? columns : undefined}"
                          .rows="${rows instanceof Array ? rows : undefined}"
                          .rowsTemplate="${!(rows instanceof Array) ? rows : undefined}"
                          .config="${config}"
                          @or-mwc-table-row-click="${(e: OrMwcTableRowClickEvent) => this.dispatchEvent(new OrAlarmTableRowClickEvent(this._data![e.detail.index] as SentAlarm))}"
            ></or-mwc-table>
        `
    }

    protected async _loadData() {
        if (this._loading) {
            return;
        }

        this._loading = true;
        const response = await manager.rest.api.AlarmResource.getAlarms();
        

        if (response.status === 200) {
            // Get page count
            this._data = response.data;
            if(manager.getRealm() != "master") {
                this._data = this._data.filter((e) => e.realm === manager.getRealm());
            }
            if(this.config?.assignOnly) {
                const userResponse = await manager.rest.api.UserResource.getCurrent();
                if(userResponse.status === 200) {
                    this._data = this._data.filter((e) => e.assigneeId === userResponse.data.id);
                }
            }
            if(this.severity) {
                this._data = this._data.filter((e) => e.severity === this.severity);
            }
            if(this.status) {
                this._data = this._data.filter((e) => e.status === this.status);
            }
            this._pageCount = this._data?.length;
        }
        this._loading = false;
    }

    protected _cleanup() {
        if (this._table) {
            this._table.destroy();
            this._table = undefined;
        }

        if (this._refresh) {
            window.clearTimeout(this._refresh);
        }
    }
}
