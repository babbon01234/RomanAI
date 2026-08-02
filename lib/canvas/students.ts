import { STUDENT_NAMES } from "@/lib/types";

/**
 * Which Canvas user each fake student stands for.
 *
 * Phase 1's students are names in a cookie with no identity behind them, and
 * that stays true — this is a lookup table for the sandbox, configured as
 * `CANVAS_STUDENT_IDS="Priya:12345,Alex:67890"`, not an account system.
 * Anyone not listed simply has no Canvas submission to look at, which is the
 * right answer for a name nobody mapped.
 *
 * It lives in the environment rather than the database because it is deploy
 * configuration for a sandbox, and because a mapping of real names to student
 * ids is exactly the kind of thing that must not quietly accumulate in a file
 * someone might commit.
 */

export function studentCanvasIds(): Map<string, string> {
  const raw = process.env.CANVAS_STUDENT_IDS?.trim();
  if (!raw) return new Map();

  const pairs = raw
    .split(",")
    .map((entry) => entry.split(":").map((part) => part.trim()))
    .filter(
      (parts): parts is [string, string] =>
        parts.length === 2 && Boolean(parts[0]) && /^\d+$/.test(parts[1]),
    );

  // Only names from the known roster, matched case-insensitively so the env
  // var doesn't have to get the capitalisation exactly right.
  const canonical = new Map(STUDENT_NAMES.map((n) => [n.toLowerCase(), n]));

  return new Map(
    pairs
      .map(([name, id]) => [canonical.get(name.toLowerCase()), id] as const)
      .filter((entry): entry is [string, string] => entry[0] !== undefined),
  );
}

export function canvasIdFor(studentName: string): string | null {
  return studentCanvasIds().get(studentName) ?? null;
}
