import { ConfigStore } from "./config.ts";
import { CodexModelCatalog } from "./codexModelCatalog.ts";
import { getConfigDiagnostics } from "./configDiagnostics.ts";
import { getRuntimeEnvDiagnostics } from "./envDiagnostics.ts";

function formatIssues(issues: string[]): string {
    if (issues.length === 0) {
        return "ok";
    }

    return issues.join(" | ");
}

const configStore = new ConfigStore();
const diagnostics = getConfigDiagnostics(configStore.snapshot);
const runtimeEnv = getRuntimeEnvDiagnostics();
const modelCatalog = new CodexModelCatalog({
    getConfig: () => configStore.snapshot,
});

console.log(`[agentchat-server] config: ${configStore.path}`);
console.log(
    `[agentchat-server] config loaded at: ${new Date(configStore.status.loadedAt).toISOString()}`,
);
console.log(
    `[agentchat-server] config last reload attempt: ${
        configStore.status.lastReloadAttemptAt === null
            ? "none"
            : new Date(configStore.status.lastReloadAttemptAt).toISOString()
    }`,
);
console.log(
    `[agentchat-server] config reload status: ${
        configStore.status.lastReloadError ? "error" : "ok"
    }`,
);
if (configStore.status.lastReloadError) {
    console.log(
        `[agentchat-server] config reload error: ${configStore.status.lastReloadError}`,
    );
    process.exitCode = 1;
}
console.log(
    `[agentchat-server] runtime env: ${runtimeEnv.ok ? "ready" : "missing required values"}`,
);
console.log(
    `[agentchat-server] auth: ${
        diagnostics.auth.activeProviderKind ?? "unconfigured"
    } - ${formatIssues(diagnostics.auth.issues)}`,
);
for (const diagnostic of runtimeEnv.diagnostics) {
    console.log(
        `[env:${diagnostic.key}] ${diagnostic.configured ? "configured" : "missing"} - ${diagnostic.description}`,
    );
}
console.log(
    `[agentchat-server] providers ready: ${diagnostics.summary.readyProviderCount}/${diagnostics.summary.enabledProviderCount}`,
);
console.log(
    `[agentchat-server] agents ready: ${diagnostics.summary.readyAgentCount}/${diagnostics.summary.enabledAgentCount}`,
);

for (const provider of diagnostics.providers) {
    if (!provider.enabled) {
        continue;
    }

    const liveProbe = await modelCatalog.probeProviderModels(provider.id);
    console.log(
        `[provider:${provider.id}] ${provider.ready ? "ready" : "not ready"} - ${formatIssues(provider.issues)}`,
    );
    console.log(
        `[provider:${provider.id}] live ${
            liveProbe.ok
                ? `ok (${liveProbe.modelCount} models)`
                : `failed - ${liveProbe.error}`
        }`,
    );
    if (!liveProbe.ok) {
        process.exitCode = 1;
    }
}

for (const agent of diagnostics.agents) {
    if (!agent.enabled) {
        continue;
    }

    console.log(
        `[agent:${agent.id}] ${agent.ready ? "ready" : "not ready"} - ${formatIssues(agent.issues)}`,
    );
}

if (!diagnostics.ok) {
    process.exitCode = 1;
}

if (!runtimeEnv.ok) {
    process.exitCode = 1;
}
