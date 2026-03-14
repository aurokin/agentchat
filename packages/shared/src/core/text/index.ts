export function trimTrailingEmptyLines(
    value: string | undefined,
): string | undefined {
    if (value === undefined) return value;
    const lines = value.split(/\r?\n/);
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === "") {
        end -= 1;
    }
    if (end === lines.length) return value;
    return lines.slice(0, end).join("\n");
}

const DISPLAY_SECTION_TITLES = [
    "Report",
    "Structure",
    "Assessment",
    "Summary",
    "Overview",
    "Findings",
    "Notable details",
    "What it appears to be for",
];

function normalizeDisplayTextSegment(segment: string): string {
    let normalized = segment;

    // Fix missing whitespace between completed sentences and the next sentence.
    normalized = normalized.replace(/([.!?])([A-Z])/g, "$1 $2");

    // If prose runs directly into the start of a markdown list, force a paragraph break.
    normalized = normalized.replace(
        /([.!?])(?=(?:\d+\.\s+|[-*]\s+))/g,
        "$1\n\n",
    );

    // Prefer explicit paragraph breaks before common report-style section titles.
    const sectionPattern = DISPLAY_SECTION_TITLES.map((title) =>
        title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|");
    normalized = normalized.replace(
        new RegExp(`([.!?]) (${sectionPattern})\\b`, "g"),
        "$1\n\n$2",
    );

    // If markdown list blocks start immediately after prose, give them a full paragraph break.
    const lines = normalized.split("\n");
    const withListBreaks: string[] = [];
    for (const line of lines) {
        const isListItem = /^\s*(?:[-*]\s+|\d+\.\s+)/.test(line);
        const previousLine = withListBreaks.at(-1) ?? "";
        const previousTrimmed = previousLine.trim();
        const previousWasListItem = /^\s*(?:[-*]\s+|\d+\.\s+)/.test(
            previousLine,
        );

        if (isListItem && previousTrimmed.length > 0 && !previousWasListItem) {
            withListBreaks.push("");
        }

        withListBreaks.push(line);
    }
    normalized = withListBreaks.join("\n");

    return normalized;
}

export function normalizeAssistantDisplayText(
    value: string | undefined,
): string | undefined {
    if (value === undefined) {
        return value;
    }

    const segments = value.split(/(```[\s\S]*?```)/g);
    const normalized = segments
        .map((segment, index) =>
            index % 2 === 1 ? segment : normalizeDisplayTextSegment(segment),
        )
        .join("");

    return normalized.replace(
        /(```[\s\S]*?```)\n(\s*(?:[-*]\s+|\d+\.\s+))/g,
        "$1\n\n$2",
    );
}
