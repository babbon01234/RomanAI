import Link from "next/link";
import { chooseStudent } from "@/app/actions/session";
import { STUDENT_NAMES } from "@/lib/types";

export default function StudentPickerPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-14 sm:py-20">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal-muted transition-colors hover:text-ink"
        >
          <svg width="12" height="8" viewBox="0 0 14 8" fill="none" aria-hidden>
            <path
              d="M14 4H2m3-3L2 4l3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </Link>

        <h1 className="mt-6 text-3xl tracking-[-0.01em] sm:text-4xl">
          Who are you?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-charcoal-muted">
          Pick your name so your teacher knows who asked.
        </p>

        <form action={chooseStudent} className="mt-8 flex flex-wrap gap-2.5">
          {STUDENT_NAMES.map((name) => (
            <button
              key={name}
              name="name"
              value={name}
              type="submit"
              className="cursor-pointer rounded-full border border-parchment-line bg-white/70 px-5 py-2.5 text-[15px] text-ink shadow-[0_6px_16px_-14px_rgba(27,42,74,.6)] transition duration-150 ease-[var(--ease-quiet)] hover:border-gold hover:bg-gold-wash active:scale-[.98]"
            >
              {name}
            </button>
          ))}
        </form>
      </div>
    </main>
  );
}
