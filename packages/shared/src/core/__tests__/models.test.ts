import { describe, expect, it } from "bun:test";
import {
    modelSupportsSearch,
    modelSupportsReasoning,
    modelSupportsVision,
    SupportedParameter,
    type OpenRouterModel,
} from "../models";

describe("model capabilities", () => {
    const model: OpenRouterModel = {
        id: "provider/model",
        name: "model",
        provider: "provider",
        supportedParameters: [
            SupportedParameter.Tools,
            SupportedParameter.Reasoning,
            SupportedParameter.Vision,
        ],
    };

    it("detects search support", () => {
        expect(modelSupportsSearch(model)).toBe(true);
        expect(modelSupportsSearch(undefined)).toBe(false);
    });

    it("detects reasoning support", () => {
        expect(modelSupportsReasoning(model)).toBe(true);
        expect(modelSupportsReasoning(undefined)).toBe(false);
    });

    it("detects vision support", () => {
        expect(modelSupportsVision(model)).toBe(true);
        expect(modelSupportsVision(undefined)).toBe(false);
    });
});
