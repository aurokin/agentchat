import type { ConfigStoreStatus } from "./config.ts";
import type { ConfigDiagnostics } from "./configDiagnostics.ts";
import type { RuntimeEnvSummary } from "./envDiagnostics.ts";

type ProviderLiveProbe = {
    ok: boolean;
    modelCount: number | null;
    error: string | null;
};

export type DoctorIssue = {
    code: string;
    severity: "error" | "warning";
    scope: string;
    message: string;
    remediation: string | null;
};

export type DoctorReport = {
    config: {
        path: string;
        loadedAt: string;
        lastReloadAttemptAt: string | null;
        reloadStatus: "ok" | "error";
        reloadError: string | null;
    };
    runtimeEnv: RuntimeEnvSummary;
    auth: ConfigDiagnostics["auth"];
    summary: ConfigDiagnostics["summary"];
    issues: DoctorIssue[];
    providers: Array<
        ConfigDiagnostics["providers"][number] & {
            liveProbe: ProviderLiveProbe | null;
        }
    >;
    agents: ConfigDiagnostics["agents"];
};

function formatIssues(issues: string[]): string {
    if (issues.length === 0) {
        return "ok";
    }

    return issues.join(" | ");
}

function createIssue(params: {
    code: string;
    severity: DoctorIssue["severity"];
    scope: string;
    message: string;
    remediation: string | null;
}): DoctorIssue {
    return {
        code: params.code,
        severity: params.severity,
        scope: params.scope,
        message: params.message,
        remediation: params.remediation,
    };
}

function mapProviderIssue(providerId: string, issue: string): DoctorIssue {
    if (issue === "Enabled provider has no enabled models.") {
        return createIssue({
            code: "provider_no_enabled_models",
            severity: "error",
            scope: `provider:${providerId}`,
            message: issue,
            remediation:
                "Enable at least one model for the provider in agentchat.config.json.",
        });
    }
    if (
        issue === "Configured codex.cwd does not exist or is not a directory."
    ) {
        return createIssue({
            code: "provider_codex_cwd_missing",
            severity: "error",
            scope: `provider:${providerId}`,
            message: issue,
            remediation:
                "Update provider.codex.cwd to an existing workspace path.",
        });
    }
    if (issue === "Configured Codex command path does not exist.") {
        return createIssue({
            code: "provider_codex_command_missing",
            severity: "error",
            scope: `provider:${providerId}`,
            message: issue,
            remediation:
                "Update provider.codex.command to an installed executable or rely on PATH resolution.",
        });
    }

    return createIssue({
        code: "provider_issue",
        severity: "error",
        scope: `provider:${providerId}`,
        message: issue,
        remediation: null,
    });
}

function mapAgentIssue(agentId: string, issue: string): DoctorIssue {
    if (issue === "Agent rootPath does not exist or is not a directory.") {
        return createIssue({
            code: "agent_root_path_missing",
            severity: "error",
            scope: `agent:${agentId}`,
            message: issue,
            remediation:
                "Update agent.rootPath to an existing workspace directory.",
        });
    }
    if (issue === "Agent has no enabled providers.") {
        return createIssue({
            code: "agent_no_enabled_providers",
            severity: "error",
            scope: `agent:${agentId}`,
            message: issue,
            remediation: "Assign at least one enabled provider to the agent.",
        });
    }
    if (
        issue === "Agent default provider is disabled; fallback will be used."
    ) {
        return createIssue({
            code: "agent_default_provider_fallback",
            severity: "warning",
            scope: `agent:${agentId}`,
            message: issue,
            remediation:
                "Point the agent default provider at an enabled provider to avoid implicit fallback.",
        });
    }
    if (
        issue === "Agent default model is unavailable; fallback will be used."
    ) {
        return createIssue({
            code: "agent_default_model_fallback",
            severity: "warning",
            scope: `agent:${agentId}`,
            message: issue,
            remediation:
                "Update the agent default model or its allowlist to match an enabled model.",
        });
    }
    if (
        issue === "Agent default variant is unavailable; fallback will be used."
    ) {
        return createIssue({
            code: "agent_default_variant_fallback",
            severity: "warning",
            scope: `agent:${agentId}`,
            message: issue,
            remediation:
                "Update the agent default variant or variant allowlist to match an enabled variant.",
        });
    }

    return createIssue({
        code: "agent_issue",
        severity: "error",
        scope: `agent:${agentId}`,
        message: issue,
        remediation: null,
    });
}

