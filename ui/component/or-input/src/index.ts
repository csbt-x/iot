import {css, customElement, html, LitElement, property, PropertyValues, TemplateResult, unsafeCSS} from "lit-element";
import {classMap} from "lit-html/directives/class-map";
import {ifDefined} from "lit-html/directives/if-defined";
import {MDCTextField} from "@material/textfield";
import {MDCComponent} from "@material/base";
import {MDCRipple} from "@material/ripple";
import {MDCCheckbox} from "@material/checkbox";
import {MDCSwitch} from "@material/switch";
import {MDCSlider, MDCSliderChangeEventDetail} from "@material/slider";
import {MDCSelect, MDCSelectEvent} from "@material/select";
import {MDCList, MDCListActionEvent} from "@material/list";

import {MDCFormField, MDCFormFieldInput} from "@material/form-field";
import {MDCIconButtonToggle, MDCIconButtonToggleEventDetail} from "@material/icon-button";
import {DefaultColor4, DefaultColor8, Util} from "@openremote/core";
import i18next from "i18next";
import { ValueFormat, ValueFormatStyleRepresentation, AssetDescriptor, ValueDescriptorHolder, ValueDescriptor, WellknownValueTypes, MetaHolder, WellknownMetaItems, ValueHolder, NameHolder, Attribute, ValueConstraint, AttributeDescriptor, ValueConstraintSize, ValueConstraintPattern, ValueConstraintMax, ValueConstraintMin, ValueConstraintAllowedValues, ValueConstraintPastOrPresent, ValueConstraintPast, ValueConstraintFuture, ValueConstraintFutureOrPresent, ValueConstraintNotNull, ValueConstraintNotBlank, ValueConstraintNotEmpty, NameValueHolder } from "@openremote/model";

// TODO: Add webpack/rollup to build so consumers aren't forced to use the same tooling
const buttonStyle = require("@material/button/dist/mdc.button.css");
const buttonFabStyle = require("@material/fab/dist/mdc.fab.css");
const iconButtonStyle = require("@material/icon-button/dist/mdc.icon-button.css");
const textfieldStyle = require("@material/textfield/dist/mdc.textfield.css");
const rippleStyle = require("@material/ripple/dist/mdc.ripple.css");
const lineRippleStyle = require("@material/line-ripple/dist/mdc.line-ripple.css");
const floatingLabelStyle = require("@material/floating-label/dist/mdc.floating-label.css");
const formFieldStyle = require("@material/form-field/dist/mdc.form-field.css");
const checkboxStyle = require("@material/checkbox/dist/mdc.checkbox.css");
const switchStyle = require("@material/switch/dist/mdc.switch.css");
const selectStyle = require("@material/select/dist/mdc.select.css");
const listStyle = require("@material/list/dist/mdc.list.css");
const menuSurfaceStyle = require("@material/menu-surface/dist/mdc.menu-surface.css");
const menuStyle = require("@material/menu/dist/mdc.menu.css");
const sliderStyle = require("@material/slider/dist/mdc.slider.css");

export class OrInputChangedEvent extends CustomEvent<OrInputChangedEventDetail> {

    public static readonly NAME = "or-input-changed";

    constructor(value?: any, previousValue?: any) {
        super(OrInputChangedEvent.NAME, {
            detail: {
                value: value,
                previousValue: previousValue
            },
            bubbles: true,
            composed: true
        });
    }
}

export interface OrInputChangedEventDetail {
    value?: any;
    previousValue?: any;
}

declare global {
    export interface HTMLElementEventMap {
        [OrInputChangedEvent.NAME]: OrInputChangedEvent;
    }
}

export enum InputType {
    BUTTON = "button",
    BUTTON_TOGGLE = "button-toggle",
    BUTTON_MOMENTARY = "button-momentary",
    CHECKBOX = "checkbox",
    CHECKBOX_LIST = "checkbox-list",
    COLOUR = "color",
    DATE = "date",
    DATETIME = "datetime-local",
    EMAIL = "email",
    JSON = "json",
    MONTH = "month",
    NUMBER = "number",
    BIG_INT = "big-int",
    PASSWORD = "password",
    RADIO = "radio",
    SWITCH = "switch",
    RANGE = "range",
    TELEPHONE = "tel",
    TEXT = "text",
    TEXTAREA = "textarea",
    TIME = "time",
    URL = "url",
    WEEK = "week",
    SELECT = "select",
    LIST = "list",
    CRON = "cron",
    DURATION = "duration",
    DURATION_TIME = "duration-time",
    DURATION_PERIOD = "duration-period"
}

export interface ValueInputProviderOptions {
    label?: string;
    readonly?: boolean;
    disabled?: boolean;
    compact?: boolean;
}

export interface ValueInputProvider {
    templateFunction: ValueInputTemplateFunction;
    supportsHelperText: boolean;
    supportsLabel: boolean;
    supportsSendButton: boolean;
}

export type ValueInputTemplateFunction = ((value: any, focused: boolean, loading: boolean, sending: boolean, error: boolean, helperText: string | undefined) => TemplateResult) | undefined;

export type ValueInputProviderGenerator = (assetDescriptor: AssetDescriptor | string, valueHolder: NameHolder & ValueHolder<any> | undefined, valueHolderDescriptor: ValueDescriptorHolder | undefined, valueDescriptor: ValueDescriptor, valueChangeNotifier: (value: any | undefined) => void, options: ValueInputProviderOptions) => ValueInputProvider;

function inputTypeSupportsButton(inputType: InputType): boolean {
    return inputType === InputType.NUMBER
        || inputType === InputType.BIG_INT
        || inputType === InputType.TELEPHONE
        || inputType === InputType.TEXT
        || inputType === InputType.PASSWORD
        || inputType === InputType.DATE
        || inputType === InputType.DATETIME
        || inputType === InputType.EMAIL
        || inputType === InputType.JSON
        || inputType === InputType.MONTH
        || inputType === InputType.TEXTAREA
        || inputType === InputType.TIME
        || inputType === InputType.URL
        || inputType === InputType.WEEK;
}

function inputTypeSupportsHelperText(inputType: InputType) {
    return inputTypeSupportsButton(inputType) || inputType === InputType.SELECT;
}

