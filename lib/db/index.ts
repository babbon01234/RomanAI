import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Single process-wide connection. Next's dev server re-evaluates modules on
 * hot reload, so the handle is stashed on globalThis to avoid opening a new
 * database (and re-running migrations) on every edit.
 */
const globalForDb = globalThis as unknown as { db?: Database.Database };

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/** Overridable so tests can run against a throwaway database. */
const DB_FILE = process.env.OFFICE_HOURS_DB ?? path.join(DATA_DIR, "app.db");

function connect(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(
    path.join(process.cwd(), "lib", "db", "schema.sql"),
    "utf8",
  );
  db.exec(schema);

  return db;
}

export const db = globalForDb.db ?? (globalForDb.db = connect());
