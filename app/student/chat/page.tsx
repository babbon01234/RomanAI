import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/session";
import { getRole, getStudentName } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StudentChatPage() {
  if ((await getRole()) !== "student") redirect("/");

  const name = await getStudentName();
  if (!name) redirect("/student");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Light chrome: the student side stays out of the way. */}
      <header className="border-b border-parchment-line/80">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5">
          <span className="font-display text-[15px] text-ink">Office Hours</span>
          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="cursor-pointer text-[12px] text-charcoal-muted transition-colors hover:text-ink"
            >
              {name}
              <span className="mx-1.5 text-charcoal-muted/40">&middot;</span>
              Not you?
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <h1 className="text-2xl tracking-[-0.01em]">Hi, {name}.</h1>
        <p className="mt-2 text-[13px] text-charcoal-muted">
          Pick a lesson above to start asking questions.
        </p>
      </main>
    </div>
  );
}
