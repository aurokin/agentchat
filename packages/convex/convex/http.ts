import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
    path: "/revenuecat-webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const authHeader = request.headers.get("authorization");
        const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();
        const debugEnabled = process.env.REVENUECAT_DEBUG === "true";

        if (!webhookSecret) {
            return new Response("RevenueCat webhook not configured", {
                status: 400,
            });
        }

        const normalize = (value: string | null) => {
            let normalized = value?.trim() ?? "";
            if (
                (normalized.startsWith('"') && normalized.endsWith('"')) ||
                (normalized.startsWith("'") && normalized.endsWith("'"))
            ) {
                normalized = normalized.slice(1, -1).trim();
            }
            const parts = normalized.split(/\s+/);
            const tokenLike = parts[parts.length - 1];
            return tokenLike ?? "";
        };

        const normalizedAuthorization = normalize(authHeader);
        const normalizedSecret = webhookSecret;

        if (!authHeader || normalizedAuthorization !== normalizedSecret) {
            if (debugEnabled) {
                console.log(
                    "RevenueCat webhook auth mismatch",
                    JSON.stringify({
                        authHeaderPresent: Boolean(authHeader),
                        authorizationPrefix: authHeader
                            ? authHeader.slice(0, 20)
                            : null,
                        authHeaderLength: authHeader?.length ?? 0,
                        secretLength: webhookSecret.length,
                    }),
                );
            }
            return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown;
        try {
            payload = await request.json();
        } catch (error) {
            console.error("RevenueCat webhook invalid JSON:", error);
            return new Response("Invalid JSON payload", { status: 400 });
        }

        const event = (payload as { event?: unknown })?.event;
        if (!event || typeof event !== "object") {
            return new Response("Missing RevenueCat event payload", {
                status: 400,
            });
        }

        const sanitizedEvent = {
            app_user_id: (event as any).app_user_id,
            entitlement_ids: (event as any).entitlement_ids,
            entitlement_id: (event as any).entitlement_id,
            expiration_at_ms: (event as any).expiration_at_ms,
            expiration_at: (event as any).expiration_at,
            type: (event as any).type,
            event_timestamp_ms: (event as any).event_timestamp_ms,
            customer_id: (event as any).customer_id,
            original_app_user_id: (event as any).original_app_user_id,
            id: (event as any).id,
        };

        // RevenueCat dashboard "Test webhook" events are not tied to a real Agentchat user id.
        // Treat them as a transport/auth smoke test and return 200 so the integration can be verified.
        if (sanitizedEvent.type === "TEST") {
            console.log("RevenueCat webhook test event received");
            return new Response("OK", { status: 200 });
        }

        try {
            await ctx.runAction(internal.revenuecat.handleWebhook, {
                event: sanitizedEvent,
            });
            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error("RevenueCat webhook error:", error);
            return new Response("Webhook processing failed", { status: 400 });
        }
    }),
});

export default http;
