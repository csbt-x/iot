import manager, {DefaultColor4} from "@openremote/core";
import {css, CSSResult, html, LitElement, TemplateResult, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {style} from "./style";
import "./or-dashboard-widget";
import {debounce} from "lodash";
import {
    DashboardGridItem,
    DashboardScalingPreset,
    DashboardScreenPreset,
    DashboardTemplate,
    DashboardWidget,
    DashboardWidgetType
} from "@openremote/model";
import {
    generateGridItem,
    generateWidgetDisplayName,
    getActivePreset, MAX_BREAKPOINT,
} from "./index";
import {InputType, OrInputChangedEvent} from "@openremote/or-mwc-components/or-mwc-input";
import {repeat} from 'lit/directives/repeat.js';
import {GridItemHTMLElement, GridStack, GridStackElement, GridStackNode} from "gridstack";
import {showSnackbar} from "@openremote/or-mwc-components/or-mwc-snackbar";
import { i18next } from "@openremote/or-translate";
import { when } from "lit/directives/when.js";
import { cache } from "lit/directives/cache.js";

// TODO: Add webpack/rollup to build so consumers aren't forced to use the same tooling
const gridcss = require('gridstack/dist/gridstack.min.css');
const extracss = require('gridstack/dist/gridstack-extra.css');

//language=css
const editorStyling = css`
    
    #view-options {
        padding: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    /* Margins on view options */
    #fit-btn { margin-right: 10px; }
    #view-preset-select { margin-left: 20px; }
    #width-input { margin-left: 20px; }
    #height-input { margin-left: 10px; }
    #rotate-btn { margin-left: 10px; }
    
    .maingridContainer {
        position: absolute;
        padding-bottom: 64px;
    }
    .maingridContainer__fullscreen {
        width: 100%;
    }
    
    .maingrid {
        border: 3px solid #909090;
        background: #FFFFFF;
        border-radius: 8px;
        overflow-x: hidden;
        overflow-y: scroll;
        padding: 4px;
        z-index: 0;
    }
    .maingrid__fullscreen {
        border: none;
        background: transparent;
        border-radius: 0;
        overflow-x: hidden;
        overflow-y: auto;
        height: 100% !important; /* To override .maingrid */
        width: 100% !important; /* To override .maingrid */
        padding: 0;
        /*pointer-events: none;*/
        position: relative;
        z-index: 0;
    }
    .maingrid__disabled {
        pointer-events: none;
        opacity: 40%;
    }
    .grid-stack-item-content {
        background: white;
        box-sizing: border-box;
        border: 2px solid #E0E0E0;
        border-radius: 4px;
        overflow: hidden !important;
    }
    .grid-stack-item-content__active {
        border: 2px solid ${unsafeCSS(DefaultColor4)};    
    }
    
    /* Grid lines on the background of the grid */
    .grid-element {
        background-image:
                linear-gradient(90deg, #E0E0E0, transparent 1px),
                linear-gradient(90deg, transparent calc(100% - 1px), #E0E0E0),
                linear-gradient(#E0E0E0, transparent 1px),
                linear-gradient(transparent calc(100% - 1px), #E0E0E0 100%);
    }
`

/* -------------------------------------------------- */

export interface ORGridStackNode extends GridStackNode {
    widgetType: DashboardWidgetType;
}

@customElement("or-dashboard-preview")
export class OrDashboardPreview extends LitElement {

    @property({ hasChanged(oldValue, newValue) { return JSON.stringify(oldValue) != JSON.stringify(newValue); }})
    set template(newValue: DashboardTemplate) {
        const oldValue = this._template;
        if(oldValue != undefined) {
            const changes = {
                changedKeys: Object.keys(newValue).filter(key => (JSON.stringify(newValue[key as keyof DashboardTemplate]) !== JSON.stringify(oldValue[key as keyof DashboardTemplate]))),
                oldValue: oldValue,
                newValue: newValue
            };
            console.log(changes.changedKeys);
            this._template = JSON.parse(JSON.stringify(newValue));
            this.latestChanges = changes;
            this.requestUpdate("template", oldValue);

        } else if(newValue != undefined) {
            this._template = newValue;
            console.log("Setting up Grid.. [#1]");
            this.setupGrid(false, false);
            this.previewPreset = newValue.screenPresets![1]; // Initial preset on load
        }
    }

    private _template?: DashboardTemplate;

    get template() {
        return this._template!;
    }

    @property() // Optional alternative for template
    protected readonly dashboardId?: string;

    @property() // Normally manager.displayRealm
    protected realm?: string;

    @property({type: Object})
    protected selectedWidget: DashboardWidget | undefined;

    @property()
    protected editMode: boolean = false;

    @property()
    protected readonly: boolean = true;

    @property()
    protected previewWidth?: string;

    @property()
    protected previewHeight?: string;

    @property()
    protected previewZoom: number = 1;

    // @property() // Optional alternative for previewWidth/previewHeight
    // protected previewSize?: DashboardSizeOption;
    @property()
    protected previewPreset?: DashboardScreenPreset;

    @property()
    protected fullscreen: boolean = false;

    @property() // Property that, when toggled on, shows a "loading" state for 200ms, and then renders the component again.
    protected rerenderPending: boolean = false;

    /* -------------- */

    @state()
    protected grid?: GridStack;

    @state() // State where the changes of the template are saved temporarily (for comparison with incoming data)
    protected latestChanges?: {
        changedKeys: string[],
        oldValue: DashboardTemplate,
        newValue: DashboardTemplate
    }

    @state() // Records time a user is dragging
    protected latestDragWidgetStart?: Date;

    @state()
    protected activePreset?: DashboardScreenPreset;

    @state()
    protected resizeObserver?: ResizeObserver;

    @state()
    protected cachedMockData?: Map<string, unknown> = new Map<string, unknown>();

    /* ------------------------------------------- */

    static get styles() {
        return [unsafeCSS(gridcss), unsafeCSS(extracss), editorStyling, style];
    }

    // Checking whether actual changes have been made; if not, prevent updating.
    shouldUpdate(changedProperties: Map<PropertyKey, unknown>): boolean {
        // console.error(changedProperties)
        const changed = changedProperties;
        if(changedProperties.has('latestChanges') && this.latestChanges?.changedKeys.length == 0 && (JSON.stringify((changedProperties.get('latestChanges') as any)?.oldValue)) == (JSON.stringify((changedProperties.get('latestChanges') as any)?.newValue))) {
            changed.delete('latestChanges');
        }
        changed.delete('latestDragWidgetStart');
        return (changed.size == 0 ? false : super.shouldUpdate(changedProperties));
    }


    // Main method for executing actions after property changes
    updated(changedProperties: Map<string, any>) {
        console.log(changedProperties);
        if(this.realm == undefined) { this.realm = manager.displayRealm; }

        // Setup template (list of widgets and properties)
        if(!this.template && this.dashboardId) {
            manager.rest.api.DashboardResource.get(this.dashboardId)
                .then((response) => { this.template = response.data.template!; })
                .catch((reason) => { console.error(reason); showSnackbar(undefined, i18next.t('errorOccurred')); });
        } else if(this.template == null && this.dashboardId == null) {
            console.error("Neither the template nor dashboardId attributes have been specified!");
        }

        // If changes to the template have been made
        if(changedProperties.has("latestChanges")) {
            if(this.latestChanges) {

                // If only columns property changed, change columns through the framework and then recreate grid.
                if(this.latestChanges.changedKeys.length == 1 && this.latestChanges.changedKeys.includes('columns') && this.grid) {
                    this.grid.column(this.latestChanges.newValue.columns!);
                    let maingrid = this.shadowRoot?.querySelector(".maingrid");
                    let gridElement = this.shadowRoot?.getElementById("gridElement");
                    gridElement!.style.backgroundSize = "" + this.grid.cellWidth() + "px " + this.grid.getCellHeight() + "px";
                    gridElement!.style.height = maingrid!.scrollHeight + 'px';
                    this.setupGrid(true, false);
                }

                // If ID changed, aka user selected a different template.
                else if(this.latestChanges.changedKeys.includes('id')) {
                    console.log("Setting up Grid.. [#7]");
                    this.setupGrid(true, true);
                }

                // If multiple properties changed, just force rerender all of it.
                else if(this.latestChanges.changedKeys.length > 1) {
                    console.log("Setting up Grid.. [#6]");
                    this.setupGrid(true, true);
                }

                // On widgets change, check whether they are programmatically added to GridStack. If not, adding them.
                else if(this.latestChanges.changedKeys.includes('widgets')) {
                    if(this.grid?.el != null) {
                        this.grid.getGridItems().forEach((gridElement) => {
                            if(!gridElement.classList.contains('ui-draggable')) {
                                this.grid?.makeWidget(gridElement);
                            }
                        })
                    }
                }
                // On screenPreset change, a full force rererender is required
                else if(this.latestChanges.changedKeys.includes('screenPresets')) {
                    console.log("Setting up Grid.. [#3]");
                    this.setupGrid(true, true);

                    // Updating previewPreset in case the currently used one has changed..
                    const changed: DashboardScreenPreset[] | undefined = this.latestChanges.newValue.screenPresets?.filter((newpreset) => {
                        return (this.latestChanges?.oldValue.screenPresets?.find((oldpreset) => { return oldpreset.id == newpreset.id })?.breakpoint != newpreset.breakpoint);
                    });
                    if(changed) {
                        const found = changed.find((x) => x.id == this.previewPreset?.id);
                        if(found) { this.previewPreset = found; }
                    }
                }
                // Set them to none again
                this.latestChanges = undefined;
            }
        }

        if(changedProperties.has("selectedWidget")) {
            if(this.selectedWidget) {
                if(changedProperties.get("selectedWidget") != undefined) { // if previous selected state was a different widget
                    this.dispatchEvent(new CustomEvent("deselected", { detail: changedProperties.get("selectedWidget") as DashboardWidget }));
                }
                if(this.grid?.el != null) {
                    const foundItem = this.grid?.getGridItems().find((item) => {
                        return item.gridstackNode?.id == this.selectedWidget?.gridItem?.id;
                    });
                    if(foundItem != null) { this.selectGridItem(foundItem); }
                    this.dispatchEvent(new CustomEvent("selected", { detail: this.selectedWidget }));
                }

            } else {
                // Checking whether the mainGrid is not destroyed and there are Items to deselect...
                if(this.grid?.el != undefined && this.grid?.getGridItems() != null) {
                    this.deselectGridItems(this.grid.getGridItems());
                }
                this.dispatchEvent(new CustomEvent("deselected", { detail: changedProperties.get("selectedWidget") as DashboardWidget }));
            }
        }

        // Switching edit/view mode needs recreation of Grid
        if(changedProperties.has("editMode")) {
            if(changedProperties.get('editMode') != undefined) {
                console.log("Setting up Grid.. [#4]");
                this.setupGrid(true, true);
            }
        }

        // Adjusting previewSize when manual pixels control changes
        if(changedProperties.has("previewWidth") || changedProperties.has("previewHeight")) {
            if(this.template?.screenPresets) {
                this.previewPreset = this.template.screenPresets.find(s => {
                    return (s.breakpoint! == Number(this.previewWidth?.replace('px', '')) // if width is equal
                        && (Math.round((s.breakpoint) / 16 * 9) == Math.round(Number(this.previewHeight?.replace('px', ''))))); // if height is equal
                });
            }
        }

        // Adjusting pixels control when previewSize changes.
        if(changedProperties.has("previewPreset")) {
            if(this.template?.screenPresets) {
                const preset = this.template.screenPresets?.find(s => s.id == this.previewPreset?.id);
                if(preset) {

                    // Largest breakpoint is 1 million, so we get 1 size smaller and add 1 px of width to it.
                    // Otherwise, just set width and calculate height with 16/9 aspect ratio.
                    if(preset.breakpoint === MAX_BREAKPOINT) {
                        const breakpoint = this.template.screenPresets[this.template.screenPresets.indexOf(preset) + 1].breakpoint!;
                        this.previewWidth = (breakpoint * 1.5) + "px";
                        this.previewHeight = (Math.round((breakpoint * 1.5) / 16 * 9) + "px");
                    } else {
                        this.previewWidth = preset.breakpoint + "px";
                        this.previewHeight = (preset.breakpoint! / 16 * 9) + "px";
                    }
                }
            }
        }

        // When parent component requests a forced rerender
        if(changedProperties.has("rerenderPending")) {
            if(this.rerenderPending) {
                this.rerenderPending = false;
            }
        }
    }


    /* ---------------------------------------- */

    // Wait until function that waits until a boolean returns differently
    waitUntil(conditionFunction: any) {
        const poll = (resolve: any) => {
            if(conditionFunction()) resolve();
            else setTimeout(_ => poll(resolve), 400);
        }
        return new Promise(poll);
    }

    // Main setup Grid method (often used)
    async setupGrid(recreate: boolean, force: boolean = false) {
        let gridElement = this.shadowRoot?.getElementById("gridElement");
        if(gridElement != null) {
            console.log("Setting up a new Grid! Using recreate [" + recreate + "] and force [" + force + "].");
            if(recreate && this.grid != null) {
                this.grid.destroy(false);

                if(force) { // Fully rerender the grid by switching rerenderPending on and off, and continue after that.
                    console.log("Recreating the grid after major changes.");
                    this.rerenderPending = true;
                    await this.updateComplete;
                    await this.waitUntil((_: any) => !this.rerenderPending);
                    gridElement = this.shadowRoot?.getElementById("gridElement");
                    this.grid = undefined;
                }
            }
            const width: number = (this.fullscreen ? this.clientWidth : (+(this.previewWidth?.replace(/\D/g, "")!)));
            const newPreset = getActivePreset(width, this.template.screenPresets!);
            if(this.activePreset && newPreset?.scalingPreset != this.activePreset?.scalingPreset) {
                if(!(recreate && force)) { // Fully rerender the grid by switching rerenderPending on and off, and continue after that.
                    if(!recreate) { // If not destroyed yet, destroy first.
                        this.grid?.destroy(false);
                    }
                    console.log("Recreating the grid after activePreset change.");
                    this.rerenderPending = true;
                    await this.updateComplete;
                    await this.waitUntil((_: any) => !this.rerenderPending);
                    gridElement = this.shadowRoot?.getElementById("gridElement");
                    this.grid = undefined;
                }
            }
            this.activePreset = newPreset;


            // If grid got reset, setup the ResizeObserver again.
            if(this.grid == null) {
                const gridHTML = this.shadowRoot?.querySelector(".maingrid");
                if(gridHTML) {
                    this.setupResizeObserver(gridHTML);
                }
            }
            this.grid = GridStack.init({
                acceptWidgets: (this.editMode),
                animate: true,
                cellHeight: (this.activePreset?.scalingPreset == DashboardScalingPreset.WRAP_TO_SINGLE_COLUMN ? (width / 4) : 'initial'),
                cellHeightThrottle: 100,
                column: this.template?.columns,
                disableOneColumnMode: (this.activePreset?.scalingPreset != DashboardScalingPreset.WRAP_TO_SINGLE_COLUMN),
                draggable: {
                    appendTo: 'parent', // Required to work, seems to be Shadow DOM related.
                    scroll: true
                },
                float: true,
                margin: 4,
                resizable: {
                    handles: 'all'
                },
                staticGrid: (this.activePreset?.scalingPreset == DashboardScalingPreset.WRAP_TO_SINGLE_COLUMN ? true : (!this.editMode)),
                styleInHead: false
            }, gridElement!);

            gridElement!.style.backgroundSize = "" + this.grid.cellWidth() + "px " + this.grid.getCellHeight() + "px";
            gridElement!.style.height = "100%";
            gridElement!.style.minHeight = "100%";

            this.grid.on('dropped', (_event: Event, _previousWidget: any, newWidget: GridStackNode | undefined) => {
                if(this.grid != null && newWidget != null) {
                    this.grid.removeWidget((newWidget.el) as GridStackElement, true, false); // Removes dragged widget first
                    this.createWidget(newWidget as ORGridStackNode);
                    this.dispatchEvent(new CustomEvent("dropped", { detail: newWidget }));
                }
            });
            this.grid.on('change', (_event: Event, items: any) => {
                if(this.template != null && this.template.widgets != null) {
                    (items as GridStackNode[]).forEach(node => {
                        const foundWidget: DashboardWidget | undefined = this.template?.widgets?.find(widget => { return widget.gridItem?.id == node.id; });
                        if(foundWidget && foundWidget.gridItem != null) {
                            foundWidget.gridItem.x = node.x;
                            foundWidget.gridItem.y = node.y;
                            foundWidget.gridItem.w = node.w;
                            foundWidget.gridItem.h = node.h;
                        }
                    });
                    this.dispatchEvent(new CustomEvent("changed", {detail: { template: this.template }}));
                }
            });
            this.grid.on('resizestart', (_event: Event, el: any) => {
                this.latestDragWidgetStart = new Date();
            });
            this.grid.on('resizestop', (_event: Event, el: any) => {
                setTimeout(() => {  this.latestDragWidgetStart = undefined; }, 200);
            });
        }
    }

    // Method for creating Widgets (reused at many places)
    createWidget(gridStackNode: ORGridStackNode): DashboardWidget {
        const randomId = (Math.random() + 1).toString(36).substring(2);
        let displayName = generateWidgetDisplayName(this.template, gridStackNode.widgetType);
        if(displayName == undefined) { displayName = (i18next.t('dashboard.widget') + " #" + randomId); } // If no displayName, set random ID as name.
        const gridItem: DashboardGridItem = generateGridItem(gridStackNode, displayName);

        const widget = {
            id: randomId,
            displayName: displayName,
            gridItem: gridItem,
            widgetType: gridStackNode.widgetType
        } as DashboardWidget;

        const tempTemplate = JSON.parse(JSON.stringify(this.template)) as DashboardTemplate;
        if(tempTemplate.widgets == undefined) {
            tempTemplate.widgets = [];
        }
        tempTemplate.widgets?.push(widget);
        this.template = tempTemplate;
        this.dispatchEvent(new CustomEvent("changed", {detail: { template: this.template }}));
        return widget;
    }


    /* ------------------------------- */

    selectGridItem(gridItem: GridItemHTMLElement) {
        if(this.grid != null) {
            this.deselectGridItems(this.grid.getGridItems()); // deselecting all other items
            gridItem.querySelectorAll<HTMLElement>(".grid-stack-item-content").forEach((item: HTMLElement) => {
                item.classList.add('grid-stack-item-content__active'); // Apply active CSS class
            });
        }
    }
    deselectGridItem(gridItem: GridItemHTMLElement) {
        gridItem.querySelectorAll<HTMLElement>(".grid-stack-item-content").forEach((item: HTMLElement) => {
            item.classList.remove('grid-stack-item-content__active'); // Remove active CSS class
        });
    }

    deselectGridItems(gridItems: GridItemHTMLElement[]) {
        gridItems.forEach(item => {
            this.deselectGridItem(item);
        })
    }

    onGridItemClick(gridItem: DashboardGridItem | undefined) {
        if(!this.latestDragWidgetStart && !this.grid?.opts.staticGrid) {
            if(!gridItem) {
                this.selectedWidget = undefined;
            } else if(this.selectedWidget?.gridItem?.id != gridItem.id) {
                this.selectedWidget = this.template?.widgets?.find(widget => { return widget.gridItem?.id == gridItem.id; });
            }
        }
    }

    onFitToScreenClick() {
        const container = this.shadowRoot?.querySelector('#container');
        if(container) {
            const zoomWidth = +((0.95 * container.clientWidth) / +this.previewWidth!.replace('px', '')).toFixed(2);
            this.previewZoom = (zoomWidth > 1 ? 1 : zoomWidth);
        }
    }

    // Render
    protected render() {

        try { // to correct the list of gridItems each render (Hopefully temporarily since it's quite compute heavy)
            if(this.grid?.getGridItems()) {
                console.warn("Correcting list of gridItems..");
                this.grid?.getGridItems().forEach((gridItem: GridItemHTMLElement) => {
                    if(this.template?.widgets?.find((widget) => widget.id == gridItem.id) == undefined) {
                        this.grid?.removeWidget(gridItem);
                    }
                })
            }
        } catch (e) { console.warn(e); }

        const customPreset = "Custom";
        let screenPresets = this.template?.screenPresets?.map(s => s.displayName);
        screenPresets?.push(customPreset);
        return html`
            <div id="buildingArea" style="display: flex; flex-direction: column; height: 100%;" @click="${(event: PointerEvent) => { if((event.composedPath()[1] as HTMLElement).id === 'buildingArea') { this.onGridItemClick(undefined); }}}">
                ${this.editMode ? html`
                    <div id="view-options">
                        <or-mwc-input id="fit-btn" type="${InputType.BUTTON}" icon="fit-to-screen"
                                      @or-mwc-input-changed="${() => this.onFitToScreenClick()}">
                        </or-mwc-input>
                        <or-mwc-input id="zoom-input" type="${InputType.NUMBER}" outlined label="${i18next.t('dashboard.zoomPercent')}" min="25" .value="${(this.previewZoom * 100)}" style="width: 90px"
                                      @or-mwc-input-changed="${debounce((event: OrInputChangedEvent) => { this.previewZoom = event.detail.value / 100; }, 50)}"
                        ></or-mwc-input>
                        <or-mwc-input id="view-preset-select" type="${InputType.SELECT}" outlined label="${i18next.t('dashboard.presetSize')}" style="min-width: 220px;"
                                      .value="${this.previewPreset == undefined ? customPreset : this.previewPreset.displayName}" .options="${screenPresets}"
                                      @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.previewPreset = this.template?.screenPresets?.find(s => s.displayName == event.detail.value); }}"
                        ></or-mwc-input>
                        <or-mwc-input id="width-input" type="${InputType.NUMBER}" outlined label="${i18next.t('width')}" min="100" .value="${this.previewWidth?.replace('px', '')}" style="width: 90px"
                                      @or-mwc-input-changed="${debounce((event: OrInputChangedEvent) => { this.previewWidth = event.detail.value + 'px'; }, 550)}"
                        ></or-mwc-input>
                        <or-mwc-input id="height-input" type="${InputType.NUMBER}" outlined label="${i18next.t('height')}" min="100" .value="${this.previewHeight?.replace('px', '')}" style="width: 90px;"
                                      @or-mwc-input-changed="${(event: OrInputChangedEvent) => { this.previewHeight = event.detail.value + 'px'; }}"
                        ></or-mwc-input>
                        <or-mwc-input id="rotate-btn" type="${InputType.BUTTON}" icon="screen-rotation"
                                      @or-mwc-input-changed="${() => { const newWidth = this.previewHeight; const newHeight = this.previewWidth; this.previewWidth = newWidth; this.previewHeight = newHeight; }}">
                        </or-mwc-input>
                    </div>
                ` : undefined}
                ${this.rerenderPending ? html`
                    <div id="container" style="justify-content: center; align-items: center;">
                        <span>${i18next.t('dashboard.renderingGrid')}</span>
                    </div>
                ` : html`
                    <div id="container" style="justify-content: center; overflow: hidden auto; position: relative;">
                        ${this.activePreset?.scalingPreset == DashboardScalingPreset.BLOCK_DEVICE ? html`
                            <div style="position: absolute; z-index: 3; height: ${this.previewHeight}px; line-height: ${this.previewHeight}px; user-select: none;"><span>${i18next.t('dashboard.deviceNotSupported')}</span></div>
                        ` : undefined}
                        <div class="${this.fullscreen ? 'maingridContainer__fullscreen' : 'maingridContainer'}">
                            <div class="maingrid ${this.fullscreen ? 'maingrid__fullscreen' : undefined}"
                                 @click="${(ev: MouseEvent) => { (ev.composedPath()[0] as HTMLElement).id == 'gridElement' ? this.onGridItemClick(undefined) : undefined; }}"
                                 style="width: ${this.previewWidth}; height: ${this.previewHeight}; visibility: ${this.activePreset?.scalingPreset == DashboardScalingPreset.BLOCK_DEVICE ? 'hidden' : 'visible'}; zoom: ${this.previewZoom}; -moz-transform: scale(${this.previewZoom}); transform-origin: top;"
                            >
                                <!-- Gridstack element on which the Grid will be rendered -->
                                <div id="gridElement" class="grid-stack ${this.fullscreen ? undefined : 'grid-element'}">
                                    ${this.template?.widgets ? repeat(this.template.widgets, (item) => item.id, (widget) => {
                                        return html`
                                            <div class="grid-stack-item" id="${widget.id}" gs-id="${widget.gridItem?.id}" gs-x="${widget.gridItem?.x}" gs-y="${widget.gridItem?.y}" gs-w="${widget.gridItem?.w}" gs-h="${widget.gridItem?.h}" @click="${() => { this.onGridItemClick(widget.gridItem); }}">
                                                <div class="grid-stack-item-content" style="display: flex;">
                                                    <or-dashboard-widget .widget="${widget}" .editMode="${this.editMode}" .realm="${this.realm}" 
                                                                         style="width: 100%;"
                                                    ></or-dashboard-widget>
                                                </div>
                                            </div>
                                        `
                                    }) : undefined}
                                </div>
                            </div>
                        </div>
                    </div>
                `}
            </div>
            <style>
                ${cache(when((this.grid && ((this.getGridstackColumns(this.grid) && this.getGridstackColumns(this.grid)! > 12) || (this.template?.columns && this.template.columns > 12))),
                        () => this.applyCustomGridstackGridCSS(this.getGridstackColumns(this.grid) ? this.getGridstackColumns(this.grid)! : this.template!.columns!),
                        undefined
                ))}
            </style>
        `
    }

    getGridstackColumns(grid: GridStack | undefined): number | undefined {
        try { return grid?.getColumn(); }
        catch (e) { return undefined; }
    }



    private cachedGridstackCSS: Map<number, TemplateResult[]> = new Map<number, TemplateResult[]>();

    // Provides support for > 12 columns in GridStack (which requires manual css edits)
    //language=html
    applyCustomGridstackGridCSS(columns: number): TemplateResult {
        console.error("Applying custom Gridstack CSS...");
        if(this.cachedGridstackCSS.has(columns)) {
            return html`${this.cachedGridstackCSS.get(columns)!.map((x) => x)}`;
        } else {
            const htmls: TemplateResult[] = [];
            for(let i = 0; i < (columns + 1); i++) {
                htmls.push(html`
                    <style>
                        .grid-stack > .grid-stack-item[gs-w="${i}"]:not(.ui-draggable-dragging):not(.ui-resizable-resizing) { width: ${100 - (columns - i) * (100 / columns)}% !important; }
                        .grid-stack > .grid-stack-item[gs-x="${i}"]:not(.ui-draggable-dragging):not(.ui-resizable-resizing) { left: ${100 - (columns - i) * (100 / columns)}% !important; }                    
                    </style>
                `);
            }
            this.cachedGridstackCSS.set(columns, htmls);
            return html`${htmls.map((x) => x)}`;
        }
    }

    // Triggering a Grid rerender on every time the element resizes.
    // In fullscreen, debounce (only trigger after 550ms of no changes) to limit amount of rerenders.
    setupResizeObserver(element: Element): ResizeObserver {
        this.resizeObserver?.disconnect();
        if(this.fullscreen) {
            this.resizeObserver = new ResizeObserver(debounce(() => {
                console.log("Noticed a Dashboard resize! Updating the grid..");
                console.log("Setting up Grid.. [#5]");
                this.setupGrid(true, false);
            }, 550));
        } else {
            this.resizeObserver = new ResizeObserver(() => {
                console.log("Noticed a Dashboard resize! Updating the grid..");
                console.log("Setting up Grid.. [#5]");
                this.setupGrid(true, false);
            });
        }
        this.resizeObserver.observe(element);
        return this.resizeObserver;
    }

    /* --------------------------------------- */

}
