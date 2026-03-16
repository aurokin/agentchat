export type ResponsiveLayout = {
    isTablet: boolean;
    isLandscape: boolean;
    useTabletLandscapeLayout: boolean;
};

// React Native window dimensions are density-independent pixels, so align the
// cutoff with Android's common sw600dp tablet breakpoint.
const TABLET_MIN_SHORTEST_SIDE = 600;

export function resolveResponsiveLayout(params: {
    width: number;
    height: number;
}): ResponsiveLayout {
    const { width, height } = params;
    const shortestSide = Math.min(width, height);
    const isTablet = shortestSide >= TABLET_MIN_SHORTEST_SIDE;
    const isLandscape = width >= height;

    return {
        isTablet,
        isLandscape,
        useTabletLandscapeLayout: isTablet && isLandscape,
    };
}
