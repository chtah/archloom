import type { LayoutHints } from "@coldtea/pr-lens-schema";
import {
  LANE_BOTTOM_PADDING,
  LANE_GAP,
  LANE_PADDING_X,
  ROW_GAP,
  TRACK_CLEARANCE,
  TRACK_PITCH_MIN,
} from "../design.js";
import { union } from "../bounds.js";
import type { Box } from "../geometry.js";
import type { ScopedGraph } from "../scope.js";
import {
  layoutArchitecture,
  occupiedBoxes,
  type ArchitectureLayout,
  type GapExpansions,
} from "./architecture.js";
import {
  chooseRetiredRoutes,
  routeAndCount,
  routeEdges,
  type ChannelTraffic,
  type RoutedEdge,
} from "./edges.js";
import { placeLabelPills, type LabelPlacement } from "./labels.js";

/**
 * Layout and routing with the pitch floor held: any gap whose traffic would
 * compress its tracks below TRACK_PITCH_MIN is widened to exactly what that
 * traffic needs, and the graph is laid out again around the wider gap. The
 * extra room is a pure function of the traffic count, so one added route
 * moves the lanes or rows beside a saturated gap by one pitch step — a small
 * change staying a small move — and an uncrowded document is laid out
 * exactly as if this pass did not exist.
 *
 * A gap is also widened when a label has nowhere on or beside its line to
 * sit — a straight line across a gap has only its width for a pill. Pills read
 * left to right, so that is the gap a horizontal line crosses: a corridor
 * when lanes run left to right, a band between columns when they run down.
 */
export const relieveCongestion = (
  graph: ScopedGraph,
  hints: LayoutHints | undefined,
): { layout: ArchitectureLayout; routed: RoutedEdge[]; pills: Map<string, Box> } => {
  let expansions: GapExpansions = { corridors: new Map(), bands: new Map() };
  let labelRoom = new Map<number, number>();
  let layout = layoutArchitecture(graph, hints, expansions);
  const retired = chooseRetiredRoutes(graph.edges, layout);
  let placed: { routed: RoutedEdge[]; labels: LabelPlacement } | undefined;

  // Widening never changes which gaps the routes choose — plans are made of
  // lane and row indices — so traffic settles after one widening. Label room
  // only grows, so that settles too. The bound is a backstop.
  for (let round = 0; round < 6; round += 1) {
    const { routed, traffic } = routeAndCount(graph.edges, layout, retired);
    const needed = expansionsFor(traffic, layout, labelRoom);
    if (!sameExpansions(needed, expansions)) {
      expansions = needed;
      layout = layoutArchitecture(graph, hints, expansions);
      placed = undefined;
      continue;
    }

    placed = { routed, labels: labelsOn(layout, routed) };
    const grown = grownRoom(
      labelRoom,
      placed.labels.cramped,
      layout.direction === "right" ? traffic.corridorsByEdge : traffic.bandsByEdge,
    );
    if (sameEntries(grown, labelRoom)) break;
    labelRoom = grown;
    expansions = expansionsFor(traffic, layout, labelRoom);
    layout = layoutArchitecture(graph, hints, expansions);
    placed = undefined;
  }

  if (placed === undefined) {
    const routed = routeEdges(graph.edges, layout, retired);
    placed = { routed, labels: labelsOn(layout, routed) };
  }
  return { layout, routed: placed.routed, pills: placed.labels.boxes };
};

const labelsOn = (layout: ArchitectureLayout, routed: readonly RoutedEdge[]): LabelPlacement =>
  placeLabelPills(routed, occupiedBoxes(layout.nodes), union(layout.lanes.map(({ box }) => box)));

/** Air either side of a corridor-filling pill, so the arrowheads still show. */
const LABEL_CORRIDOR_AIR = 12;

/** Only ever grows, which is what lets the loop settle. */
const grownRoom = (
  room: ReadonlyMap<number, number>,
  cramped: ReadonlyMap<string, number>,
  gapsByEdge: ReadonlyMap<string, readonly number[]>,
): Map<number, number> => {
  const grown = new Map(room);
  for (const [id, pillWidth] of cramped) {
    const width = pillWidth + LABEL_CORRIDOR_AIR * 2;
    for (const index of gapsByEdge.get(id) ?? [])
      grown.set(index, Math.max(grown.get(index) ?? 0, width));
  }
  return grown;
};

/** Room for this many tracks at the floor pitch, plus clearance to the cards. */
const widthNeeded = (traffic: number): number =>
  (traffic - 1) * TRACK_PITCH_MIN + TRACK_CLEARANCE * 2;

const CORRIDOR_WIDTH = LANE_PADDING_X * 2 + LANE_GAP;

/** `labelRoom` is keyed by corridor left to right and by band top to bottom. */
const expansionsFor = (
  traffic: ChannelTraffic,
  layout: ArchitectureLayout,
  labelRoom: ReadonlyMap<number, number>,
): GapExpansions => {
  const { grid } = layout;
  const corridorRoom = layout.direction === "right" ? labelRoom : new Map<number, number>();
  const bandRoom = layout.direction === "right" ? new Map<number, number>() : labelRoom;

  const corridors = new Map<number, number>();
  for (const index of new Set([...traffic.corridors.keys(), ...corridorRoom.keys()])) {
    const count = traffic.corridors.get(index) ?? 0;
    const width = Math.max(count > 0 ? widthNeeded(count) : 0, corridorRoom.get(index) ?? 0);
    const extra = width - CORRIDOR_WIDTH;
    if (extra > 0) corridors.set(index, extra);
  }

  const bands = new Map<number, number>();
  for (const index of new Set([...traffic.bands.keys(), ...bandRoom.keys()])) {
    const count = traffic.bands.get(index) ?? 0;
    // The band after the last row is the sliver of lane bottom padding.
    const width = index === grid.rows.length ? LANE_BOTTOM_PADDING : ROW_GAP;
    const extra = Math.max(count > 0 ? widthNeeded(count) : 0, bandRoom.get(index) ?? 0) - width;
    if (extra > 0) bands.set(index, extra);
  }

  return { corridors, bands };
};

const sameExpansions = (a: GapExpansions, b: GapExpansions): boolean =>
  sameEntries(a.corridors, b.corridors) && sameEntries(a.bands, b.bands);

const sameEntries = (a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
