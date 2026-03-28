import os from "node:os";
import path from "node:path";

export const STABLE_CHECKOUT_PATH = "/home/auro/code/agentchat/stable";

export const HOST_CONFIG_ROOT = path.join(os.homedir(), ".config", "agentchat");
export const HOST_CONFIG_PATH = path.join(HOST_CONFIG_ROOT, "config.json");
export const HOST_DEV_ROOT = path.join(HOST_CONFIG_ROOT, "dev");
export const HOST_STABLE_ROOT = path.join(HOST_CONFIG_ROOT, "stable");
export const HOST_DEV_CONVEX_ENV_PATH = path.join(HOST_DEV_ROOT, "convex.env");
export const HOST_STABLE_WEB_ENV_PATH = path.join(HOST_STABLE_ROOT, "web.env");
export const HOST_STABLE_SERVER_ENV_PATH = path.join(
    HOST_STABLE_ROOT,
    "server.env",
);
export const HOST_STABLE_CONVEX_ENV_PATH = path.join(
    HOST_STABLE_ROOT,
    "convex.env",
);
export const HOST_STABLE_SERVER_CONFIG_PATH = path.join(
    HOST_STABLE_ROOT,
    "server-config.json",
);

export const HOST_REGISTRY_ROOT = path.join(
    os.homedir(),
    ".local",
    "state",
    "agentchat",
    "local-host",
);
export const HOST_REGISTRY_PATH = path.join(
    HOST_REGISTRY_ROOT,
    "registry.json",
);
export const HOST_PORT_LEASES_PATH = path.join(
    HOST_REGISTRY_ROOT,
    "port-leases.json",
);
export const HOST_PROCESS_REGISTRY_PATH = path.join(
    HOST_REGISTRY_ROOT,
    "process-registry.json",
);

export const LOCAL_STATE_DIR = path.join(".agentchat", "local");
export const LOCAL_MANIFEST_PATH = path.join(LOCAL_STATE_DIR, "manifest.json");

export const DEFAULT_STABLE_WEB_PORT = 4040;
export const DEFAULT_STABLE_SERVER_PORT = 3030;
export const DEFAULT_DEV_WEB_PORT = 4041;
export const DEFAULT_DEV_SERVER_PORT = 3031;
export const DEV_PORT_SPAN = 200;
