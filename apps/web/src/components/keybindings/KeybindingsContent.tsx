"use client";

import type { ReactNode } from "react";
import {
    ArrowDown,
    ArrowUp,
    Brain,
    Cpu,
    History,
    Keyboard,
    Mail,
    Search,
    Settings,
    Sparkles,
    Trash2,
    type LucideIcon,
} from "lucide-react";

export interface KeybindingItem {
    id: string;
    label: string;
    keys: string[];
    icon?: LucideIcon;
}

const GLOBAL_KEYBINDINGS: KeybindingItem[] = [
    {
        id: "newConversation",
        label: "New conversation",
        keys: ["Cmd/Ctrl", "Shift", "O"],
        icon: Mail,
    },
    {
        id: "deleteConversation",
        label: "Delete conversation",
        keys: ["Cmd/Ctrl", "Shift", "D"],
        icon: Trash2,
    },
    {
        id: "previousConversation",
        label: "Previous conversation",
        keys: ["Cmd/Ctrl", "↑"],
        icon: ArrowUp,
    },
    {
        id: "nextConversation",
        label: "Next conversation",
        keys: ["Cmd/Ctrl", "↓"],
        icon: ArrowDown,
    },
    {
        id: "latestConversation",
        label: "Latest conversation",
        keys: ["Cmd/Ctrl", "←"],
        icon: History,
    },
];

const CHAT_KEYBINDINGS: KeybindingItem[] = [
    {
        id: "focusInput",
        label: "Focus input",
        keys: ["/"],
        icon: Keyboard,
    },
    {
        id: "newLine",
        label: "New line",
        keys: ["Shift+Enter", "Ctrl+J"],
        icon: Keyboard,
    },
    {
        id: "toggleSettings",
        label: "Toggle settings",
        keys: ["Cmd/Ctrl", ","],
        icon: Settings,
    },
    {
        id: "cycleFavoriteModels",
        label: "Cycle favorite models",
        keys: ["Cmd/Ctrl", "Alt", "M"],
        icon: Cpu,
    },
    {
        id: "cycleSkills",
        label: "Cycle skills",
        keys: ["Cmd/Ctrl", "Alt", "S"],
        icon: Sparkles,
    },
    {
        id: "clearSkill",
        label: "Clear skill (None)",
        keys: ["Cmd/Ctrl", "Alt", "N"],
        icon: Sparkles,
    },
    {
        id: "thinkingLevel",
        label: "Thinking level",
        keys: ["Cmd/Ctrl", "Alt", "1-5"],
        icon: Brain,
    },
    {
        id: "thinkingOff",
        label: "Thinking off",
        keys: ["Cmd/Ctrl", "Alt", "Backspace"],
        icon: Brain,
    },
    {
        id: "searchLevel",
        label: "Search level",
        keys: ["Cmd/Ctrl", "Shift", "1-3"],
        icon: Search,
    },
    {
        id: "searchOff",
        label: "Search off",
        keys: ["Cmd/Ctrl", "Shift", "Backspace"],
        icon: Search,
    },
];

const HIGHLIGHT_IDS = new Set([
    "cycleFavoriteModels",
    "cycleSkills",
    "clearSkill",
    "thinkingLevel",
    "searchLevel",
]);

export const KEYBINDING_HIGHLIGHTS = CHAT_KEYBINDINGS.filter((item) =>
    HIGHLIGHT_IDS.has(item.id),
);

export const KeyCaps = ({ children }: { children: ReactNode }) => (
    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 text-[11px] uppercase tracking-widest border border-border bg-background-elevated text-muted-foreground">
        {children}
    </span>
);

const KeybindingRow = ({ label, keys, icon: Icon }: KeybindingItem) => (
    <div className="flex items-center justify-between gap-3">
        <span className="text-sm flex items-center gap-2">
            {Icon && <Icon size={12} className="text-muted-foreground" />}
            {label}
        </span>
        <div className="flex items-center gap-1">
            {keys.map((key) => (
                <KeyCaps key={`${label}-${key}`}>{key}</KeyCaps>
            ))}
        </div>
    </div>
);

export function KeybindingsContent() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
                Shortcuts follow scope rules: modals and dropdowns take
                priority, then global bindings, then chat-only actions.
            </p>
            <div className="space-y-4">
                <div className="border border-border bg-muted/20 p-4 space-y-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Global
                    </div>
                    <div className="space-y-2">
                        {GLOBAL_KEYBINDINGS.map((binding) => (
                            <KeybindingRow key={binding.id} {...binding} />
                        ))}
                    </div>
                </div>
                <div className="border border-border bg-muted/20 p-4 space-y-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        Chat
                    </div>
                    <div className="space-y-2">
                        {CHAT_KEYBINDINGS.map((binding) => (
                            <KeybindingRow key={binding.id} {...binding} />
                        ))}
                    </div>
                </div>
            </div>
            <div className="text-xs text-muted-foreground/80 border border-border bg-background-elevated px-3 py-2">
                Dropdowns and modals temporarily override shortcuts so
                navigation stays predictable.
            </div>
        </div>
    );
}
