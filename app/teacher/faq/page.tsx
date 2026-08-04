import Link from "next/link";
import { FaqRow } from "@/components/teacher/FaqRow";
import { listAllFaqs, listLessons } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function TeacherFaqPage() {
  const faqs = await listAllFaqs();
  const titles = new Map((await listLessons()).map((l) => [l.id, l.title]));

  return (
    <>
      <h1 className="text-2xl tracking-[-0.01em]">FAQ</h1>
      <p className="mt-1.5 text-[13px] text-charcoal-muted">
        Saved answers. Students see these as shortcuts, and a question worded
        closely enough gets the saved wording instead of a generated one.
      </p>

      {faqs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center">
          <p className="font-display text-lg text-ink">Nothing saved yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-charcoal-muted">
            When a good question comes in, promote it from{" "}
            <Link
              href="/teacher/questions"
              className="text-gold-deep underline underline-offset-2 hover:text-ink"
            >
              Questions
            </Link>
            . You can rewrite the answer before students see it.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {faqs.map((faq) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              lessonTitle={titles.get(faq.lesson_id) ?? "Unknown lesson"}
            />
          ))}
        </div>
      )}
    </>
  );
}
