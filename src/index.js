import { zoom } from "d3-zoom";
import { transition } from "d3-transition";
import { select } from "d3-selection";
import { partition, stratify } from "d3-hierarchy";
import intervals from "./intervals.json";

const margins = { bottom: 60 }; // 5 * tickLength and then some
const defaultConfig = {
  width: 960,
  height: 380,
  tickLength: 10,
  neighborWidth: 25,
  fontSize: 12,
};

const labelVisible = (d) => +(d.x1 - d.x0 > 14);

const hierarchicalData = stratify()(intervals).sum((d) =>
  d.leaf ? d.start - d.end : 0
);

export function geoTimescale(parentSelector, config = defaultConfig) {
  const { tickLength, width, height, neighborWidth, fontSize } = config;
  const font = `${fontSize}px sans-serif`;

  // Create a new d3 partition layout
  const makePartition = (data) =>
    partition()
      .size([width, height - margins.bottom])
      .padding(0)(data);

  const root = makePartition(hierarchicalData);

  const svg = select(parentSelector)
    .append("svg")
    .attr("viewBox", [0, 0, width, height + tickLength * 2]) //hacky fix should
    .style("font", font);

  const g = svg.append("g").attr("cursor", "grab");

  svg.call(
    zoom()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([1, 8])
      .on("zoom", zoomed)
      .on("end", () => {
        g.attr("cursor", "grab");
      })
  );

  let focus = root;
  geoTimescale.focus = focus;

  // Observable code
  // Make this into a view, so that the currently hovered sequence is available to the breadcrumb
  // const element = svg.node();
  // element.value = { sequence: [] };

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
      // Update the value of this view with the currently hovered sequence and percentage
      // observable code
      // element.value = { sequence };
      // element.dispatchEvent(new CustomEvent("input"));
    })
    .on("click", clicked);

  svg.on("pointerleave", () => {
    cell.attr("fill-opacity", 1);
    // Update the value of this view
    // observable code

    // element.value = { sequence: "" };
    // element.dispatchEvent(new CustomEvent("input"));
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

  // if (validSelection) {
  //   const matchNode = root.find((d) => d.data.name === selectedInterval);

  //   clicked(null, matchNode);
  // }

  function clicked(event, p) {
    focus = focus === p ? (p = p.parent) : p;
    geoTimescale.focus = focus;
    hideSmallTicks = [0, 1].includes(focus.depth);

    const focusAncestors = focus.ancestors().slice(1); // Ignore clicked node itself

    const t = event ? transition().duration(450) : null; // Can't transition when using input, bit of a hack

    // Show a bit of the neighbouring cells on focus of an interval
    const leftNeighbor =
      focus.data.start === root.data.start ? 0 : neighborWidth;
    const rightNeighbor = focus.data.end === root.data.end ? 0 : neighborWidth;

    root.each(
      (d) =>
        (d.target = {
          x0:
            leftNeighbor +
            ((d.x0 - p.x0) / (p.x1 - p.x0)) *
              (width - rightNeighbor - leftNeighbor),
          x1:
            leftNeighbor +
            ((d.x1 - p.x0) / (p.x1 - p.x0)) *
              (width - rightNeighbor - leftNeighbor),
          y0: d.y0,
          y1: d.y1,
        })
    );

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

  function zoomed(e) {
    if (!root.target) return;

    const translateX = e.transform.x;

    if (
      translateX + root.target.x0 > 0 ||
      root.x1 - translateX > root.target.x1
    )
      return;

    g.attr("cursor", "grabbing");
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
            .attr("y2", (d) => margins.bottom - d.depth * tickLength);

          tick
            .append("text")
            .attr("x", 0)
            .attr("y", (d) => margins.bottom - d.depth * tickLength + 4)
            .attr("dominant-baseline", "hanging")
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