function mapAuthIssue(issue: string): DoctorIssue {
    if (issue === "No enabled auth providers are configured.") {
        return createIssue({
            code: "auth_no_enabled_providers",
            severity: "error",
            scope: "auth",
            message: issue,
            remediation:
                "Enable at least one auth provider and point auth.defaultProviderId at it.",
        });
    }
    if (
        issue ===
        "Configured default auth provider is disabled; fallback will be used."
    ) {
        return createIssue({
            code: "auth_default_provider_fallback",
            severity: "warning",
            scope: "auth",
            message: issue,
            remediation:
                "Enable the configured auth default provider or update auth.defaultProviderId to the intended enabled provider.",
        });
    }
    if (
        issue ===
        "Configured default auth provider is missing; fallback will be used."
    ) {
        return createIssue({
            code: "auth_default_provider_missing",
            severity: "warning",
            scope: "auth",
            message: issue,
            remediation:
                "Update auth.defaultProviderId to an existing enabled auth provider.",
        });
    }

    return createIssue({
        code: "auth_issue",
        severity: "error",
        scope: "auth",
        message: issue,
        remediation: null,
    });
}

export function buildDoctorIssues(params: {
    configStatus: ConfigStoreStatus;
    diagnostics: ConfigDiagnostics;
    runtimeEnv: RuntimeEnvSummary;
    liveProbes: Map<string, ProviderLiveProbe>;
}): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    if (params.configStatus.lastReloadError) {
        issues.push(
            createIssue({
                code: "config_reload_failed",
                severity: "error",
                scope: "config",
                message: params.configStatus.lastReloadError,
                remediation:
                    "Fix agentchat.config.json and trigger another config reload attempt.",
            }),
        );
    }

    for (const diagnostic of params.runtimeEnv.diagnostics) {
        if (diagnostic.configured) {
            continue;
        }

        issues.push(
            createIssue({
                code: `runtime_env_missing_${diagnostic.key.toLowerCase()}`,
                severity: "error",
                scope: `runtimeEnv:${diagnostic.key}`,
                message: `${diagnostic.key} is missing.`,
                remediation: diagnostic.description,
            }),
        );
    }

    for (const issue of params.diagnostics.auth.issues) {
        issues.push(mapAuthIssue(issue));
    }

    for (const provider of params.diagnostics.providers) {
        if (!provider.enabled) {
            continue;
        }

        for (const issue of provider.issues) {
            issues.push(mapProviderIssue(provider.id, issue));
        }

        const liveProbe = params.liveProbes.get(provider.id);
        if (liveProbe?.ok === false) {
            issues.push(
                createIssue({
                    code: "provider_live_probe_failed",
                    severity: "error",
                    scope: `provider:${provider.id}`,
                    message: liveProbe.error ?? "Provider live probe failed.",
                    remediation:
                        "Verify Codex CLI access and provider runtime credentials in the server environment.",
                }),
            );
        }
    }

    for (const agent of params.diagnostics.agents) {
        if (!agent.enabled) {
            continue;
        }

        for (const issue of agent.issues) {
            issues.push(mapAgentIssue(agent.id, issue));
        }
    }

    return issues;
}

