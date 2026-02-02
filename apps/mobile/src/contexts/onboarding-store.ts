export interface OnboardingSnapshot {
    isInitialized: boolean;
    hasCompletedOnboarding: boolean;
}

export interface OnboardingStore {
    subscribe(listener: () => void): () => void;
    getSnapshot(): OnboardingSnapshot;
    getServerSnapshot(): OnboardingSnapshot;
    refresh(): Promise<void>;
    completeOnboarding(): Promise<void>;
}

export interface OnboardingStorage {
    getHasCompletedOnboarding: () => Promise<boolean>;
    setHasCompletedOnboarding: () => Promise<void>;
}

export const createOnboardingStore = (
    storage: OnboardingStorage,
): OnboardingStore => {
    let snapshot: OnboardingSnapshot = {
        isInitialized: false,
        hasCompletedOnboarding: false,
    };
    const listeners = new Set<() => void>();
    let initPromise: Promise<void> | null = null;

    const notify = () => {
        listeners.forEach((listener) => listener());
    };

    const initialize = async () => {
        try {
            const onboardingCompleted =
                await storage.getHasCompletedOnboarding();
            snapshot = {
                isInitialized: true,
                hasCompletedOnboarding: onboardingCompleted,
            };
        } catch {
            snapshot = { ...snapshot, isInitialized: true };
        }
        notify();
    };

    const ensureInitialized = () => {
        if (!initPromise) {
            initPromise = initialize();
        }
        return initPromise;
    };

    return {
        subscribe(listener: () => void) {
            listeners.add(listener);
            void ensureInitialized();
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot() {
            return snapshot;
        },
        getServerSnapshot() {
            return snapshot;
        },
        async refresh() {
            initPromise = null;
            await ensureInitialized();
        },
        async completeOnboarding() {
            snapshot = { isInitialized: true, hasCompletedOnboarding: true };
            notify();
            await storage.setHasCompletedOnboarding();
        },
    };
};
