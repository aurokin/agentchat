"use client";

import type { AgentchatServerIssue } from "@/lib/server-issues";

type OperatorNoticeProps = {
    issue: AgentchatServerIssue;
    actionLabel?: string;
    onAction?: () => void;
    tone?: "error" | "warning";
};

export function OperatorNotice({
    issue,
    actionLabel,
    onAction,
    tone = "error",
}: OperatorNoticeProps) {
    const toneClasses =
        tone === "warning"
            ? "border-warning/40 bg-warning/8 text-warning"
            : "border-danger/40 bg-danger/8 text-danger";

    return (
        <div className={`border p-4 ${toneClasses}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-foreground">
                        {issue.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {issue.detail}
                    </p>
                </div>
                {actionLabel && onAction ? (
                    <button
                        type="button"
                        className="btn-deco btn-deco-secondary shrink-0"
                        onClick={onAction}
                    >
                        {actionLabel}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
