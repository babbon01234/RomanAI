import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

test("a hash verifies against the password it was made from", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("the wrong password is rejected", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("wrong password entirely", hash), false);
});

test("hashing the same password twice produces different hashes", async () => {
  // A fixed salt would mean two accounts with the same password have the
  // same hash — visibly so, to anyone with database access.
  const [a, b] = await Promise.all([
    hashPassword("correct horse battery staple"),
    hashPassword("correct horse battery staple"),
  ]);
  assert.notEqual(a, b);
});
