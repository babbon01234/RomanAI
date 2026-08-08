import Link from "next/link";
import { signUpWithPassword, startTeacherGoogleSignup } from "@/app/actions/auth";
import { ErrorBanner, FIELD, FormField } from "@/components/auth/FormField";
import { isGoogleConfigured } from "@/lib/auth/google";
import { teacherSignupOpen } from "@/lib/auth/teacher-code";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = (await searchParams).error;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-14 sm:py-20">
      <div className="w-full max-w-3xl">
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
          Back to sign in
        </Link>

        <h1 className="mt-6 text-4xl leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Create an account.
        </h1>

        <div className="mt-9 max-w-sm">
          <ErrorBanner message={error} />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <RoleCard
            variant="teacher"
            role="teacher"
            label="I’m teaching"
            blurb="Add lessons, see what students are asking, save the answers worth keeping."
          />
          <RoleCard
            variant="student"
            role="student"
            label="I’m a student"
            blurb="Pick a lesson and ask. Every answer shows where it came from."
          />
        </div>
      </div>
    </main>
  );
}

/**
 * Only rendered on the teacher card, and only when a code is actually
 * required — in local dev with none configured there's nothing to ask for,
 * and an empty box the user must ignore is worse than no box.
 */
function TeacherCodeField() {
  if (teacherSignupOpen()) return null;

  return (
    <label className="block">
      <span className="text-[13px] font-medium text-parchment">Teacher signup code</span>
      <span className="mt-0.5 block text-[12px] text-parchment/60">
        Teacher accounts approve content and read the question log, so they
        aren&rsquo;t open to sign up for.
      </span>
      <input
        type="password"
        name="teacherCode"
        required
        autoComplete="off"
        aria-label="Teacher signup code"
        className={`${FIELD} mt-2 border-parchment/25 bg-parchment/10 text-parchment placeholder:text-parchment/40`}
      />
    </label>
  );
}

function RoleCard({
  variant,
  role,
  label,
  blurb,
}: {
  variant: "teacher" | "student";
  role: "teacher" | "student";
  label: string;
  blurb: string;
}) {
  const teacher = variant === "teacher";

  return (
    <div
      className={
        "flex flex-col rounded-xl p-6 " +
        (teacher
          ? "bg-ink text-parchment shadow-[0_10px_24px_-16px_rgba(27,42,74,.65)]"
          : "border border-parchment-line bg-white/70 shadow-[0_10px_24px_-20px_rgba(27,42,74,.5)]")
      }
    >
      <span className={"font-display text-2xl " + (teacher ? "text-parchment" : "text-ink")}>
        {label}
      </span>
      <span
        className={
          "mt-1.5 text-[13px] leading-relaxed " +
          (teacher ? "text-parchment/70" : "text-charcoal-muted")
        }
      >
        {blurb}
      </span>

      {isGoogleConfigured() && (
        <>
          {/* The teacher's Google button posts through a server action so the
              signup code is checked before Google is ever involved; the
              student's is a plain link, because student signup is open. */}
          {teacher ? (
            <form action={startTeacherGoogleSignup} className="mt-5">
              <TeacherCodeField />
              <button
                type="submit"
                className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-parchment/25 bg-parchment/10 px-4 py-2.5 text-[13px] font-medium text-parchment transition-colors duration-150 hover:bg-parchment/15"
              >
                Continue with Google
              </button>
            </form>
          ) : (
            <a
              href="/api/auth/google?role=student"
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-parchment-line bg-white px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-gold hover:bg-gold-wash"
            >
              Continue with Google
            </a>
          )}

          <div
            className={
              "my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] " +
              (teacher ? "text-parchment/50" : "text-charcoal-muted/70")
            }
          >
            <span className={"h-px flex-1 " + (teacher ? "bg-parchment/20" : "bg-parchment-line")} />
            or
            <span className={"h-px flex-1 " + (teacher ? "bg-parchment/20" : "bg-parchment-line")} />
          </div>
        </>
      )}

      <form action={signUpWithPassword} className="space-y-3.5">
        <input type="hidden" name="role" value={role} />

        {teacher && <TeacherCodeField />}

        <FormField>
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            aria-label="Name"
            placeholder={teacher ? "Ms. Rivera" : "Your name"}
            className={teacher ? `${FIELD} border-parchment/25 bg-parchment/10 text-parchment placeholder:text-parchment/40` : FIELD}
          />
        </FormField>

        <FormField>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            aria-label="Email"
            placeholder="you@school.edu"
            className={teacher ? `${FIELD} border-parchment/25 bg-parchment/10 text-parchment placeholder:text-parchment/40` : FIELD}
          />
        </FormField>

        <FormField>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-label="Password"
            placeholder="At least 8 characters"
            className={teacher ? `${FIELD} border-parchment/25 bg-parchment/10 text-parchment placeholder:text-parchment/40` : FIELD}
          />
        </FormField>

        <button
          type="submit"
          className={
            "mt-1.5 w-full cursor-pointer rounded-lg px-5 py-2.5 text-[13px] font-medium transition-colors duration-150 " +
            (teacher
              ? "bg-gold text-ink hover:bg-gold-deep hover:text-parchment"
              : "bg-ink text-parchment hover:bg-ink/90")
          }
        >
          Create account
        </button>
      </form>
    </div>
  );
}
