"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createLessonAction, type LessonFormState } from "@/app/actions/lessons";
import { ACCEPT_ATTRIBUTE } from "@/lib/parsing";

const FIELD =
  "w-full rounded-lg border border-parchment-line bg-white/70 px-3.5 py-2.5 text-[14px] text-charcoal placeholder:text-charcoal-muted/50 transition-colors duration-150 focus:border-gold focus:outline-none";

export function NewLessonForm() {
  const [state, action] = useActionState<LessonFormState, FormData>(
    createLessonAction,
    {},
  );
  const [names, setNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="mt-8 space-y-6">
      <Field label="Title" hint="What the class calls it.">
        <input
          name="title"
          required
          maxLength={120}
          placeholder="Unit 3 — Photosynthesis"
          className={FIELD}
        />
      </Field>

      <Field label="Description" hint="Optional. A line to help students pick.">
        <textarea
          name="description"
          rows={3}
          maxLength={400}
          placeholder="Covers the light reactions and the Calvin cycle. Lab report due Friday."
          className={`${FIELD} resize-y`}
        />
      </Field>

      <Field label="Files" hint="PDF, DOCX, or PPTX. You can add more than one.">
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          required
          accept={ACCEPT_ATTRIBUTE}
          onChange={(e) =>
            setNames(Array.from(e.target.files ?? []).map((f) => f.name))
          }
          className="sr-only"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full cursor-pointer rounded-lg border border-dashed border-parchment-line bg-white/40 px-4 py-7 text-center transition-colors duration-150 hover:border-gold hover:bg-gold-wash/40"
        >
          <span className="block text-[13px] font-medium text-ink">
            {names.length ? "Choose different files" : "Choose files"}
          </span>
          <span className="mt-1 block text-[12px] text-charcoal-muted">
            {names.length
              ? `${names.length} selected`
              : "Slides, a handout, an assignment sheet"}
          </span>
        </button>

        {names.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {names.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 text-[12px] text-charcoal-muted"
              >
                <span aria-hidden className="h-1 w-1 rounded-full bg-gold" />
                {name}
              </li>
            ))}
          </ul>
        )}
      </Field>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
        >
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-lg bg-gold px-5 py-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-gold-deep hover:text-parchment disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Add lesson"}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className="mt-0.5 block text-[12px] text-charcoal-muted">
        {hint}
      </span>
      <span className="mt-2.5 block">{children}</span>
    </label>
  );
}
