"use client";

import { Cloud, CloudOff } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";

/**
 * Workspace Status Badge
 *
 * Shows the current Convex workspace status in the sidebar.
 */
export function WorkspaceStatusBadge() {
    const { workspaceStatus, isConvexAvailable } = useWorkspace();

    if (!isConvexAvailable) {
        return null;
    }

    const getBadgeConfig = () => {
        switch (workspaceStatus) {
            case "ready":
                return {
                    icon: <Cloud size={12} />,
                    label: "Convex Connected",
                    className: "text-success bg-success/10",
                };
            case "unavailable":
            default:
                return {
                    icon: <CloudOff size={12} />,
                    label: "Sign In Required",
                    className: "text-muted-foreground bg-muted",
                };
        }
    };

    const config = getBadgeConfig();

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                config.className,
            )}
        >
            {config.icon}
            <span>{config.label}</span>
        </div>
    );
}
