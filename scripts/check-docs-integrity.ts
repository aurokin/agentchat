import fs from "node:fs";
import path from "node:path";

import {
    extractBunRunCommands,
    extractMarkdownLinks,
    hasScript,
    listMarkdownFiles,
    resolveDocLinkTarget,
} from "./doc-integrity-helpers";

type MissingCommand = {
    docPath: string;
    raw: string;
    packageJsonPath: string;
    script: string;
};

type MissingLink = {
    docPath: string;
    raw: string;
    resolvedPath: string;
};

function toPosixPath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

function main(): void {
    const rootDir = process.cwd();
    const markdownFiles = listMarkdownFiles(rootDir);
    const missingCommands: MissingCommand[] = [];
    const missingLinks: MissingLink[] = [];

    for (const docPath of markdownFiles) {
        const docText = fs.readFileSync(docPath, "utf8");

        for (const command of extractBunRunCommands(docText)) {
            const packageJsonPath = path.join(
                rootDir,
                command.cwd ?? ".",
                "package.json",
            );
            if (!fs.existsSync(packageJsonPath)) {
                missingCommands.push({
                    docPath,
                    raw: command.raw,
                    packageJsonPath,
                    script: command.script,
                });
                continue;
            }

            if (!hasScript(fs.readFileSync(packageJsonPath, "utf8"), command.script)) {
                missingCommands.push({
                    docPath,
                    raw: command.raw,
                    packageJsonPath,
                    script: command.script,
                });
            }
        }

        for (const link of extractMarkdownLinks(docText)) {
            const resolvedPath = resolveDocLinkTarget({
                rootDir,
                docPath,
                target: link.target,
            });
            if (resolvedPath === null) {
                continue;
            }

            if (!fs.existsSync(resolvedPath)) {
                missingLinks.push({
                    docPath,
                    raw: link.raw,
                    resolvedPath,
                });
            }
        }
    }

    if (missingCommands.length === 0 && missingLinks.length === 0) {
        console.log(
            `docs integrity check passed (${markdownFiles.length} markdown files scanned)`,
        );
        return;
    }

    if (missingCommands.length > 0) {
        console.error("Missing documented Bun scripts:");
        for (const missing of missingCommands) {
            console.error(
                `- ${toPosixPath(path.relative(rootDir, missing.docPath))}: ${missing.raw} -> missing "${missing.script}" in ${toPosixPath(path.relative(rootDir, missing.packageJsonPath))}`,
            );
        }
        console.error("");
    }

    if (missingLinks.length > 0) {
        console.error("Missing documented file links:");
        for (const missing of missingLinks) {
            console.error(
                `- ${toPosixPath(path.relative(rootDir, missing.docPath))}: ${missing.raw} -> ${toPosixPath(path.relative(rootDir, missing.resolvedPath))}`,
            );
        }
        console.error("");
    }

    process.exit(1);
}

main();