function inputTypeSupportsLabel(inputType: InputType) {
    return inputTypeSupportsHelperText(inputType) || inputType === InputType.CHECKBOX || inputType === InputType.SWITCH;
}

export const getValueHolderInputTemplateProvider: ValueInputProviderGenerator = (assetDescriptor: AssetDescriptor | string, valueHolder: NameValueHolder<any> | undefined, valueHolderDescriptor: ValueDescriptorHolder | undefined, valueDescriptor: ValueDescriptor, valueChangeNotifier: (value: any | undefined) => void, options: ValueInputProviderOptions) => {

    let inputType: InputType | undefined;
    let step: number | undefined;
    let pattern: string | undefined;
    let min: any;
    let max: any;
    let required: boolean | undefined;
    let selectOptions: [string, string][] | undefined;
    let valueConverter: (v: any) => any | undefined;

    const assetType = typeof assetDescriptor === "string" ? assetDescriptor : assetDescriptor.name;
    const constraints: ValueConstraint[] = (valueHolder && ((valueHolder as MetaHolder).meta) || (valueDescriptor && (valueDescriptor as MetaHolder).meta) ? Util.getAttributeValueConstraints(valueHolder as Attribute<any>, valueHolderDescriptor as AttributeDescriptor, assetType) : Util.getMetaValueConstraints(valueHolder as NameValueHolder<any>, valueHolderDescriptor as AttributeDescriptor, assetType)) || [];
    const format: ValueFormat | undefined = (valueHolder && ((valueHolder as MetaHolder).meta) || (valueDescriptor && (valueDescriptor as MetaHolder).meta) ? Util.getAttributeValueFormat(valueHolder as Attribute<any>, valueHolderDescriptor as AttributeDescriptor, assetType) : Util.getMetaValueFormat(valueHolder as Attribute<any>, valueHolderDescriptor as AttributeDescriptor, assetType));

    // Determine input type
    switch (valueDescriptor.name) {
        case WellknownValueTypes.TEXT:
        case WellknownValueTypes.EMAIL:
        case WellknownValueTypes.UUID:
        case WellknownValueTypes.ASSETID:
        case WellknownValueTypes.HOSTORIPADDRESS:
        case WellknownValueTypes.IPADDRESS:
            inputType = Util.getMetaValue(WellknownMetaItems.MULTILINE, valueHolder, valueHolderDescriptor) === true ? InputType.TEXTAREA : InputType.TEXT;
            break;
        case WellknownValueTypes.BOOLEAN:
            if (format && format.asNumber) {
                inputType = InputType.NUMBER;
                step = 1;
                min = 0;
                max = 1;
                valueConverter = (v) => !!v;
                break;
            }
            if (format && (format.asOnOff || format.asOpenClosed)) {
                inputType = InputType.SWITCH;
            } else {
                inputType = InputType.CHECKBOX;
            }

            if (format && format.asMomentary) {
                inputType = InputType.BUTTON_MOMENTARY;
            }
            break;
        case WellknownValueTypes.BIGNUMBER:
        case WellknownValueTypes.NUMBER:
        case WellknownValueTypes.POSITIVEINTEGER:
        case WellknownValueTypes.POSITIVENUMBER:
        case WellknownValueTypes.LONG:
        case WellknownValueTypes.INTEGER:
        case WellknownValueTypes.BYTE:
        case WellknownValueTypes.INTEGERBYTE:
        case WellknownValueTypes.DIRECTION:
        case WellknownValueTypes.TCPIPPORTNUMBER:
            if (valueDescriptor.name === WellknownValueTypes.BYTE || valueDescriptor.name === WellknownValueTypes.INTEGERBYTE) {
                min = 0;
                max = 255;
                step = 1;
            } else if (valueDescriptor.name === WellknownValueTypes.INTEGER || valueDescriptor.name === WellknownValueTypes.LONG) {
                step = 1;
            }
            if (format && format.asDate) {
                inputType = InputType.DATETIME;
            } else if (format && format.asBoolean) {
                inputType = InputType.CHECKBOX;
                valueConverter = (v) => v ? 1 : 0;
            } else if (format && format.asSlider) {
                inputType = InputType.RANGE;
            } else {
                inputType = InputType.NUMBER;
            }
            break;
        case WellknownValueTypes.BIGINTEGER:
            inputType = InputType.BIG_INT;
            step = 1;
            break;
        case WellknownValueTypes.COLOURRGB:
            inputType = InputType.COLOUR;
            break;
        case WellknownValueTypes.DATEANDTIME:
        case WellknownValueTypes.TIMESTAMP:
        case WellknownValueTypes.TIMESTAMPISO8601:
            inputType = InputType.DATETIME;
            break;
        case WellknownValueTypes.TIMERCRONEXPRESSION:
            inputType = InputType.CRON;
            break;
        case WellknownValueTypes.TIMEDURATIONISO8601:
            inputType = InputType.DURATION_TIME;
            break;
        case WellknownValueTypes.PERIODDURATIONISO8601:
            inputType = InputType.DURATION_PERIOD;
            break;
        case WellknownValueTypes.TIMEANDPERIODDURATIONISO8601:
            inputType = InputType.DURATION;
            break;
    }

    if (!inputType) {
        switch (valueDescriptor.jsonType) {
            case "number":
            case "bigint":
                inputType = InputType.NUMBER;
                break;
            case "boolean":
                inputType = InputType.CHECKBOX;
                break;
            case "string":
                inputType = InputType.TEXT;
                break;
            case "date":
                inputType = InputType.DATETIME;
                break;
        }
    }

    if (!inputType) {
        inputType = InputType.JSON;
    }

    // Apply any constraints
    const sizeConstraint = constraints && constraints.find(c => c.type === "size") as ValueConstraintSize;
    const patternConstraint = constraints && constraints.find(c => c.type === "pattern") as ValueConstraintPattern;
    const minConstraint = constraints && constraints.find(c => c.type === "min") as ValueConstraintMin;
    const maxConstraint = constraints && constraints.find(c => c.type === "max") as ValueConstraintMax;
    const allowedValuesConstraint = constraints && constraints.find(c => c.type === "allowedValues") as ValueConstraintAllowedValues;
    const pastConstraint = constraints && constraints.find(c => c.type === "past") as ValueConstraintPast;
    const pastOrPresentConstraint = constraints && constraints.find(c => c.type === "pastOrPresent") as ValueConstraintPastOrPresent;
    const futureConstraint = constraints && constraints.find(c => c.type === "future") as ValueConstraintFuture;
    const futureOrPresentConstraint = constraints && constraints.find(c => c.type === "futureOrPresent") as ValueConstraintFutureOrPresent;
    const notEmptyConstraint = constraints && constraints.find(c => c.type === "notEmpty") as ValueConstraintNotEmpty;
    const notBlankConstraint = constraints && constraints.find(c => c.type === "notBlank") as ValueConstraintNotBlank;
    const notNullConstraint = constraints && constraints.find(c => c.type === "notNull") as ValueConstraintNotNull;

    if (sizeConstraint) {
        min = sizeConstraint.min;
        max = sizeConstraint.max;
    }
    if (sizeConstraint) {
        min = sizeConstraint.min;
        max = sizeConstraint.max;
    }
    if (minConstraint) {
        min = minConstraint.min;
    }
    if (maxConstraint) {
        max = maxConstraint.max;
    }
    if (patternConstraint) {
        pattern = patternConstraint.regexp;
    }
    if (notNullConstraint) {
        required = true;
    }
    if (notBlankConstraint && !pattern) {
        pattern = "\\S+";
    } else if (notEmptyConstraint && !pattern) {
        pattern = ".+";
    }
    if (allowedValuesConstraint && allowedValuesConstraint.allowedValues) {
        const allowedLabels = allowedValuesConstraint.allowedValueNames && allowedValuesConstraint.allowedValueNames.length === allowedValuesConstraint.allowedValues.length ? allowedValuesConstraint.allowedValueNames : undefined;
        selectOptions = allowedValuesConstraint.allowedValues.map((v, i) => {
            const label = allowedLabels ? allowedLabels[i] : typeof v === "string" ? Util.getAllowedValueLabel(v) : "" + i;
            return ["" + v, label || "" + v];
        });
        inputType = InputType.SELECT;
    }

    if (inputType === InputType.DATETIME) {
        if (pastConstraint || pastOrPresentConstraint) {
            min = undefined;
            max = new Date();
        } else if (futureConstraint || futureOrPresentConstraint) {
            min = new Date();
            max = undefined;
        }

        // Refine the input type based on formatting
        if (format) {
            if (format.timeStyle && !format.dateStyle) {
                inputType = InputType.TIME;
            } else if (format.dateStyle && !format.timeStyle) {
                inputType = InputType.DATE;
            }
        }
    }

    if (inputType === InputType.NUMBER && format && format.resolution) {
        step = format.resolution;
    }

    const supportsHelperText = inputTypeSupportsHelperText(inputType);
    const supportsLabel = inputTypeSupportsLabel(inputType);
    const supportsSendButton = inputTypeSupportsButton(inputType);
    const readonly = options.readonly;

    const templateFunction: ValueInputTemplateFunction = (value, focused, loading, sending, error, helperText) => {

        const disabled = options.disabled || loading || sending;
        const label = supportsLabel ? options.label : undefined;

        return html`<or-input id="input" .type="${inputType}" .label="${label}" .value="${value}" .pattern="${pattern}"
            .min="${min}" .max="${max}" .format="${format}" .focused="${focused}" .required="${required}"
            .options="${selectOptions}" .readonly="${readonly}" .disabled="${disabled}" .step="${step}"
            .helperText="${helperText}" .helperPersistent="${true}"
        }}" @or-input-changed="${(e: OrInputChangedEvent) => {
            e.stopPropagation();
            valueChangeNotifier(valueConverter ? valueConverter(e.detail.value) : e.detail.value);
        }}"></or-input>`
    };

    return {
        templateFunction: templateFunction,
        supportsHelperText: supportsHelperText,
        supportsSendButton: supportsSendButton,
        supportsLabel: supportsLabel
    };
}

