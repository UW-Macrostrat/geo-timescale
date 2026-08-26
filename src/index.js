import { zoom, zoomIdentity } from "d3-zoom";
import { transition } from "d3-transition";
import { select } from "d3-selection";
import { partition, hierarchy } from "d3-hierarchy";
// The import attribute lets browsers load this module unbundled (see demo.html)
import defaultIntervals from "./intervals.json" with { type: "json" };

const defaults = {
  width: 960,
  height: 400,
  tickLength: 10,
  neighborWidth: 25,
  fontSize: 12,
};

const margins = { bottom: 65 };

// Depths in the ICS interval hierarchy:
// 0 = root, 1 = eon, 2 = era, 3 = period, 4 = epoch, 5 = age
const EON_DEPTH = 1;
const EPOCH_DEPTH = 4;

const labelVisible = (d) => +(d.x1 - d.x0 > 14);

/** @typedef {import("../index").Interval} Interval */
/** @typedef {import("../index").GeoTimescaleConfig} GeoTimescaleConfig */
/** @typedef {import("../index").GeoTimescaleInstance} GeoTimescaleInstance */

/**
 * Renders an interactive, zoomable geologic timescale into the container
 * matched by `parentSelector`.
 *
 * @param {string} parentSelector CSS selector for the container element
 * @param {GeoTimescaleConfig} [config]
 * @returns {GeoTimescaleInstance}
 */
