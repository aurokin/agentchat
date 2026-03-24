import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export function canonicalizePathForComparison(targetPath: string): string {
    const resolvedPath = path.resolve(targetPath);
    if (existsSync(resolvedPath)) {
        try {
            return realpathSync(resolvedPath);
        } catch {
            return resolvedPath;
        }
    }

    const parentPath = path.dirname(resolvedPath);
    if (parentPath === resolvedPath || !existsSync(parentPath)) {
        return resolvedPath;
    }

    try {
        return path.join(realpathSync(parentPath), path.basename(resolvedPath));
    } catch {
        return resolvedPath;
    }
}

export function pathsOverlap(leftPath: string, rightPath: string): boolean {
    const canonicalLeftPath = canonicalizePathForComparison(leftPath);
    const canonicalRightPath = canonicalizePathForComparison(rightPath);
    return (
        canonicalLeftPath === canonicalRightPath ||
        canonicalLeftPath.startsWith(canonicalRightPath + path.sep) ||
        canonicalRightPath.startsWith(canonicalLeftPath + path.sep)
    );
}
