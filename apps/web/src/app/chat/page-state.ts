export function shouldShowInitialChatLoader(params: {
    isAuthLoading: boolean;
    loadingAgents: boolean;
    hasBootstrap: boolean;
    hasAuthenticatedBootstrap: boolean;
    hasAccess: boolean;
    hasBootstrapIssue: boolean;
    hasRenderedAuthenticatedShell: boolean;
}): boolean {
    if (params.hasRenderedAuthenticatedShell) {
        return false;
    }

    if (params.isAuthLoading) {
        return true;
    }

    if (!params.hasBootstrap) {
        return (
            params.loadingAgents ||
            (params.hasAccess && !params.hasBootstrapIssue)
        );
    }

    if (
        params.hasAccess &&
        !params.hasAuthenticatedBootstrap &&
        !params.hasBootstrapIssue
    ) {
        return true;
    }

    return false;
}

export function canMarkAuthenticatedShellRendered(params: {
    hasAccess: boolean;
    hasAuthenticatedBootstrap: boolean;
    hasBootstrapIssue: boolean;
    showInitialLoader: boolean;
}): boolean {
    return (
        params.hasAccess &&
        params.hasAuthenticatedBootstrap &&
        !params.hasBootstrapIssue &&
        !params.showInitialLoader
    );
}

export function shouldRenderAuthenticatedShell(params: {
    hasAccess: boolean;
    hasRenderedAuthenticatedShell: boolean;
    isAuthLoading: boolean;
}): boolean {
    return (
        params.hasAccess ||
        (params.hasRenderedAuthenticatedShell && params.isAuthLoading)
    );
}

export function shouldResetAuthenticatedShellRendered(params: {
    hasAccess: boolean;
    hasRenderedAuthenticatedShell: boolean;
    isAuthLoading: boolean;
}): boolean {
    return (
        params.hasRenderedAuthenticatedShell &&
        !params.hasAccess &&
        !params.isAuthLoading
    );
}

export function shouldShowFullPageBootstrapIssue(params: {
    hasBootstrapIssue: boolean;
    hasRenderedAuthenticatedShell: boolean;
}): boolean {
    return params.hasBootstrapIssue && !params.hasRenderedAuthenticatedShell;
}
