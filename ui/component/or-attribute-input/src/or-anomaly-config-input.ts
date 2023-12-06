import "@openremote/or-chart"
import "@openremote/or-mwc-components/or-mwc-input";
import {OrInputChangedEvent} from "@openremote/or-mwc-components/or-mwc-input"
import { customElement, property } from "lit/decorators.js";
import {css, html, LitElement, PropertyValues, TemplateResult, unsafeCSS} from "lit";
import {Console, DefaultColor4, manager, Util} from "@openremote/core";
import {
    Alarm,
    AnomalyDetectionConfigObject,
    AnomalyDetectionConfiguration, AnomalyDetectionConfigurationChange,
    AnomalyDetectionConfigurationGlobal,
    AnomalyDetectionConfigurationUnion,
    Asset,
    AssetDatapointQueryUnion,
    AssetModelUtil,
    AssetQuery,
    Attribute,
    AttributeRef,
    DatapointInterval, AlarmConfig, User, UserQuery,
    ValueDatapoint
} from "@openremote/model";
import {ErrorObject, OrJSONForms, StandardRenderers} from "@openremote/or-json-forms";
import {i18next, translate} from "@openremote/or-translate";
import "@openremote/or-components/or-collapsible-panel"
import {createRef, Ref, ref} from 'lit/directives/ref.js';




@customElement("or-anomaly-config-input")
export class OrAnomalyConfigChart extends translate(i18next)(LitElement) {

    @property({type: Object})
    public anomalyDetectionConfigObject?: AnomalyDetectionConfigObject = undefined;
    @property({type: Object})
    public attributeRef?: AttributeRef = undefined;
    @property({type: Object})
    public datapointQuery!: AssetDatapointQueryUnion;
    @property({type: Number})
    public timespan?: number = undefined;
    @property({type: Boolean})
    expanded: boolean = true;
    @property({type: Boolean})
    updateBool: boolean = false;
    @property()
    public users: User[] = [];
    @property({type:Object})
    public template!: TemplateResult
    @property({type:Number})
    public selectedIndex: number = -1;
    @property({type: String, attribute: false})
    public onChange?: (dataAndErrors: {errors: ErrorObject[] | undefined, data: any}, update: boolean) => void;


    async connectedCallback(): Promise<void> {
        await this.loadUsers();
        super.connectedCallback();
    }
    render() {
        return this.draw()
    }

