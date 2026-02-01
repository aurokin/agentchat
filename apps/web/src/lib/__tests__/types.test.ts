import { test, expect, describe } from "bun:test";
import {
    SupportedParameter,
    OpenRouterModel,
    modelSupportsSearch,
    modelSupportsReasoning,
    modelSupportsVision,
} from "@/lib/types";

describe("types.ts", () => {
    describe("modelSupportsSearch", () => {
        test("returns false for undefined", () => {
            expect(modelSupportsSearch(undefined)).toBe(false);
        });

        test("returns false for model without tools parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: undefined,
            };
            expect(modelSupportsSearch(model)).toBe(false);
        });

        test("returns false for model with empty supportedParameters", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [],
            };
            expect(modelSupportsSearch(model)).toBe(false);
        });

        test("returns true for model with tools parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [SupportedParameter.Tools],
            };
            expect(modelSupportsSearch(model)).toBe(true);
        });

        test("returns true for model with tools and reasoning", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [
                    SupportedParameter.Tools,
                    SupportedParameter.Reasoning,
                ],
            };
            expect(modelSupportsSearch(model)).toBe(true);
        });

        test("returns false for model with only reasoning", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [SupportedParameter.Reasoning],
            };
            expect(modelSupportsSearch(model)).toBe(false);
        });
    });

    describe("modelSupportsReasoning", () => {
        test("returns false for undefined", () => {
            expect(modelSupportsReasoning(undefined)).toBe(false);
        });

        test("returns false for model without reasoning parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: undefined,
            };
            expect(modelSupportsReasoning(model)).toBe(false);
        });

        test("returns false for model with empty supportedParameters", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [],
            };
            expect(modelSupportsReasoning(model)).toBe(false);
        });

        test("returns true for model with reasoning parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [SupportedParameter.Reasoning],
            };
            expect(modelSupportsReasoning(model)).toBe(true);
        });

        test("returns true for model with reasoning and tools", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [
                    SupportedParameter.Reasoning,
                    SupportedParameter.Tools,
                ],
            };
            expect(modelSupportsReasoning(model)).toBe(true);
        });

        test("returns false for model with only tools", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [SupportedParameter.Tools],
            };
            expect(modelSupportsReasoning(model)).toBe(false);
        });
    });

    describe("modelSupportsVision", () => {
        test("returns false for undefined", () => {
            expect(modelSupportsVision(undefined)).toBe(false);
        });

        test("returns false for model without vision parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: undefined,
            };
            expect(modelSupportsVision(model)).toBe(false);
        });

        test("returns false for model with empty supportedParameters", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [],
            };
            expect(modelSupportsVision(model)).toBe(false);
        });

        test("returns true for model with vision parameter", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [SupportedParameter.Vision],
            };
            expect(modelSupportsVision(model)).toBe(true);
        });

        test("returns true for model with vision and other parameters", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [
                    SupportedParameter.Vision,
                    SupportedParameter.Tools,
                    SupportedParameter.Reasoning,
                ],
            };
            expect(modelSupportsVision(model)).toBe(true);
        });

        test("returns false for model with only tools and reasoning", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
                supportedParameters: [
                    SupportedParameter.Tools,
                    SupportedParameter.Reasoning,
                ],
            };
            expect(modelSupportsVision(model)).toBe(false);
        });
    });

    describe("OpenRouterModel interface", () => {
        test("can create model with all properties", () => {
            const model: OpenRouterModel = {
                id: "anthropic/claude-3-5-sonnet",
                name: "claude-3-5-sonnet",
                provider: "Anthropic",
                supportedParameters: [
                    SupportedParameter.Reasoning,
                    SupportedParameter.Tools,
                ],
            };
            expect(model.id).toBe("anthropic/claude-3-5-sonnet");
            expect(model.name).toBe("claude-3-5-sonnet");
            expect(model.provider).toBe("Anthropic");
            expect(model.supportedParameters).toHaveLength(2);
        });

        test("can create model without optional supportedParameters", () => {
            const model: OpenRouterModel = {
                id: "test/model",
                name: "test",
                provider: "test",
            };
            expect(model.supportedParameters).toBeUndefined();
        });
    });
});
