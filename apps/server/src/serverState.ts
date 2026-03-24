import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

const AGENTCHAT_STATE_DIRECTORY_NAME = ".agentchat-state";
const DEFAULT_INSTANCE_RUNTIME_KEY = `${process.pid}:${randomUUID()}`;

export function getDefaultAgentchatStateBasePath(): string {
    const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
    if (xdgStateHome) {
        return path.join(xdgStateHome, "agentchat");
    }

    return path.join(os.homedir(), ".local", "state", "agentchat");
}

export function sanitizeStateFileComponent(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getStableStateKey(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function resolveDefaultStateId(
    configPath: string,
    seed?: string,
): string {
    const basename = sanitizeStateFileComponent(
        path.basename(path.resolve(configPath)),
    );
    if (!seed) {
        return basename;
    }

    return `${basename}-${getStableStateKey(seed)}`;
}

export function resolveDefaultInstanceKey(
    seed: string,
    runtimeKey = DEFAULT_INSTANCE_RUNTIME_KEY,
): string {
    return `instance-${getStableStateKey(`${seed}:${runtimeKey}`)}`;
}

export function getServerStateScopeKey(stateId: string): string {
    return `${sanitizeStateFileComponent(stateId)}-${getStableStateKey(stateId)}`;
}

export function getScopedAgentchatStateDirectory(params: {
    category: string;
    stateId: string;
}): string {
    return path.join(
        getDefaultAgentchatStateBasePath(),
        AGENTCHAT_STATE_DIRECTORY_NAME,
        params.category,
        getServerStateScopeKey(params.stateId),
    );
}
