# CLAUDE.md

## Tooling

- Build: `cargo build --release`
- Install: `make install` (installs to `/usr/local/bin`, override with `PREFIX=`)
- Lint: `cargo clippy`
- Format: `cargo fmt`
- Tests: `cargo test` (unit tests in `src/structured.rs` and `src/cache.rs`)

## Non-Obvious Rules

- **Quickshell emits NEITHER `started` NOR `exited` when the command does not exist** — `running` just drops back to false. That is the only signal a failed start gives. Anything that waits on `onExited` to leave a loading state hangs for ever when the CLI is not installed, which is the first run of everyone who installs the plugin from the marketplace: the plugin is a git clone, the CLI is a package, and nothing installs the second for you. The `onRunningChanged` guard in the panel's `Process` is what makes the not-installed message reachable — verified against a running shell, not assumed.

- **QML hands JS a V4Sequence, not an Array.** A `property var` holding a QVariantList (any list-valued setting read through `setting()`) has working `.length` and index access, but `Array.isArray()` is false and `Object.prototype.toString` gives `"[object V4Sequence]"`. `Favourites.normalize()` duck-types on `length` for exactly this reason — a real-Array check silently emptied the favourites list at runtime while every unit test passed, because node always has the real thing. Anything guarding a list-valued setting must duck-type, and must still exclude strings, which carry a length too.

- **Do not fold a settings read into a call through a `.pragma library` import.** `Favourites.normalize(setting("favourites", []))` as a single binding was never invalidated when `settings` arrived and held the empty list it saw first. It is split into `favouritesRaw` (a plain binding, which captures the dependency) and `favourites` (the transform). The bug hid for a while because a settings change often rebuilds the bar slot, re-evaluating everything from scratch.

- **`PanelKeyCatcher` takes keys before descendants**, so any inline editor needs `blocked:` set while it has focus, or Esc and the arrows never reach it. The panel sets `blocked: root.editingLocation`.

- **Never assign `drag.target` for an item owned by a positioner.** The favourites chips live in a `Flow`; mutating a positioned item's x/y leaves stale offsets that make neighbours overlap after an aborted drag. The reorder tracks the press by hand with a threshold and a `suppressClick` flag, and the chips never move — a marker shows the drop gap. This mirrors `plugins/bar/Bar.qml`, which carries the same warning. The marker is parented to a chip, not to the Flow, which would lay it out as another flow item.

- **The wind compass is Rectangles, not a glyph or a Canvas.** Eight arrow glyphs quantise the bearing into 45° buckets; a single rotated glyph sits off-centre because glyph ink is not centred in the em box; a Canvas needs `requestPaint()` on every bearing and theme change. Ticks and needle are full-size child Items rotated about their own centre — which is the dial's centre — with the mark pinned to the top.

- **`omarchy bar set <id> <key> <v> --json` cannot write arrays.** Quickshell's `qs ipc call` splits or unwraps them: a multi-element list fails with "4 required but 6 were provided" and a one-element array is stored as a bare string. Write list settings from QML (`registry.setBarWidget` takes a real JS array) or edit shell.json.

- **Verify QML by loading it.** `qmllint` exits 255 with no output on these files (it cannot resolve `qs.*`), and `qmlformat`'s exit code is 1 even on a clean file, so neither is a gate. Use `omarchy restart shell` then `quickshell -p /usr/share/omarchy/shell log`. Panels dismiss the moment synthetic input arrives, so `wtype` cannot drive them; `grim` in the same command as the `open` IPC does capture them. When measuring a rendered angle, find the dial centre from the ink — assuming the crop centre is the dial centre produced a bogus 30° error.

- Output must be valid Waybar JSON (`{"text": ..., "tooltip": ..., "class": ..., "alt": ...}`)
- `--output json` is a second, structured output mode (raw data, no Pango; consumed by the Omarchy shell plugin in `omarchy/`) — it must always exit 0 with valid JSON, errors go in the `error: {message}` field
- Forecast selection lives ONLY in `forecast.rs` (`upcoming_hours`, `forecast_days`); both the Waybar tooltip and the structured JSON render those slots, so "next N hours" and day/night are identical on both surfaces. Never index the API's parallel arrays — they can disagree in length in a cached payload and that used to panic the Waybar path; zip them instead
- The core publishes `palette` in the structured JSON (text/dim/accent, temp_cold/temp_warm, and `precip_ramp` as `{pct, color}` stops). QML consumes it via `rampColor()`, which mirrors `theme.rs::ramp_color`. Thresholds and colors live in the core; the panel must not re-derive them
- The response cache is request-keyed (`weather-<hash>.json`, hash over location input + units + days + hours), so different flag sets never cross-serve payloads
- Tooltip uses Pango markup for colors and formatting — escape user-facing strings
- `--no-color[=all|bar|tooltip]` (plus `NO_COLOR`, which the explicit flag overrides) resolves to a `ColorChoice` in `waybar.rs`; all color markup goes through `Paint`, which emits nothing when disabled. Monochrome drops color ONLY — glyphs, box drawing, bold, alignment and the `class`/`alt` fields all stay, and `--output json` is byte-identical either way
- Argument errors go through `report_cli_error` (not clap's default exit 2): they emit a waybar error object, or a structured error when the raw argv asked for `--output json`, always exit 0. `--help`/`--version` print normally
- Tooltip always uses Nerd Font icons regardless of `--icons` setting (for monospace alignment)
- Response cache uses flock-based file locking (`cache.rs`) with 60s TTL
- Theme resolution chain (`theme.rs::load_from`): Omarchy theme at `$XDG_STATE_HOME/omarchy/current/theme/colors.toml` (default `~/.local/state/...`, legacy `~/.config/omarchy/...` as fallback) → pywal cache at `$XDG_CACHE_HOME/wal/colors.json` (default `~/.cache/...`) → built-in One Dark defaults. pywal is consulted only when no Omarchy theme file was found
- Omarchy theme keys: prefer the semantic names current themes ship (`accent`, `foreground`, `background`, `red`, `green`, `yellow`, `orange`); `color1/2/3` are the legacy fallback
- pywal mapping: `special.foreground`/`special.background` → text/dim blend, `color4` (fallback `special.cursor`) → accent, `color2` → green, `color3` → yellow, `color1` → error. pywal has no orange slot — synthesize it as the yellow⊕red midpoint, never alias it to red (that flattens gauges across the widget family)
- A missing or non-hex value must only affect its own field — never sink the whole theme load. Values are validated with the strict `is_hex_color` (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`) so malformed colors can't reach Pango markup
- Theme loading must never panic or error: absent/unreadable/invalid files degrade silently to the next tier, preserving exit 0
- Font Awesome icons are wrapped in Pango markup (`<span>`) for correct rendering in Waybar