export function geoTimescale(parentSelector, config = {}) {
  const {
    tickLength = defaults.tickLength,
    width = defaults.width,
    height = defaults.height,
    neighborWidth = defaults.neighborWidth,
    fontSize = defaults.fontSize,
    intervals = defaultIntervals,
  } = config;
  const font = `${fontSize}px sans-serif`;

  // Each instance needs its own hierarchy: partition() writes x0/y0/x1/y1
  // onto the nodes in place, so sharing nodes across instances would let
  // the last-created timescale clobber the others' layout.
  const hierarchicalData = hierarchy(intervals).sum((d) =>
    d.children ? 0 : d.start - d.end
  );

  // Create a new d3 partition layout
  const makePartition = (data) =>
    partition()
      .size([width, height - margins.bottom])
      .padding(0)(data);

  const root = makePartition(hierarchicalData);

  const svg = select(parentSelector)
    .append("svg")
    .attr("class", "geo-timescale")
    .attr("viewBox", [0, 0, width, height])
    .attr("role", "group")
    .attr("aria-label", intervals.name)
    .style("font", font);

  // Replace the browser's default focus outline (thick, rounded) with a
  // stroke matching the click highlight; :focus-visible keeps the ring from
  // appearing on mouse clicks
  svg
    .append("style")
    .text(
      ".geo-timescale rect { outline: none; }\n" +
        ".geo-timescale rect:focus-visible { stroke: black; stroke-width: 1.5; }"
    );

  const g = svg.append("g");

  let focus = root;

  // Returned to the caller; tracks the focused interval and, while hovering,
  // the ancestor path of the hovered interval.
  const instance = { focus, sequence: [] };

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
    // Roving tabindex: a single cell (initially the root) is in the tab
    // order, and the arrow keys move which one (see keydowned)
    .attr("tabindex", (d) => (d === root ? 0 : -1))
    .attr("role", "button")
    .attr(
      "aria-label",
      (d) => `${d.data.name}, ${d.data.start} to ${d.data.end} Ma`
    )
    .on("pointerenter", (_event, d) => highlightAncestors(d))
    .on("focus", (_event, d) => highlightAncestors(d))
    .on("blur", clearHighlight)
    .on("keydown", keydowned)
    .on("click", clicked);

  svg.on("pointerleave", clearHighlight);

  function highlightAncestors(d) {
    const sequence = d.ancestors().reverse();
    cell.attr("fill-opacity", (d) => (sequence.includes(d) ? 1.0 : 0.5));
    instance.sequence = sequence;
  }

  function clearHighlight() {
    cell.attr("fill-opacity", 1);
    instance.sequence = [];
  }

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

  ticksGroup.call((g) => ticks(g, makeTicksData(root, width), hideSmallTicks));

  // Arrow keys move between intervals: Left/Right along a row, Up to the
  // parent, Down to the oldest child. Enter and Space zoom like a click.
  function keydowned(event, d) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      clicked.call(this, event, d);
      return;
    }

    const siblings = d.parent?.children ?? [];
    const index = siblings.indexOf(d);
    const targets = {
      ArrowLeft: index > 0 ? siblings[index - 1] : undefined,
      ArrowRight: siblings[index + 1],
      ArrowUp: d.parent,
      ArrowDown: d.children?.[0],
    };
    const target = targets[event.key];
    if (!target) {
      return;
    }
    event.preventDefault();
    rect.attr("tabindex", (r) => (r === target ? 0 : -1));
    rect
      .filter((r) => r === target)
      .node()
      .focus();
  }

  function clicked(event, p) {
    // Zooming out from the fully zoomed-out root would leave no focus at all
    focus = p === focus ? (p.parent ?? p) : p;
    instance.focus = focus;
    // The activated cell becomes the tab stop, so keyboard focus resumes there
    rect.attr("tabindex", (d) => (d === p ? 0 : -1));
    hideSmallTicks = focus.depth <= EON_DEPTH;

    const focusAncestors = focus.ancestors().slice(1); // Ignore clicked node itself

    const t = transition().duration(450);

    // Show a bit of the neighbouring cells on focus of an interval
    const leftNeighbor =
      focus.data.start === root.data.start ? 0 : neighborWidth;
    const rightNeighbor = focus.data.end === root.data.end ? 0 : neighborWidth;

    // Focusing a very short interval (e.g. Holocene, 0.0117 of 4000 Ma)
    // magnifies targets by up to ~10^6, producing coordinates around 10^8 px.
    // Browsers rasterize in float32 (~32 px steps at that magnitude) and cull
    // oversized geometry, so labels jitter and rects vanish mid-transition.
    // Nothing outside a few viewport widths is visible anyway, so clamp
    // targets near the viewport, and keep the pan range a full viewport
    // width inside the clamp bounds so clamped-off geometry stays out of view.
    const clampMin = -3 * width;
    const clampMax = 4 * width;
    const clampX = (x) => Math.max(clampMin, Math.min(clampMax, x));

    root.each((d) => {
      const widthMinusNeighbors = width - rightNeighbor - leftNeighbor;
      const focusWidth = focus.x1 - focus.x0; // partition width of focused node

      const target = {
        x0: clampX(
          leftNeighbor + ((d.x0 - focus.x0) / focusWidth) * widthMinusNeighbors
        ),
        x1: clampX(
          leftNeighbor + ((d.x1 - focus.x0) / focusWidth) * widthMinusNeighbors
        ),
        y0: d.y0,
        y1: d.y1,
      };

      d.target = target;
    });

    // Clamp panning to the new focus layout and reset any prior pan.
    // Resetting through the zoom behavior keeps its internal transform in
    // sync with the visible position; the zoom handler moves `g`.
    zoomBehavior.translateExtent([
      [Math.max(root.target.x0, clampMin + width), 0],
      [Math.min(root.target.x1, clampMax - width), height],
    ]);
    svg.transition(t).call(zoomBehavior.transform, zoomIdentity);

    cell
      .transition(t)
      .attr("transform", (d) => `translate(${d.target.x0},${d.target.y0})`);

    rect
      .transition(t)
      .attr("width", (d) => +(d.target.x1 - d.target.x0))
      .attr("stroke", "white")
      .attr("stroke-width", 1);

    select(this)
      .transition(t)
      .attr("stroke", "black")
      .attr("stroke-width", 1.5);

    // raise() re-inserts the cell's <g> element, and the browser drops DOM
    // focus from elements that move; restore it so arrow keys keep working
    const hadFocus = document.activeElement === this;
    select(this.parentNode).raise();
    if (hadFocus) {
      this.focus({ preventScroll: true });
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

    ticksGroup.call((g) =>
      ticks(g, makeTicksData(root, width), hideSmallTicks, t)
    );
  }

  // Pan-only behavior: scale is fixed at 1, translateExtent clamps panning to
  // the focused layout (updated on every click)
  const zoomBehavior = zoom()
    .extent([
      [0, 0],
      [width, height],
    ])
    .scaleExtent([1, 1])
    .translateExtent([
      [0, 0],
      [width, height],
    ])
    .on("zoom", zoomed)
    .on("end", () => {
      rect.attr("cursor", "pointer");
    });

  svg.call(zoomBehavior);

  return instance;

  function zoomed(e) {
    if (e.sourceEvent) {
      rect.attr("cursor", "grabbing");
    }
    g.attr("transform", `translate(${e.transform.x},0)`);
  }

  function ticks(g, data, hideSmallTicks, t) {
    // The enter render places ticks at d.x; updates (which always pass a
    // transition) move them to d.targetX, set by `clicked`.
    markOverlappingLabels(data, (d) => (t ? d.targetX : d.x), hideSmallTicks);

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
              d.depth >= EPOCH_DEPTH && hideSmallTicks ? 0 : 1
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
            .attr("opacity", (d) => (d.labelVisible ? 1 : 0))
            .text((d) => d.text)
            .clone(true)
            .lower()
            .attr("stroke-linejoin", "round")
            .attr("stroke-width", 2)
            .attr("stroke", "white");
        },
        (update) => {
          update.each(function (d) {
            select(this)
              .selectAll("text")
              .transition(t)
              .attr("opacity", d.labelVisible ? 1 : 0);
          });

          return update
            .transition(t)
            .attr("opacity", (d) =>
              d.depth >= EPOCH_DEPTH && hideSmallTicks ? 0 : 1
            )
            .attr("transform", (d) => `translate(${d.targetX}, 0)`)
            .attr("dominant-baseline", "hanging")
            .attr("text-anchor", (d) =>
              d.targetX === 0 ? "start" : d.targetX === width ? "end" : "middle"
            );
        }
      );
  }

  // Age labels crowd together where many short intervals meet — most visibly
  // the Phanerozoic boundaries when fully zoomed out. Marks each tick with
  // whether its label fits: shallower (more important) boundaries win, and a
  // label that would overlap an already-kept one is hidden. Its tick line
  // still marks the boundary.
  function markOverlappingLabels(data, getX, hideSmallTicks) {
    const kept = [];
    const byImportance = [...data].sort(
      (a, b) => a.depth - b.depth || getX(a) - getX(b)
    );

    for (const tick of byImportance) {
      if (tick.depth >= EPOCH_DEPTH && hideSmallTicks) {
        tick.labelVisible = false; // the whole tick is hidden at this zoom
        continue;
      }

      // Tick labels shrink with depth via font-size in em, see ticks()
      const tickFont = `${fontSize * (1 - 0.05 * tick.depth)}px sans-serif`;
      const halfWidth = getTextWidth(String(tick.text), tickFont) / 2 + 3;
      const x = getX(tick);

      tick.labelVisible = kept.every(
        (other) => Math.abs(other.x - x) >= other.halfWidth + halfWidth
      );
      if (tick.labelVisible) {
        kept.push({ x, halfWidth });
      }
    }
  }
}

function makeTicksData(root, width) {
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
