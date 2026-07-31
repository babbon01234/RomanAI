import { continueAsStudent, continueAsTeacher } from "@/app/actions/session";

export default function LandingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-14 sm:py-20">
      <div className="w-full max-w-3xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-charcoal-muted">
          Office Hours
        </p>

        <h1 className="mt-4 max-w-xl text-4xl leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Ask about the lesson.
          <br />
          Get the source with it.
        </h1>

        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-charcoal-muted">
          Every answer comes from your teacher&rsquo;s own materials, with the
          slide or page it came from.
        </p>

        <div className="mt-11 grid gap-4 sm:grid-cols-2">
          <RoleCard
            action={continueAsTeacher}
            variant="teacher"
            label="I’m teaching"
            blurb="Add lessons, see what students are asking, save the answers worth keeping."
          />
          <RoleCard
            action={continueAsStudent}
            variant="student"
            label="I’m a student"
            blurb="Pick a lesson and ask. Every answer shows where it came from."
          />
        </div>

        <p className="mt-10 text-xs text-charcoal-muted/80">
          Demo build. No passwords, no real student data.
        </p>
      </div>
    </main>
  );
}

function RoleCard({
  action,
  variant,
  label,
  blurb,
}: {
  action: () => Promise<void>;
  variant: "teacher" | "student";
  label: string;
  blurb: string;
}) {
  const teacher = variant === "teacher";

  return (
    <form action={action} className="contents">
      <button
        type="submit"
        className={
          "group relative flex min-h-[172px] cursor-pointer flex-col items-start rounded-xl p-6 text-left transition duration-200 ease-[var(--ease-quiet)] hover:-translate-y-0.5 active:translate-y-0 " +
          (teacher
            ? "bg-ink text-parchment shadow-[0_10px_24px_-16px_rgba(27,42,74,.65)] hover:shadow-[0_16px_32px_-16px_rgba(27,42,74,.7)]"
            : "border border-parchment-line bg-white/70 shadow-[0_10px_24px_-20px_rgba(27,42,74,.5)] hover:border-gold hover:shadow-[0_16px_30px_-20px_rgba(27,42,74,.5)]")
        }
      >
        {/* Quiet motif: stacked index cards for the teacher, ruled paper for
            the student — enough to tell the two worlds apart at a glance. */}
        <span
          aria-hidden
          className={
            "pointer-events-none absolute right-6 top-6 h-9 w-9 rounded-[3px] " +
            (teacher
              ? "border border-parchment/25 bg-parchment/10 shadow-[5px_-5px_0_-1px_var(--color-ink),5px_-5px_0_rgba(250,246,237,.22)]"
              : "border border-parchment-line bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_5px,var(--color-parchment-line)_5px,var(--color-parchment-line)_6px)]")
          }
        />

        <span
          className={
            "mt-auto font-display text-2xl " +
            (teacher ? "text-parchment" : "text-ink")
          }
        >
          {label}
        </span>

        <span
          className={
            "mt-2 max-w-[26ch] text-[13px] leading-relaxed " +
            (teacher ? "text-parchment/70" : "text-charcoal-muted")
          }
        >
          {blurb}
        </span>

        <span
          aria-hidden
          className={
            "mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-[gap] duration-200 group-hover:gap-2.5 " +
            (teacher ? "text-gold" : "text-gold-deep")
          }
        >
          Continue
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path
              d="M0 4h12M9 1l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    </form>
  );
}