export function buildDoctorReport(params: {
    configPath: string;
    configStatus: ConfigStoreStatus;
    diagnostics: ConfigDiagnostics;
    runtimeEnv: RuntimeEnvSummary;
    liveProbes: Map<string, ProviderLiveProbe>;
}): DoctorReport {
    return {
        config: {
            path: params.configPath,
            loadedAt: new Date(params.configStatus.loadedAt).toISOString(),
            lastReloadAttemptAt:
                params.configStatus.lastReloadAttemptAt === null
                    ? null
                    : new Date(
                          params.configStatus.lastReloadAttemptAt,
                      ).toISOString(),
            reloadStatus: params.configStatus.lastReloadError ? "error" : "ok",
            reloadError: params.configStatus.lastReloadError,
        },
        runtimeEnv: params.runtimeEnv,
        auth: params.diagnostics.auth,
        summary: params.diagnostics.summary,
        issues: buildDoctorIssues({
            configStatus: params.configStatus,
            diagnostics: params.diagnostics,
            runtimeEnv: params.runtimeEnv,
            liveProbes: params.liveProbes,
        }),
        providers: params.diagnostics.providers
            .filter((provider) => provider.enabled)
            .map((provider) => ({
                ...provider,
                liveProbe: params.liveProbes.get(provider.id) ?? null,
            })),
        agents: params.diagnostics.agents.filter((agent) => agent.enabled),
    };
}

export function formatDoctorText(report: DoctorReport): string {
    const lines = [
        `[agentchat-server] config: ${report.config.path}`,
        `[agentchat-server] config loaded at: ${report.config.loadedAt}`,
        `[agentchat-server] config last reload attempt: ${
            report.config.lastReloadAttemptAt ?? "none"
        }`,
        `[agentchat-server] config reload status: ${report.config.reloadStatus}`,
    ];

    if (report.config.reloadError) {
        lines.push(
            `[agentchat-server] config reload error: ${report.config.reloadError}`,
        );
    }

    lines.push(
        `[agentchat-server] runtime env: ${
            report.runtimeEnv.ok ? "ready" : "missing required values"
        }`,
    );
    lines.push(
        `[agentchat-server] auth: ${
            report.auth.activeProviderKind ?? "unconfigured"
        } - ${formatIssues(report.auth.issues)}`,
    );

    for (const diagnostic of report.runtimeEnv.diagnostics) {
        lines.push(
            `[env:${diagnostic.key}] ${
                diagnostic.configured ? "configured" : "missing"
            } - ${diagnostic.description}`,
        );
    }

    lines.push(
        `[agentchat-server] providers ready: ${report.summary.readyProviderCount}/${report.summary.enabledProviderCount}`,
    );
    lines.push(
        `[agentchat-server] agents ready: ${report.summary.readyAgentCount}/${report.summary.enabledAgentCount}`,
    );

    for (const provider of report.providers) {
        lines.push(
            `[provider:${provider.id}] ${provider.ready ? "ready" : "not ready"} - ${formatIssues(provider.issues)}`,
        );
        if (provider.liveProbe) {
            lines.push(
                `[provider:${provider.id}] live ${
                    provider.liveProbe.ok
                        ? `ok (${provider.liveProbe.modelCount} models)`
                        : `failed - ${provider.liveProbe.error}`
                }`,
            );
        }
    }

    for (const agent of report.agents) {
        lines.push(
            `[agent:${agent.id}] ${agent.ready ? "ready" : "not ready"} - ${formatIssues(agent.issues)}`,
        );
    }

    return `${lines.join("\n")}\n`;
}

export function getDoctorExitCode(report: DoctorReport): number {
    if (report.config.reloadError) {
        return 1;
    }
    if (!report.runtimeEnv.ok) {
        return 1;
    }
    if (report.auth.issues.length > 0) {
        return 1;
    }
    if (report.providers.some((provider) => !provider.ready)) {
        return 1;
    }
    if (report.providers.some((provider) => provider.liveProbe?.ok === false)) {
        return 1;
    }
    if (report.agents.some((agent) => !agent.ready)) {
        return 1;
    }
    return 0;
}
