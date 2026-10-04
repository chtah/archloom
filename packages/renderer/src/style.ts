import type { FlowMessage, GraphEdge, GraphNode, Lane } from "@coldtea/pr-lens-schema";
import type { Box } from "./geometry.js";

/** Paths and pills are in drawing coordinates; add atlas.shift for canvas coordinates. */
export type RecordedLine = {
  id: string;
  from: string;
  to: string;
  d: string;
  pill?: Box;
} & ({ kind: "edge" } | { kind: "message"; flow: string });

/** Private engine hooks. Icon markup must already be trusted by the caller. */
export type RenderStyle = {
  colours?: readonly string[];
  nodeAccent?: (node: GraphNode) => string | undefined;
  /** Trusted SVG child markup in a 24×24 coordinate space, scaled into a 16×16 chip area. */
  nodeIcon?: (node: GraphNode) => string | undefined;
  edgeColour?: (edge: GraphEdge) => string | undefined;
  edgeDash?: (edge: GraphEdge) => string | undefined;
  laneTint?: (lane: Lane) => string | undefined;
  laneInfo?: (lane: Lane) => string | undefined;
  messageColour?: (message: FlowMessage) => string | undefined;
  onLine?: (line: RecordedLine) => void;
};

type StyleScope = { style: RenderStyle; colours: Set<string> };
let scope: StyleScope | undefined;

export const currentStyle = (): RenderStyle | undefined => scope?.style;

/** Synchronous, reentrant isolation, including when a resolver throws. */
export const withStyle = <T>(style: RenderStyle | undefined, paint: () => T): T => {
  const previous = scope;
  scope = style === undefined ? undefined : { style, colours: new Set(style.colours?.map((colour) => colour.toLowerCase())) };
  try {
    return paint();
  } finally {
    scope = previous;
  }
};

/** Hex digits are encoded without sanitization collisions. */
export const colourMarkerId = (colour: string, open = false): string => {
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(colour))
    throw new Error("Style marker colours must be hex colours");
  return `${open ? "mko" : "mk"}-colour-${colour.slice(1).toLowerCase()}`;
};

export const colourMarker = (colour: string, open = false): string => {
  const id = colourMarkerId(colour, open);
  scope?.colours.add(colour.toLowerCase());
  return `url(#${id})`;
};

export const markerColours = (): readonly string[] => [...(scope?.colours ?? [])];
