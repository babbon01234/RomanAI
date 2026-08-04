/**
 * Run once, before the app is deployed (see the "vercel-build" package.json
 * script), so schema/column migrations land as a single write against the
 * remote database instead of racing across concurrent serverless cold starts.
 * Safe to re-run — every step it takes is idempotent.
 */
import { getDb } from "@/lib/db";

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "(local file)";
  console.log(`Running migrations against ${url}...`);
  const db = await getDb();
  db.close();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
