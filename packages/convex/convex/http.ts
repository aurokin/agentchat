import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

const runtimeInternal = internal as unknown as {
    runtimeIngress: {
        runStarted: any;
        messageStarted: any;
        messageDelta: any;
        runCompleted: any;
        runInterrupted: any;
        runFailed: any;
        runtimeBinding: any;
        readRuntimeBinding: any;
    };
};

function getRuntimeIngressSecret(): string {
    const secret = process.env.RUNTIME_INGRESS_SECRET?.trim();
    if (!secret) {
        throw new Error("RUNTIME_INGRESS_SECRET is not configured.");
    }
    return secret;
}

function assertRuntimeIngressAuthorized(request: Request): void {
    const provided = request.headers.get("x-agentchat-runtime-secret")?.trim();
    if (!provided || provided !== getRuntimeIngressSecret()) {
        throw new Error("Unauthorized runtime ingress request");
    }
}

function ok(): Response {
    return Response.json({ ok: true });
}

function runtimeRoute(params: { path: string; mutation: any }) {
    http.route({
        path: params.path,
        method: "POST",
        handler: httpAction(async (ctx, request) => {
            try {
                assertRuntimeIngressAuthorized(request);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unauthorized",
                    },
                    { status: 401 },
                );
            }

            const payload = (await request.json()) as unknown;
            await ctx.runMutation(params.mutation, payload as any);
            return ok();
        }),
    });
}

function runtimeQueryRoute(params: { path: string; query: any }) {
    http.route({
        path: params.path,
        method: "POST",
        handler: httpAction(async (ctx, request) => {
            try {
                assertRuntimeIngressAuthorized(request);
            } catch (error) {
                return Response.json(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unauthorized",
                    },
                    { status: 401 },
                );
            }

            const payload = (await request.json()) as unknown;
            const result = await ctx.runQuery(params.query, payload as any);
            return Response.json(result);
        }),
    });
}

runtimeRoute({
    path: "/runtime/run-started",
    mutation: runtimeInternal.runtimeIngress.runStarted,
});
runtimeRoute({
    path: "/runtime/message-started",
    mutation: runtimeInternal.runtimeIngress.messageStarted,
});
runtimeRoute({
    path: "/runtime/message-delta",
    mutation: runtimeInternal.runtimeIngress.messageDelta,
});
runtimeRoute({
    path: "/runtime/run-completed",
    mutation: runtimeInternal.runtimeIngress.runCompleted,
});
runtimeRoute({
    path: "/runtime/run-interrupted",
    mutation: runtimeInternal.runtimeIngress.runInterrupted,
});
runtimeRoute({
    path: "/runtime/run-failed",
    mutation: runtimeInternal.runtimeIngress.runFailed,
});
runtimeRoute({
    path: "/runtime/runtime-binding",
    mutation: runtimeInternal.runtimeIngress.runtimeBinding,
});
runtimeQueryRoute({
    path: "/runtime/runtime-binding/read",
    query: runtimeInternal.runtimeIngress.readRuntimeBinding,
});

export default http;
