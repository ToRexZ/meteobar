// Tests for Geocode.js, the pure helpers behind the in-panel location field.
// Run with: node --test omarchy/Geocode.test.mjs   (or: make check-omarchy)
//
// Geocode.js is a QML JS library, so it has no module system of its own. The
// harness reads it, drops the `.pragma library` line QML requires, and
// evaluates it — the same functions the panel sees, with no export shim
// polluting the source.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "Geocode.js"), "utf8")
  .replace(/^\s*\.pragma\s+library\s*$/m, "")

const Geocode = new Function(
  source + "\nreturn { parseSuggestions: parseSuggestions, clampIndex: clampIndex, commitValue: commitValue }"
)()

const toledo = {
  results: [
    { name: "Toledo", admin1: "Castilla-La Mancha", country: "Spain", country_code: "ES", latitude: 39.85, longitude: -4.02 },
    { name: "Toledo", admin1: "Ohio", country: "United States", country_code: "US", latitude: 41.65, longitude: -83.53 },
    { name: "Toledo", admin1: "Paraná", country: "Brazil", country_code: "BR", latitude: -24.71, longitude: -53.74 }
  ]
}

test("parseSuggestions returns one entry per result, in order", () => {
  const out = Geocode.parseSuggestions(JSON.stringify(toledo))
  assert.equal(out.length, 3)
  assert.deepEqual(out.map(s => s.label), [
    "Toledo, Castilla-La Mancha, ES",
    "Toledo, Ohio, US",
    "Toledo, Paraná, BR"
  ])
})

test("parseSuggestions saves the documented \"City, CC\" form", () => {
  const out = Geocode.parseSuggestions(JSON.stringify(toledo))
  assert.deepEqual(out.map(s => s.location), ["Toledo, ES", "Toledo, US", "Toledo, BR"])
})

test("parseSuggestions falls back to the province when \"City, CC\" is ambiguous", () => {
  // Two Springfields in the same country: "Springfield, US" would be a coin
  // flip when the binary re-resolves it, so the province identifies each one.
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [
      { name: "Springfield", admin1: "Illinois", country_code: "US" },
      { name: "Springfield", admin1: "Missouri", country_code: "US" },
      { name: "Springfield", admin1: "Ontario", country_code: "CA" }
    ]
  }))
  assert.deepEqual(out.map(s => s.location), [
    "Springfield, Illinois",
    "Springfield, Missouri",
    "Springfield, CA"
  ])
})

test("parseSuggestions handles a missing province", () => {
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [{ name: "Singapore", country_code: "SG", country: "Singapore" }]
  }))
  assert.equal(out[0].label, "Singapore, SG")
  assert.equal(out[0].location, "Singapore, SG")
})

test("parseSuggestions uses the country name when there is no country code", () => {
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [{ name: "Atlantis", country: "Nowhere" }]
  }))
  assert.equal(out[0].label, "Atlantis, Nowhere")
  assert.equal(out[0].location, "Atlantis, Nowhere")
})

test("parseSuggestions degrades to the bare name with nothing else to add", () => {
  const out = Geocode.parseSuggestions(JSON.stringify({ results: [{ name: "Trondheim" }] }))
  assert.equal(out[0].label, "Trondheim")
  assert.equal(out[0].location, "Trondheim")
})

test("parseSuggestions drops entries with no usable name", () => {
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [{ name: "Oslo", country_code: "NO" }, { country_code: "NO" }, { name: "", country_code: "NO" }]
  }))
  assert.equal(out.length, 1)
  assert.equal(out[0].name, "Oslo")
})

test("parseSuggestions collapses rows that would read identically", () => {
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [
      { name: "Bergen", admin1: "Vestland", country_code: "NO" },
      { name: "Bergen", admin1: "Vestland", country_code: "NO" }
    ]
  }))
  assert.equal(out.length, 1)
})

test("parseSuggestions returns [] for empty, malformed, or resultless input", () => {
  for (const raw of ["", "{}", "not json", "null", '{"results":[]}', undefined, null]) {
    assert.deepEqual(Geocode.parseSuggestions(raw), [], `input: ${String(raw)}`)
  }
})

test("clampIndex keeps the highlight inside the list", () => {
  assert.equal(Geocode.clampIndex(0, 3), 0)
  assert.equal(Geocode.clampIndex(2, 3), 2)
  assert.equal(Geocode.clampIndex(7, 3), 2)
  assert.equal(Geocode.clampIndex(-4, 3), 0)
  assert.equal(Geocode.clampIndex(1, 0), 0)
  assert.equal(Geocode.clampIndex("nonsense", 3), 0)
})

test("commitValue prefers the highlighted suggestion", () => {
  const out = Geocode.parseSuggestions(JSON.stringify(toledo))
  assert.equal(Geocode.commitValue("Toledo", out, 1), "Toledo, US")
})

test("commitValue clamps a highlight past the end of the list", () => {
  const out = Geocode.parseSuggestions(JSON.stringify(toledo))
  assert.equal(Geocode.commitValue("Toledo", out, 99), "Toledo, BR")
})

test("commitValue falls back to typed text when geocoding gave nothing", () => {
  // Keeps the field usable when the network is down, and lets someone type
  // the documented "City, CC" form directly.
  assert.equal(Geocode.commitValue("  Toledo, ES  ", [], 0), "Toledo, ES")
  assert.equal(Geocode.commitValue("Trondheim", null, 0), "Trondheim")
})

test("commitValue returns \"\" for blank text, which means IP auto-detect", () => {
  assert.equal(Geocode.commitValue("", [], 0), "")
  assert.equal(Geocode.commitValue("   ", [], 0), "")
  assert.equal(Geocode.commitValue(null, [], 0), "")
})

test("commitValue ignores suggestions once the text is blank", () => {
  // Clearing the field is an explicit request for auto-detect; a stale
  // suggestion list must not resurrect the old city.
  const out = Geocode.parseSuggestions(JSON.stringify(toledo))
  assert.equal(Geocode.commitValue("", out, 0), "")
})

test("parseSuggestions counts ambiguity after collapsing duplicate rows", () => {
  // Live Open-Meteo data: Viborg, Central Jutland, DK comes back twice under
  // different ids (2610319 and 2610320). Only one row survives the collapse,
  // so "Viborg, DK" names exactly one city and the province fallback must not
  // fire — counting raw results instead of rows made it fire.
  const out = Geocode.parseSuggestions(JSON.stringify({
    results: [
      { name: "Viborg", admin1: "Central Jutland", country_code: "DK" },
      { name: "Viborg", admin1: "South Dakota", country_code: "US" },
      { name: "Viborg", admin1: "Dalarna County", country_code: "SE" },
      { name: "Viborg", admin1: "Central Jutland", country_code: "DK" },
      { name: "Viborgi", admin1: "Balvi Municipality", country_code: "LV" }
    ]
  }))
  assert.equal(out.length, 4)
  assert.deepEqual(out.map(s => s.location),
    ["Viborg, DK", "Viborg, US", "Viborg, SE", "Viborgi, LV"])
})
