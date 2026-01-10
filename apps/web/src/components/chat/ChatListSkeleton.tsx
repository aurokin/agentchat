import { Skeleton } from "@/components/ui/Skeleton";

export function ChatListSkeleton() {
    return (
        <ul className="p-3 space-y-1 list-none">
            {[1, 2, 3, 4, 5].map((i) => (
                <li key={i}>
                    <div className="w-full text-left p-3 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                            <Skeleton className="mt-1 w-3.5 h-3.5 flex-shrink-0" />
                            <div className="min-w-0 w-full">
                                <Skeleton className="h-4 w-24 mb-1.5" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        </div>
                        <Skeleton className="w-3.5 h-3.5" />
                    </div>
                </li>
            ))}
        </ul>
    );
}
