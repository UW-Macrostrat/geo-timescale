import type { HierarchyRectangularNode } from "d3-hierarchy";

/**
 * A node in the interval tree: the root or an eon down to an age.
 * `src/intervals*.json` follow this shape.
 */
export interface Interval {
  name: string;
  /** Standard geologic map abbreviation, shown when the cell is too narrow */
  abbr?: string;
  /** Label color; set when the fill color is too dark for black text */
  textColor?: string;
  /** ICS chart fill color */
  color: string;
  /** Older boundary age in Ma */
  start: number;
  /** Younger boundary age in Ma */
  end: number;
  /** Sub-intervals, ordered oldest first; absent on leaves */
  children?: Interval[];
}

export interface GeoTimescaleConfig {
  /** Width of the SVG in pixels (default 960) */
  width?: number;
  /** Height of the SVG in pixels (default 400) */
  height?: number;
  /** Length of the age ticks on the scale bar (default 10) */
  tickLength?: number;
  /** Width reserved for neighboring intervals on zoom (default 25) */
  neighborWidth?: number;
  /** Label font size in pixels (default 12) */
  fontSize?: number;
  /** Interval tree to display; defaults to the bundled English ICS data */
  intervals?: Interval;
}

/** An interval with the d3 hierarchy/partition node fields and methods. */
export type IntervalNode = HierarchyRectangularNode<Interval>;

/** Live view of a rendered timescale's interaction state. */
export interface GeoTimescaleInstance {
  /** The currently focused (zoomed-to) interval */
  focus: IntervalNode;
  /**
   * While an interval is hovered or keyboard-focused, its ancestor path,
   * root first; empty otherwise
   */
  sequence: IntervalNode[];
}

/**
 * Renders an interactive, zoomable geologic timescale into the container
 * matched by `parentSelector`.
 */
export function geoTimescale(
  parentSelector: string,
  config?: GeoTimescaleConfig
): GeoTimescaleInstance;
