geo-timescale
=============

A modular D3.js-based geologic time scale that utilizes data from the [Paleobiology Database](http://paleobiodb.org).

To use, simply include ````timescale.js```` and ````timescale.css```` in your HTML document, and initialize into the div of your choice with ````timescale.init("id-of-div")````.

A live demo can be found at http://bl.ocks.org/julesblm/a25026573de31ea91a2a779d3366929b

## D3 v5 version

Transtition animations are now concurrent. Unfortunately because the way the new d3.hierarchy partition function works, "interval_hash" no longer works the same way as in the previous  version.

### Funding

Development supported by NSF EAR-0949416.
