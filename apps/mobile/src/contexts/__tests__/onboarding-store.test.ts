import { describe, expect, it, mock } from "bun:test";
import { createOnboardingStore } from "@/contexts/onboarding-store";

describe("onboarding-store", () => {
    it("initializes from storage on refresh", async () => {
        const getHasCompletedOnboarding = mock(async () => true);
        const setHasCompletedOnboarding = mock(async () => undefined);
        const store = createOnboardingStore({
            getHasCompletedOnboarding,
            setHasCompletedOnboarding,
        });

        await store.refresh();

        expect(store.getSnapshot()).toEqual({
            isInitialized: true,
            hasCompletedOnboarding: true,
        });
        expect(getHasCompletedOnboarding).toHaveBeenCalledTimes(1);
    });

    it("refresh re-reads onboarding state", async () => {
        let completed = false;
        const getHasCompletedOnboarding = mock(async () => completed);
        const setHasCompletedOnboarding = mock(async () => undefined);
        const store = createOnboardingStore({
            getHasCompletedOnboarding,
            setHasCompletedOnboarding,
        });

        await store.refresh();
        expect(store.getSnapshot().hasCompletedOnboarding).toBe(false);

        completed = true;
        await store.refresh();
        expect(store.getSnapshot().hasCompletedOnboarding).toBe(true);
        expect(getHasCompletedOnboarding).toHaveBeenCalledTimes(2);
    });

    it("marks onboarding as complete and persists", async () => {
        const getHasCompletedOnboarding = mock(async () => false);
        const setHasCompletedOnboarding = mock(async () => undefined);
        const store = createOnboardingStore({
            getHasCompletedOnboarding,
            setHasCompletedOnboarding,
        });

        await store.completeOnboarding();

        expect(store.getSnapshot()).toEqual({
            isInitialized: true,
            hasCompletedOnboarding: true,
        });
        expect(setHasCompletedOnboarding).toHaveBeenCalledTimes(1);
    });
});
