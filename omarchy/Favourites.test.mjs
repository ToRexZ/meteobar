// Tests for Favourites.js, the pure list handling behind the chip strip.
// Run with: node --test omarchy/Favourites.test.mjs   (or: make check-omarchy)

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "Favourites.js"), "utf8")
  .replace(/^\s*\.pragma\s+library\s*$/m, "")

const F = new Function(
  source +
    "\nreturn { CAPACITY: CAPACITY, normalize: normalize, chipLabel: chipLabel," +
    " isFavourite: isFavourite, toggle: toggle }"
)()

test("CAPACITY is the documented limit", () => {
  assert.equal(F.CAPACITY, 8)
})

// ---- normalize ----------------------------------------------------------
// The list comes out of shell.json, which anyone may have hand-edited.

test("normalize passes a clean list through unchanged", () => {
  assert.deepEqual(F.normalize(["Viborg, DK", "Toledo, ES"]), ["Viborg, DK", "Toledo, ES"])
})

test("normalize trims, and drops blanks and non-strings", () => {
  assert.deepEqual(
    F.normalize(["  Viborg, DK  ", "", "   ", null, 42, {}, [], "Toledo, ES"]),
    ["Viborg, DK", "Toledo, ES"]
  )
})

test("normalize drops duplicates, keeping the first", () => {
  assert.deepEqual(F.normalize(["Viborg, DK", "Toledo, ES", "Viborg, DK"]),
    ["Viborg, DK", "Toledo, ES"])
})

test("normalize enforces the cap", () => {
  const many = Array.from({ length: 20 }, (_, i) => `City ${i}`)
  assert.equal(F.normalize(many).length, F.CAPACITY)
  assert.equal(F.normalize(many)[0], "City 0")
})

test("normalize returns [] for anything that is not a list", () => {
  for (const raw of [undefined, null, "Viborg, DK", 7, {}, true]) {
    assert.deepEqual(F.normalize(raw), [], `input: ${String(raw)}`)
  }
})

// ---- chipLabel ---------------------------------------------------------

test("chipLabel keeps the city and drops the qualifier", () => {
  assert.equal(F.chipLabel("Viborg, DK"), "Viborg")
  assert.equal(F.chipLabel("Toledo, Castille-La Mancha"), "Toledo")
  assert.equal(F.chipLabel("  Toledo , ES "), "Toledo")
})

test("chipLabel leaves a bare name alone", () => {
  assert.equal(F.chipLabel("Trondheim"), "Trondheim")
})

test("chipLabel is empty for empty input", () => {
  for (const raw of ["", "   ", null, undefined, ","]) {
    assert.equal(F.chipLabel(raw), "", `input: ${String(raw)}`)
  }
})

// ---- isFavourite -------------------------------------------------------

test("isFavourite matches exactly, ignoring surrounding space", () => {
  const list = ["Viborg, DK", "Toledo, ES"]
  assert.equal(F.isFavourite(list, "Viborg, DK"), true)
  assert.equal(F.isFavourite(list, "  Viborg, DK  "), true)
  assert.equal(F.isFavourite(list, "Viborg, Central Jutland"), false)
  assert.equal(F.isFavourite(list, "viborg, dk"), false)
  assert.equal(F.isFavourite(list, ""), false)
  assert.equal(F.isFavourite(null, "Viborg, DK"), false)
})

// ---- toggle ------------------------------------------------------------

test("toggle adds a new city at the end", () => {
  const out = F.toggle(["Viborg, DK"], "Toledo, ES")
  assert.deepEqual(out.list, ["Viborg, DK", "Toledo, ES"])
  assert.equal(out.action, "added")
  assert.equal(out.changed, true)
})

test("toggle removes a city already saved", () => {
  const out = F.toggle(["Viborg, DK", "Toledo, ES"], "Viborg, DK")
  assert.deepEqual(out.list, ["Toledo, ES"])
  assert.equal(out.action, "removed")
  assert.equal(out.changed, true)
})

test("toggle does not mutate the list it was given", () => {
  const before = ["Viborg, DK"]
  F.toggle(before, "Toledo, ES")
  assert.deepEqual(before, ["Viborg, DK"])
})

test("toggle refuses an empty value, which means auto-detect", () => {
  const out = F.toggle(["Viborg, DK"], "   ")
  assert.deepEqual(out.list, ["Viborg, DK"])
  assert.equal(out.action, "none")
  assert.equal(out.changed, false)
  assert.match(out.reason, /nothing to save/i)
})

test("toggle refuses to add past the cap, and says why", () => {
  const full = Array.from({ length: F.CAPACITY }, (_, i) => `City ${i}`)
  const out = F.toggle(full, "One More")
  assert.deepEqual(out.list, full)
  assert.equal(out.action, "none")
  assert.equal(out.changed, false)
  assert.match(out.reason, /8/)
})

test("toggle can still remove when the list is full", () => {
  // Refusing every write at the cap would strand the user with no way back.
  const full = Array.from({ length: F.CAPACITY }, (_, i) => `City ${i}`)
  const out = F.toggle(full, "City 3")
  assert.equal(out.action, "removed")
  assert.equal(out.list.length, F.CAPACITY - 1)
  assert.ok(!out.list.includes("City 3"))
})

test("toggle normalizes a hand-edited list on the way through", () => {
  const out = F.toggle(["  Viborg, DK  ", "", "Viborg, DK"], "Toledo, ES")
  assert.deepEqual(out.list, ["Viborg, DK", "Toledo, ES"])
})

test("toggle trims the value it stores", () => {
  const out = F.toggle([], "  Toledo, ES  ")
  assert.deepEqual(out.list, ["Toledo, ES"])
})