// language=CSS
const style = css`
    
    :host {
        display: inline-block;
        --internal-or-input-color: var(--or-input-color, var(--or-app-color4, ${unsafeCSS(DefaultColor4)}));    
        --internal-or-input-text-color: var(--or-input-text-color, var(--or-app-color1, ${unsafeCSS(DefaultColor8)}));    
        
        --mdc-theme-primary: var(--internal-or-input-color);
        --mdc-theme-on-primary: var(--internal-or-input-text-color);
        --mdc-theme-secondary: var(--internal-or-input-color);
    }
    
    :host([hidden]) {
        display: none;
    }    

    :host([type=select]) {
        height: 56px;
    }
     
    #wrapper {
        display: flex;
        align-items: center;
        min-height: 48px;
        height: 100%;
    }   
    
    #wrapper > label {
        white-space: nowrap;
        margin-right: 20px;
    }
    
    #component {
        max-width: 100%;
    }

    .mdc-text-field {
        flex: 1 1 0;
    }

    .mdc-list {
        flex: 1 1 0;
        overflow: auto;
    }

    #menu-anchor {
        max-width: 100%;
    }
    
    .mdc-checkbox-list input {
        display: none;
    }
    
    .mdc-checkbox-list label {
        display: block;
        border-radius: 50%;
        text-align: center;
        width: 32px;
        line-height: 32px;
        height: 32px;
        background-color: var(--or-app-color2);
        font-size: 13px;
    }
    
    input::-webkit-calendar-picker-indicator {
        margin: 0;
    }
    
    .mdc-checkbox-list .mdc-checkbox {
        padding: 0;
        height: 32px;
        width: 32px;
    }
    
    .mdc-checkbox-list input:checked + label {
        color: var(--or-app-color2);
        background-color: var(--mdc-theme-primary);
    }

    .or-input--rounded {
        border-radius: 50% !important;
    }

    ::-webkit-clear-button {display: none;}
    ::-webkit-inner-spin-button { display: none; }
    ::-webkit-datetime-edit { padding: 0em;}
    ::-webkit-datetime-edit-text { padding: 0; }

    .mdc-text-field--focused:not(.mdc-text-field--disabled) .mdc-floating-label {
        color: var(--mdc-theme-primary);
    }
    .mdc-text-field--focused .mdc-text-field__input:required ~ .mdc-floating-label::after,
    .mdc-text-field--focused .mdc-text-field__input:required ~ .mdc-notched-outline .mdc-floating-label::after {
        color: var(--mdc-theme-primary);
    }
    
    .mdc-text-field, .mdc-text-field-helper-line {
        width: 100%;
    }
    
    .mdc-text-field.dense-comfortable {
        height: 48px;
    }
    
    .mdc-text-field.dense-compact {
        height: 36px;
    }
    
    .mdc-select:not(.mdc-list) {
        white-space: nowrap;
        display: flex;
        flex-direction: column;
    }

    .mdc-select:not(.mdc-select--disabled).mdc-select--focused .mdc-floating-label {
        color: var(--mdc-theme-primary);
    }

    .mdc-select-helper-text {
        white-space: normal;
        color: rgba(0, 0, 0, 0.6);
    }

    .mdc-icon-button {
        padding: 0;
        color: var(--internal-or-input-color);
    }
    
    /* Give slider min width like select etc. */
    .mdc-slider {
        min-width: 200px;
    }
    
    #field {
        height: 100%;
    }
`;

