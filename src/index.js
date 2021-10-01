import { zoom } from "d3-zoom";
import { transition } from "d3-transition";
import { select } from "d3-selection";
import { partition, stratify } from "d3-hierarchy";
import intervals from "./intervals.json";

const defaults = {
  width: 960,
  height: 400,
  tickLength: 10,
  neighborWidth: 25,
  fontSize: 12,
};

const margins = { bottom: 65 };

const labelVisible = (d) => +(d.x1 - d.x0 > 14);

const hierarchicalData = stratify()(intervals).sum((d) =>
  d.leaf ? d.start - d.end : 0
);

export function geoTimescale(parentSelector, config = {}) {
  const {
    tickLength = defaults.tickLength,
    width = defaults.width,
    height = defaults.height,
    neighborWidth = defaults.neighborWidth,
    fontSize = defaults.fontSize,
  } = config;
  const font = `${fontSize}px sans-serif`;

  // Create a new d3 partition layout
  const makePartition = (data) =>
    partition()
      .size([width, height - margins.bottom])
      .padding(0)(data);

  const root = makePartition(hierarchicalData);

  const svg = select(parentSelector)
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .style("font", font);

  const g = svg.append("g");

  let focus = root;

  // Expose focus and ancestors
  geoTimescale.focus = focus;
  geoTimescale.sequence = [];

  let hideSmallTicks = true;

  const cellGroup = g.append("g").attr("id", "cells");

  const cell = cellGroup
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  const rect = cell
    .append("rect")
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("fill", (d) => d.data.color)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .attr("cursor", "pointer")
    .on("pointerenter", (_event, d) => {
      // Get the ancestors of the current segment
      const sequence = d.ancestors().reverse();
      // Highlight the ancestors
      cell.attr("fill-opacity", (d) => (sequence.includes(d) ? 1.0 : 0.5));

      geoTimescale.sequence = sequence;
    })
    .on("click", clicked);

  svg.on("pointerleave", () => {
    cell.attr("fill-opacity", 1);
    geoTimescale.sequence = [];
  });

  cell.append("title").text((d) => {
    const sequence = d
      .ancestors()
      .map((d) => d.data.name)
      .reverse();

    return `${sequence.join(" > ")}`;
  });

  const text = cell
    .append("text")
    .style("user-select", "none")
    .attr("pointer-events", "none")
    .attr("x", (d) => {
      const textX = (d.x1 - d.x0) / 2;
      return Number.isNaN(textX) ? 0 : textX;
    })
    .attr("y", (d) => (d.y1 - d.y0) / 2)
    .attr("fill", (d) => d.data.textColor ?? "black")
    .attr("fill-opacity", labelVisible)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text((d) => {
      const rectWidth = d.x1 - d.x0;
      const labelWidth = getTextWidth(d.data.name, font);
      const abbrev = d.data.abbr || d.data.name.charAt(0);

      return rectWidth - 10 < labelWidth ? abbrev : d.data.name;
    });

  // Append ages ticks scale bar
  const ticksGroup = g
    .append("g")
    .attr("id", "ticks")
    .attr("transform", `translate(0,${height - margins.bottom})`); // Move tick group down

  ticksGroup.call((g) => ticks(g, makeTicksData(root), hideSmallTicks));

  function clicked(event, p) {
    focus = p === focus ? p.parent : p;
    geoTimescale.focus = focus;
    hideSmallTicks = [0, 1].includes(focus.depth);

    const focusAncestors = focus.ancestors().slice(1); // Ignore clicked node itself

    const t = event ? transition().duration(450) : null; // Can't transition when using input, bit of a hack

    // Show a bit of the neighbouring cells on focus of an interval
    const leftNeighbor =
      focus.data.start === root.data.start ? 0 : neighborWidth;
    const rightNeighbor = focus.data.end === root.data.end ? 0 : neighborWidth;

    root.each((d) => {
      const widthMinusNeighbors = width - rightNeighbor - leftNeighbor;
      const focusWidth = focus.x1 - focus.x0; // partition width of focused node

      const target = {
        x0:
          leftNeighbor + ((d.x0 - focus.x0) / focusWidth) * widthMinusNeighbors,
        x1:
          leftNeighbor + ((d.x1 - focus.x0) / focusWidth) * widthMinusNeighbors,
        y0: d.y0,
        y1: d.y1,
      };

      d.target = target;
    });

    // Reset drag
    g.transition(t).attr("transform", "translate(0,0)");

    cell
      .transition(t)
      .attr("transform", (d) => `translate(${d.target.x0},${d.target.y0})`);

    rect
      .transition(t)
      .attr("width", (d) => +(d.target.x1 - d.target.x0))
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    if (event) {
      select(this)
        .transition(t)
        .attr("stroke", "black")
        .attr("stroke-width", 1.5);

      select(this.parentNode).raise();
    }

    text
      .transition(t)
      .attr("fill-opacity", (d) =>
        focusAncestors.includes(d) ? 1 : labelVisible(d.target)
      )
      .attr("x", (d) => {
        // Position all the ancestors labels in the middle
        if (focusAncestors.includes(d)) {
          return -d.target.x0 + width / 2;
        }
        const rectWidth = d.target.x1 - d.target.x0;
        const textX = rectWidth / 2;

        return Number.isNaN(textX) ? -10 : textX;
      })
      .text((d) => {
        const rectWidth = d.target.x1 - d.target.x0;
        const labelWidth = getTextWidth(d.data.name, font);
        const abbrev = d.data.abbr || d.data.name.charAt(0);

        return rectWidth - 8 < labelWidth ? abbrev : d.data.name;
      });

    ticksGroup.call((g) => ticks(g, makeTicksData(root), hideSmallTicks, t));
  }

  svg.call(
    zoom()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([1, 8])
      .on("zoom", zoomed)
      .on("end", () => {
        rect.attr("cursor", "pointer");
      })
  );

  function zoomed(e) {
    if (!root.target) return;

    const translateX = e.transform.x;

    if (
      translateX + root.target.x0 > 0 ||
      root.x1 - translateX > root.target.x1
    )
      return;

    rect.attr("cursor", "grabbing");
    g.attr("transform", `translate(${translateX},0)`);
  }

  function ticks(g, data, hideSmallTicks, t) {
    g.selectAll("g")
      .data(data)
      .join(
        (enter) => {
          const tick = enter
            .append("g")
            .attr("transform", (d) => `translate(${d.x}, 0)`)
            .attr("text-anchor", (d) =>
              d.x === 0 ? "start" : d.x === width ? "end" : "middle"
            )
            .attr("opacity", (d) =>
              [4, 5].includes(d.depth) && hideSmallTicks ? 0 : 1
            );

          tick
            .append("line")
            .attr("stroke", "#555")
            .attr("stroke-width", 1)
            .attr("x1", 0)
            .attr("y1", 2)
            .attr("x2", 0)
            .attr(
              "y2",
              (d) => margins.bottom - d.depth * tickLength - fontSize
            );

          tick
            .append("text")
            .attr("x", 0)
            .attr(
              "y",
              (d) => margins.bottom - d.depth * tickLength - fontSize / 2
            )
            .attr("dominant-baseline", "middle")
            .attr("font-size", (d) => `${1 - 0.05 * d.depth}em`)
            .text((d) => d.text)
            .clone(true)
            .lower()
            .attr("stroke-linejoin", "round")
            .attr("stroke-width", 2)
            .attr("stroke", "white");
        },
        (update) =>
          update
            .transition(t)
            .attr("opacity", (d) =>
              [4, 5].includes(d.depth) && hideSmallTicks ? 0 : 1
            )
            .attr("transform", (d) => `translate(${d.targetX}, 0)`)
            .attr("dominant-baseline", "hanging")
            .attr("text-anchor", (d) =>
              d.targetX === 0 ? "start" : d.targetX === width ? "end" : "middle"
            )
      );
  }
}

function makeTicksData(root, width = 960) {
  const uniqueStartAges = new Set(
    root.descendants().map((node) => node.data.start)
  );

  const ticksData = Array.from(uniqueStartAges)
    .map((start) =>
      root.descendants().find((node) => node.data.start === start)
    )
    .map((d) => ({
      x: d.x0,
      depth: d.depth,
      targetX: d?.target?.x0 || 0,
      text: d.data.start,
    }));

  const now = {
    x: root.x1,
    depth: 0,
    targetX: root?.target?.x1 || width,
    text: 0,
  };

  ticksData.push(now);

  return ticksData;
}

// Via https://stackoverflow.com/questions/1636842/svg-get-text-element-width
function getTextWidth(text, font) {
  // re-use canvas object for better performance
  var canvas =
    getTextWidth.canvas ||
    (getTextWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  const metrics = context.measureText(text);

  return metrics.width;
}

// export default geoTimescale
