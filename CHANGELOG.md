# Changelog

## [Unreleased]

### Added

- TypeScript types (`index.d.ts`, referenced by JSDoc in the source)
- The interval data ships in the npm package:
  `import intervals from "@macrostrat/d3-timescale/intervals.nl.json" with { type: "json" }`
- `npm run release` (release-it) automates version bump, changelog dating,
  tag, GitHub release, and npm publish

- `build:data` script that generates the interval data from the
  [ICS chart linked-data](https://github.com/i-c-stratigraphy/chart)
- Language support in the build script (`--lang=nl`), with Dutch data in
  `src/intervals.nl.json`
- `--convention` flag in the build script: geochronologic qualifiers by
  default ("Early Jurassic", "Vroeg-Jura"), `--convention=stratigraphic` for
  chronostratigraphic ones ("Lower Jurassic", "Onder-Jura"), following select elements on the [official chart](https://stratigraphy.org/chart/?language=nl&scale=log) page.
- `intervals` config option to pass custom (e.g. localized) interval data
- `geoTimescale` returns `{ focus, sequence }` for the focused interval and
  hovered ancestor path
- New demo page
- Keyboard accessibility: arrow keys move between intervals, Enter/Space
  zooms, cells carry ARIA labels and a visible focus ring

### Changed

- Interval data updated to [ICS chart v2026/06](https://stratigraphy.org/supplementary#data), replacing the 2021 Paleobiology Database snapshot
- Data format is now a nested tree without PBDB ids, consumed with
  `d3.hierarchy()` instead of an extra `stratify()` call.
- Build tooling switched from microbundle to tsdown for ESM-only output.
- ESLint upgraded to v9 flat config

### Removed

- CommonJS and UMD builds
- `dist/` is no longer committed

### Fixed

- Multiple timescales on one page no longer overwrite each other's layout and
  state
- Overlapping age tick labels (e.g. the Phanerozoic periods at full zoom-out)
  are hidden in favor of more important boundaries; their tick lines remain
- Zooming to very short intervals (e.g. the Holocene) no longer makes cells
  jitter and vanish; off-screen layout coordinates are clamped to stay within
  the browser's float32 rasterization precision
- Zooming out from the fully zoomed-out root no longer throws a console
  TypeError
