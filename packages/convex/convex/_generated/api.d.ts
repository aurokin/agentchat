/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKey from "../apiKey.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as http from "../http.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_revenuecat_helpers from "../lib/revenuecat_helpers.js";
import type * as messages from "../messages.js";
import type * as revenuecat from "../revenuecat.js";
import type * as skills from "../skills.js";
import type * as users from "../users.js";

import type {
    ApiFromModules,
    FilterApi,
    FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
    apiKey: typeof apiKey;
    attachments: typeof attachments;
    auth: typeof auth;
    chats: typeof chats;
    http: typeof http;
    "lib/encryption": typeof lib_encryption;
    "lib/revenuecat_helpers": typeof lib_revenuecat_helpers;
    messages: typeof messages;
    revenuecat: typeof revenuecat;
    skills: typeof skills;
    users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
    typeof fullApi,
    FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
    typeof fullApi,
    FunctionReference<any, "internal">
>;

export declare const components: {};
