# geo-timescale

A modular D3.js-based geologic time scale that utilizes data from the [Paleobiology Database](http://paleobiodb.org). A live demo can be found at [Observable](https://observablehq.com/@julesblm/geological-time-scale-2021).

```js
import { geoTimescale } from "geotimescale";

geoTimescale("#timescale-container", [config]);
```

The `config` parameter is an object can contain the following properties:

- `width`
- `height`
- `tickLength`
- `neighborWidth`
- `fontSize`

If any of these properties is not present, a default value will be used.

## Funding

Development of first version supported by NSF EAR-0949416.
