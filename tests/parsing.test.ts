import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { kindFromFilename, parseFile } from "@/lib/parsing";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const read = (name: string) => fs.readFileSync(path.join(FIXTURES, name));

test("recognises the three accepted formats and nothing else", () => {
  assert.equal(kindFromFilename("deck.pptx"), "pptx");
  assert.equal(kindFromFilename("HANDOUT.DOCX"), "docx");
  assert.equal(kindFromFilename("notes.pdf"), "pdf");
  assert.equal(kindFromFilename("answers.key"), null);
  assert.equal(kindFromFilename("noextension"), null);
});

test("pptx: one chunk per slide, numbered as the deck numbers them", async () => {
  const chunks = await parseFile(read("fixture.pptx"), "pptx");

  assert.equal(chunks.length, 4);
  assert.deepEqual(
    chunks.map((c) => c.locator),
    ["Slide 1", "Slide 2", "Slide 3", "Slide 4"],
  );
  assert.match(chunks[3].content, /Friday at 11:59pm/);
});

test("pptx: XML entities are decoded, not left raw", async () => {
  const chunks = await parseFile(read("fixture.pptx"), "pptx");
  const calvin = chunks.find((c) => c.locator === "Slide 3")!;

  assert.match(calvin.content, /ATP & NADPH/);
  assert.doesNotMatch(calvin.content, /&amp;/);
});

test("pdf: locators are real page numbers, and page content stays on its page", async () => {
  const chunks = await parseFile(read("fixture.pdf"), "pdf");

  assert.deepEqual(
    chunks.map((c) => c.locator),
    ["Page 1", "Page 2"],
  );
  assert.match(chunks[0].content, /Goggles/);
  assert.match(chunks[1].content, /20%/);
  // Page 1's text must not bleed into Page 2's citation.
  assert.doesNotMatch(chunks[1].content, /Goggles/);
});

test("docx: cites sections, never invented page numbers", async () => {
  const chunks = await parseFile(read("fixture.docx"), "docx");

  assert.ok(chunks.length > 0);
  for (const chunk of chunks) {
    assert.match(chunk.locator, /^Section \d+/);
    // A .docx has no pages until it is laid out — claiming one would be a lie.
    assert.doesNotMatch(chunk.locator, /Page|Slide/);
  }
});

test("an unreadable file fails with a reason rather than empty output", async () => {
  await assert.rejects(
    () => parseFile(read("corrupt.pdf"), "pdf"),
    (error: Error) => {
      assert.ok(error.message.length > 0);
      return true;
    },
  );
});
