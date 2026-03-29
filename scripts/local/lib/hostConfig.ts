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
import { isRecord, readJsonIfExists } from "./util.ts";

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
            defaultHost: "127.0.0.1",
        },
        stable: {
            defaultHost: "127.0.0.1",
            lanUrl: null,
            publicUrl: null,
            secondaryUrls: [],
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

    if (!isRecord(override)) {
        throw new Error(`Invalid host config at ${HOST_CONFIG_PATH}.`);
    }

    if (
        "stableCheckoutPath" in override &&
        override.stableCheckoutPath !== undefined &&
        typeof override.stableCheckoutPath !== "string"
    ) {
        throw new Error(
            `Invalid stableCheckoutPath in host config ${HOST_CONFIG_PATH}.`,
        );
    }
    if (
        "dev" in override &&
        override.dev !== undefined &&
        !isRecord(override.dev)
    ) {
        throw new Error(`Invalid dev config in ${HOST_CONFIG_PATH}.`);
    }
    if (
        "stable" in override &&
        override.stable !== undefined &&
        !isRecord(override.stable)
    ) {
        throw new Error(`Invalid stable config in ${HOST_CONFIG_PATH}.`);
    }
    for (const [label, value] of [
        ["dev.convexEnvPath", override.dev?.convexEnvPath],
        ["dev.defaultHost", override.dev?.defaultHost],
        ["stable.defaultHost", override.stable?.defaultHost],
        ["stable.lanUrl", override.stable?.lanUrl],
        ["stable.publicUrl", override.stable?.publicUrl],
        ["stable.webEnvPath", override.stable?.webEnvPath],
        ["stable.serverEnvPath", override.stable?.serverEnvPath],
        ["stable.convexEnvPath", override.stable?.convexEnvPath],
        ["stable.serverConfigPath", override.stable?.serverConfigPath],
    ] as const) {
        if (
            value !== undefined &&
            value !== null &&
            typeof value !== "string"
        ) {
            throw new Error(
                `Invalid ${label} in host config ${HOST_CONFIG_PATH}.`,
            );
        }
    }
    if (
        override.stable?.secondaryUrls !== undefined &&
        (!Array.isArray(override.stable.secondaryUrls) ||
            override.stable.secondaryUrls.some(
                (value) => typeof value !== "string",
            ))
    ) {
        throw new Error(
            `Invalid stable.secondaryUrls in host config ${HOST_CONFIG_PATH}.`,
        );
    }

    return {
        version: 1,
        stableCheckoutPath:
            override.stableCheckoutPath ?? defaults.stableCheckoutPath,
        dev: {
            convexEnvPath:
                override.dev?.convexEnvPath ?? defaults.dev.convexEnvPath,
            defaultHost: override.dev?.defaultHost ?? defaults.dev.defaultHost,
        },
        stable: {
            defaultHost:
                override.stable?.defaultHost ?? defaults.stable.defaultHost,
            lanUrl: override.stable?.lanUrl ?? defaults.stable.lanUrl,
            publicUrl: override.stable?.publicUrl ?? defaults.stable.publicUrl,
            secondaryUrls:
                override.stable?.secondaryUrls ?? defaults.stable.secondaryUrls,
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
