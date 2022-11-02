import {css, html, PropertyValues, TemplateResult, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import manager, {DefaultColor3, DefaultColor4, Util} from "@openremote/core";
import "@openremote/or-components/or-panel";
import "@openremote/or-translate";
import {Store} from "@reduxjs/toolkit";
import {AppStateKeyed, Page, PageProvider, router} from "@openremote/or-app";
import {ClientRole, Role, User, UserAssetLink, UserQuery} from "@openremote/model";
import {i18next} from "@openremote/or-translate";
import {InputType, OrInputChangedEvent, OrMwcInput} from "@openremote/or-mwc-components/or-mwc-input";
import {OrMwcDialog, showDialog, showOkCancelDialog} from "@openremote/or-mwc-components/or-mwc-dialog";
import {showSnackbar} from "@openremote/or-mwc-components/or-mwc-snackbar";
import {isAxiosError, GenericAxiosResponse} from "@openremote/rest";
import {OrAssetTreeRequestSelectionEvent, OrAssetTreeSelectionEvent} from "@openremote/or-asset-tree";
import {getNewUserRoute, getUsersRoute} from "../routes";
import {when} from 'lit/directives/when.js';
import {until} from 'lit/directives/until.js';
import {OrMwcTableRowClickEvent, TableColumn} from "@openremote/or-mwc-components/or-mwc-table";

const tableStyle = require("@material/data-table/dist/mdc.data-table.css");

export function pageUsersProvider(store: Store<AppStateKeyed>): PageProvider<AppStateKeyed> {
    return {
        name: "users",
        routes: [
            "users",
            "users/:id",
            "users/new/:type"
        ],
        pageCreator: () => {
            return new PageUsers(store);
        },
    };
}

interface UserModel extends User {
    password?: string;
    loaded?: boolean;
    loading?: boolean;
    previousRoles?: Role[];
    roles?: Role[];
    previousRealmRoles?: Role[];
    realmRoles?: Role[];
    previousAssetLinks?: UserAssetLink[];
    userAssetLinks?: UserAssetLink[];
}

const RESTRICTED_USER_REALM_ROLE = "restricted_user";

@customElement("page-users")
export class PageUsers extends Page<AppStateKeyed> {
    static get styles() {
        // language=CSS
        return [
            unsafeCSS(tableStyle),
            css`
                #wrapper {
                    height: 100%;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: auto;
                }

                #title {
                    padding: 0 20px;
                    font-size: 18px;
                    font-weight: bold;
                    width: calc(100% - 40px);
                    max-width: 1360px;
                    margin: 20px auto;
                    align-items: center;
                    display: flex;
                }

                #title or-icon {
                    margin-right: 10px;
                    margin-left: 14px;
                }

                .panel {
                    width: calc(100% - 90px);
                    max-width: 1310px;
                    background-color: white;
                    border: 1px solid #e5e5e5;
                    border-radius: 5px;
                    position: relative;
                    margin: 5px auto;
                    padding: 12px 24px 24px;
                }

                .panel-title {
                    text-transform: uppercase;
                    font-weight: bolder;
                    line-height: 1em;
                    margin-bottom: 10px;
                    margin-top: 0;
                    flex: 0 0 auto;
                    letter-spacing: 0.025em;
                    display: flex;
                    align-items: center;
                    min-height: 36px;
                }

                #table-users,
                #table-users table {
                    width: 100%;
                    white-space: nowrap;
                }

                .mdc-data-table__row {
                    cursor: pointer;
                    border-top-color: #D3D3D3;
                }

                .mdc-data-table__row.disabled {
                    cursor: progress;
                    opacity: 0.4;
                }

                .table-actions-container {
                    text-align: right;
                    position: absolute;
                    right: 0;
                    margin: 2px;
                }

                td, th {
                    width: 25%
                }

                or-mwc-input {
                    margin-bottom: 20px;
                    margin-right: 16px;
                }

                or-icon {
                    vertical-align: middle;
                    --or-icon-width: 20px;
                    --or-icon-height: 20px;
                    margin-right: 2px;
                    margin-left: -5px;
                }

                .row {
                    display: flex;
                    flex-direction: row;
                    margin: 10px 0;
                    flex: 1 1 0;
                }

                .column {
                    display: flex;
                    flex-direction: column;
                    margin: 0px;
                    flex: 1 1 0;
                    max-width: 50%;
                }

                .mdc-data-table__header-cell {
                    font-weight: bold;
                    color: ${unsafeCSS(DefaultColor3)};
                }

                .mdc-data-table__header-cell:first-child {
                    padding-left: 36px;
                }

                .item-row td {
                    padding: 0;
                }

                .item-row-content {
                    flex-direction: row;
                    overflow: hidden;
                    max-height: 0;
                    padding-left: 16px;
                }

                .item-row.expanded .item-row-content {
                    overflow: visible;
                    max-height: unset;
                }

                .button {
                    cursor: pointer;
                    display: flex;
                    flex-direction: row;
                    align-content: center;
                    padding: 16px;
                    align-items: center;
                    font-size: 14px;
                    text-transform: uppercase;
                    color: var(--or-app-color4);
                }

                .hidden {
                    display: none;
                }

                .breadcrumb-text:hover {
                    text-decoration: underline;
                }

                @media screen and (max-width: 768px) {
                    #title {
                        padding: 0;
                        width: 100%;
                    }

                    .hide-mobile {
                        display: none;
                    }

                    .row {
                        display: block;
                        flex-direction: column;
                    }

                    .panel {
                        border-radius: 0;
                        border-left: 0px;
                        border-right: 0px;
                        width: calc(100% - 48px);
                    }

                    td, th {
                        width: 50%
                    }
                }
            `,
        ];
    }

    @property()
    public realm?: string;
    @property()
    public userId?: string;
    @property()
    public creationState?: {
        userModel: UserModel
    }

    @state()
    protected _users: UserModel[] = [];
    @state()
    protected _serviceUsers: UserModel[] = [];
    @state()
    protected _roles: Role[] = [];
    @state()
    protected _realmRoles: Role[] = [];

    protected _realmRolesFilter = (role: Role) => {
        return !role.composite && !["uma_authorization", "offline_access", "admin"].includes(role.name) && !role.name.startsWith("default-roles")
    };

    @state()
    protected _compositeRoles: Role[] = [];
    protected _loading: boolean = false;

    @state()
    protected _loadUsersPromise?: Promise<any>;

    get name(): string {
        return "user_plural";
    }


    public shouldUpdate(changedProperties: PropertyValues): boolean {
        console.log(changedProperties);
        if (changedProperties.has("realm") && changedProperties.get("realm") != undefined) {
            this.reset();
            this.loadUsers();
        }
        if (changedProperties.has('userId')) {
            this._updateRoute();
        } else if (changedProperties.has('creationState')) {
            this._updateNewUserRoute();
        }
        return super.shouldUpdate(changedProperties);
    }

    public connectedCallback() {
        super.connectedCallback();
        this.loadUsers();
    }

    public disconnectedCallback() {
        super.disconnectedCallback();
    }

    protected responseAndStateOK(stateChecker: () => boolean, response: GenericAxiosResponse<any>, errorMsg: string): boolean {

        if (!stateChecker()) {
            return false;
        }

        if (!response.data) {
            showSnackbar(undefined, errorMsg, i18next.t("dismiss"));
            console.error(errorMsg + ": response = " + response.statusText);
            return false;
        }

        return true;
    }

    protected async loadUsers(): Promise<void> {
        this._loadUsersPromise = this.fetchUsers();
        this._loadUsersPromise.then(() => {
            this._loadUsersPromise = undefined;
        })
        return this._loadUsersPromise;
    }

    protected async fetchUsers(): Promise<void> {

        if (!this.realm || this._loading || !this.isConnected) {
            return;
        }

        this._loading = true;

        this._compositeRoles = [];
        this._roles = [];
        this._realmRoles = [];
        this._users = [];
        this._serviceUsers = [];

        if (!manager.authenticated || !manager.hasRole(ClientRole.READ_USERS)) {
            console.warn("Not authenticated or insufficient access");
            return;
        }

        // After async op check that the response still matches current state and that the component is still loaded in the UI
        const stateChecker = () => {
            return this.getState().app.realm === this.realm && this.isConnected;
        }

        const roleResponse = await manager.rest.api.UserResource.getRoles(manager.displayRealm);

        if (!this.responseAndStateOK(stateChecker, roleResponse, i18next.t("loadFailedRoles"))) {
            return;
        }

        const realmResponse = await manager.rest.api.RealmResource.get(manager.displayRealm);

        if (!this.responseAndStateOK(stateChecker, realmResponse, i18next.t("loadFailedRoles"))) {
            return;
        }

        const usersResponse = await manager.rest.api.UserResource.query({realmPredicate: {name: manager.displayRealm}} as UserQuery);

        if (!this.responseAndStateOK(stateChecker, usersResponse, i18next.t("loadFailedUsers"))) {
            return;
        }

        this._compositeRoles = roleResponse.data.filter(role => role.composite).sort(Util.sortByString(role => role.name));
        this._roles = roleResponse.data.filter(role => !role.composite).sort(Util.sortByString(role => role.name));
        this._realmRoles = (realmResponse.data.realmRoles || []).sort(Util.sortByString(role => role.name));
        this._users = usersResponse.data.filter(user => !user.serviceAccount).sort(Util.sortByString(u => u.username));
        this._serviceUsers = usersResponse.data.filter(user => user.serviceAccount).sort(Util.sortByString(u => u.username));
        this._loading = false;
    }

    private async _createUpdateUser(user: UserModel) {

        if (!user.username) {
            return;
        }

        if (user.password === "") {
            // Means a validation failure shouldn't get here
            return;
        }

        const isUpdate = !!user.id;

        try {
            const response = await manager.rest.api.UserResource.createUpdate(manager.displayRealm, user);

            // Ensure user ID is set
            user.id = response.data.id;

            if (user.password) {
                const credentials = {value: user.password}
                manager.rest.api.UserResource.resetPassword(manager.displayRealm, user.id, credentials);
            }

            await this._updateRoles(user, false);
            await this._updateRoles(user, true);
            await this._updateUserAssetLinks(user);
        } catch (e) {
            if (isAxiosError(e)) {
                console.error((isUpdate ? "save user failed" : "create user failed") + ": response = " + e.response.statusText);

                if (e.response.status === 400) {
                    showSnackbar(undefined, i18next.t(isUpdate ? "saveUserFailed" : "createUserFailed"), i18next.t("dismiss"));
                }
            }
        } finally {
            await this.loadUsers();
        }
    }

    /**
     * Backend only uses name of role not the ID so although service client roles are not the same as composite roles
     * the names will match so that's ok
     */
    private async _updateRoles(user: UserModel, realmRoles: boolean) {
        const roles = realmRoles ? user.realmRoles.filter(role => role.assigned) : user.roles.filter(role => role.assigned);
        const previousRoles = realmRoles ? user.previousRealmRoles : user.previousRoles;
        const removedRoles = previousRoles.filter(previousRole => !roles.some(role => role.name === previousRole.name));
        const addedRoles = roles.filter(role => !previousRoles.some(previousRole => previousRole.name === role.name));

        if (removedRoles.length === 0 && addedRoles.length === 0) {
            return;
        }

        if (realmRoles) {
            await manager.rest.api.UserResource.updateUserRealmRoles(manager.displayRealm, user.id, roles);
        } else {
            await manager.rest.api.UserResource.updateUserRoles(manager.displayRealm, user.id, roles);
        }
    }

    private async _updateUserAssetLinks(user: UserModel) {
        if (!user.previousAssetLinks) {
            return;
        }

        const removedLinks = user.previousAssetLinks.filter(assetLink => !user.userAssetLinks.some(newLink => assetLink.id.assetId === newLink.id.assetId));
        const addedLinks = user.userAssetLinks.filter(assetLink => !user.previousAssetLinks.some(oldLink => assetLink.id.assetId === oldLink.id.assetId)).map(link => {
            // Ensure user ID is added as new users wouldn't have had an ID at the time the links were created in the UI
            link.id.userId = user.id;
            return link;
        });

        if (removedLinks.length > 0) {
            await manager.rest.api.AssetResource.deleteUserAssetLinks(removedLinks);
        }
        if (addedLinks.length > 0) {
            await manager.rest.api.AssetResource.createUserAssetLinks(addedLinks);
        }
    }

    private _deleteUser(user) {
        showOkCancelDialog(i18next.t("delete"), i18next.t("deleteUserConfirm"), i18next.t("delete"))
            .then((ok) => {
                if (ok) {
                    this.doDelete(user);
                }
            });
    }

    private doDelete(user) {
        manager.rest.api.UserResource.delete(manager.displayRealm, user.id).then(response => {
            if (user.serviceAccount) {
                this._serviceUsers = [...this._serviceUsers.filter(u => u.id !== user.id)];
                this.reset();
            } else {
                this._users = [...this._users.filter(u => u.id !== user.id)];
                this.reset();
            }
        })
    }

    protected render(): TemplateResult | void {
        console.error("Rendering!");
        if (!manager.authenticated) {
            return html`
                <or-translate value="notAuthenticated"></or-translate>
            `;
        }

        const compositeRoleOptions: string[] = this._compositeRoles.map(cr => cr.name);
        const realmRoleOptions: [string, string][] = this._realmRoles ? this._realmRoles.filter(r => this._realmRolesFilter(r)).map(r => [r.name, i18next.t("realmRole." + r.name, Util.camelCaseToSentenceCase(r.name.replace("_", " ").replace("-", " ")))]) : [];
        const readonly = !manager.hasRole(ClientRole.WRITE_ADMIN);

        // Content of User Table
        const userTableColumns: TableColumn[] = [
            {title: i18next.t('username')},
            {title: i18next.t('email'), hideMobile: true},
            {title: i18next.t('role')},
            {title: i18next.t('status')}
        ];
        const userTableRows: string[][] = this._users.map((user) => [user.username, user.email, user.roles?.filter(r => r.composite).map(r => r.name).join(","), user.enabled ? i18next.t('enabled') : i18next.t('disabled')])

        // Content of Service user Table
        const serviceUserTableColumns: TableColumn[] = [
            {title: i18next.t('username')},
            {title: i18next.t('email'), hideMobile: true},
            {title: ''},
            {title: i18next.t('status')}
        ];
        const serviceUserTableRows: string[][] = this._serviceUsers.map((user) => [user.username, user.email, '', user.enabled ? i18next.t('enabled') : i18next.t('disabled')]);

        // Configuration
        const tableConfig = {
            columnFilter: [],
            stickyFirstColumn: false,
            pagination: {
                enable: true
            }
        }

        const mergedUserList: UserModel[] = [...this._users, ...this._serviceUsers];
        const index: number | undefined = (this.userId ? mergedUserList.findIndex((user) => user.id == this.userId) : undefined);

        console.warn(mergedUserList);
        console.warn(index);
        console.warn(this.userId);
        console.warn(mergedUserList[index]);

        return html`
            <div id="wrapper">

                <!-- Breadcrumb on top of the page-->
                ${when((this.userId && index != undefined) || this.creationState, () => html`
                    <div style="padding: 0 20px; width: calc(100% - 40px); max-width: 1360px; margin: 12px auto 0; display: flex; align-items: center;">
                        <span class="breadcrumb-text" style="cursor: pointer; color: ${DefaultColor4}"
                              @click="${() => this.reset()}">${i18next.t("user_plural")}</span>
                        <or-icon icon="chevron-right"
                                 style="margin: 0 5px -3px 5px; --or-icon-width: 16px; --or-icon-height: 16px;"></or-icon>
                        <span style="margin-left: 2px;">${index != undefined ? mergedUserList[index]?.username : (this.creationState.userModel.serviceAccount ? i18next.t('creating_serviceUser') : i18next.t('creating_regularUser'))}</span>
                    </div>
                `)}

                <div id="title">
                    <or-icon icon="account-group"></or-icon>
                    <span>${this.userId && index != undefined ? mergedUserList[index]?.username : i18next.t('user_plural')}</span>
                </div>

                <!-- User Specific page -->
                ${when((this.userId && index != undefined) || this.creationState, () => html`
                    ${when(mergedUserList[index] != undefined || this.creationState, () => {
                        const user: UserModel = (index != undefined ? mergedUserList[index] : this.creationState.userModel);
                        return html`
                            <div id="content" class="panel">
                                <p class="panel-title">${user.serviceAccount ? i18next.t('serviceUser') : i18next.t('user')} ${i18next.t('settings')}</p>
                                ${until(this.getUserViewTemplate((index != undefined ? mergedUserList[index] : this.creationState.userModel), compositeRoleOptions, realmRoleOptions, ("user" + index), readonly), html`${i18next.t('loading')}`)}
                            </div>
                        `; 
                    }, () => html`${i18next.t('errorOccured')}`)}

                    <!-- List of Users page -->
                `, () => html`
                    <div id="content" class="panel">
                        <div class="panel-title" style="justify-content: space-between;">
                            <p>${i18next.t("regularUser_plural")}</p>
                            <or-mwc-input style="margin: 0;" type="${InputType.BUTTON}" icon="plus"
                                          label="${i18next.t('add')} ${i18next.t("user")}"
                                          @or-mwc-input-changed="${() => this.creationState = {userModel: this.getNewUserModel(false)}}"></or-mwc-input>
                        </div>
                        ${until(this.getUsersTable(userTableColumns, userTableRows, tableConfig, (ev) => {
                            this.userId = this._users[ev.detail.index].id;
                        }), html`${i18next.t('loading')}`)}
                    </div>

                    <div id="content" class="panel">
                        <div class="panel-title" style="justify-content: space-between;">
                            <p>${i18next.t("serviceUser_plural")}</p>
                            <or-mwc-input style="margin: 0;" type="${InputType.BUTTON}" icon="plus"
                                          label="${i18next.t('add')} ${i18next.t("user")}"
                                          @or-mwc-input-changed="${() => this.creationState = {userModel: this.getNewUserModel(true)}}"></or-mwc-input>
                        </div>
                        ${until(this.getUsersTable(serviceUserTableColumns, serviceUserTableRows, tableConfig, (ev) => {
                            this.userId = this._serviceUsers[ev.detail.index].id;
                        }), html`${i18next.t('loading')}`)}
                    </div>
                `)}
            </div>
        `;
    }

    protected getRowsTemplate(columns: TableColumn[], values: any[]): TemplateResult {
        return html`
            ${columns.map((column, index) => html`
                <td class="padded-cell mdc-data-table__cell${column.hideMobile ? ' hide-mobile' : undefined}">
                    <span>${values[index]}</span>
                </td>
            `)}
        `
    }

    protected async getUsersTable(columns: TemplateResult | any[], rows: TemplateResult | string[][], config: any, onRowClick: (event: OrMwcTableRowClickEvent) => void): Promise<TemplateResult> {
        if (this._loadUsersPromise) {
            await this._loadUsersPromise;
        }
        return html`
            <or-mwc-table .columns="${columns instanceof Array ? columns : undefined}"
                          .columnsTemplate="${!(columns instanceof Array) ? columns : undefined}"
                          .rows="${rows instanceof Array ? rows : undefined}"
                          .rowsTemplate="${!(rows instanceof Array) ? rows : undefined}"
                          .config="${config}"
                          @or-mwc-table-row-click="${rows instanceof Array ? onRowClick : undefined}"
            ></or-mwc-table>
        `
    }

    protected getNewUserModel(serviceAccount: boolean): UserModel {
        return {
            password: undefined,
            roles: [],
            realmRoles: [],
            userAssetLinks: [],
            serviceAccount: serviceAccount
        }
    }

    public stateChanged(state: AppStateKeyed) {
        console.warn(state);
        this.realm = state.app.realm;
        this.userId = (state.app.params && state.app.params.id) ? state.app.params.id : undefined;
        this.creationState = (state.app.params?.type ? {userModel: this.getNewUserModel(state.app.params.type == 'serviceuser')} : undefined);
    }

    protected async loadUser(user: UserModel) {
        if (user.roles || user.realmRoles) {
            return;
        }

        // Load users assigned roles
        const userRolesResponse = await (manager.rest.api.UserResource.getUserRoles(manager.displayRealm, user.id));
        if (!this.responseAndStateOK(() => true, userRolesResponse, i18next.t("loadFailedUserInfo"))) {
            return;
        }

        const userRealmRolesResponse = await manager.rest.api.UserResource.getUserRealmRoles(manager.displayRealm, user.id);
        if (!this.responseAndStateOK(() => true, userRolesResponse, i18next.t("loadFailedUserInfo"))) {
            return;
        }

        const userAssetLinksResponse = await manager.rest.api.AssetResource.getUserAssetLinks({
            realm: manager.displayRealm,
            userId: user.id
        });
        if (!this.responseAndStateOK(() => true, userAssetLinksResponse, i18next.t("loadFailedUserInfo"))) {
            return;
        }

        user.roles = userRolesResponse.data.filter(r => r.assigned);
        user.realmRoles = userRealmRolesResponse.data.filter(r => r.assigned);
        this._realmRoles = [...userRealmRolesResponse.data];
        user.previousRealmRoles = [...user.realmRoles];
        user.previousRoles = [...user.roles];
        user.userAssetLinks = userAssetLinksResponse.data;
        user.loaded = true;
        user.loading = false;

        // Update the dom
        this.requestUpdate();
    }

    protected _openAssetSelector(ev: MouseEvent, user: UserModel, readonly: boolean) {
        const openBtn = ev.target as OrMwcInput;
        openBtn.disabled = true;
        user.previousAssetLinks = [...user.userAssetLinks];

        const onAssetSelectionChanged = (e: OrAssetTreeSelectionEvent) => {
            user.userAssetLinks = e.detail.newNodes.map(node => {
                const userAssetLink: UserAssetLink = {
                    id: {
                        userId: user.id,
                        realm: user.realm,
                        assetId: node.asset.id
                    }
                };
                return userAssetLink;
            })
        };

        const dialog = showDialog(new OrMwcDialog()
            .setHeading(i18next.t("linkedAssets"))
            .setContent(html`
                <or-asset-tree
                        id="chart-asset-tree" readonly .selectedIds="${user.userAssetLinks.map(ual => ual.id.assetId)}"
                        .showSortBtn="${false}" expandNodes checkboxes
                        @or-asset-tree-request-selection="${(e: OrAssetTreeRequestSelectionEvent) => {
                            if (readonly) {
                                e.detail.allow = false;
                            }
                        }}"
                        @or-asset-tree-selection="${(e: OrAssetTreeSelectionEvent) => {
                            if (!readonly) {
                                onAssetSelectionChanged(e);
                            }
                        }}"></or-asset-tree>
            `)
            .setActions([
                {
                    default: true,
                    actionName: "cancel",
                    content: i18next.t("cancel"),
                    action: () => {
                        user.userAssetLinks = user.previousAssetLinks;
                        user.previousAssetLinks = undefined;
                        openBtn.disabled = false;
                    }
                },
                {
                    actionName: "ok",
                    content: i18next.t("ok"),
                    action: () => {
                        openBtn.disabled = false;
                        this.requestUpdate();
                    }
                }
            ])
            .setDismissAction({
                actionName: "cancel",
                action: () => {
                    user.userAssetLinks = user.previousAssetLinks;
                    user.previousAssetLinks = undefined;
                    openBtn.disabled = false;
                }
            }));
    }

    protected onUserChanged(e: OrInputChangedEvent, suffix: string) {
        // Don't have form-associated custom element support in lit at time of writing which would be the way to go here
        const formElement = (e.target as HTMLElement).parentElement;
        const saveBtn = this.shadowRoot.getElementById("savebtn-" + suffix) as OrMwcInput;

        if (formElement) {
            const saveDisabled = Array.from(formElement.children).filter(e => e instanceof OrMwcInput).some(input => !(input as OrMwcInput).valid);
            saveBtn.disabled = saveDisabled;
        }
    }

    protected _onPasswordChanged(user: UserModel, suffix: string) {
        const passwordComponent = this.shadowRoot.getElementById("password-" + suffix) as OrMwcInput;
        const repeatPasswordComponent = this.shadowRoot.getElementById("repeatPassword-" + suffix) as OrMwcInput;

        if (repeatPasswordComponent.value !== passwordComponent.value) {
            const error = i18next.t("passwordMismatch");
            repeatPasswordComponent.setCustomValidity(error);
            user.password = "";
        } else {
            repeatPasswordComponent.setCustomValidity(undefined);
            user.password = passwordComponent.value;
        }
    }

    protected async _regenerateSecret(ev: OrInputChangedEvent, user: UserModel, secretInputId: string) {
        const btnElem = ev.currentTarget as OrMwcInput;
        const secretElem = this.shadowRoot.getElementById(secretInputId) as OrMwcInput;
        if (!btnElem || !secretElem) {
            return;
        }
        btnElem.disabled = true;
        secretElem.disabled = true;
        const resetResponse = await manager.rest.api.UserResource.resetSecret(manager.displayRealm, user.id);
        if (resetResponse.data) {
            secretElem.value = resetResponse.data;
        }
        btnElem.disabled = false;
        secretElem.disabled = false;
    }

    protected _updateUserSelectedRoles(user: UserModel, suffix: string) {
        const roleCheckboxes = [...((this.shadowRoot.getElementById("role-list-" + suffix) as HTMLDivElement).children as any)] as OrMwcInput[];
        const implicitRoleNames = this.getImplicitUserRoles(user);
        roleCheckboxes.forEach((checkbox) => {
            const roleName = checkbox.label;
            const r = this._roles.find(role => roleName === role.name);
            checkbox.disabled = !!implicitRoleNames.find(name => r.name === name);
            checkbox.value = !!user.roles.find(userRole => userRole.name === r.name) || implicitRoleNames.some(implicitRoleName => implicitRoleName === r.name);
        });
    }

    protected getImplicitUserRoles(user: UserModel) {
        return this._compositeRoles.filter((role) => user.roles.some(ur => ur.name === role.name)).flatMap((role) => role.compositeRoleIds).map(id => this._roles.find(r => r.id === id).name);
    }

    protected async getUserViewTemplate(user: UserModel, compositeRoleOptions: string[], realmRoleOptions: [string, string][], suffix: string, readonly: boolean = true): Promise<TemplateResult> {
        await this.loadUser(user);
        const isServiceUser = user.serviceAccount;
        const isSameUser = user.username === manager.username;
        const implicitRoleNames = user.loaded ? this.getImplicitUserRoles(user) : [];
        return html`
            <div class="row">
                <div class="column">
                    <h5>${i18next.t("details")}</h5>
                    <!-- user details -->
                    <or-mwc-input ?readonly="${!!user.id || readonly}" .disabled="${!!user.id}"
                                  .label="${i18next.t("username")}"
                                  .type="${InputType.TEXT}" minLength="3" maxLength="255" required
                                  pattern="[a-zA-Z0-9-_]+"
                                  .value="${user.username}"
                                  .validationMessage="${i18next.t("invalidUsername")}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                      user.username = e.detail.value;
                                      this.onUserChanged(e, suffix)
                                  }}"></or-mwc-input>
                    <or-mwc-input ?readonly="${readonly}"
                                  class="${isServiceUser ? "hidden" : ""}"
                                  .label="${i18next.t("email")}"
                                  .type="${InputType.EMAIL}"
                                  .value="${user.email}"
                                  .validationMessage="${i18next.t("invalidEmail")}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                      user.email = e.detail.value;
                                      this.onUserChanged(e, suffix)
                                  }}"></or-mwc-input>
                    <or-mwc-input ?readonly="${readonly}"
                                  class="${isServiceUser ? "hidden" : ""}"
                                  .label="${i18next.t("firstName")}"
                                  .type="${InputType.TEXT}" minLength="1"
                                  .value="${user.firstName}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                      user.firstName = e.detail.value;
                                      this.onUserChanged(e, suffix)
                                  }}"></or-mwc-input>
                    <or-mwc-input ?readonly="${readonly}"
                                  class="${isServiceUser ? "hidden" : ""}"
                                  .label="${i18next.t("surname")}"
                                  .type="${InputType.TEXT}" minLength="1"
                                  .value="${user.lastName}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                      user.lastName = e.detail.value;
                                      this.onUserChanged(e, suffix)
                                  }}"></or-mwc-input>

                    <!-- password -->
                    <h5>${i18next.t("password")}</h5>
                    ${isServiceUser ? html`
                        ${user.secret ? html`
                            <or-mwc-input id="password-${suffix}" readonly
                                          .label="${i18next.t("secret")}"
                                          .value="${user.secret}"
                                          .type="${InputType.TEXT}"></or-mwc-input>
                            <or-mwc-input ?readonly="${!user.id || readonly}"
                                          .label="${i18next.t("regenerateSecret")}"
                                          .type="${InputType.BUTTON}"
                                          @or-mwc-input-changed="${(ev) => this._regenerateSecret(ev, user, "password-" + suffix)}"></or-mwc-input>
                        ` : html`
                            <span>${i18next.t("generateSecretInfo")}</span>
                        `}
                    ` : html`
                        <or-mwc-input id="password-${suffix}"
                                      ?readonly="${readonly}"
                                      .label="${i18next.t("password")}"
                                      .type="${InputType.PASSWORD}" min="1"
                                      @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                          this._onPasswordChanged(user, suffix);
                                          this.onUserChanged(e, suffix);
                                      }}"
                        ></or-mwc-input>
                        <or-mwc-input id="repeatPassword-${suffix}"
                                      helperPersistent ?readonly="${readonly}"
                                      .label="${i18next.t("repeatPassword")}"
                                      .type="${InputType.PASSWORD}" min="1"
                                      @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                          this._onPasswordChanged(user, suffix);
                                          this.onUserChanged(e, suffix);
                                      }}"
                        ></or-mwc-input>
                    `}
                </div>

                <div class="column">
                    <h5>${i18next.t("settings")}</h5>
                    <!-- enabled -->
                    <or-mwc-input ?readonly="${readonly}"
                                  .label="${i18next.t("active")}"
                                  .type="${InputType.CHECKBOX}"
                                  .value="${user.enabled}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => user.enabled = e.detail.value}"
                                  style="height: 56px;"
                    ></or-mwc-input>

                    <!-- realm roles -->
                    <or-mwc-input
                            ?readonly="${readonly}"
                            ?disabled="${isSameUser}"
                            .value="${user.realmRoles && user.realmRoles.length > 0 ? user.realmRoles.filter(r => this._realmRolesFilter(r)).map(r => r.name) : undefined}"
                            .type="${InputType.SELECT}" multiple
                            .options="${realmRoleOptions}"
                            .label="${i18next.t("realm_role_plural")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                const roleNames = e.detail.value as string[];
                                const excludedAndCompositeRoles = user.realmRoles.filter(r => !this._realmRolesFilter(r));
                                const selectedRoles = this._realmRoles.filter(cr => roleNames.some(name => cr.name === name)).map(r => {
                                    return {...r, assigned: true} as Role;
                                });
                                user.realmRoles = [...excludedAndCompositeRoles, ...selectedRoles];
                            }}"></or-mwc-input>

                    <!-- composite client roles -->
                    <or-mwc-input
                            ?readonly="${readonly}"
                            ?disabled="${isSameUser}"
                            .value="${user.roles && user.roles.length > 0 ? user.roles.filter(r => r.composite).map(r => r.name) : undefined}"
                            .type="${InputType.SELECT}" multiple
                            .options="${compositeRoleOptions}"
                            .label="${i18next.t("manager_role_plural")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                const roleNames = e.detail.value as string[];
                                user.roles = this._compositeRoles.filter(cr => roleNames.some(name => cr.name === name)).map(r => {
                                    return {...r, assigned: true};
                                });
                                this._updateUserSelectedRoles(user, suffix);
                            }}"></or-mwc-input>

                    <!-- roles -->
                    <div style="display:flex;flex-wrap:wrap;margin-bottom: 20px;"
                         id="role-list-${suffix}">
                        ${this._roles.map(r => {
                            return html`
                                <or-mwc-input
                                        ?readonly="${readonly}"
                                        ?disabled="${implicitRoleNames.find(name => r.name === name)}"
                                        .value="${!!user.roles.find(userRole => userRole.name === r.name) || implicitRoleNames.some(implicitRoleName => implicitRoleName === r.name)}"
                                        .type="${InputType.CHECKBOX}"
                                        .label="${r.name}"
                                        style="width:25%;margin:0"
                                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                            if (!!e.detail.value) {
                                                user.roles.push({...r, assigned: true});
                                            } else {
                                                user.roles = user.roles.filter(e => e.name !== r.name);
                                            }
                                        }}"></or-mwc-input>
                            `
                        })}
                    </div>

                    <!-- restricted access -->
                    <div>
                        <span>${i18next.t("linkedAssets")}:</span>
                        <or-mwc-input outlined
                                      .type="${InputType.BUTTON}"
                                      .label="${i18next.t("selectRestrictedAssets", {number: user.userAssetLinks.length})}"
                                      @click="${(ev: MouseEvent) => this._openAssetSelector(ev, user, readonly)}"></or-mwc-input>
                    </div>
                </div>
            </div>
            ${readonly ? `` : html`
                <div class="row" style="margin-bottom: 0;">

                    ${!isSameUser && user.id ? html`
                        <or-mwc-input style="margin: 0;" outlined
                                      .label="${i18next.t("delete")}"
                                      .type="${InputType.BUTTON}"
                                      @click="${() => this._deleteUser(user)}"></or-mwc-input>
                    ` : ``}
                    <or-mwc-input id="savebtn-${suffix}" style="margin: 0 0 0 auto;" raised
                                  .label="${i18next.t(user.id ? "save" : "create")}"
                                  .type="${InputType.BUTTON}"
                                  @click="${() => {
                                      this._createUpdateUser(user).then(() => {
                                          showSnackbar(undefined, (user.username + " " + i18next.t("savedSuccessfully")));
                                          this.reset();
                                      })
                                  }}">
                    </or-mwc-input>
                </div>
            `}
        `;
    }

    protected reset() {
        console.error("RESETTING PAGE!");
        this.userId = undefined;
        this.creationState = undefined;
    }

    protected _updateRoute(silent: boolean = false) {
        router.navigate(getUsersRoute(this.userId), {
            callHooks: !silent,
            callHandler: !silent
        });
    }

    protected _updateNewUserRoute(silent: boolean = false) {
        router.navigate(getNewUserRoute(this.creationState?.userModel.serviceAccount), {
            callHooks: !silent,
            callHandler: !silent
        });
    }
}
