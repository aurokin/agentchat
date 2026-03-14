import { describe, expect, it } from "bun:test";
import {
    modelSupportsSearch,
    modelSupportsReasoning,
    modelSupportsVision,
    resolveThinkingLevelForVariant,
    SupportedParameter,
    type ProviderModel,
} from "../models";

describe("model capabilities", () => {
    const model: ProviderModel = {
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

    it("uses provider variants directly without legacy aliases", () => {
        expect(resolveThinkingLevelForVariant("low")).toBe("low");
        expect(resolveThinkingLevelForVariant("medium")).toBe("medium");
        expect(resolveThinkingLevelForVariant("high")).toBe("high");
        expect(resolveThinkingLevelForVariant("minimal")).toBe("minimal");
        expect(resolveThinkingLevelForVariant("unknown", "none")).toBe("none");
    });
});