@customElement("or-input")
export class OrInput extends LitElement {

    static get styles() {
        return [
            css`${unsafeCSS(iconButtonStyle)}`,
            css`${unsafeCSS(buttonStyle)}`,
            css`${unsafeCSS(buttonFabStyle)}`,
            css`${unsafeCSS(textfieldStyle)}`,
            css`${unsafeCSS(rippleStyle)}`,
            css`${unsafeCSS(lineRippleStyle)}`,
            css`${unsafeCSS(floatingLabelStyle)}`,
            css`${unsafeCSS(formFieldStyle)}`,
            css`${unsafeCSS(checkboxStyle)}`,
            css`${unsafeCSS(switchStyle)}`,
            css`${unsafeCSS(selectStyle)}`,
            css`${unsafeCSS(listStyle)}`,
            css`${unsafeCSS(menuStyle)}`,
            css`${unsafeCSS(menuSurfaceStyle)}`,
            css`${unsafeCSS(sliderStyle)}`,
            style
        ];
    }

    @property({type: Boolean})
    public focused?: boolean;

    @property()
    public value?: any;

    @property({type: String})
    public type?: InputType;

    @property({type: Boolean})
    public readonly: boolean = false;

    @property({type: Boolean})
    public required: boolean = false;

    @property()
    public max?: any;

    @property()
    public min?: any;

    @property({type: Number})
    public step?: number;

    @property({type: Boolean})
    public checked: boolean = false;

    @property({type: Number})
    public maxLength?: number;

    @property({type: Number})
    public minLength?: number;

    @property({type: Number})
    public rows?: number;

    @property({type: Number})
    public cols?: number;

    @property({type: Boolean})
    public multiple: boolean = false;

    @property({type: String, attribute: true, reflect: false})
    public pattern?: string;

    @property({type: String})
    public placeHolder?: string;

    @property({type: Array})
    public options?: string[] | [string, string][];

    @property({type: Boolean})
    public autoSelect?: boolean;

    /* STYLING PROPERTIES BELOW */

    @property({type: String})
    public icon?: string;

    @property({type: String})
    public iconOn?: string;

    @property({type: String})
    public iconTrailing?: string;

    @property({type: Boolean})
    public compact: boolean = false;

    @property({type: Boolean})
    public comfortable: boolean = false;

    /* BUTTON STYLES START */

    @property({type: Boolean})
    public raised: boolean = false;

    @property({type: Boolean})
    public action: boolean = false;

    @property({type: Boolean})
    public unElevated: boolean = false;

    @property({type: Boolean})
    public outlined: boolean = false;

    @property({type: Boolean})
    public rounded: boolean = false;

    @property({type: Object})
    public format?: ValueFormat;

    @property({type: Boolean})
    public disableSliderNumberInput: boolean = false;

    /* BUTTON STYLES END */

    /* TEXT INPUT STYLES START */

    @property({type: Boolean})
    public fullWidth: boolean = false;

    @property({type: String})
    public helperText?: string;

    @property({type: Boolean})
    public helperPersistent: boolean = false;

    @property({type: String})
    public validationMessage = "";

    @property({type: Boolean})
    public charCounter: boolean = false;

    @property({type: String})
    public label?: string;

    @property({type: Boolean})
    public disabled: boolean = false;

    /* TEXT INPUT STYLES END */

