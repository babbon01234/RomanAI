import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { ChatShell, type Exchange } from "@/components/student/ChatShell";
import { activeProvider } from "@/lib/answer";
import {
  listAllFaqs,
  listLessons,
  listMessagesForStudent,
} from "@/lib/db/queries";
import { getRole, getStudentName } from "@/lib/session";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StudentChatPage() {
  if ((await getRole()) !== "student") redirect("/");

  const name = await getStudentName();
  if (!name) redirect("/");

  const lessons = await listLessons();

  // Rehydrate this student's own history from the question log, so a refresh
  // (or picking the phone back up) doesn't lose the conversation.
  const history: Record<string, Exchange[]> = {};
  for (const lesson of lessons) {
    if (lesson.approved_count === 0) continue;

    const messages = await listMessagesForStudent(lesson.id, name);
    history[lesson.id] = messages.map((message) => {
      const citations = JSON.parse(message.citations_json) as Citation[];
      return {
        key: message.id,
        question: message.question,
        answer: message.answer,
        citations,
        found: message.source === "faq" || citations.length > 0,
        source: message.source,
        handedOff: message.outcome === "needs_human",
        restored: true,
      };
    });
  }

  const faqs = await listAllFaqs();

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
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-12 pt-7">
        <ChatShell
          lessons={lessons}
          faqs={faqs}
          history={history}
          rehearsal={activeProvider() === "rehearsal"}
        />
      </main>
    </div>
  );
}
