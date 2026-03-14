type EnvCase = {
    key: "BACKEND_TOKEN_SECRET" | "AGENTCHAT_CONVEX_SITE_URL" | "RUNTIME_INGRESS_SECRET";
};

const REQUIRED_CASES: EnvCase[] = [
    { key: "BACKEND_TOKEN_SECRET" },
    { key: "AGENTCHAT_CONVEX_SITE_URL" },
    { key: "RUNTIME_INGRESS_SECRET" },
];

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

async function runDoctorWithout(key: EnvCase["key"]): Promise<string> {
    const originalValue = process.env[key];
    delete process.env[key];

    try {
        const { getRuntimeEnvDiagnostics } = await import(
            "../../apps/server/src/envDiagnostics.ts"
        );
        const diagnostics = getRuntimeEnvDiagnostics();
        invariant(
            diagnostics.ok === false,
            `Expected runtime env diagnostics to fail when ${key} is missing.`,
        );
        const diagnostic = diagnostics.diagnostics.find(
            (entry) => entry.key === key,
        );
        invariant(diagnostic, `Missing diagnostic entry for ${key}.`);
        invariant(
            diagnostic.configured === false,
            `Expected diagnostic ${key} to be marked missing.`,
        );

        return JSON.stringify(diagnostics);
    } finally {
        if (originalValue === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalValue;
        }
    }
}

async function main() {
    const results = [];
    for (const testCase of REQUIRED_CASES) {
        results.push({
            key: testCase.key,
            outputPreview: (await runDoctorWithout(testCase.key)).slice(
                0,
                240,
            ),
        });
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                checks: results,
            },
            null,
            2,
        ),
    );
}

await main();
