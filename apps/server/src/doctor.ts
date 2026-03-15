import { ConfigStore } from "./config.ts";
import { CodexModelCatalog } from "./codexModelCatalog.ts";
import { getConfigDiagnostics } from "./configDiagnostics.ts";
import {
    buildDoctorReport,
    formatDoctorText,
    getDoctorExitCode,
} from "./doctorReport.ts";
import { getRuntimeEnvDiagnostics } from "./envDiagnostics.ts";

const configStore = new ConfigStore();
const diagnostics = getConfigDiagnostics(configStore.snapshot);
const runtimeEnv = getRuntimeEnvDiagnostics();
const modelCatalog = new CodexModelCatalog({
    getConfig: () => configStore.snapshot,
});
const jsonMode = process.argv.includes("--json");
const liveProbes = new Map();

for (const provider of diagnostics.providers) {
    if (!provider.enabled) {
        continue;
    }

    const liveProbe = await modelCatalog.probeProviderModels(provider.id);
    liveProbes.set(provider.id, {
        ok: liveProbe.ok,
        modelCount: liveProbe.ok ? liveProbe.modelCount : null,
        error: liveProbe.ok ? null : liveProbe.error,
    });
}

const report = buildDoctorReport({
    configPath: configStore.path,
    configStatus: configStore.status,
    diagnostics,
    runtimeEnv,
    liveProbes,
});

if (jsonMode) {
    console.log(JSON.stringify(report, null, 4));
} else {
    process.stdout.write(formatDoctorText(report));
}

process.exitCode = getDoctorExitCode(report);
