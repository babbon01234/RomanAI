import Link from "next/link";
import { NewLessonForm } from "@/components/teacher/NewLessonForm";

export default function NewLessonPage() {
  return (
    <div className="max-w-xl">
      <Link
        href="/teacher"
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
        Lessons
      </Link>

      <h1 className="mt-5 text-2xl tracking-[-0.01em]">Add a lesson</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-charcoal-muted">
        Upload the slides or handout you gave the class. Students can only ask
        about what you put here.
      </p>

      <NewLessonForm />
    </div>
  );
}
