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
    " isFavourite: isFavourite, toggle: toggle, move: move }"
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

// ---- move --------------------------------------------------------------
// `insertBefore` is an index into the list AS IT IS, 0..length, because that is
// what the drag geometry produces: "the pointer is in the gap before chip 3".
// Everything past that — the shift when an item moves rightward — is arithmetic
// the caller should not have to get right.

const ABCD = ["A", "B", "C", "D"]

test("move drags an item rightward, before a later chip", () => {
  const out = F.move(ABCD, 0, 2)
  assert.deepEqual(out.list, ["B", "A", "C", "D"])
  assert.equal(out.changed, true)
})

test("move drags an item to the very end", () => {
  assert.deepEqual(F.move(ABCD, 0, 4).list, ["B", "C", "D", "A"])
})

test("move drags an item leftward", () => {
  assert.deepEqual(F.move(ABCD, 3, 0).list, ["D", "A", "B", "C"])
  assert.deepEqual(F.move(ABCD, 2, 1).list, ["A", "C", "B", "D"])
})

test("move reports no change when the item lands where it already is", () => {
  // Both gaps adjacent to an item mean "stay put": before itself, and before
  // its right-hand neighbour.
  for (const before of [1, 2]) {
    const out = F.move(ABCD, 1, before)
    assert.deepEqual(out.list, ABCD, `insertBefore: ${before}`)
    assert.equal(out.changed, false, `insertBefore: ${before}`)
  }
})

test("move clamps an insertion point past the end", () => {
  assert.deepEqual(F.move(ABCD, 0, 99).list, ["B", "C", "D", "A"])
})

test("move clamps a negative insertion point", () => {
  assert.deepEqual(F.move(ABCD, 2, -5).list, ["C", "A", "B", "D"])
})

test("move refuses an out-of-range source", () => {
  for (const from of [-1, 4, 99, "x", null, undefined, 1.5]) {
    const out = F.move(ABCD, from, 0)
    assert.deepEqual(out.list, ABCD, `from: ${String(from)}`)
    assert.equal(out.changed, false, `from: ${String(from)}`)
  }
})

test("move does not mutate the list it was given", () => {
  const before = ["A", "B", "C"]
  F.move(before, 0, 3)
  assert.deepEqual(before, ["A", "B", "C"])
})

test("move normalizes a hand-edited list on the way through", () => {
  const out = F.move(["  A  ", "", "B", "A", "C"], 0, 3)
  assert.deepEqual(out.list, ["B", "C", "A"])
})

test("move is a no-op on a list too short to reorder", () => {
  assert.equal(F.move(["A"], 0, 1).changed, false)
  assert.equal(F.move([], 0, 0).changed, false)
})

test("normalize accepts an array-like that is not a real Array", () => {
  // QML does not hand JS a real Array. A `property var` holding a QVariantList
  // arrives as a V4Sequence: length and index access work, but
  // Array.isArray() is false and Object.prototype.toString gives
  // "[object V4Sequence]". Demanding a real Array silently emptied the list at
  // runtime while every test here passed, because node always has the real
  // thing. Duck-typing the container is the whole fix.
  const sequenceLike = { 0: "Aarhus, DK", 1: "Aalborg, DK", length: 2 }
  assert.equal(Array.isArray(sequenceLike), false)
  assert.deepEqual(F.normalize(sequenceLike), ["Aarhus, DK", "Aalborg, DK"])
})

test("normalize still rejects a string, which is also length-bearing", () => {
  // The duck-type must not treat "Viborg, DK" as ten single-character entries.
  assert.deepEqual(F.normalize("Viborg, DK"), [])
})

test("move and toggle work on an array-like too", () => {
  const sequenceLike = { 0: "A", 1: "B", 2: "C", length: 3 }
  assert.deepEqual(F.move(sequenceLike, 0, 3).list, ["B", "C", "A"])
  assert.deepEqual(F.toggle(sequenceLike, "D").list, ["A", "B", "C", "D"])
  assert.equal(F.isFavourite(sequenceLike, "B"), true)
})
