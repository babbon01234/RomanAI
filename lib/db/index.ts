import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { flagContent, serializeFlags } from "@/lib/review/flags";

/**
 * Single process-wide connection. Next's dev server re-evaluates modules on
 * hot reload, so the handle is stashed on globalThis to avoid opening a new
 * database (and re-running migrations) on every edit.
 *
 * Memoized as a Promise rather than a Client: creating a usable connection
 * means setting the foreign_keys pragma and ensuring the schema exists first,
 * both of which are async against @libsql/client.
 */
const globalForDb = globalThis as unknown as { dbClient?: Promise<Client> };

/** Overridable so tests can run against a throwaway database. */
const DB_FILE =
  process.env.OFFICE_HOURS_DB ?? path.join(process.cwd(), "data", "app.db");

/**
 * Columns added after a database already exists. `CREATE TABLE IF NOT EXISTS`
 * is a no-op on an existing table, so a Phase 1 database would never grow the
 * Phase 2 provenance columns without this. Adding a column is idempotent here
 * because we check what's already there first.
 */
const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  lessons: {
    canvas_course_id: "TEXT",
    canvas_kind: "TEXT",
    canvas_item_id: "TEXT",
    synced_at: "TEXT",
  },
  files: {
    canvas_file_id: "TEXT",
    canvas_updated_at: "TEXT",
    // Where an uploaded file's bytes live in Vercel Blob. NULL for Canvas
    // rich text ('html' files), which has nothing to store.
    blob_url: "TEXT",
  },
  chunks: {
    // Existing chunks become 'pending' — Phase 3 must not grandfather in
    // content no teacher has looked at.
    approval_status: "TEXT NOT NULL DEFAULT 'pending'",
    flags: "TEXT NOT NULL DEFAULT '[]'",
    reviewed_at: "TEXT",
  },
  messages: {
    // Questions logged before Phase 4 were all answered by the old pipeline;
    // 'answered' is the honest default for them.
    outcome: "TEXT NOT NULL DEFAULT 'answered'",
    human_reason: "TEXT",
  },
};

/** @returns the columns this run actually added, as "table.column". */
async function migrate(client: Client): Promise<string[]> {
  const added: string[] = [];

  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((row) => row.name as string));

    for (const [name, type] of Object.entries(columns)) {
      if (existing.has(name)) continue;

      try {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
        added.push(`${table}.${name}`);
      } catch (error) {
        // Another cold start raced this same ALTER TABLE and won. There's no
        // remote-file-lock equivalent to serialize on, so the race is settled
        // by ignoring the loser's "duplicate column name" instead.
        if (!isDuplicateColumnError(error)) throw error;
      }
    }
  }

  return added;
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}

/**
 * Chunks stored before Phase 3 have no flags, because flags are computed on
 * insert. Left alone they would all read as unflagged, and the review queue's
 * "approve all unflagged" would wave an existing answer key straight through
 * to students — the one outcome this phase exists to prevent. So the backfill
 * runs once, when the column is first added.
 */
async function backfillFlags(client: Client): Promise<void> {
  const result = await client.execute("SELECT id, content FROM chunks");
  const rows = result.rows as unknown as { id: string; content: string }[];
  if (rows.length === 0) return;

  await client.batch(
    rows.map((row) => ({
      sql: "UPDATE chunks SET flags = ? WHERE id = ?",
      args: [serializeFlags(flagContent(row.content)), row.id],
    })),
    "write",
  );
}

/**
 * Runs table creation, the ADDED_COLUMNS migration, index creation, and the
 * flags backfill. Exported so scripts/migrate.ts can run it once at deploy
 * time; also called lazily on first connect as an idempotent safety net for
 * local dev and for any production cold start that beats the deploy script.
 */
export async function ensureSchema(client: Client): Promise<void> {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "lib", "db", "schema.sql"),
    "utf8",
  );

  // Tables first, then the added columns, then the indexes — the unique index
  // on the canvas_* columns can't be created before they exist.
  const [tables, indexes] = splitSchema(schema);
  await client.executeMultiple(tables);
  const added = await migrate(client);
  await client.executeMultiple(indexes);

  if (added.includes("chunks.flags")) await backfillFlags(client);
}

/**
 * Splits schema.sql into table statements and index statements. Ordering
 * matters only because an index on a freshly migrated column has to come
 * after the ALTER TABLE that adds it.
 */
function splitSchema(schema: string): [string, string] {
  // Comments go first: prose is allowed to contain semicolons, and splitting
  // on them without this cuts a sentence in half and hands SQLite the rest.
  const statements = schema
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const isIndex = (s: string) => /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s);
  const join = (list: string[]) => list.map((s) => `${s};`).join("\n");

  return [
    join(statements.filter((s) => !isIndex(s))),
    join(statements.filter(isIndex)),
  ];
}

function createConnection(): Client {
  const url = process.env.TURSO_DATABASE_URL ?? `file:${DB_FILE}`;
  if (url.startsWith("file:")) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }

  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: "number",
  });
}

async function connect(): Promise<Client> {
  const client = createConnection();
  await client.execute("PRAGMA foreign_keys = ON");
  await ensureSchema(client);
  return client;
}

export const getDb = (): Promise<Client> =>
  globalForDb.dbClient ?? (globalForDb.dbClient = connect());
