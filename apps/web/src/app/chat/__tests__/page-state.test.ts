import { describe, expect, test } from "bun:test";

import {
    canMarkAuthenticatedShellRendered,
    shouldRenderAuthenticatedShell,
    shouldResetAuthenticatedShellRendered,
    shouldShowFullPageBootstrapIssue,
    shouldShowInitialChatLoader,
} from "../page-state";

describe("chat page state", () => {
    test("shows the full-page loader before the first bootstrap resolves", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: true,
                hasBootstrap: false,
                hasAuthenticatedBootstrap: false,
                hasAccess: false,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("keeps the chat shell mounted during background bootstrap refreshes", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: true,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: true,
                hasAccess: true,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: true,
            }),
        ).toBe(false);
    });

    test("shows the full-page loader before bootstrap when auth is loading", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: true,
                loadingAgents: false,
                hasBootstrap: false,
                hasAuthenticatedBootstrap: false,
                hasAccess: false,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("keeps the full-page loader during cold auth loading after bootstrap", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: true,
                loadingAgents: false,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: false,
                hasAccess: false,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("keeps the chat shell mounted during background auth refreshes", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: true,
                loadingAgents: false,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: true,
                hasAccess: false,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: true,
            }),
        ).toBe(false);
    });

    test("keeps the loader up for cold signed-in loads until authenticated bootstrap succeeds", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: true,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: false,
                hasAccess: true,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("keeps signed-in cold loads in the loader between anonymous and authenticated bootstrap", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: false,
                hasBootstrap: false,
                hasAuthenticatedBootstrap: false,
                hasAccess: true,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("shows authenticated bootstrap failures instead of spinning forever", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: false,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: false,
                hasAccess: true,
                hasBootstrapIssue: true,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(false);
    });

    test("allows the anonymous sign-in view after anonymous bootstrap resolves", () => {
        expect(
            shouldShowInitialChatLoader({
                isAuthLoading: false,
                loadingAgents: false,
                hasBootstrap: true,
                hasAuthenticatedBootstrap: false,
                hasAccess: false,
                hasBootstrapIssue: false,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(false);
    });

    test("does not mark the shell rendered while bootstrap is still loading", () => {
        expect(
            canMarkAuthenticatedShellRendered({
                hasAccess: true,
                hasAuthenticatedBootstrap: false,
                hasBootstrapIssue: false,
                showInitialLoader: true,
            }),
        ).toBe(false);
    });

    test("does not mark the shell rendered while the cold auth loader is still showing", () => {
        expect(
            canMarkAuthenticatedShellRendered({
                hasAccess: true,
                hasAuthenticatedBootstrap: true,
                hasBootstrapIssue: false,
                showInitialLoader: true,
            }),
        ).toBe(false);
    });

    test("does not mark the shell rendered from anonymous bootstrap data", () => {
        expect(
            canMarkAuthenticatedShellRendered({
                hasAccess: true,
                hasAuthenticatedBootstrap: false,
                hasBootstrapIssue: false,
                showInitialLoader: false,
            }),
        ).toBe(false);
    });

    test("marks the shell rendered only when the authenticated chat shell can render", () => {
        expect(
            canMarkAuthenticatedShellRendered({
                hasAccess: true,
                hasAuthenticatedBootstrap: true,
                hasBootstrapIssue: false,
                showInitialLoader: false,
            }),
        ).toBe(true);
    });

    test("renders the authenticated shell with current access", () => {
        expect(
            shouldRenderAuthenticatedShell({
                hasAccess: true,
                hasRenderedAuthenticatedShell: false,
                isAuthLoading: false,
            }),
        ).toBe(true);
    });

    test("preserves the authenticated shell during background auth loading", () => {
        expect(
            shouldRenderAuthenticatedShell({
                hasAccess: false,
                hasRenderedAuthenticatedShell: true,
                isAuthLoading: true,
            }),
        ).toBe(true);
    });

    test("does not preserve the authenticated shell after auth settles unauthenticated", () => {
        expect(
            shouldRenderAuthenticatedShell({
                hasAccess: false,
                hasRenderedAuthenticatedShell: true,
                isAuthLoading: false,
            }),
        ).toBe(false);
    });

    test("resets the shell preservation latch after auth settles unauthenticated", () => {
        expect(
            shouldResetAuthenticatedShellRendered({
                hasAccess: false,
                hasRenderedAuthenticatedShell: true,
                isAuthLoading: false,
            }),
        ).toBe(true);
    });

    test("does not reset the shell preservation latch during auth refresh loading", () => {
        expect(
            shouldResetAuthenticatedShellRendered({
                hasAccess: false,
                hasRenderedAuthenticatedShell: true,
                isAuthLoading: true,
            }),
        ).toBe(false);
    });

    test("shows bootstrap issues full-page before the shell has rendered", () => {
        expect(
            shouldShowFullPageBootstrapIssue({
                hasBootstrapIssue: true,
                hasRenderedAuthenticatedShell: false,
            }),
        ).toBe(true);
    });

    test("keeps bootstrap refresh failures inside the mounted shell", () => {
        expect(
            shouldShowFullPageBootstrapIssue({
                hasBootstrapIssue: true,
                hasRenderedAuthenticatedShell: true,
            }),
        ).toBe(false);
    });
});
