import {
    RankedTester,
    rankWith,
    isStringControl,
    and,
    ControlProps,
    mapStateToControlProps,
    mapDispatchToControlProps,
    uiTypeIs,
    formatIs
} from "@jsonforms/core";
import manager, { AssetModelUtil, OREvent } from "@openremote/core";
import { Agent, AgentDescriptor } from "@openremote/model";
import { JsonFormsStateContext, getTemplateWrapper, JsonFormsRendererRegistryEntry } from "@openremote/or-json-forms";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import { html } from "lit";
import "@openremote/or-mwc-components/or-mwc-input";
import { i18next } from "@openremote/or-translate";
import { until } from "lit/directives/until";


/**
 * This function creates a short lived cache for loading the list of agents; this is useful when multiple instances
 * of this control are used in a single UI
 */
let agents: Agent[] | undefined;
let loadingPromise: Promise<Agent[]> | undefined;
const timeout = 2000;

export function loadAgents(): PromiseLike<Agent[]> {

    if (agents) {
        return Promise.resolve(agents);
    }

    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = manager.rest.api.AssetResource.queryAssets({
        tenant: {
            realm: manager.displayRealm
        },
        types: [
            "Agent"
        ],
        select: {
            excludeParentInfo: true,
            excludePath: true,
            excludeAttributes: true
        }
    })
        .then(response => response.data as Agent[])
        .then(agnts => {
            agents = agnts;
            manager.addListener((ev: OREvent) => {
                switch (ev) {
                    case OREvent.DISPLAY_REALM_CHANGED:
                        agents = undefined;
                        loadingPromise = undefined;
                        break;
                }
            });
            manager.events!.subscribeAssetEvents(undefined, false, undefined, (assetEvent) => {
                if (assetEvent.asset && assetEvent.asset.type!.endsWith("Agent")) {
                    agents = undefined;
                    loadingPromise = undefined;
                }
            })

            return agnts;
        });

    return loadingPromise;
}

const agentIdTester: RankedTester = rankWith(
    6,
    and(uiTypeIs("Control"), formatIs("or-agent-id"))
);
const agentIdRenderer = (state: JsonFormsStateContext, props: ControlProps) => {
    props = {
        ...props,
        ...mapStateToControlProps({jsonforms: {...state}}, props),
        ...mapDispatchToControlProps(state.dispatch)
    };

    const onAgentChanged = (agent: Agent | undefined) => {
        props.handleChange(props.path, agent ? agent.id : undefined);
        return;
    };

    const loadedTemplatePromise = loadAgents().then(agents => {

        const options: [string, string][] = agents.map(agent => [agent.id!, agent.name + " (" + agent.id + ")"]);

        return html`
            <or-mwc-input .label="${i18next.t("agentId")}" @or-mwc-input-changed="${(ev: OrInputChangedEvent) => onAgentChanged(agents.find((agent) => agent.id === ev.detail.value))}" type="${InputType.SELECT}" .value="${props.data}" .placeholder="${i18next.t("selectAgent")}" .options="${options}"></or-mwc-input>
        `;
    });

    const template = html`
        <div>
            ${until(loadedTemplatePromise, html`<or-mwc-input .type="${InputType.SELECT}"></or-mwc-input>`)}
        </div>`;

    return getTemplateWrapper(template, state, props);
};

export const agentIdRendererRegistryEntry: JsonFormsRendererRegistryEntry = {
    tester: agentIdTester,
    renderer: agentIdRenderer
};
