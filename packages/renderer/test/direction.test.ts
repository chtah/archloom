import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { describe, expect, it } from "vitest";
import { gapBetween } from "../src/bounds.js";
import { PILL_CARD_CLEARANCE, TRACK_CLEARANCE, TRACK_PITCH_MAX, TRACK_PITCH_MIN } from "../src/design.js";
import type { Box } from "../src/geometry.js";
import { occupiedBoxes } from "../src/layout/architecture.js";
import { relieveCongestion } from "../src/layout/congestion.js";
import { channelTraffic, chooseRetiredRoutes } from "../src/layout/edges.js";
import { render } from "../src/index.js";
import { expectGolden } from "./goldens.js";
import { tiers } from "./tiers.js";

const down = (doc: GraphDoc): GraphDoc => ({
  ...doc,
  layout: { laneOrder: [], ...doc.layout, direction: "down" },
});
const right = (doc: GraphDoc): GraphDoc => ({
  ...doc,
  layout: { laneOrder: [], ...doc.layout, direction: "right" },
});
const scoped = (doc: GraphDoc) => ({ lanes: doc.lanes, nodes: doc.nodes, edges: doc.edges, flows: doc.flows });

const apart = (a: Box, b: Box): boolean =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe("layout.direction: down", () => {
  it("records the top-to-bottom bytes its review saw", () => {
    const doc = down(tiers.find(({ name }) => name === "tier4-checkout")?.doc as GraphDoc);
    expectGolden("tier4-checkout.down.architecture.dark.svg", render(doc, { lens: "architecture", theme: "dark" }).svg);
  });

  it("leaves left to right exactly as it was when right is spelled out", () => {
    for (const { doc } of tiers) {
      const unset: GraphDoc = { ...doc, layout: doc.layout === undefined ? undefined : { ...doc.layout, direction: "right" } };
      expect(render(right(doc), { lens: "architecture", theme: "dark" }).svg).toBe(
        render(unset, { lens: "architecture", theme: "dark" }).svg,
      );
    }
  });

  for (const { name, doc } of tiers)
    describe(name, () => {
      const turned = down(doc);
      const { layout, routed, pills } = relieveCongestion(scoped(turned), turned.layout);

      it("draws the same bytes twice", () => {
        const draw = () => render(turned, { lens: "architecture", theme: "light" }).svg;
        expect(draw()).toBe(draw());
      });

      it("stacks lanes down the page, each spanning the full width", () => {
        layout.lanes.forEach(({ box }, index) => {
          const next = layout.lanes[index + 1]?.box;
          expect(box.x).toBe(layout.lanes[0]?.box.x);
          expect(box.width).toBe(layout.lanes[0]?.box.width);
          if (next !== undefined) expect(next.y).toBeGreaterThan(box.y + box.height);
        });
      });

      it("keeps every card inside its lane, clear of every other, with rows as columns", () => {
        for (const placed of layout.nodes) {
          const lane = layout.lanes[placed.laneIndex]?.box;
          expect(lane).toBeDefined();
          if (lane !== undefined) expect(contains(lane, placed.box)).toBe(true);
          const column = layout.grid.rows[placed.row];
          expect(placed.box.x).toBe(column?.top);
          for (const other of layout.nodes)
            if (other !== placed) expect(apart(placed.box, other.box), `${placed.node.id} overlaps ${other.node.id}`).toBe(true);
        }
      });

      it("puts every label once, clear of cards and of each other", () => {
        expect(pills.size).toBe(turned.edges.filter((edge) => edge.label !== undefined).length);
        const boxes = [...pills.values()];
        boxes.forEach((a, index) => {
          for (const b of boxes.slice(index + 1)) expect(apart(a, b)).toBe(true);
        });
        for (const [id, pill] of pills)
          for (const box of occupiedBoxes(layout.nodes))
            expect(gapBetween(pill, box), `the ${id} pill crowds a card`).toBeGreaterThanOrEqual(PILL_CARD_CLEARANCE);
      });

      it("ends every route on the cards it connects", () => {
        const byId = new Map(layout.nodes.map((placed) => [placed.node.id, placed.box]));
        for (const { edge, curve } of routed) {
          const touches = (box: Box | undefined, point: { x: number; y: number }) =>
            box !== undefined && gapBetween(box, { ...point, width: 0, height: 0 }) < 0.01;
          const end = curve.segments[curve.segments.length - 1]?.to ?? curve.from;
          expect(touches(byId.get(edge.from), curve.from), `${edge.id} leaves its source`).toBe(true);
          expect(touches(byId.get(edge.to), end), `${edge.id} reaches its target`).toBe(true);
        }
      });

      it("holds the track pitch floor in every gap", () => {
        const traffic = channelTraffic(turned.edges, layout, chooseRetiredRoutes(turned.edges, layout));
        const pitch = (width: number, count: number) =>
          Math.min(TRACK_PITCH_MAX, (width - TRACK_CLEARANCE * 2) / (count - 1));
        for (const [index, count] of traffic.corridors) {
          const corridor = layout.grid.corridors[index];
          if (count < 2 || corridor === undefined) continue;
          expect(pitch(corridor.right - corridor.left, count)).toBeGreaterThanOrEqual(TRACK_PITCH_MIN);
        }
        for (const [index, count] of traffic.bands) {
          const before = layout.grid.rows[index - 1];
          if (count < 2 || before === undefined) continue;
          const after = layout.grid.rows[index]?.top ?? layout.grid.laneBottom;
          expect(pitch(after - (before.top + before.height), count)).toBeGreaterThanOrEqual(TRACK_PITCH_MIN);
        }
      });

      it("reports the cards it drew in the atlas", () => {
        const drawn = render(turned, { lens: "architecture", theme: "dark" });
        const shift = drawn.atlas.shift ?? { x: 0, y: 0 };
        for (const placed of layout.nodes) {
          const box = drawn.atlas.nodes[placed.node.id];
          expect(box?.x).toBeCloseTo(placed.box.x + shift.x, 2);
          expect(box?.y).toBeCloseTo(placed.box.y + shift.y, 2);
          expect(drawn.svg).toContain(`width="${box?.width}" height="${box?.height}"`);
        }
      });
    });
});
