.pragma library

// Pure list handling behind the favourites chip strip. Panel.qml draws the
// chips and persists the result; the rules live here (Favourites.test.mjs).
//
// A favourite is just a location string in the same form the `location` setting
// takes — "Viborg, DK", "Toledo, Castille-La Mancha". Switching to one writes
// it to `location`, so a favourite is a shortcut and never a second notion of
// where the weather is from.

// Chips share the panel's width with the forecast, and a list this long is
// already past the point of being faster than typing.
var CAPACITY = 8

function _trim(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
}

// The stored list comes from shell.json, which anyone may have hand-edited, so
// nothing downstream should have to wonder what is in it: strings only, trimmed,
// no blanks, no duplicates, never longer than the cap.
function normalize(raw) {
  // Duck-typed, not Array.isArray(). QML does not hand JS a real Array: a
  // `property var` holding a QVariantList arrives as a V4Sequence, where index
  // access and .length work but Array.isArray() is false and
  // Object.prototype.toString gives "[object V4Sequence]". Demanding a real
  // Array threw the whole list away at runtime while every unit test passed,
  // because node always has the real thing.
  //
  // `typeof raw === "object"` is what keeps a string out — it carries a length
  // too, and would otherwise normalize into one entry per character.
  if (!raw || typeof raw !== "object" || typeof raw.length !== "number") return []

  var out = []
  var seen = {}
  for (var i = 0; i < raw.length && out.length < CAPACITY; i++) {
    if (typeof raw[i] !== "string") continue
    var value = _trim(raw[i])
    if (value === "" || seen[value]) continue
    seen[value] = true
    out.push(value)
  }
  return out
}

// What a chip reads. The qualifier is what disambiguates the city when the
// binary resolves it, not what the reader needs to tell four chips apart, and
// dropping it keeps the strip narrow enough to hold a useful number of them.
// The full string is still worth showing as a tooltip.
function chipLabel(location) {
  var name = _trim(location)
  if (name === "") return ""
  var comma = name.indexOf(",")
  return comma === -1 ? name : _trim(name.slice(0, comma))
}

// Exact equality, deliberately: "Viborg, DK" and "Viborg, Central Jutland" name
// the same city but are different settings, and quietly treating them as one
// would mean guessing which the user meant.
function isFavourite(list, value) {
  var target = _trim(value)
  if (target === "") return false

  var clean = normalize(list)
  for (var i = 0; i < clean.length; i++) {
    if (clean[i] === target) return true
  }
  return false
}

// Adds `value`, or removes it when it is already saved. Returns a NEW list
// alongside what happened, so the caller can persist only on a real change and
// say why nothing happened otherwise:
//   { list, changed, action: "added" | "removed" | "none", reason }
function toggle(list, value) {
  var clean = normalize(list)
  var target = _trim(value)

  if (target === "") {
    return {
      list: clean,
      changed: false,
      action: "none",
      reason: "nothing to save — the location is on auto-detect"
    }
  }

  if (isFavourite(clean, target)) {
    var without = []
    for (var i = 0; i < clean.length; i++) {
      if (clean[i] !== target) without.push(clean[i])
    }
    return { list: without, changed: true, action: "removed", reason: "" }
  }

  // Checked after the removal branch on purpose: refusing every write at the
  // cap would leave a full list with no way to make room from here.
  if (clean.length >= CAPACITY) {
    return {
      list: clean,
      changed: false,
      action: "none",
      reason: "favourites are full (" + CAPACITY + ") — remove one first"
    }
  }

  var withValue = clean.slice()
  withValue.push(target)
  return { list: withValue, changed: true, action: "added", reason: "" }
}

// Moves the item at `from` so it lands before whatever currently sits at
// `insertBefore` — an index into the list as it is, 0..length, where length
// means "at the end". That is the form the drag geometry produces ("the pointer
// is in the gap before chip 3"); the shift that applies when an item travels
// rightward is arithmetic the caller should not have to redo.
//
// Returns { list, changed }, so a drag that ends where it started writes
// nothing.
function move(list, from, insertBefore) {
  var clean = normalize(list)
  var unchanged = { list: clean, changed: false }

  if (from === null || from === undefined) return unchanged
  var source = Number(from)
  // Rejects NaN and a fractional index rather than rounding one into a
  // neighbour's place.
  if (!isFinite(source) || source % 1 !== 0) return unchanged
  if (source < 0 || source >= clean.length) return unchanged

  var target = Number(insertBefore)
  if (!isFinite(target)) target = clean.length
  target = Math.max(0, Math.min(Math.floor(target), clean.length))

  // The two gaps either side of an item both mean "stay put".
  if (target === source || target === source + 1) return unchanged

  var out = clean.slice()
  var item = out.splice(source, 1)[0]
  out.splice(target > source ? target - 1 : target, 0, item)
  return { list: out, changed: true }
}
