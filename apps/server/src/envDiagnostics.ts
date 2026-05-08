export type RuntimeEnvDiagnostic = {
    key: "BACKEND_TOKEN_SECRET" | "CONVEX_URL" | "RUNTIME_INGRESS_SECRET";
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
            key: "CONVEX_URL",
            configured: isConfigured(env.CONVEX_URL),
            description:
                "Convex deployment URL; apps/server derives the runtime persistence ingress site URL from it.",
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
