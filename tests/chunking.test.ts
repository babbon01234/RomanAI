import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksToChunks, normalize } from "@/lib/parsing/chunk";

test("normalises whitespace without joining separate lines", () => {
  assert.equal(normalize("  Hello   world  "), "Hello world");
  assert.equal(normalize("A\r\n\r\n\r\n\r\nB"), "A\n\nB");
  assert.equal(normalize("Heading\nBody"), "Heading\nBody");
});

test("one block becomes one chunk, keeping its locator", () => {
  const chunks = blocksToChunks([
    { locator: "Slide 1", text: "The light reactions happen in the thylakoid membrane." },
  ]);

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].locator, "Slide 1");
});

test("drops blocks too short to be worth citing", () => {
  const chunks = blocksToChunks([
    { locator: "Slide 1", text: "Ok" },
    { locator: "Slide 2", text: "" },
    { locator: "Slide 3", text: "A passage long enough to actually answer something." },
  ]);

  assert.deepEqual(
    chunks.map((c) => c.locator),
    ["Slide 3"],
  );
});

test("a split block marks its continuation so the citation stays honest", () => {
  const long = Array.from(
    { length: 60 },
    (_, i) => `Sentence number ${i} carrying enough words to take up room.`,
  ).join(" ");

  const chunks = blocksToChunks([{ locator: "Page 2", text: long }]);

  assert.ok(chunks.length > 1, "expected the long block to split");
  assert.equal(chunks[0].locator, "Page 2");
  for (const chunk of chunks.slice(1)) {
    assert.equal(chunk.locator, "Page 2 (cont.)");
  }
});

test("splits on sentence boundaries, not mid-sentence", () => {
  const long = Array.from(
    { length: 60 },
    (_, i) => `Sentence number ${i} carrying enough words to take up room.`,
  ).join(" ");

  for (const chunk of blocksToChunks([{ locator: "Page 1", text: long }])) {
    assert.match(
      chunk.content.trim(),
      /[.!?]$/,
      `chunk ended mid-sentence: ${JSON.stringify(chunk.content.slice(-40))}`,
    );
  }
});

test("keeps blocks in document order", () => {
  const chunks = blocksToChunks([
    { locator: "Slide 1", text: "First passage, long enough to keep around." },
    { locator: "Slide 2", text: "Second passage, also long enough to keep." },
  ]);

  assert.deepEqual(
    chunks.map((c) => c.locator),
    ["Slide 1", "Slide 2"],
  );
});
