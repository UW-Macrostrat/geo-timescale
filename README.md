# geo-timescale

[![npm version](https://badge.fury.io/js/@macrostrat%2Fd3-timescale.svg)](https://www.npmjs.com/package/@macrostrat/d3-timescale)

A modular D3.js-based geologic time scale that utilizes data from the [Paleobiology Database](http://paleobiodb.org).
A live demo (v2) can be found at [Observable](https://observablehq.com/@julesblm/geological-time-scale-2021).

A live demo of v1 (compatible with d3 version 3) can be found at
[bl.ocks.org](http://bl.ocks.org/jczaplew/7546689).

```js
import { geoTimescale } from "@macrostrat/d3-timescale";

geoTimescale("#timescale-container", [config]);
```

## Usage

The `config` parameter is an object can contain the following properties:

- `width`
- `height`
- `tickLength`
- `neighborWidth`
- `fontSize`

If any of these properties is not present, a default value will be used.

## Installing

The package is published at NPM at [`@macrostrat/d3-timescale`](https://www.npmjs.com/package/@macrostrat/d3-timescale).

```bash
npm install @macrostrat/d3-timescale
```

## Funding

Development of first version supported by NSF EAR-0949416.
