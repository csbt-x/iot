import { css, html, LitElement, unsafeCSS } from "lit";
import { InputType,OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import { customElement, property } from "lit/decorators.js";
import {
  ManagerRealmConfig,
  HeaderNames,
  DEFAULT_LANGUAGES,
  DefaultColor1,
  DefaultColor2,
  DefaultColor3, DefaultColor4, DefaultColor5, DefaultColor6,
} from "@openremote/core";
import { i18next } from "@openremote/or-translate";
import { ManagerConfRealm, ManagerHeaders } from "@openremote/model";


@customElement("or-conf-realm-card")
export class OrConfRealmCard extends LitElement {

  static styles = css`
    div{
      width: 100%;
    }
    .language{
      width: 50%;
      padding: 8px 4px;
    }
    .appTitle{
      width: 50%;
      padding: 8px 4px;
    }
    .d-inline-flex{
      display: inline-flex;
    }
    .flex-wrap{
      flex-wrap: wrap;
      justify-content: space-between;
    }
    .header-group{
      width: 50%;
    }
    .header-group .header-item{
      width: 50%;
    }
    .color-group{
      width: 50%;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
    }
    .color-group .color-item{
      width: 50%;
    }
    .logo-group{
      width: 50%;
      height: 300px;
    }
    #remove-realm{
      margin: 8px 4px;
    }
    .subheader{
      margin: 4px 8px;
      font-weight: bold;
    }
  `;

  @property({attribute: false})
  public realm: ManagerConfRealm = {
    appTitle: "OpenRemote Demo",
    language: "en",
    styles: "",
    headers:[]
  };

  @property({attribute: true})
  public name: string = "";

  @property({attribute: true})
  public onRemove: CallableFunction = () => {};

  protected headerList = [
    ManagerHeaders.realms,
    ManagerHeaders.map,
    ManagerHeaders.language,
    ManagerHeaders.export,
    ManagerHeaders.roles,
    ManagerHeaders.account,
    ManagerHeaders.assets,
    ManagerHeaders.gateway,
    ManagerHeaders.users,
  ]

  protected _getColors(){
    //TODO settings default colors
    const colors : {[name:string] : string} = {
      '--or-app-color1': unsafeCSS(DefaultColor1).toString(),
      '--or-app-color2': unsafeCSS(DefaultColor2).toString(),
      '--or-app-color3': unsafeCSS(DefaultColor3).toString(),
      '--or-app-color4': unsafeCSS(DefaultColor4).toString(),
      '--or-app-color5': unsafeCSS(DefaultColor5).toString(),
      '--or-app-color6': unsafeCSS(DefaultColor6).toString(),
    }
    if (this.realm?.styles){
      //TODO use regex for filtering and getting color codes CSS
      const css = this.realm.styles.slice(this.realm.styles.indexOf("{") +1, this.realm.styles.indexOf("}"))
      css.split(";").forEach(function(value){
        const col = value.split(":")
        if (col.length >= 2){
          colors[col[0].trim()] = col[1].trim()
        }
      })
    }
    return colors
  }

  protected _setColor(key:string, value:string){
    const colors  = this._getColors()
    colors[key] = value
    let css = ":host > * {"
    Object.entries(colors).map(([key, value]) => {
      css += key +":" +value + ";"
    })
    console.log(colors, css, this.realm.appTitle)
    this.realm.styles = css
  }

  protected _setHeader(key:ManagerHeaders, value:boolean){
    if (!('headers' in this.realm)){
      this.realm.headers = []
    }
    if (value){
      this.realm.headers?.push(key)
    } else {
      this.realm.headers =  this.realm.headers?.filter(function(ele){
        return ele != key;
      });
    }
  }

  render() {
    const app = this
    return html`
      <or-collapsible-panel>
        <div slot="header" class="header-container">
          <strong>${this.name}</strong>
        </div>
        <div slot="content">
          <div class="d-inline-flex">
            <or-mwc-input class="appTitle" .type="${InputType.TEXT}" value="${this.realm?.appTitle}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.realm.appTitle = e.detail.value}" label="App Title"></or-mwc-input>
            <or-mwc-input class="language" .type="${InputType.SELECT}" value="${this.realm?.language}" .options="${Object.entries(DEFAULT_LANGUAGES).map(([key, value]) => {return [key, i18next.t(value)]})}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.realm.language = e.detail.value}" label="Default language"></or-mwc-input>
          </div>
          <div class="d-inline-flex">
            <div class="header-group">
              <div class="subheader">Headers</div>
              ${Object.entries(this.headerList).map(function([key , value]){
                  return html`<or-mwc-input 
                    .type="${InputType.CHECKBOX}" 
                    class="header-item" label="${value}" 
                    .value="${!!app.realm.headers ? app.realm.headers?.includes(<ManagerHeaders>value) : true }" 
                    @or-mwc-input-changed="${(e: OrInputChangedEvent) => app._setHeader(value, e.detail.value)}"
                  ></or-mwc-input>`
              })}
            </div>
            <div class="logo-group">
              ${this.realm?.favicon}
              ${this.realm?.logo}
              ${this.realm?.logoMobile}
            </div>
          </div>
          <div class="color-group">
            <div class="subheader">Manager colors</div>
            ${Object.entries(this._getColors()).map(function([key, value]){
              return html`<or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${value}" label="${key}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => app._setColor(key, e.detail.value)}"></or-mwc-input>`
            })}
          </div>
          <or-mwc-input id="remove-realm" .type="${InputType.BUTTON}" label="Remove" @click="${() => {this.onRemove()}}" ></or-mwc-input>
        </div>
      </or-collapsible-panel>
`;
  }
}
