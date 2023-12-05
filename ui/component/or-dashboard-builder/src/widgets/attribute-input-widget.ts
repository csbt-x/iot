import {css, html, PropertyValues, TemplateResult } from "lit";
import {OrAssetWidget} from "../util/or-asset-widget";
import {WidgetConfig} from "../util/widget-config";
import {Attribute, AttributeRef, WellknownMetaItems} from "@openremote/model";
import {WidgetManifest} from "../util/or-widget";
import {WidgetSettings} from "../util/widget-settings";
import { customElement, query, queryAll } from "lit/decorators.js";
import {AttributeInputSettings} from "../settings/attribute-input-settings";
import { when } from "lit/directives/when.js";
import {i18next} from "@openremote/or-translate";
import {OrAttributeInput, OrAttributeInputChangedEvent} from "@openremote/or-attribute-input";
import {throttle} from "lodash";
import {Util} from "@openremote/core";

export interface AttributeInputWidgetConfig extends WidgetConfig {
    attributeRefs: AttributeRef[];
    readonly: boolean,
    showHelperText: boolean
}

function getDefaultWidgetConfig() {
    return {
        attributeRefs: [],
        readonly: false,
        showHelperText: true
    } as AttributeInputWidgetConfig
}

const styling = css`
  #widget-wrapper {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  .attr-input {
    width: 100%;
    box-sizing: border-box;
  }
`

@customElement("attribute-input-widget")
export class AttributeInputWidget extends OrAssetWidget {

    protected widgetConfig!: AttributeInputWidgetConfig;

    @query("#widget-wrapper")
    protected widgetWrapperElem?: HTMLElement;

    @queryAll(".attr-input")
    protected attributeInputElems?: NodeList;

    protected resizeObserver?: ResizeObserver;

    static getManifest(): WidgetManifest {
        return {
            displayName: "Attribute",
            displayIcon: "form-textbox",
            getContentHtml(config: WidgetConfig): OrAssetWidget {
                return new AttributeInputWidget(config);
            },
            getDefaultConfig(): WidgetConfig {
                return getDefaultWidgetConfig();
            },
            getSettingsHtml(config: WidgetConfig): WidgetSettings {
                return new AttributeInputSettings(config);
            }

        }
    }

    // TODO: Improve this to be more efficient
    refreshContent(force: boolean): void {
        console.log("refreshContent!");
        /* this.widgetConfig = JSON.parse(JSON.stringify(this.widgetConfig)) as AttributeInputWidgetConfig; */
    }

    static get styles() {
        return [...super.styles, styling];
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver?.disconnect();
        delete this.resizeObserver;
    }

    protected updated(changedProps: PropertyValues) {

        // If widgetConfig, and the attributeRefs of them have changed...
        if(changedProps.has("widgetConfig") && this.widgetConfig) {
            const attributeRefs = this.widgetConfig.attributeRefs;
            if(attributeRefs.length > 0 && !this.isAttributeRefLoaded(attributeRefs[0])) {
                this.loadAssets(attributeRefs);
            }
        }

        if(!this.resizeObserver && this.widgetWrapperElem) {
            this.resizeObserver = new ResizeObserver(throttle(() => {
                window.dispatchEvent(new Event('resize'));
            }, 200));
            this.resizeObserver.observe(this.widgetWrapperElem);
        }

        return super.updated(changedProps);
    }

    protected loadAssets(attributeRefs: AttributeRef[]) {
        this.fetchAssets(attributeRefs).then((assets) => {
            this.loadedAssets = assets;
        });
    }

    protected render(): TemplateResult {
        const config = this.widgetConfig;
        const attribute = (config.attributeRefs.length > 0 && this.loadedAssets[0]?.attributes) ? this.loadedAssets[0].attributes[config.attributeRefs[0].name!] : undefined;
        const readOnlyMetaItem = Util.getMetaValue(WellknownMetaItems.READONLY, attribute);
        return html`
            ${when(config.attributeRefs.length > 0 && attribute && this.loadedAssets && this.loadedAssets.length > 0, () => {
                return html`
                    <div id="widget-wrapper">
                        <or-attribute-input class="attr-input" fullWidth
                                            .assetType="${this.loadedAssets[0]?.type}"
                                            .attribute="${attribute}"
                                            .assetId="${this.loadedAssets[0]?.id}"
                                            .disabled="${!this.loadedAssets}"
                                            .readonly="${config.readonly || readOnlyMetaItem || this.getEditMode!()}"
                                            .hasHelperText="${config.showHelperText}"
                        ></or-attribute-input>
                    </div>
                `
            }, () => html`
                <div style="height: 100%; display: flex; justify-content: center; align-items: center;">
                    <span>${i18next.t('noAttributesConnected')}</span>
                </div>
            `)}
        `;
    }
}
