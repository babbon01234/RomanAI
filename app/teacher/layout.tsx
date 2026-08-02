import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/session";
import { countPendingChunks } from "@/lib/db/queries";
import { getRole } from "@/lib/session";
import { TEACHER_NAME } from "@/lib/types";
import { TeacherNav } from "@/components/teacher/TeacherNav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await getRole()) !== "teacher") redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Navy chrome: this is the "desk" side of the product. */}
      <header className="bg-ink text-parchment">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <Link href="/teacher" className="font-display text-lg leading-none">
            Office Hours
          </Link>

          <TeacherNav pending={countPendingChunks()} />

          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="cursor-pointer text-[12px] text-parchment/60 transition-colors hover:text-parchment"
            >
              {TEACHER_NAME}
              <span className="mx-1.5 text-parchment/35">&middot;</span>
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-9">
        {children}
      </main>
    </div>
  );
}
