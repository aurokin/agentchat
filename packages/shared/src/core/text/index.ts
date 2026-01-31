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
