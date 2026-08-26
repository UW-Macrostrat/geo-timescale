# geo-timescale

[![npm version](https://badge.fury.io/js/@macrostrat%2Fd3-timescale.svg)](https://www.npmjs.com/package/@macrostrat/d3-timescale)

An interactive, zoomable geologic time scale built with D3.js, showing the
[International Chronostratigraphic Chart](https://stratigraphy.org/chart/) —
eons down to stages, with the ratified boundary ages.

## Installing

```bash
npm install @macrostrat/d3-timescale
```

## Usage

```js
import { geoTimescale } from "@macrostrat/d3-timescale";

geoTimescale("#timescale-container", config);
```

The optional `config` object can contain the following properties:

| Property        | Default              | Description                                                        |
| --------------- | -------------------- | ------------------------------------------------------------------ |
| `width`         | `960`                | Width of the SVG in pixels                                         |
| `height`        | `400`                | Height of the SVG in pixels                                        |
| `tickLength`    | `10`                 | Length of the age ticks on the scale bar                           |
| `neighborWidth` | `25`                 | Width reserved for neighboring intervals on zoom                   |
| `fontSize`      | `12`                 | Label font size in pixels                                          |
| `intervals`     | bundled English data | Interval tree to display, e.g. a localized one (see [Data](#data)) |

Click an interval to zoom to it; click the focused interval to zoom back out.

The chart is keyboard accessible: Tab focuses it, the arrow keys move between
intervals (Left/Right along a row, Up to the parent, Down into the children),
and Enter or Space zooms like a click.

`geoTimescale` returns an object with the currently focused interval node
(`focus`) and, while hovering, the ancestor path of the hovered interval
(`sequence`).

## Demo

The demo ([`index.html`](index.html)) runs straight from `src/` (d3 is loaded
from a CDN), so a fresh clone needs no install or build — just a static file
server:

```bash
npm run demo # runs npx serve; any static file server works
```

and open the printed URL.

## Data

The interval data in `src/intervals.json` is generated from the
[ICS chart linked-data](https://github.com/i-c-stratigraphy/chart) published by
the International Commission on Stratigraphy, and currently reflects chart
version 2026/06. It replaces the [Paleobiology Database](https://paleobiodb.org)
snapshot used by earlier versions of this package.

To regenerate it (for example when the ICS publishes a chart revision):

```bash
npm run build:data
```

The build script can also produce the interval names in any language present
in the ICS data (en, nl, nl-be, de, fr, es, zh, ...):

```bash
node scripts/build-intervals.js --lang=nl   # writes src/intervals.nl.json
```

The subseries names follow the geochronologic (units of time) convention by
default: "Early Jurassic", Dutch "Vroeg-Jura". Pass
`--convention=stratigraphic` for the chronostratigraphic (units of rock)
qualifiers instead: "Lower Jurassic", Dutch "Onder-Jura" — the two column
heading options on the [ICS chart](https://stratigraphy.org/chart/).

Two names are not part of the ICS data and are composed by the script itself:
the root node ("Geologic Time") and the subseries qualifiers above. For
languages without a `LOCALE` entry in the script these fall back to English,
with a warning. To fully localize a new language, add an entry to `LOCALE` in
[`scripts/build-intervals.js`](scripts/build-intervals.js) with the root name,
the qualifiers for both conventions, and how a qualifier joins the base name
(a space in English, a hyphen in Dutch). Pass the generated file to the
`intervals` config option to display it.

See the header comment in [`scripts/build-intervals.js`](scripts/build-intervals.js)
for details on the data format and the few documented corrections applied to
the upstream data.

The generated files ship with the npm package, for use with the `intervals`
config option:

```js
import dutchIntervals from "@macrostrat/d3-timescale/intervals.nl.json" with { type: "json" };

geoTimescale("#timescale-container", { intervals: dutchIntervals });
```

## Releasing

Releases are automated with [release-it](https://github.com/release-it/release-it).
With a clean working tree, an npm login, and a `GITHUB_TOKEN` environment
variable (e.g. ``export GITHUB_TOKEN=`gh auth token` ``):

```bash
npm run release
```

This lints and builds, bumps the version, turns the changelog's Unreleased
section into a dated release section, commits, tags, publishes to npm, and
creates the GitHub release. To release the version already in `package.json`
(like the first 3.0.0), run `npm run release -- --no-increment`.

## Funding

Development of first version supported by NSF EAR-0949416.
