import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

test("worker exposes the requested page and structured visit log", () => {
  assert.match(source, /myipaddress\.visit/);
  assert.match(source, /CF-Connecting-IP/);
  assert.match(source, /Approximate address/);
  assert.match(source, /cache-control.*no-store/);
});

test("worker keeps unrelated paths unavailable", () => {
  assert.match(source, /return new Response\("Not found"/);
  assert.match(source, /status: 404/);
});
