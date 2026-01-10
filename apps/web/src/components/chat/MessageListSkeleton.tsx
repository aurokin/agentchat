import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface MessageListSkeletonProps {
    count?: number;
    streaming?: boolean;
}

export function MessageListSkeleton({
    count = 3,
    streaming = false,
}: MessageListSkeletonProps) {
    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "animate-fade-slide-in",
                        i % 2 === 0 ? "text-right" : "text-left",
                    )}
                    style={{ animationDelay: `${i * 30}ms` }}
                >
                    <div className="inline-block max-w-[90%] relative">
                        <Skeleton
                            className={cn(
                                "h-4 w-20 mb-2",
                                i % 2 === 0 ? "ml-auto" : "mr-auto",
                            )}
                        />
                        <div
                            className={cn(
                                "p-5",
                                i % 2 === 0
                                    ? "bg-primary/10"
                                    : "bg-background-elevated border border-border",
                            )}
                        >
                            {streaming && i === count - 1 ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-5/6" />
                                    <Skeleton className="h-4 w-4/5" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
