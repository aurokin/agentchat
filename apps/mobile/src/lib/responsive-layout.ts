export type ResponsiveLayout = {
    isTablet: boolean;
    isLandscape: boolean;
    useTabletLandscapeLayout: boolean;
};

const TABLET_MIN_SHORTEST_SIDE = 700;
const TABLET_MIN_LONGEST_SIDE = 900;

export function resolveResponsiveLayout(params: {
    width: number;
    height: number;
}): ResponsiveLayout {
    const { width, height } = params;
    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const isTablet =
        shortestSide >= TABLET_MIN_SHORTEST_SIDE &&
        longestSide >= TABLET_MIN_LONGEST_SIDE;
    const isLandscape = width >= height;

    return {
        isTablet,
        isLandscape,
        useTabletLandscapeLayout: isTablet && isLandscape,
    };
}
