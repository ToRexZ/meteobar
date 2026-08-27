// Tests for Wind.js. Run with: node --test omarchy/Wind.test.mjs
//
// One function, but it carries a convention: Open-Meteo reports the direction
// the wind comes FROM, and the compass needle points where it is GOING. These
// tests exist so a later edit cannot quietly flip that back — the display would
// still look plausible while being 180° wrong.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "Wind.js"), "utf8")
  .replace(/^\s*\.pragma\s+library\s*$/m, "")

const W = new Function(source + "\nreturn { downwindBearing: downwindBearing }")()

test("downwindBearing turns a reported bearing into the way the wind blows", () => {
  // 106° reported = wind out of the east-southeast = heading west-northwest.
  assert.equal(W.downwindBearing(106), 286)
  assert.equal(W.downwindBearing(286), 106)
})

test("downwindBearing handles the cardinals", () => {
  assert.equal(W.downwindBearing(0), 180)
  assert.equal(W.downwindBearing(90), 270)
  assert.equal(W.downwindBearing(180), 0)
  assert.equal(W.downwindBearing(270), 90)
})

test("downwindBearing wraps rather than exceeding a full turn", () => {
  assert.equal(W.downwindBearing(359), 179)
  assert.equal(W.downwindBearing(360), 180)
  assert.equal(W.downwindBearing(720), 180)
  assert.equal(W.downwindBearing(450), 270)
})

test("downwindBearing normalizes a negative bearing", () => {
  // JS % keeps the sign, so a naive (deg + 180) % 360 returns a negative angle
  // here and the needle points at a mirrored bearing.
  assert.equal(W.downwindBearing(-10), 170)
  assert.equal(W.downwindBearing(-90), 90)
  assert.equal(W.downwindBearing(-370), 170)
})

test("downwindBearing keeps sub-degree precision", () => {
  // The needle is a rotation, not a glyph out of a set of eight, so there is no
  // reason to quantise.
  assert.equal(W.downwindBearing(106.5), 286.5)
  assert.equal(W.downwindBearing(0.25), 180.25)
})

test("downwindBearing accepts a numeric string", () => {
  assert.equal(W.downwindBearing("106"), 286)
})

test("downwindBearing returns null when there is no usable bearing", () => {
  // A missing reading must be distinguishable from due north, or a calm hour
  // would draw a needle pointing confidently at 180°.
  for (const raw of [null, undefined, "", "   ", "east", NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(W.downwindBearing(raw), null, `input: ${String(raw)}`)
  }
})
