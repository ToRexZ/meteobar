.pragma library

// Pure helpers behind the in-panel location field. Panel.qml keeps the network
// call and the rendering; the string handling lives here so it can be read and
// tested on its own (omarchy/Geocode.test.mjs).

function _trim(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
}

// An Open-Meteo geocoding response becomes rows the panel can draw and save.
// Each row carries three strings:
//   name      the city alone                        "Toledo"
//   label     what the suggestion list shows        "Toledo, Castille-La Mancha, ES"
//   location  what gets persisted as the setting    "Toledo, ES"
//
// `location` is deliberately a name and not coordinates: the meteobar binary
// re-resolves it with its own geocoding, and the manifest schema has one
// `location` string — no lat/lon keys to write into.
function parseSuggestions(raw) {
  var results
  try {
    var data = JSON.parse(String(raw === undefined || raw === null ? "" : raw) || "{}")
    results = data && data.results
  } catch (e) {
    return []
  }
  if (!results || !results.length) return []

  // One row per distinct label. Open-Meteo really does return the same place
  // twice under different ids — Viborg, Central Jutland, DK arrives as both
  // 2610319 and 2610320 — and two rows reading identically would be a coin
  // flip for the reader as much as for the binary.
  var rows = []
  var seen = {}
  for (var i = 0; i < results.length; i++) {
    var result = results[i]
    if (!result) continue

    var name = _trim(result.name)
    if (!name) continue

    var province = _trim(result.admin1)
    var code = _trim(result.country_code)
    var country = _trim(result.country)

    var parts = [name]
    if (province) parts.push(province)
    if (code) parts.push(code)
    else if (country) parts.push(country)

    var label = parts.join(", ")
    if (seen[label]) continue
    seen[label] = true

    rows.push({ name: name, label: label, province: province, code: code, country: country })
  }

  // How many rows the user can actually choose between share a "City, CC".
  // Counted over the collapsed rows and not the raw results, or an upstream
  // duplicate makes a city that is in fact unique look ambiguous.
  var perCountry = {}
  for (var j = 0; j < rows.length; j++) {
    var key = rows[j].name + "|" + rows[j].code
    perCountry[key] = (perCountry[key] || 0) + 1
  }

  // "City, CC" is the compact documented form, but it is only an answer when it
  // names one city. Two Springfields in the US would both persist as
  // "Springfield, US" and the binary would resolve whichever it liked, so a
  // colliding pair falls back to the province instead.
  var out = []
  for (var k = 0; k < rows.length; k++) {
    var row = rows[k]

    var qualifier = ""
    if (row.code && perCountry[row.name + "|" + row.code] === 1) qualifier = row.code
    else if (row.province) qualifier = row.province
    else if (row.code) qualifier = row.code
    else if (row.country) qualifier = row.country

    out.push({
      name: row.name,
      label: row.label,
      location: qualifier ? row.name + ", " + qualifier : row.name
    })
  }
  return out
}

// Keeps the highlight inside the list however the caller arrived at the index.
function clampIndex(index, length) {
  var max = (parseInt(length, 10) || 0) - 1
  if (max < 0) return 0
  var n = parseInt(index, 10)
  if (isNaN(n)) n = 0
  return Math.max(0, Math.min(n, max))
}

// The string to persist for what the user typed and highlighted. An empty field
// is an explicit request for IP auto-detect, so it wins over any suggestion
// still sitting in the list. With no suggestions the typed text is used as-is,
// which keeps the field working when geocoding is unreachable and lets someone
// type the documented "City, CC" form directly.
function commitValue(text, suggestions, selectedIndex) {
  var typed = _trim(text)
  if (typed === "") return ""

  var choices = suggestions || []
  if (!choices.length) return typed

  var chosen = choices[clampIndex(selectedIndex, choices.length)]
  return (chosen && chosen.location) ? chosen.location : typed
}
