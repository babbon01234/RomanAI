import type { FileStatus } from "@/lib/types";

/**
 * A utility signal, not a delight moment (DESIGN_GUIDE) — the colour and the
 * dot cross-fade on change, and nothing moves.
 */
const STYLES: Record<FileStatus, { label: string; className: string; dot: string }> = {
  processing: {
    label: "Processing",
    className: "border-parchment-line bg-parchment-deep text-charcoal-muted",
    dot: "bg-charcoal-muted/50 animate-pulse",
  },
  ready: {
    label: "Ready",
    className: "border-sage/30 bg-sage-wash text-sage",
    dot: "bg-sage",
  },
  failed: {
    label: "Couldn’t read",
    className: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
};

export function StatusBadge({ status }: { status: FileStatus }) {
  const { label, className, dot } = STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-500 ease-[var(--ease-quiet)] ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${dot}`}
      />
      {label}
    </span>
  );
}
