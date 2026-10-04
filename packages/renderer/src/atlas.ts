import { covering, type Canvas } from "./bounds.js";
import { roundCoord, type Box } from "./geometry.js";

/**
 * Where everything a render drew ended up, in the viewBox units of the file
 * beside it.
 *
 * A surface that plays a walkthrough has to put a rim around what a step
 * points at, and a step points at lanes, nodes, edges and flow steps by id
 * alone. Only the renderer knows where any of them landed, and it knows it
 * while it is drawing them, so the geometry travels with the picture rather
 * than being measured back out of it by something that would have to guess.
 */
export type RenderAtlas = {
  /** Canvas translation applied to raw recorded paths and label pills. */
  shift?: { x: number; y: number };
  lanes: Record<string, Box>;
  nodes: Record<string, Box>;
  /** Individual heading hit boxes when a node is drawn in multiple flows. */
  nodeInstances?: Array<{ id: string; flow?: string; box: Box }>;
  edges: Record<string, Box>;
  /** Keyed by flow, then by step: a flow step's id is unique only inside its own flow. */
  messages: Record<string, Record<string, Box>>;
};

/** An atlas for a drawing that has placed nothing. */
export const emptyAtlas = (): RenderAtlas => ({ lanes: {}, nodes: {}, edges: {}, messages: {} });

export type AtlasEntry = { id: string; box: Box };

/** Translate and round one raw drawing box into canvas coordinates. */
export const atlasBox = (box: Box, canvas: Canvas): Box => ({
  x: roundCoord(box.x + canvas.shiftX),
  y: roundCoord(box.y + canvas.shiftY),
  width: roundCoord(box.width),
  height: roundCoord(box.height),
});

/**
 * Boxes onto the canvas and into a record, in the order they were drawn.
 *
 * Each coordinate is rounded on its own, exactly as the one written into the
 * file beside it is, so a box here and the rectangle it stands for cannot
 * disagree in the last place. An id drawn more than once — a participant
 * heading a column in two stacked flows — keeps the box covering every
 * drawing of it, because a reader sent to that node is being sent to all of
 * them.
 */
export const atlasBoxes = (
  entries: readonly AtlasEntry[],
  canvas: Canvas,
): Record<string, Box> => {
  const grown = new Map<string, Box>();
  for (const { id, box } of entries) {
    const current = grown.get(id);
    grown.set(id, current === undefined ? box : covering(current, box));
  }

  const boxes: Record<string, Box> = {};
  for (const [id, box] of grown) boxes[id] = atlasBox(box, canvas);
  return boxes;
};
