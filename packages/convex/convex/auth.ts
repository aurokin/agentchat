import { convexAuth } from "@convex-dev/auth/server";
import Google, { type GoogleProfile } from "@auth/core/providers/google";

const getProfileUpdates = (
    profile: Record<string, unknown> & {
        email?: string;
        phone?: string;
        emailVerified?: boolean;
        phoneVerified?: boolean;
        name?: string;
        image?: string;
    },
    now: number,
) => {
    const updates: Record<string, unknown> = {};

    if (typeof profile.name === "string") {
        updates.name = profile.name;
    }
    if (typeof profile.image === "string") {
        updates.image = profile.image;
    }
    if (typeof profile.email === "string") {
        updates.email = profile.email;
    }
    if (typeof profile.phone === "string") {
        updates.phone = profile.phone;
    }
    if (profile.emailVerified === true) {
        updates.emailVerificationTime = now;
    }
    if (profile.phoneVerified === true) {
        updates.phoneVerificationTime = now;
    }

    return updates;
};

const getInitialSync = async (
    ctx: { db: any },
    userId: string,
    existingInitialSync: boolean | undefined,
) => {
    if (existingInitialSync !== undefined) {
        return existingInitialSync;
    }

    const [chat, skill] = await Promise.all([
        ctx.db
            .query("chats")
            .filter((q: any) => q.eq(q.field("userId"), userId))
            .first(),
        ctx.db
            .query("skills")
            .filter((q: any) => q.eq(q.field("userId"), userId))
            .first(),
    ]);

    return Boolean(chat || skill);
};

const getSiteUrl = () => {
    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) {
        throw new Error("SITE_URL is not configured");
    }
    return siteUrl.replace(/\/$/, "");
};

const resolveRedirectTo = (redirectTo: string) => {
    const mobileRedirectPrefix = "agentchat://convex-auth";
    if (redirectTo.startsWith(mobileRedirectPrefix)) {
        return redirectTo;
    }

    const baseUrl = getSiteUrl();
    if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${baseUrl}${redirectTo}`;
    }
    if (redirectTo.startsWith(baseUrl)) {
        const after = redirectTo[baseUrl.length];
        if (after === undefined || after === "?" || after === "/") {
            return redirectTo;
        }
    }

    throw new Error(
        `Invalid \`redirectTo\` ${redirectTo} for configured SITE_URL: ${baseUrl}`,
    );
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    providers: [
        Google({
            profile(profile: GoogleProfile) {
                const fallbackName = [profile.given_name, profile.family_name]
                    .filter(Boolean)
                    .join(" ");
                const name = profile.name ?? (fallbackName || undefined);
                return {
                    id: profile.sub,
                    name,
                    email: profile.email,
                    image: profile.picture,
                    emailVerified: profile.email_verified,
                };
            },
        }),
    ],
    callbacks: {
        async redirect({ redirectTo }) {
            return resolveRedirectTo(redirectTo);
        },
        async createOrUpdateUser(ctx, args) {
            const now = Date.now();
            const profileUpdates = getProfileUpdates(args.profile, now);

            if (args.existingUserId) {
                const existing = await ctx.db.get(args.existingUserId);
                if (existing) {
                    const initialSync = await getInitialSync(
                        ctx,
                        args.existingUserId,
                        existing.initialSync,
                    );

                    await ctx.db.patch(args.existingUserId, {
                        ...profileUpdates,
                        createdAt: existing.createdAt ?? now,
                        updatedAt: now,
                        initialSync,
                    });

                    return args.existingUserId;
                }
            }

            const userId = await ctx.db.insert("users", {
                ...profileUpdates,
                cloudChatCount: 0,
                cloudMessageCount: 0,
                cloudSkillCount: 0,
                cloudAttachmentCount: 0,
                cloudAttachmentBytes: 0,
                createdAt: now,
                updatedAt: now,
                initialSync: false,
            });

            return userId;
        },
    },
});
