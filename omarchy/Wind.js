.pragma library

// Wind direction, for the compass needle in the panel (Wind.test.mjs).

// Open-Meteo reports the direction the wind comes FROM — 106° means air
// arriving out of the east-southeast. The needle points where that air is
// GOING, which is the half turn added here and the convention consumer weather
// apps use. The panel's tooltip still names the reported direction, so the
// display and the number it came from cannot be read as contradicting.
//
// Returns a bearing in [0, 360), or null when there is no usable reading: a
// missing value must stay distinguishable from due north, or a calm hour would
// draw a needle pointing confidently at 180°.
function downwindBearing(degrees) {
  var value

  if (typeof degrees === "number") {
    value = degrees
  } else if (typeof degrees === "string") {
    // Number("") and Number("   ") are both 0, which would read as north.
    if (degrees.replace(/^\s+|\s+$/g, "") === "") return null
    value = Number(degrees)
  } else {
    // Covers null, undefined, booleans, arrays and objects — Number([]) is 0
    // and Number(true) is 1, so neither can be allowed near the arithmetic.
    return null
  }

  if (!isFinite(value)) return null

  // JS % keeps the sign of the dividend, so a negative bearing has to be
  // brought back into range before the half turn is added — otherwise the
  // needle settles on a mirrored angle.
  var from = ((value % 360) + 360) % 360
  return (from + 180) % 360
}
