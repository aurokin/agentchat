import { buildDoctorReport, prepareBootstrapContext } from "./lib/bootstrap.ts";
import { loadLocalManifest } from "./lib/manifest.ts";

async function main(): Promise<void> {
    const asJson = process.argv.includes("--json");
    const manifest = loadLocalManifest();
    let context = null;
    let issue: string | null = null;

    if (manifest) {
        try {
            context = await prepareBootstrapContext();
        } catch (error) {
            issue =
                error instanceof Error
                    ? error.message
                    : "Local wrapper doctor failed.";
        }
    }

    const report = buildDoctorReport(context, issue);

    if (asJson) {
        console.log(JSON.stringify(report, null, 4));
    } else {
        console.log(
            report.ok
                ? "Local wrapper doctor: ok"
                : "Local wrapper doctor: issues found",
        );
        for (const check of report.checks) {
            console.log(
                `${check.ok ? "OK" : "FAIL"} ${check.label}: ${check.detail}`,
            );
        }
    }

    if (!report.ok) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Local wrapper doctor failed.",
    );
    process.exitCode = 1;
});