    protected draw(){
        const uiSchema: any = {
            type: "Control",
            scope: "#"
        };
        let schemaChangeGlobal: any;
        let schemaForecast: any;
        const jsonFormsInput: Ref<OrJSONForms> = createRef();
        const options: {value: string | undefined, label: string | undefined}[] = this.users.map((u) => {
            return { value: u.id, label: u.username };
        });
        if(this.selectedIndex == -1){
            this.selectedIndex = this.anomalyDetectionConfigObject!.methods!.length > 0 ? 0:-1;
        }
        schemaChangeGlobal = JSON.parse("{\n" +
            "  \"type\": \"object\",\n" +
            "  \"title\": \"Global\",\n" +
            "  \"properties\": {\n" +
            "    \"onOff\": {\n" +
            "      \"type\": \"boolean\"\n" +
            "    },\n" +
            "    \"type\": {\n" +
            "      \"type\": \"string\",\n" +
            "      \"enum\": [\n" +
            "        \"global\",\n" +
            "        \"change\",\n" +
            "        \"forecast\"\n" +
            "      ]\n" +
            "    },\n" +
            "    \"deviation\": {\n" +
            "      \"type\": \"integer\"\n" +
            "    },\n" +
            "    \"minimumDatapoints\": {\n" +
            "      \"type\": \"integer\"\n" +
            "    },\n" +
            "    \"timespan\": {\n" +
            "      \"type\": \"string\"\n" +
            "    }\n" +
            "  }\n" +
            "}");
        schemaForecast = JSON.parse("{\n" +
            "  \"type\": \"object\",\n" +
            "  \"title\": \"Forecast\",\n" +
            "  \"properties\": {\n" +
            "    \"onOff\": {\n" +
            "      \"type\": \"boolean\"\n" +
            "    },\n" +
            "    \"type\": {\n" +
            "      \"type\": \"string\",\n" +
            "      \"enum\": [\n" +
            "        \"global\",\n" +
            "        \"change\",\n" +
            "        \"forecast\"\n" +
            "      ],\n" +
            "      \"default\":\"forecast\"\n" +
            "    },\n" +
            "    \"deviation\": {\n" +
            "      \"type\": \"integer\"\n" +
            "    }\n" +
            "  }\n" +
            "}")

        if(!this.anomalyDetectionConfigObject || !this.attributeRef || !this.anomalyDetectionConfigObject.methods)return html``;
        const attributeRef = this.attributeRef;
        const showJson = (ev: Event) => {
            ev.stopPropagation();
        };

        const onChanged = (dataAndErrors: { errors: ErrorObject[] | undefined, data: any }) => {
            let newconfig =dataAndErrors.data as AnomalyDetectionConfigurationUnion
            this.updateData(newconfig)
            if (jsonFormsInput.value) {
                if(newconfig){
                    jsonFormsInput.value.data = newconfig;
                }
            }
        }
        const doLoad = async (con: AnomalyDetectionConfigObject) => {
            if (jsonFormsInput.value) {
                if(con.methods![this.selectedIndex]){
                    jsonFormsInput.value.data = con.methods![this.selectedIndex];
                }
            }
        }
        window.setTimeout(() => doLoad(this.anomalyDetectionConfigObject as AnomalyDetectionConfigObject), 0);
        this.requestUpdate();
        return html`
            <style>
                    .test {
                        display: flex;
                        flex-direction: column;
                        width: 100%;
                    }
                    .item{
                        display: flex;
                        width: 100%;
                    }
                </style>
                <div class="test">
                    <or-collapsible-panel style="width: 100%">
                        <div slot="header">
                            <span>
                            Anomaly Detection Custom
                            </span>
                            <or-mwc-input type="button" outlined .label="${i18next.t("json")}" icon="pencil" @or-mwc-input-changed="${(ev: Event) => showJson(ev)}"></or-mwc-input>
                        </div>
                        
                        <div class="test" slot="content">
                            <div style="display: flex; padding: 0 16pt; margin-left: 10pt">
                                ${this.anomalyDetectionConfigObject.methods.map((m) => {
            const i = this.anomalyDetectionConfigObject!.methods?.indexOf(this.anomalyDetectionConfigObject!.methods?.find(x => x === m)!)!;
            return html`
                                <div .style="z-index: 10; margin:0 2pt; border-top-right-radius:4pt; border-top-left-radius:4pt; border-color:lightgray; border-style:solid; border-width:thin; ${i === this.selectedIndex ? "border-bottom-color: white;": "border-bottom-style: none;"}">
                                    <or-mwc-input type="button" .label="${m.name}" @or-mwc-input-changed="${() =>{ this.selectedIndex = i;this.updateBool=!this.updateBool; this.requestUpdate();}}" ></or-mwc-input>
                                </div>
                            `
        })}
                                <or-mwc-input type="button" label="add method" icon="plus" @or-mwc-input-changed="${() =>{this.addMethod();}}" ></or-mwc-input>
                            </div >
                            ${this.selectedIndex == -1? html`
                                <p style="padding-left:16pt ">No methods Created</p>
                            `: html`
                                <div style="margin: 16pt; padding: 16pt; margin-top: -1px; border-style: solid; border-color: lightgray; border-width: thin; border-radius: 4pt;">
                                <div style="display: flex;  justify-content: space-between; width: 100%">
                                    <div class="item" style="justify-content: left">
                                    <or-mwc-input .label="${"Name"}" type="text" .value="${this.anomalyDetectionConfigObject!.methods![this.selectedIndex].name!}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.updateProperty(e,"name")}"></or-mwc-input>
                                    </div>
                                   
                                    <div class="item" style="justify-content: right">
                                    <or-mwc-input .style="visibility: ${this.selectedIndex == -1? 'hidden':'visible'};" type="button" icon="close-circle" @or-mwc-input-changed="${() =>{ this.removeMethod(this.selectedIndex); this.requestUpdate();}}" ></or-mwc-input>
                                    </div>
                                </div>
                                <div .style="visibility: ${this.selectedIndex == -1? 'hidden':'visible'};" class="test" slot="content" >
                                    <div style="display: flex; justify-content: space-between; flex-direction: row;">
                                        <div style="width: 45%">
                                            <p>Detection Method</p>
                                        <or-json-forms  .renderers="${StandardRenderers}" ${ref(jsonFormsInput)}
                                        .disabled="${false}" .readonly="${false}" .label="Config"
                                        .schema="${this.anomalyDetectionConfigObject.methods![this.selectedIndex].type === "forecast"? schemaForecast : schemaChangeGlobal}" label="Anomaly Detection Json forms" .uischema="${uiSchema}"
                                        .onChange="${onChanged}" .props="test" .minimal="${true}"></or-json-forms>
                                    </div>
                                    <div style="width: 45%;  display: flex; flex-direction: column;">
                                        <p>Alarm</p>
                                        <or-mwc-input type="checkbox" label="Active" .value="${this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarmOnOff}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.updateProperty(e,"alarmOnOff")}"></or-mwc-input>
                                        <or-mwc-input style="padding-top: 10px;" .value="${this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarm?.severity?this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarm?.severity:""}" type="select" .options="${["LOW","MEDIUM","HIGH"]}" label="Severity" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.updateProperty(e,"alarm.severity")}"></or-mwc-input>
                                        <or-mwc-input style="padding-top: 10px;" .label="${i18next.t("alarm.assignee")}" placeholder=" " type="select"
                              .options="${options.map((obj) => obj.label)}"
                              .value="${this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarm!.assigneeId ? options.filter((obj) => obj.value === this.anomalyDetectionConfigObject!.methods![this.selectedIndex].alarm!.assigneeId).map((obj) => obj.label)[0] : ""}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                  e.detail.value = options.filter((obj) => obj.label === e.detail.value).map((obj) => obj.value)[0]
                                this.updateProperty(e,"alarm.assigneeId");
                            }}"></or-mwc-input>
                                        <or-mwc-input style="padding-top: 10px;" .value="${this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarm?.content?this.anomalyDetectionConfigObject.methods[this.selectedIndex].alarm?.content:"%AssetId%\n%AttributeName%"}" type="textarea"  label="Content" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.updateProperty(e,"alarm.content")}"></or-mwc-input>
                                    </div>
                                    </div>
                                    <or-anomaly-config-chart style="display: flex; width: auto;"
                                        .timePresetKey="${this.updateBool}" .panelName="${this.selectedIndex}" .anomalyConfig="${this.anomalyDetectionConfigObject ? this.anomalyDetectionConfigObject.methods![this.selectedIndex] : undefined}" .attributeRef="${attributeRef}" >
                                    </or-anomaly-config-chart>
                                </div>
                            </div>
                            `}
                        </div>
                    </or-collapsible-panel>
                </div>
                `
    }
    protected addMethod() {
        if(this.anomalyDetectionConfigObject){
            const obj = this.anomalyDetectionConfigObject;

            const i = this.anomalyDetectionConfigObject.methods ? this.anomalyDetectionConfigObject.methods.length: 0
            let con : AnomalyDetectionConfigurationGlobal;
            con = {name:"Method "+ (this.anomalyDetectionConfigObject.methods!.length +1 ),type:"global", onOff:false, deviation:10, minimumDatapoints:19, timespan:"PT20M", alarm:{content:"%AssetId%\n%AttributeName%"},alarmOnOff:false  }
            this.anomalyDetectionConfigObject.methods![i] = con;
            this.selectedIndex = i;
            this.draw();
        }
    }
    protected removeMethod(index:number) {
        if(this.anomalyDetectionConfigObject){
            this.anomalyDetectionConfigObject.methods?.splice(index,1);
            this.selectedIndex--;
            this.draw();
        }
    }
    protected updateProperty(e:OrInputChangedEvent, prop:string){
        if(this.anomalyDetectionConfigObject && this.anomalyDetectionConfigObject.methods){
            let newconfig:AnomalyDetectionConfigurationUnion = JSON.parse(JSON.stringify(this.anomalyDetectionConfigObject.methods[this.selectedIndex]));
            if(prop.includes("alarm.")){
                if(typeof newconfig.alarm![prop as keyof AlarmConfig] === typeof e.detail.value || typeof undefined){
                    //can't dynamicly set value of property using a string in typescript
                    // @ts-ignore
                    newconfig.alarm[prop.split("alarm.")[1]] = e.detail.value;
                }
            }else{
                if(typeof newconfig[prop as keyof AnomalyDetectionConfigurationUnion] === typeof e.detail.value || typeof undefined){
                    //can't dynamicly set value of property using a string in typescript
                    // @ts-ignore
                    newconfig[prop] = e.detail.value;
                }
            }
            this.updateData(newconfig);
        }
    }

    protected updateData(newConfig:AnomalyDetectionConfigurationUnion){
        let valid = true;
        let update = false;
        if (newConfig) {
            // test if updated values are influential on drawing the graph and if so update that data
            let testDrawUpdateConfig = JSON.parse(JSON.stringify(newConfig))
            testDrawUpdateConfig.name = this.anomalyDetectionConfigObject!.methods![this.selectedIndex].name;
            testDrawUpdateConfig.alarm = this.anomalyDetectionConfigObject!.methods![this.selectedIndex].alarm;
            testDrawUpdateConfig.alarmOnOff = this.anomalyDetectionConfigObject!.methods![this.selectedIndex].alarmOnOff;
            testDrawUpdateConfig.onOff = this.anomalyDetectionConfigObject!.methods![this.selectedIndex].onOff;
            if(!Util.objectsEqual(testDrawUpdateConfig, this.anomalyDetectionConfigObject!.methods![this.selectedIndex])){
                update = true;
            }

            if ( !newConfig.type || !newConfig.deviation || newConfig.onOff == undefined) valid = false;
            if(newConfig.type === "global"){
                if(!/^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.test((newConfig as AnomalyDetectionConfigurationGlobal).timespan as string))valid = false
            }else if(newConfig.type === "change"){
                if(!/^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.test((newConfig as AnomalyDetectionConfigurationChange).timespan as string))valid = false
            }
            if (!Util.objectsEqual(newConfig, this.anomalyDetectionConfigObject!.methods![this.selectedIndex]) && valid) {
                this.anomalyDetectionConfigObject!.methods![this.selectedIndex] = newConfig;
                if (this.onChange && valid) {
                    this.onChange({data: this.anomalyDetectionConfigObject, errors: []},true);
                }
            }
            if(valid) this.draw();
            if(update) this.updateBool = !this.updateBool;
        }
    }
    protected async loadUsers() {
        const usersResponse = await manager.rest.api.UserResource.query({
            realmPredicate: { name: manager.displayRealm },
        } as UserQuery);

        if (usersResponse.status !== 200) {
            return;
        }

        this.users = usersResponse.data.filter((user) => user.enabled && !user.serviceAccount);
    }

}
