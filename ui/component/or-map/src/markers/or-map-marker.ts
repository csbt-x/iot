import {html, LitElement, PropertyValues} from "lit";
import {customElement, property, query} from "lit/decorators.js";
import {markerActiveColorVar, markerColorVar} from "../style";

export class OrMapMarkerChangedEvent extends CustomEvent<OrMapMarkerChangedEventDetail> {

    public static readonly NAME = "or-map-marker-changed";

    constructor(marker: OrMapMarker, prop: string) {
        super(OrMapMarkerChangedEvent.NAME, {
            detail: {
                marker: marker,
                property: prop
            },
            bubbles: true,
            composed: true
        });
    }
}

export class OrMapMarkerClickedEvent extends CustomEvent<OrMapMarkerEventDetail> {

    public static readonly NAME = "or-map-marker-clicked";

    constructor(marker: OrMapMarker) {
        super(OrMapMarkerClickedEvent.NAME, {
            detail: {
                marker: marker
            },
            bubbles: true,
            composed: true
        });
    }
}

export interface OrMapMarkerEventDetail {
    marker: OrMapMarker;
}

export interface OrMapMarkerChangedEventDetail extends OrMapMarkerEventDetail {
    property: string;
}

declare global {
    export interface HTMLElementEventMap {
        [OrMapMarkerChangedEvent.NAME]: OrMapMarkerChangedEvent;
        [OrMapMarkerClickedEvent.NAME]: OrMapMarkerClickedEvent;
    }
}

/**
 * Base class for all map markers.
 *
 * This component doesn't directly render anything instead it generates DOM that can be added to the map component
 */
@customElement("or-map-marker")
export class OrMapMarker extends LitElement {

    protected static _defaultTemplate = (icon: string | undefined) => `
        <or-icon icon="or:marker"></or-icon>
        <or-icon class="marker-icon" icon="${icon || ""}"></or-icon>
    `

    @property({type: Number, reflect: true, attribute: true})
    public lat?: number;

    @property({type: Number, reflect: true})
    public lng?: number;

    @property({type: Number, reflect: true})
    public radius?: number;

    @property({type: Boolean})
    public visible: boolean = true;

    @property({type: String})
    public icon?: string;

    @property({type: String})
    public color?: string;

    @property({type: String})
    public activeColor?: string;

    @property({type: Boolean})
    public interactive: boolean = true;

    @property({type: Boolean})
    active: boolean = false;

    // This is the actual map marker element not the same element as returned from createMarkerElement when using raster map
    public _actualMarkerElement?: HTMLDivElement;

    @query("slot")
    protected _slot?: HTMLSlotElement;

    public get markerContainer(): HTMLDivElement | undefined {
        if (this._actualMarkerElement) {
            return this._actualMarkerElement.firstElementChild as HTMLDivElement;
        }
    }

    public _onClick(e: MouseEvent) {
        this.dispatchEvent(new OrMapMarkerClickedEvent(this));
    }

    public _createMarkerElement(): HTMLDivElement {
        const markerElem = document.createElement("div");
        const markerContainerElem = document.createElement("div");
        markerElem.appendChild(markerContainerElem);
        this.addMarkerClassNames(markerElem);
        this.addMarkerContainerClassNames(markerContainerElem);
        let content = this.createMarkerContent();
        if (!content) {
            // Append default marker
            markerElem.classList.add("or-map-marker-default");
            content = this.createDefaultMarkerContent();
        }
        markerContainerElem.appendChild(content);
        this.updateInteractive(markerElem);
        this.updateVisibility(markerElem);
        this.updateColor(markerContainerElem);
        this.updateActive(markerElem);
        return markerElem;
    }

    /**
     * Override in sub types to customise the look of the marker. If undefined returned then a default marker will
     * be used instead.
     */
    public createMarkerContent(): HTMLElement | undefined {

        // Append child elements
        let hasChildren = false;
        let container = document.createElement("div");

        if (this._slot) {
            this._slot.assignedNodes({flatten: true}).forEach((child) => {
                if (child instanceof HTMLElement) {
                    container.appendChild(child.cloneNode(true));
                    hasChildren = true;
                }
            });
        }
        
        if (!hasChildren) {
            return;
        }

        return container;
    }

    protected shouldUpdate(_changedProperties: PropertyValues): boolean {
        if (_changedProperties.has("icon")) {
            this.refreshMarkerContent();
        }

        if (_changedProperties.has("color") || _changedProperties.has("activeColor")) {
            this.updateColor(this.markerContainer);
        }

        if (_changedProperties.has("visible")) {
            this.updateVisibility(this._actualMarkerElement);
        }

        if (_changedProperties.has("interactive")) {
            this.updateInteractive(this._actualMarkerElement);
        }

        if (_changedProperties.has("active")) {
            this.updateActive(this._actualMarkerElement);
            this.updateColor(this.markerContainer);
        }

        _changedProperties.forEach((oldValue, prop) => this._raisePropertyChange(prop as string));
        return false;
    }

    protected updateVisibility(container?: HTMLDivElement) {
        if (container) {
            if (this.visible) {
                container.removeAttribute("hidden");
            } else {
                container.setAttribute("hidden", "true");
            }
        }
    }

    protected getColor() {
        return this.color && this.color !== "unset" ? this.color : undefined;
    }

    protected getActiveColor() {
        return this.activeColor && this.activeColor !== "unset" ? this.activeColor : undefined;
    }

    protected updateColor(container?: HTMLDivElement) {
        if (container) {
            container.style.removeProperty(markerColorVar);
            container.style.removeProperty(markerActiveColorVar);

            const color = this.getColor();
            const activeColor = this.getActiveColor();

            if (color) {
                container.style.setProperty(markerColorVar, color);
            }
            if (activeColor) {
                container.style.setProperty(markerActiveColorVar, activeColor);
            }
        }
    }

    protected updateActive(container?: HTMLDivElement) {
        if (container) {
            if (this.active) {
                container.classList.add("active");
            } else {
                container.classList.remove("active");
            }
        }
    }

    protected updateInteractive(container?: HTMLDivElement) {
        if (container) {
            if (this.interactive) {
                container.classList.add("interactive");
            } else {
                container.classList.remove("interactive");
            }
        }
    }

    protected refreshMarkerContent() {
        if (this.markerContainer) {
            let content = this.createMarkerContent();
            if (!content) {
                // Append default marker
                this._actualMarkerElement!.classList.add("or-map-marker-default");
                content = this.createDefaultMarkerContent();
            } else {
                this._actualMarkerElement!.classList.remove("or-map-marker-default");
            }
            if (this.markerContainer.children.length > 0) {
                this.markerContainer.removeChild(this.markerContainer.children[0]);
            }
            this.markerContainer.appendChild(content);
        }
    }

    protected render() {
        return html`
          <slot></slot>
        `;
    }

    protected _raisePropertyChange(prop: string) {
        this.dispatchEvent(new OrMapMarkerChangedEvent(this, prop));
    }

    protected addMarkerClassNames(markerElement: HTMLElement) {
        markerElement.classList.add("or-map-marker");
    }

    protected addMarkerContainerClassNames(markerContainer: HTMLElement) {
        markerContainer.classList.add("marker-container");
    }

    protected createDefaultMarkerContent(): HTMLElement {
        const div = document.createElement("div");
        div.innerHTML = OrMapMarker._defaultTemplate(this.icon);
        return div;
    }
}
