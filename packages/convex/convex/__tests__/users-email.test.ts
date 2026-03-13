import { describe, expect, test } from "bun:test";

import { getByEmailInternal } from "../users";

type HandlerExport = {
    _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: unknown, args: unknown) {
    return handler._handler(ctx, args);
}

describe("getByEmailInternal", () => {
    test("matches a user case-insensitively", async () => {
        const seenEmails: string[] = [];
        const user = { _id: "users:1", email: "operator@example.com" };
        const ctx = {
            db: {
                query: () => ({
                    withIndex: (
                        _name: string,
                        apply: (query: {
                            eq: (field: string, value: string) => unknown;
                        }) => unknown,
                    ) => {
                        apply({
                            eq: (_field, value) => {
                                seenEmails.push(value);
                                return null;
                            },
                        });

                        return {
                            unique: async () =>
                                seenEmails.at(-1) === "operator@example.com"
                                    ? user
                                    : null,
                        };
                    },
                }),
            },
        };

        const result = await runHandler(
            getByEmailInternal as unknown as HandlerExport,
            ctx,
            {
                email: "Operator@Example.com",
            },
        );

        expect(result).toEqual(user);
        expect(seenEmails).toEqual([
            "Operator@Example.com",
            "operator@example.com",
        ]);
    });

    test("rejects blank email", async () => {
        const ctx = {
            db: {
                query: () => ({
                    withIndex: () => ({
                        unique: async () => null,
                    }),
                }),
            },
        };

        await expect(
            runHandler(getByEmailInternal as unknown as HandlerExport, ctx, {
                email: "   ",
            }),
        ).rejects.toThrow("Email is required");
    });
});
