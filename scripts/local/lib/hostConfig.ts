import {
    HOST_CONFIG_PATH,
    HOST_DEV_CONVEX_ENV_PATH,
    HOST_STABLE_CONVEX_ENV_PATH,
    HOST_STABLE_SERVER_CONFIG_PATH,
    HOST_STABLE_SERVER_ENV_PATH,
    HOST_STABLE_WEB_ENV_PATH,
    STABLE_CHECKOUT_PATH,
} from "./constants.ts";
import type { HostConfig } from "./model.ts";
import { readJsonIfExists } from "./util.ts";

type PartialHostConfig = Partial<HostConfig> & {
    dev?: Partial<HostConfig["dev"]>;
    stable?: Partial<HostConfig["stable"]>;
};

export function getDefaultHostConfig(): HostConfig {
    return {
        version: 1,
        stableCheckoutPath: STABLE_CHECKOUT_PATH,
        dev: {
            convexEnvPath: HOST_DEV_CONVEX_ENV_PATH,
        },
        stable: {
            webEnvPath: HOST_STABLE_WEB_ENV_PATH,
            serverEnvPath: HOST_STABLE_SERVER_ENV_PATH,
            convexEnvPath: HOST_STABLE_CONVEX_ENV_PATH,
            serverConfigPath: HOST_STABLE_SERVER_CONFIG_PATH,
        },
    };
}

export function loadHostConfig(): HostConfig {
    const defaults = getDefaultHostConfig();
    const override = readJsonIfExists<PartialHostConfig>(HOST_CONFIG_PATH);

    if (!override) {
        return defaults;
    }

    return {
        version: 1,
        stableCheckoutPath:
            override.stableCheckoutPath ?? defaults.stableCheckoutPath,
        dev: {
            convexEnvPath:
                override.dev?.convexEnvPath ?? defaults.dev.convexEnvPath,
        },
        stable: {
            webEnvPath:
                override.stable?.webEnvPath ?? defaults.stable.webEnvPath,
            serverEnvPath:
                override.stable?.serverEnvPath ?? defaults.stable.serverEnvPath,
            convexEnvPath:
                override.stable?.convexEnvPath ?? defaults.stable.convexEnvPath,
            serverConfigPath:
                override.stable?.serverConfigPath ??
                defaults.stable.serverConfigPath,
        },
    };
}
