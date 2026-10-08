import { cn } from "@/lib/utils";
import { ACT_STATUS_LABELS, type ActStatus } from "@/lib/performance/types";

const TONE: Record<ActStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  needs_changes: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  accepted: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  waitlisted: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  declined: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground line-through",
};

export function ActStatusChip({ status, className }: { status: ActStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status], className)}>
      {ACT_STATUS_LABELS[status]}
    </span>
  );
}
