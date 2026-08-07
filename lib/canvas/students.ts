/**
 * Which Canvas user each real student account stands for.
 *
 * Phase 9 gave students real accounts, but Canvas has no idea those accounts
 * exist — this is a lookup table for the sandbox, configured as
 * `CANVAS_STUDENT_IDS="Priya Patel:12345,Alex Chen:67890"`, not a sync. A
 * student whose name isn't listed simply has no Canvas submission to look at.
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

  // Matched case-insensitively so the env var doesn't have to get a
  // student's capitalisation exactly right.
  return new Map(pairs.map(([name, id]) => [name.toLowerCase(), id]));
}

export function canvasIdFor(studentName: string): string | null {
  return studentCanvasIds().get(studentName.toLowerCase()) ?? null;
}
