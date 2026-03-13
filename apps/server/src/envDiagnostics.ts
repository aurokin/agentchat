export type RuntimeEnvDiagnostic = {
    key:
        | "BACKEND_TOKEN_SECRET"
        | "AGENTCHAT_CONVEX_SITE_URL"
        | "RUNTIME_INGRESS_SECRET";
    configured: boolean;
    description: string;
};

export type RuntimeEnvSummary = {
    ok: boolean;
    diagnostics: RuntimeEnvDiagnostic[];
};

function isConfigured(value: string | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

export function getRuntimeEnvDiagnostics(
    env: NodeJS.ProcessEnv = process.env,
): RuntimeEnvSummary {
    const diagnostics: RuntimeEnvDiagnostic[] = [
        {
            key: "BACKEND_TOKEN_SECRET",
            configured: isConfigured(env.BACKEND_TOKEN_SECRET),
            description:
                "Shared secret used by Convex and apps/server for backend websocket session tokens.",
        },
        {
            key: "AGENTCHAT_CONVEX_SITE_URL",
            configured: isConfigured(env.AGENTCHAT_CONVEX_SITE_URL),
            description:
                "Convex site URL used by apps/server runtime persistence ingress.",
        },
        {
            key: "RUNTIME_INGRESS_SECRET",
            configured: isConfigured(env.RUNTIME_INGRESS_SECRET),
            description:
                "Shared secret used by apps/server runtime persistence ingress.",
        },
    ];

    return {
        ok: diagnostics.every((diagnostic) => diagnostic.configured),
        diagnostics,
    };
}