    protected _mdcComponent?: MDCComponent<any>;
    protected _mdcComponent2?: MDCComponent<any>;
    protected _selectedIndex = -1;

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this._mdcComponent) {
            this._mdcComponent.destroy();
            this._mdcComponent = undefined;
        }
        if (this._mdcComponent2) {
            this._mdcComponent2.destroy();
            this._mdcComponent2 = undefined;
        }
    }

    protected shouldUpdate(_changedProperties: PropertyValues) {

        if (_changedProperties.has("disabled")) {
            if (this._mdcComponent) {
                (this._mdcComponent as any).disabled = this.disabled;
            }
            if (this.type === InputType.RANGE && this._mdcComponent2) {
                (this._mdcComponent2 as any).disabled = this.disabled;
            }
        }

        if (_changedProperties.has("readonly")) {
            if (this._mdcComponent) {
                (this._mdcComponent as any).readonly = this.readonly;
            }
            if (this.type === InputType.RANGE && this._mdcComponent2) {
                (this._mdcComponent2 as any).readonly = this.readonly;
            }
        }

        if (!this.type && this.value) {
            if (this.value instanceof Date) {
                this.type = InputType.DATETIME;
            } else if (typeof(this.value) === "boolean") {
                this.type = InputType.CHECKBOX;
            } else if (typeof(this.value) === "number") {
                this.type = InputType.NUMBER;
            } else if (typeof(this.value) === "string") {
                this.type = InputType.TEXT;
            } else {
                this.type = InputType.JSON;
            }
        }
        return true;
    }

    public focus() {
        if (this.type === InputType.RANGE && this._mdcComponent2) {
            (this._mdcComponent2 as any).focus();
        } else if (this._mdcComponent && typeof (this._mdcComponent as any).focus === "function") {
            (this._mdcComponent as any).focus();
        }
    }

    protected render() {

        if (this.type) {

            const showLabel = !this.fullWidth && this.label;
            let outlined = !this.fullWidth && this.outlined;
            let hasHelper = !!this.helperText;
            const showValidationMessage = this.validationMessage;
            const helperClasses = {
                "mdc-text-field-helper-text--persistent": this.helperPersistent,
                "mdc-text-field-helper-text--validation-msg": showValidationMessage,
            };
            const hasValue = this.value || this.value === false;
            const labelTemplate = showLabel ? html`<span class="mdc-floating-label ${hasValue ? "mdc-floating-label--float-above" : ""}" id="label">${this.label}</span>` : undefined;

            switch (this.type) {
                case InputType.RADIO:
                    return html`RADIO`
                    break;
                case InputType.SWITCH:
                    return html`
                        <span id="wrapper">
                            ${this.label ? html`<label for="elem" class="${this.disabled ? "mdc-switch--disabled" : ""}">${this.label}</label>` : ``}
                            <div id="component" class="mdc-switch ${this.disabled || this.readonly ? "mdc-switch--disabled" : ""} ${this.value ? "mdc-switch--checked" : ""}">
                                <div class="mdc-switch__track"></div>
                                <div class="mdc-switch__thumb-underlay">
                                    <div class="mdc-switch__thumb">
                                        <input type="checkbox" id="elem" class="mdc-switch__native-control" 
                                        ?checked="${this.value}"
                                        ?required="${this.required}"
                                        ?disabled="${this.disabled || this.readonly}"
                                        @change="${(e: Event) => this.onValueChange((e.target as HTMLInputElement), (e.target as HTMLInputElement).checked)}"
                                        role="switch">
                                    </div>
                                </div>
                            </div>
                        </span>
                    `;
                case InputType.LIST:
                        const classesList = {
                            "mdc-select--outlined": outlined,
                            "mdc-select--disabled": this.disabled,
                            "mdc-select--required": this.required,
                            "mdc-select--dense": false, // this.dense,
                            "mdc-select--no-label": !this.label,
                            "mdc-select--with-leading-icon": !!this.icon
                        };

                        const optsList = this.resolveOptions(this.options);
                        this._selectedIndex = -1;
                        return html`
                            <div id="component" class="mdc-list mdc-select ${classMap(classesList)}" @MDCList:action="${(e: MDCListActionEvent) => this.onValueChange(undefined, e.detail.index === -1 ? undefined : Array.isArray(this.options![e.detail.index]) ? this.options![e.detail.index][0] : this.options![e.detail.index])}">
                                <ul class="mdc-list">
                                    ${optsList ? optsList.map(([optValue, optDisplay], index) => {
                                        if (this.value === optValue) {
                                            this._selectedIndex = index;
                                        }
                                        // todo: it's not actually putting the mdc-list-item--selected class on even when this.value === optValue...
                                        return html`<li class="${classMap({"mdc-list-item": true, "mdc-list-item--selected": this.value === optValue})}" role="option" data-value="${optValue}"><or-translate value="${optDisplay}"></or-translate></li>`;
                                    }) : ``}
                                </ul>
                            </div>
                        `;
                case InputType.SELECT:
                    const classes = {
                        "mdc-select--outlined": outlined,
                        "mdc-select--filled": !outlined,
                        "mdc-select--disabled": this.disabled || this.readonly,
                        "mdc-select--required": this.required,
                        "mdc-select--dense": false, // this.dense,
                        "mdc-select--no-label": !this.label,
                        "mdc-select--with-leading-icon": !!this.icon
                    };

                    const opts = this.resolveOptions(this.options);
                    const value = opts && opts.find(([optValue, optDisplay], index) => this.value === optValue);
                    const valueLabel = value ? value[1] : typeof this.value === "string" ? this.value : "";
                    this._selectedIndex = -1;

                    return html`
                        <div id="component"
                            class="mdc-select ${classMap(classes)}"
                            @MDCSelect:change="${(e: MDCSelectEvent) => this.onValueChange(undefined, e.detail.index === -1 ? undefined : Array.isArray(this.options![e.detail.index]) ? this.options![e.detail.index][0] : this.options![e.detail.index])}">
                                <div id="menu-anchor" class="mdc-select__anchor select-class">
                                    <span class="mdc-select__ripple"></span>
                                    <span class="mdc-select__selected-text">${valueLabel ? i18next.t(valueLabel) : ""}</span>
                                    <span class="mdc-select__dropdown-icon">
                                        <svg
                                          class="mdc-select__dropdown-icon-graphic"
                                          viewBox="7 10 10 5">
                                        <polygon
                                            class="mdc-select__dropdown-icon-inactive"
                                            stroke="none"
                                            fill-rule="evenodd"
                                            points="7 10 12 15 17 10">
                                        </polygon>
                                        <polygon
                                            class="mdc-select__dropdown-icon-active"
                                            stroke="none"
                                            fill-rule="evenodd"
                                            points="7 15 12 10 17 15">
                                        </polygon>
                                      </svg>
                                    </span>
                                    ${outlined ? this.renderOutlined(labelTemplate) : labelTemplate}
                                    ${!outlined ? html`<div class="mdc-line-ripple"></div>` : ``}
                                </div>

                                <div class="mdc-select__menu mdc-menu mdc-menu-surface select-class" role="listbox">
                                    <ul class="mdc-list">
                                        ${opts ? opts.map(([optValue, optDisplay], index) => {
                                            if (this.value === optValue) {
                                                this._selectedIndex = index;
                                            }
                                            return html`<li class="mdc-list-item ${this._selectedIndex === index ? "mdc-list-item--selected" : ""}" role="option" aria-selected="${this._selectedIndex === index}"  data-value="${optValue}">
                                                            <span class="mdc-list-item__ripple"></span>
                                                            <span class="mdc-list-item__text">${i18next.t(optDisplay)}</span>
                                                         </li>`;
                                        }) : ``}
                                    </ul>
                                </div>

                                ${hasHelper ? html`
                                    <p id="component-helper-text" class="mdc-select-helper-text ${classMap(helperClasses)}" aria-hidden="true">
                                        ${showValidationMessage ? this.validationMessage : this.helperText}
                                    </p>` : ``}
                        </div>
                    `;
                case InputType.BUTTON_TOGGLE:
                    return html`
                        <button id="component" class="mdc-icon-button ${this.value ? "mdc-icon-button--on" : ""}"
                            ?readonly="${this.readonly}"
                            ?disabled="${this.disabled}"
                            @MDCIconButtonToggle:change="${(evt: CustomEvent<MDCIconButtonToggleEventDetail>) => this.onValueChange(undefined, evt.detail.isOn)}">
                            ${this.icon ? html`<or-icon class="mdc-icon-button__icon" aria-hidden="true" icon="${this.icon}"></or-icon>` : ``}
                            ${this.iconOn ? html`<or-icon class="mdc-icon-button__icon mdc-icon-button__icon--on" aria-hidden="true" icon="${this.iconOn}"></or-icon>` : ``}
                        </button>
                    `;
                case InputType.BUTTON:
                case InputType.BUTTON_MOMENTARY: {
                    const isMomentary = this.type === InputType.BUTTON_MOMENTARY;
                    const isIconButton = !this.action && !this.label;
                    const classes = {
                        "mdc-icon-button": isIconButton,
                        "mdc-fab": !isIconButton && this.action,
                        "mdc-fab--extended": !isIconButton && this.action && !!this.label,
                        "mdc-fab--mini": !isIconButton && this.action && (this.compact || this.comfortable),
                        "mdc-button": !isIconButton && !this.action,
                        "mdc-button--raised": !isIconButton && !this.action && this.raised,
                        "mdc-button--unelevated": !isIconButton && !this.action && this.unElevated,
                        "mdc-button--outlined": !isIconButton && !this.action && this.outlined,
                        "or-input--rounded": !isIconButton && !this.action && this.rounded
                    };
                    return html`
                        <button id="component" class="${classMap(classes)}"
                            ?readonly="${this.readonly}"
                            ?disabled="${this.disabled}"
                            @mousedown="${() => {if (isMomentary) this.dispatchEvent(new OrInputChangedEvent(true, null))}}" @mouseup="${() => isMomentary ? this.dispatchEvent(new OrInputChangedEvent(false, true)) : this.dispatchEvent(new OrInputChangedEvent(true, null))}">
                            ${!isIconButton ? html`<div class="mdc-button__ripple"></div>` : ``}
                            ${this.icon ? html`<or-icon class="${isIconButton ? "" : this.action ? "mdc-fab__icon" : "mdc-button__icon"}" aria-hidden="true" icon="${this.icon}"></or-icon>` : ``}
                            ${this.label ? html`<span class="${this.action ? "mdc-fab__label" : "mdc-button__label"}">${this.label}</span>` : ``}
                            ${!isIconButton && this.iconTrailing ? html`<or-icon class="${this.action ? "mdc-fab__icon" : "mdc-button__icon"}" aria-hidden="true" icon="${this.iconTrailing}"></or-icon>` : ``}
                        </button>
                    `;
                }
                case InputType.CHECKBOX_LIST:

                    const optsRadio = this.resolveOptions(this.options);
                    this._selectedIndex = -1;
                    return html`
                            <div class="mdc-checkbox-list">
                                ${optsRadio ? optsRadio.map(([optValue, optDisplay], index) => {
                                    if (this.value === optValue) {
                                        this._selectedIndex = index;
                                    }
                                    return html`
                                    <div id="field" class="mdc-form-field">
                                        <div id="component" class="mdc-checkbox">
                                            <input type="checkbox" 
                                                ?checked="${this.value && this.value.includes(optValue)}"
                                                ?required="${this.required}"
                                                name="${optValue}"
                                                ?disabled="${this.disabled || this.readonly}"
                                                @change="${(e: Event) => this.onValueChange((e.target as HTMLInputElement), {name: (e.target as HTMLInputElement).name, checked: (e.target as HTMLInputElement).checked})}"
                                                class="mdc-checkbox__native-control" id="elem-${optValue}"/>

                                            <label for="elem-${optValue}"><or-translate value="${optDisplay}"></or-translate></label>
                                              
                                        </div>
                                    </div>

                                    `;
                                }) : ``}
                            </div>
                    `;
                case InputType.CHECKBOX:
                    return html`
                        <div id="field" class="mdc-form-field">
                            <div id="component" class="mdc-checkbox">
                                <input type="checkbox" 
                                    ?checked="${this.value}"
                                    ?required="${this.required}"
                                    ?disabled="${this.disabled || this.readonly}"
                                    @change="${(e: Event) => this.onValueChange((e.target as HTMLInputElement), (e.target as HTMLInputElement).checked)}"
                                    class="mdc-checkbox__native-control" id="elem"/>
                                <div class="mdc-checkbox__background">
                                    <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
                                        <path class="mdc-checkbox__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59"></path>
                                    </svg>
                                    <div class="mdc-checkbox__mixedmark"></div>
                                </div>
                            </div>
                            <label class="mdc-checkbox-circle" for="elem">${this.label}</label>
                        </div>
                    `;
                case InputType.NUMBER:
                case InputType.RANGE:
                case InputType.DATE:
                case InputType.DATETIME:
                case InputType.TIME:
                case InputType.MONTH:
                case InputType.WEEK:
                case InputType.COLOUR:
                case InputType.EMAIL:
                case InputType.PASSWORD:
                case InputType.TELEPHONE:
                case InputType.URL:
                case InputType.TEXT:
                case InputType.TEXTAREA:
                case InputType.JSON: {
                    // The following HTML input types require the values as specially formatted strings
                    let valMinMax: [any, any, any] = [this.value === undefined || this.value === null ? undefined : this.value, this.min, this.max];

                    if (valMinMax.some((v) => typeof (v) !== "string")) {

                        if (this.type === InputType.JSON) {
                            valMinMax[0] = valMinMax[0] !== undefined && valMinMax[0] !== null ? (typeof valMinMax[0] === "string" ? valMinMax[0] : JSON.stringify(valMinMax[0], null, 2)) : "";
                        } else {

                            const format = this.format ? {...this.format} : {};

                            switch (this.type) {
                                case InputType.TIME:
                                    format.asDate = true;
                                    format.hour12 = false;
                                    format.timeStyle = this.step && this.step < 60 ? ValueFormatStyleRepresentation.MEDIUM : ValueFormatStyleRepresentation.SHORT;
                                    break;
                                case InputType.DATE:
                                    format.asDate = true;
                                    format.momentJsFormat = "YYYY-MM-DD";
                                    break;
                                case InputType.WEEK:
                                    format.asDate = true;
                                    format.momentJsFormat = "YYYY-[W]WW";
                                    break;
                                case InputType.MONTH:
                                    format.asDate = true;
                                    format.momentJsFormat = "YYYY-MM";
                                    break;
                                case InputType.DATETIME:
                                    format.asDate = true;
                                    format.momentJsFormat = "YYYY-MM-DDTHH:mm";
                                    break;
                            }

                            // Numbers/dates must be in english locale
                            valMinMax = valMinMax.map((val) => val !== undefined ? Util.getValueAsString(val, () => format, "en-GB") : undefined) as [any,any,any];
                        }
                    }

                    let inputElem: TemplateResult | undefined;
                    let label = this.label;
                    let type = this.type;
                    let componentId = "component";

                    if (this.type === InputType.RANGE) {
                        // Change vars so number input can be included alongside the slider
                        label = undefined;
                        outlined = false;
                        hasHelper = false;
                        type = InputType.NUMBER;
                        componentId = "number";
                    }

                    if (!(this.type === InputType.RANGE && this.disableSliderNumberInput)) {
                        const classes = {
                            "mdc-text-field": true,
                            "mdc-text-field--filled": !outlined,
                            "mdc-text-field--outlined": outlined,
                            "mdc-text-field--textarea": type === InputType.TEXTAREA || type === InputType.JSON,
                            "mdc-text-field--disabled": this.disabled,
                            "mdc-text-field--fullwidth": this.fullWidth && !outlined,
                            "dense-comfortable": this.comfortable,
                            "dense-compact": !this.comfortable && this.compact,
                            "mdc-text-field--label-floating": hasValue,
                            "mdc-text-field--no-label": !this.label,
                            "mdc-text-field--with-leading-icon": !!this.icon,
                            "mdc-text-field--with-trailing-icon": !!this.iconTrailing
                        };

                        inputElem = type === InputType.TEXTAREA || type === InputType.JSON
                            ? html`
                                <textarea id="elem" class="mdc-text-field__input" ?required="${this.required}"
                                ?readonly="${this.readonly}" ?disabled="${this.disabled}" minlength="${ifDefined(this.minLength)}"
                                maxlength="${ifDefined(this.maxLength)}" rows="${this.rows ? this.rows : 5}"
                                cols="${ifDefined(this.cols)}" aria-label="${ifDefined(label)}"
                                aria-labelledby="${ifDefined(label ? "label" : undefined)}"
                                @change="${(e: Event) => this.onValueChange((e.target as HTMLTextAreaElement), (e.target as HTMLTextAreaElement).value)}">${valMinMax[0] ? valMinMax[0] : ""}</textarea>`
                            : html`
                            <input type="${type}" id="elem" aria-labelledby="${ifDefined(label ? "label" : undefined)}"
                            class="mdc-text-field__input" ?required="${this.required}" ?readonly="${this.readonly}"
                            ?disabled="${this.disabled}" min="${ifDefined(valMinMax[1])}" max="${ifDefined(valMinMax[2])}"
                            step="${this.step ? this.step : "any"}" minlength="${ifDefined(this.minLength)}" pattern="${ifDefined(this.pattern)}"
                            maxlength="${ifDefined(this.maxLength)}" placeholder="${ifDefined(this.placeHolder)}"
                            .value="${valMinMax[0] !== null && valMinMax[0] !== undefined ? valMinMax[0] : ""}"
                            @keyup="${(e: KeyboardEvent) => {
                                if ((e.code === "Enter" || e.code === "NumpadEnter")) {
                                    this.onValueChange((e.target as HTMLInputElement), (e.target as HTMLInputElement).value);
                                }}}"
                            @change="${(e: Event) => this.onValueChange((e.target as HTMLInputElement), (e.target as HTMLInputElement).value)}" />`;

                        inputElem = html`
                            <label id="${componentId}" class="${classMap(classes)}">
                                ${this.icon ? html`<or-icon class="mdc-text-field__icon mdc-text-field__icon--leading" aria-hidden="true" icon="${this.icon}"></or-icon>` : ``}
                                ${outlined ? `` : html`<span class="mdc-text-field__ripple"></span>`}
                                ${inputElem}
                                ${outlined ? this.renderOutlined(labelTemplate) : labelTemplate}
                                ${outlined ? `` : html`<span class="mdc-line-ripple"></span>`}
                                ${this.iconTrailing ? html`<or-icon class="mdc-text-field__icon mdc-text-field__icon--trailing" aria-hidden="true" icon="${this.iconTrailing}"></or-icon>` : ``}
                            </label>
                            ${hasHelper ? html`
                                <div class="mdc-text-field-helper-line">
                                    <div class="mdc-text-field-helper-text ${classMap(helperClasses)}">${showValidationMessage ? this.validationMessage : this.helperText}</div>
                                    ${this.charCounter && !this.readonly ? html`<div class="mdc-text-field-character-counter"></div>` : ``}
                                </div>
                            ` : ``}
                        `;
                    }

                    if (this.type === InputType.RANGE) {
                        inputElem = html`
                            <span id="wrapper">
                                ${this.label ? html`<label for="component" class="${this.disabled ? "mdc-switch--disabled" : ""}">${this.label}</label>` : ``}
                                <div id="component" class="mdc-slider" @MDCSlider:change="${(ev:CustomEvent<MDCSliderChangeEventDetail>) => this.onValueChange(undefined, ev.detail.value)}">
                                  <input class="mdc-slider__input" ?disabled="${this.readonly || this.disabled}" type="range" min="${ifDefined(valMinMax[1])}" max="${ifDefined(valMinMax[2])}" value="${ifDefined(valMinMax[0])}" name="slider" aria-label="${this.label}">
                                  <div class="mdc-slider__track">
                                    <div class="mdc-slider__track--inactive"></div>
                                    <div class="mdc-slider__track--active">
                                      <div class="mdc-slider__track--active_fill"></div>
                                    </div>
                                  </div>
                                  <div class="mdc-slider__thumb">
                                    <div class="mdc-slider__thumb-knob"></div>
                                  </div>
                                </div>
                                ${inputElem ? html`<div style="width: 75px; margin-left: 20px;">${inputElem}</div>` : ``}
                            </span>
                        `;
                    }

                    return inputElem;
                }
            }
        }

        return html`<span>INPUT TYPE NOT IMPLEMENTED</span>`;
    }

    protected _getFormat(): ValueFormat | undefined {
        if (this.format) {
            return this.format;
        }


    }

    protected updated(_changedProperties: PropertyValues): void {
        super.updated(_changedProperties);

        if (_changedProperties.has("type")) {
            const component = this.shadowRoot!.getElementById("component");
            if (this._mdcComponent) {
                this._mdcComponent.destroy();
                this._mdcComponent = undefined;
            }
            if (this._mdcComponent2) {
                this._mdcComponent2.destroy();
                this._mdcComponent2 = undefined;
            }

            if (component && this.type) {
                switch (this.type) {
                    case InputType.LIST:
                        const mdcList = new MDCList(component);
                        this._mdcComponent = mdcList;
                        mdcList.selectedIndex = this._selectedIndex;
                        break;
                    case InputType.SELECT:
                        const mdcSelect = new MDCSelect(component);
                        this._mdcComponent = mdcSelect;
                        mdcSelect.selectedIndex = this._selectedIndex;
                        break;
                    case InputType.RADIO:
                        break;
                    case InputType.BUTTON:
                    case InputType.BUTTON_MOMENTARY:
                        const isIconButton = !this.action && !this.label;
                        const ripple = new MDCRipple(component);
                        if (isIconButton) {
                            ripple.unbounded = true;
                        }
                        this._mdcComponent = ripple;
                        break;
                    case InputType.BUTTON_TOGGLE:
                        this._mdcComponent = new MDCIconButtonToggle(component);
                        break;
                    case InputType.CHECKBOX:
                        this._mdcComponent = new MDCCheckbox(component);
                        const field = this.shadowRoot!.getElementById("field");
                        if (field) {
                            const mdcField = new MDCFormField(field);
                            mdcField.input = this._mdcComponent as unknown as MDCFormFieldInput;
                            this._mdcComponent2 = mdcField;
                        }
                        break;
                    case InputType.SWITCH:
                        this._mdcComponent = new MDCSwitch(component);
                        break;
                    case InputType.RANGE:
                        this._mdcComponent = new MDCSlider(component);
                        const numberComponent = this.shadowRoot!.getElementById("number");
                        if (numberComponent) {
                            const numberField = new MDCTextField(numberComponent);
                            numberField.useNativeValidation = false;
                            this._mdcComponent2 = numberField;
                        }
                        break;
                    default:
                        const textField = new MDCTextField(component);
                        textField.useNativeValidation = false;
                        this._mdcComponent = textField;
                        break;
                }

                if (this._mdcComponent && this.focused && typeof((this._mdcComponent as any).focus) === "function") {
                    (this._mdcComponent as any).focus();
                }
            }
        } else {
            // some components need to be kept in sync with the DOM
            if (this.type === InputType.SELECT && this._mdcComponent) {
                (this._mdcComponent as MDCSelect).selectedIndex = this._selectedIndex;
            } else if (this.type === InputType.RANGE && this._mdcComponent) {
                const slider = this._mdcComponent as MDCSlider;
                slider.setDisabled(this.disabled || this.readonly);
                // slider.getDefaultFoundation(). getDefaultFoundation()..getMax() = this.min;
                // slider.max = this.max;
                // slider.setValue(this.value);
            } else if (this.type === InputType.SWITCH && this._mdcComponent) {
                const swtch = this._mdcComponent as MDCSwitch;
                swtch.checked = this.value;
            }
        }
    }

    protected renderOutlined(labelTemplate: TemplateResult | undefined) {
        return html`
            <span class="mdc-notched-outline">
                <span class="mdc-notched-outline__leading"></span>
                ${labelTemplate ? html`
                <span class="mdc-notched-outline__notch">
                    ${labelTemplate}
                </span>
                ` : ``}
                <span class="mdc-notched-outline__trailing"></span>
            </span>
        `;
    }

    protected onValueChange(elem: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined, newValue: any | undefined) {
        let valid = true;

        if (elem && this._mdcComponent) {

            // trigger validation
            valid = elem.checkValidity();
            if (this._mdcComponent instanceof MDCTextField) {
                this._mdcComponent.valid = valid;
            }
        }

        const previousValue = this.value;

        if (newValue === "null") {
            newValue = null;
        }

        if (newValue === "undefined") {
            newValue = undefined;
        }

        if (typeof(newValue) === "string") {
            switch (this.type) {
                case InputType.CHECKBOX:
                case InputType.SWITCH:
                    newValue = newValue === "on";
                    break;
                case InputType.JSON:
                case InputType.NUMBER:
                case InputType.RANGE:
                    newValue = newValue !== "" ? JSON.parse(newValue) : null;
                    break;
                case InputType.DATETIME:
                    if (newValue === "") {
                        newValue = null;
                    } else {
                        const date = Date.parse(newValue);
                        const offset = (new Date()).getTimezoneOffset() * 60000;
                        newValue = date + offset;
                    }
                    break;
            }
        }

        this.value = newValue;

        if (newValue !== previousValue) {
            if (this.type === InputType.RANGE) {
                (this._mdcComponent as MDCSlider).setValue(newValue);
                if (this._mdcComponent2) {
                    (this._mdcComponent2 as MDCTextField).value = newValue;
                }
            }
            this.dispatchEvent(new OrInputChangedEvent(this.value, previousValue));
        }
    }

    public get valid(): boolean {
        const elem = this.shadowRoot!.getElementById("elem") as any;
        if (elem && elem.checkValidity) {
            return elem.checkValidity();
        }
        return true;
    }

    public get currentValue(): any {
        const elem = this.shadowRoot!.getElementById("elem") as any;
        if (elem && elem.value) {
            return elem.value;
        }
    }

    protected resolveOptions(options: string[] | [string, string][] | undefined): [string, string][] | undefined {
        let resolved: [string, string][] | undefined;

        if (options && options.length > 0) {
            if (Array.isArray(options[0])) {
                resolved = options as [string, string][];
            } else {
                resolved = (options as string[]).map((option) => [option, option]);
            }
        }

        return resolved;
    }
}
