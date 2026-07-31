export default function TeacherQuestionsPage() {
  return (
    <>
      <h1 className="text-2xl tracking-[-0.01em]">Questions</h1>
      <p className="mt-1.5 text-[13px] text-charcoal-muted">
        Everything students have asked, newest first.
      </p>
      <div className="mt-8 rounded-xl border border-dashed border-parchment-line bg-white/40 px-6 py-14 text-center text-[13px] text-charcoal-muted">
        Nothing asked yet.
      </div>
    </>
  );
}
