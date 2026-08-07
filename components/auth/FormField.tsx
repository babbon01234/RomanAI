export const FIELD =
  "w-full rounded-lg border border-parchment-line bg-white/70 px-3.5 py-2.5 text-[14px] text-charcoal placeholder:text-charcoal-muted/50 transition-colors duration-150 focus:border-gold";

export function FormField({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label && <span className="text-[13px] font-medium text-ink">{label}</span>}
      <span className={label ? "mt-2 block" : "block"}>{children}</span>
    </label>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
    >
      {message}
    </p>
  );
}
