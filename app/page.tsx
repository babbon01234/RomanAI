import Link from "next/link";
import { signInWithPassword } from "@/app/actions/auth";
import { ErrorBanner, FIELD, FormField } from "@/components/auth/FormField";
import { isGoogleConfigured } from "@/lib/auth/google";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const error = (await searchParams).error;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-14 sm:py-20">
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-charcoal-muted">
          Office Hours
        </p>

        <h1 className="mt-4 text-4xl leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Sign in.
        </h1>

        <p className="mt-5 text-[15px] leading-relaxed text-charcoal-muted">
          Every answer comes from your teacher&rsquo;s own materials, with the
          slide or page it came from.
        </p>

        <div className="mt-9 rounded-xl border border-parchment-line bg-white/70 p-6 shadow-[0_10px_24px_-20px_rgba(27,42,74,.5)]">
          {isGoogleConfigured() && (
            <>
              <a
                href="/api/auth/google"
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-parchment-line bg-white px-4 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-gold hover:bg-gold-wash"
              >
                Continue with Google
              </a>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-charcoal-muted/70">
                <span className="h-px flex-1 bg-parchment-line" />
                or
                <span className="h-px flex-1 bg-parchment-line" />
              </div>
            </>
          )}

          <form action={signInWithPassword} className="space-y-4">
            <ErrorBanner message={error} />

            <FormField label="Email">
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@school.edu"
                className={FIELD}
              />
            </FormField>

            <FormField label="Password">
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={FIELD}
              />
            </FormField>

            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg bg-ink px-5 py-2.5 text-[13px] font-medium text-parchment transition-colors duration-150 hover:bg-ink/90"
            >
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-6 text-[13px] text-charcoal-muted">
          New here?{" "}
          <Link href="/signup" className="font-medium text-ink underline underline-offset-2">
            Create an account
          </Link>
        </p>

        <p className="mt-10 text-xs text-charcoal-muted/80">
          Demo build. Sandbox data only — never a real school&rsquo;s.
        </p>
      </div>
    </main>
  );
}
