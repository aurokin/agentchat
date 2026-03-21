import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const AGENTCHAT_STATE_DIRECTORY_NAME = ".agentchat-state";

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

export function resolveDefaultStateId(configPath: string): string {
    return sanitizeStateFileComponent(path.basename(path.resolve(configPath)));
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
