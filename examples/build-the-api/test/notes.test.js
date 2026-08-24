import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/notes.js";

test("add returns a stored note with an id and a timestamp", () => {
  const s = createStore();
  const n = s.add({ title: "First" });
  assert.equal(typeof n.id, "string");
  assert.ok(n.id.length > 0);
  assert.equal(n.title, "First");
  assert.equal(n.body, "");
  assert.deepEqual(n.tags, []);
  assert.equal(typeof n.createdAt, "number");
});

test("ids are unique within a store", () => {
  const s = createStore();
  const ids = new Set([s.add({ title: "a" }).id, s.add({ title: "b" }).id]);
  assert.equal(ids.size, 2);
});

test("a title is required", () => {
  const s = createStore();
  assert.throws(() => s.add({ title: "   " }), /title is required/);
  assert.throws(() => s.add({}), /title is required/);
});

test("tags are lower-cased and de-duplicated", () => {
  const s = createStore();
  const n = s.add({ title: "t", tags: ["Work", "work", "HOME"] });
  assert.deepEqual([...n.tags].sort(), ["home", "work"]);
});

test("get returns the note, or undefined", () => {
  const s = createStore();
  const n = s.add({ title: "findable" });
  assert.equal(s.get(n.id).title, "findable");
  assert.equal(s.get("nope"), undefined);
});

test("list is newest first", () => {
  const s = createStore();
  const a = s.add({ title: "older" });
  const b = s.add({ title: "newer" });
  assert.deepEqual(
    s.list().map((n) => n.id),
    [b.id, a.id]
  );
});

test("list filters by tag, case-insensitively", () => {
  const s = createStore();
  s.add({ title: "one", tags: ["Work"] });
  s.add({ title: "two", tags: ["home"] });
  assert.deepEqual(
    s.list({ tag: "WORK" }).map((n) => n.title),
    ["one"]
  );
});

test("list searches title and body", () => {
  const s = createStore();
  s.add({ title: "Groceries", body: "milk" });
  s.add({ title: "Plans", body: "buy MILK later" });
  s.add({ title: "Other", body: "nothing" });
  assert.equal(s.list({ q: "milk" }).length, 2);
  assert.equal(s.list({ q: "groc" }).length, 1);
});

test("tag and search must both match", () => {
  const s = createStore();
  s.add({ title: "hit", body: "milk", tags: ["shop"] });
  s.add({ title: "miss", body: "milk", tags: ["home"] });
  assert.deepEqual(
    s.list({ tag: "shop", q: "milk" }).map((n) => n.title),
    ["hit"]
  );
});

test("update applies a patch and returns the note", () => {
  const s = createStore();
  const n = s.add({ title: "before" });
  const after = s.update(n.id, { title: "after", tags: ["A", "a"] });
  assert.equal(after.title, "after");
  assert.deepEqual(after.tags, ["a"]);
  assert.equal(s.get(n.id).title, "after");
});

test("update cannot change the id or the timestamp", () => {
  const s = createStore();
  const n = s.add({ title: "fixed" });
  const after = s.update(n.id, { id: "hacked", createdAt: 0 });
  assert.equal(after.id, n.id);
  assert.equal(after.createdAt, n.createdAt);
});

test("update on an unknown id throws", () => {
  const s = createStore();
  assert.throws(() => s.update("nope", { title: "x" }), /no such note/);
});

test("remove says whether anything went away", () => {
  const s = createStore();
  const n = s.add({ title: "temporary" });
  assert.equal(s.remove(n.id), true);
  assert.equal(s.remove(n.id), false);
  assert.equal(s.get(n.id), undefined);
});

test("stats counts notes and tags", () => {
  const s = createStore();
  s.add({ title: "a", tags: ["work"] });
  s.add({ title: "b", tags: ["work", "urgent"] });
  assert.deepEqual(s.stats(), { count: 2, tags: { work: 2, urgent: 1 } });
});

test("two stores do not share notes", () => {
  const a = createStore();
  const b = createStore();
  a.add({ title: "mine" });
  assert.equal(b.list().length, 0);
});
