import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the connection at a throwaway file before anything imports it.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "office-hours-auth-test-"));
process.env.OFFICE_HOURS_DB = path.join(TMP, "test.db");

const users = await import("@/lib/auth/users");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("a password account round-trips by email", async () => {
  const created = await users.createUserWithPassword(
    "Priya@Example.Test",
    "Priya",
    "student",
    "hashed",
  );

  const found = await users.findUserByEmail("priya@example.test");
  assert.equal(found?.id, created.id);
  assert.equal(found?.role, "student");
  assert.equal(found?.google_id, null);

  // Emails are stored lowercase, so a differently-cased lookup still finds it.
  assert.equal((await users.findUserByEmail("PRIYA@EXAMPLE.TEST"))?.id, created.id);
});

test("a Google account round-trips by google id, with no password hash", async () => {
  const created = await users.createUserWithGoogle(
    "ms.rivera@example.test",
    "Ms. Rivera",
    "teacher",
    "google-sub-123",
  );

  const found = await users.findUserByGoogleId("google-sub-123");
  assert.equal(found?.id, created.id);
  assert.equal(found?.password_hash, null);
});

test("an unknown email or google id finds nothing", async () => {
  assert.equal(await users.findUserByEmail("nobody@example.test"), null);
  assert.equal(await users.findUserByGoogleId("nope"), null);
  assert.equal(await users.findUserById("nope"), null);
});
