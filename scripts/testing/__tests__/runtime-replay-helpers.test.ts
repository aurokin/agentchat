import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { AgentchatSocketEvent } from "../../../packages/shared/src/core/agentchat-socket";
import {
    analyzePersistedRunTimeline,
    analyzeSocketReplay,
    assertPersistedRunTimeline,
    type PersistedRunEvent,
} from "../runtime-replay-helpers";

const FIXTURES_DIR = path.join(
    import.meta.dir,
    "..",
    "fixtures",
    "runtime-replay",
);

function readJsonFixture<T>(name: string): T {
    return JSON.parse(
        fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"),
    ) as T;
}

describe("persisted runtime replay fixtures", () => {
    test("accepts the completed fixture", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-completed.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "completed",
            issues: [],
        });
    });

    test("accepts the interrupted fixture", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-interrupted.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "interrupted",
            issues: [],
        });
    });

    test("accepts the multi-message fixture", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-multi-message.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "completed",
            issues: [],
        });
    });

    test("treats delayed terminal persistence as pending when allowed", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
            allowPendingTerminal: boolean;
        }>("persisted-pending.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "pending",
            issues: [],
        });
    });

    test("rejects duplicate sequence fixtures", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-duplicate-sequence.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }).issues.map((issue) => issue.code),
        ).toEqual(
            expect.arrayContaining([
                "persisted_run_events_duplicate_sequence",
                "persisted_run_events_out_of_order",
            ]),
        );
    });

    test("rejects out-of-order sequence fixtures", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-out-of-order.json");

        expect(() =>
            assertPersistedRunTimeline({
                ...fixture,
            }),
        ).toThrow("ascending sequence order");
    });

    test("accepts failed persistence fixtures", () => {
        const fixture = readJsonFixture<{
            events: PersistedRunEvent[];
            initialAssistantMessageId: string;
            finalAssistantMessageId: string;
            finalStatus: "completed" | "interrupted" | "failed";
            finalContent: string;
            sawDelta: boolean;
        }>("persisted-failed.json");

        expect(
            analyzePersistedRunTimeline({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "failed",
            issues: [],
        });
    });
});

describe("socket runtime replay fixtures", () => {
    test("accepts active replay fixtures for resume coverage", () => {
        const fixture = readJsonFixture<{
            events: AgentchatSocketEvent[];
            allowActiveReplay: boolean;
        }>("socket-active-replay.json");

        expect(
            analyzeSocketReplay({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "active",
            messageIds: ["assistant-1"],
            issues: [],
        });
    });

    test("accepts interrupted replay fixtures", () => {
        const fixture = readJsonFixture<{
            events: AgentchatSocketEvent[];
        }>("socket-interrupted.json");

        expect(
            analyzeSocketReplay({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "interrupted",
            messageIds: ["assistant-1"],
            issues: [],
        });
    });

    test("accepts multi-message replay fixtures", () => {
        const fixture = readJsonFixture<{
            events: AgentchatSocketEvent[];
        }>("socket-multi-message.json");

        expect(
            analyzeSocketReplay({
                ...fixture,
            }),
        ).toEqual({
            ok: true,
            terminalStatus: "completed",
            messageIds: ["assistant-status-1", "assistant-final-1"],
            issues: [],
        });
    });

    test("rejects invalid replay ordering", () => {
        const fixture = readJsonFixture<{
            events: AgentchatSocketEvent[];
        }>("socket-delta-before-start.json");

        expect(
            analyzeSocketReplay({
                ...fixture,
            }).issues.map((issue) => issue.code),
        ).toEqual(
            expect.arrayContaining([
                "socket_replay_delta_before_message_started",
            ]),
        );
    });

    test("rejects multi-message replay fixtures without previous-message links", () => {
        const fixture = readJsonFixture<{
            events: AgentchatSocketEvent[];
        }>("socket-multi-message-missing-previous-link.json");

        expect(
            analyzeSocketReplay({
                ...fixture,
            }).issues.map((issue) => issue.code),
        ).toEqual(
            expect.arrayContaining([
                "socket_replay_missing_previous_message_link",
            ]),
        );
    });
});
