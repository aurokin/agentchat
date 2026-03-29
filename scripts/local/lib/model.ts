export type LaneType = "dev" | "stable";
export type ServiceName = "web" | "server";
export type ManagedServiceState = "running" | "stopped";

export type ConvexMode = "unconfigured" | "external-dev" | "production";

export type ManagedWebEnv = {
    host: string;
    nextPublicConvexUrl: string | null;
    nextAllowedDevOrigins: string | null;
};

export type ManagedServerEnv = {
    host: string;
    backendTokenSecret: string;
    agentchatConvexSiteUrl: string;
    runtimeIngressSecret: string;
};

export type HostConfig = {
    version: 1;
    stableCheckoutPath: string;
    dev: {
        convexEnvPath: string;
        defaultHost: string;
    };
    stable: {
        defaultHost: string;
        lanUrl: string | null;
        publicUrl: string | null;
        secondaryUrls: string[];
        webEnvPath: string;
        serverEnvPath: string;
        convexEnvPath: string;
        serverConfigPath: string;
    };
};

export type LocalManifest = {
    manifestVersion: 1;
    laneType: LaneType;
    laneId: string;
    checkoutPath: string;
    webPort: number;
    serverPort: number;
    webUrl: string;
    serverUrl: string;
    convexMode: ConvexMode;
    convexDeployment: string | null;
    convexCloudUrl: string | null;
    convexSiteUrl: string | null;
    xdgStateHome: string;
    sandboxRoot: string;
    stateId: string;
    logDir: string;
    managedEnv: {
        web: ManagedWebEnv;
        server: ManagedServerEnv;
    };
    serverConfig: Record<string, unknown>;
    generatedFiles: {
        webEnvPath: string;
        serverEnvPath: string;
        serverConfigPath: string;
    };
    updatedAt: string;
};

export type HostRegistry = {
    version: 1;
    stableCheckoutPath: string;
    stableConvexSiteUrl: string | null;
    stableConvexCloudUrl: string | null;
    updatedAt: string;
};

export type PortLease = {
    laneId: string;
    checkoutPath: string;
    service: ServiceName;
    port: number;
    updatedAt: string;
};

export type PortLeases = {
    version: 1;
    leases: PortLease[];
};

export type ManagedService = {
    laneId: string;
    laneType: LaneType;
    sessionId: string;
    service: ServiceName;
    checkoutPath: string;
    cwd: string;
    pid: number;
    pgid: number;
    command: string[];
    processStartToken?: string | null;
    logPath: string;
    ports: number[];
    state: ManagedServiceState;
    startedAt: string;
    updatedAt: string;
};

export type ProcessRegistry = {
    version: 1;
    services: ManagedService[];
};

export type DesiredGeneratedFiles = {
    webEnv: string;
    serverEnv: string;
    serverConfig: string;
};

export type BootstrapContext = {
    manifest: LocalManifest;
    generatedFiles: DesiredGeneratedFiles;
    registry: HostRegistry;
    leases: PortLeases;
};
