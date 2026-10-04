import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { broadcastBaselineGraph, minimalGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { describe, expect, it } from "vitest";
import { draw, render, type RecordedLine } from "../src/index.js";
import { colourMarkerId, currentStyle, withStyle } from "../src/style.js";
import { layoutDataFlow } from "../src/layout/dataflow.js";
import { FLOW_MAX_PULSES_PER_MESSAGE } from "../src/design.js";
import { roundCoord } from "../src/geometry.js";
import { atlasBox } from "../src/atlas.js";
import { CARD_PADDING_X, ICON_CHIP_SIZE } from "../src/design.js";

const architecture = { lens: "architecture", theme: "dark" } as const;

describe("pure drawing and scoped styling", () => {
  it("matches render without a style, including an empty style", () => {
    for (const lens of ["architecture", "data-flow"] as const) {
      const options = { lens, theme: "dark" } as const;
      expect(draw(postmarkRefactorGraph, options).svg).toBe(render(postmarkRefactorGraph, options).svg);
      expect(draw(postmarkRefactorGraph, { ...options, style: {} }).svg).toBe(render(postmarkRefactorGraph, options).svg);
    }
  });

  it("colours chips/outlines without dimming styled cards, keeps glyph fallback, and escapes lane info", () => {
    const plain = draw(broadcastBaselineGraph, architecture).svg;
    const styled = render(broadcastBaselineGraph, {
      ...architecture,
      style: { nodeAccent: () => "#123abc", laneTint: () => "#234bcd", laneInfo: () => "info < &" },
    }).svg;
    expect(plain).toContain('class="cardsh context"');
    expect(styled).not.toContain('class="cardsh context"');
    expect(styled).not.toMatch(/<g class="cardsh"[^>]*opacity=/);
    expect(styled).toMatch(/class="chip"[^>]*fill="#123abc"/);
    expect(styled).toMatch(/class="card"[^>]*stroke="#123abc"/);
    expect(styled).toContain('class="glyph');
    expect(styled).toMatch(/class="lanebox"[^>]*fill="#234bcd"/);
    expect(styled).toContain("info &lt; &amp;");
  });

  it("scales trusted 24×24 icons inside the translated 16×16 chip area", () => {
    const { svg, atlas } = draw(minimalGraph, { ...architecture, style: { nodeIcon: () => '<path data-test="custom" d="M0,0 L24,24"/>' } });
    const box = atlas.nodes[minimalGraph.nodes[0]!.id]!;
    const shift = atlas.shift!;
    const x = roundCoord(box.x - shift.x + CARD_PADDING_X + (ICON_CHIP_SIZE - 16) / 2);
    const y = roundCoord(box.y - shift.y + (box.height - 16) / 2);
    expect(svg).toContain(`<g transform="translate(${x},${y})"`);
    expect(svg).toContain('<g transform="scale(0.6666666666666666)"><path data-test="custom" d="M0,0 L24,24"/></g>');
    expect(svg).not.toContain('class="glyph');
  });

  it("matches edge heads/pulses, preserves muted fading and supports dashes", () => {
    const doc: GraphDoc = {
      ...broadcastBaselineGraph,
      edges: broadcastBaselineGraph.edges.map((edge) => ({ ...edge, emphasis: "muted", animated: true })),
    };
    const recorded: RecordedLine[] = [];
    const { svg, atlas } = draw(doc, { ...architecture, style: {
      colours: ["#ABCDEF", "#abcdef", "#abc"],
      edgeColour: () => "#abcdef", edgeDash: () => "2 6", onLine: (line) => recorded.push(line),
    } });
    expect(recorded).toHaveLength(doc.edges.length);
    for (const line of recorded) {
      expect(line.kind).toBe("edge");
      expect(svg).toContain(`d="${line.d}"`);
      expect(atlas.edges[line.id]).toBeDefined();
      if (line.pill) expect(svg).toContain(`x="${Math.round(line.pill.x * 100) / 100}"`);
    }
    expect(svg).toContain('marker-end="url(#mk-colour-abcdef)"');
    expect(svg).toMatch(/class="edge[^>]*stroke="#abcdef"[^>]*stroke-dasharray="2 6"[^>]*opacity="0.45"/);
    expect(svg).toMatch(/<circle[^>]*fill="#abcdef"/);
    expect(svg.match(/id="mk-colour-abcdef"/g)).toHaveLength(1);
    expect(svg).toContain('id="mk-colour-abc"');
    expect(atlas.shift).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("restores outer styles across nested renders, repeated renders and resolver failures", () => {
    const baseline = draw(minimalGraph, architecture).svg;
    let nested = "";
    const outer = draw(minimalGraph, { ...architecture, style: { nodeAccent: () => {
      nested = draw(minimalGraph, { ...architecture, style: { nodeAccent: () => "#222222" } }).svg;
      expect(draw(minimalGraph, architecture).svg).toBe(baseline);
      return "#111111";
    } } }).svg;
    expect(nested).toContain('stroke="#222222"');
    expect(outer).toContain('stroke="#111111"');
    expect(outer).not.toContain("#222222");
    expect(() => draw(minimalGraph, { ...architecture, style: { nodeAccent: () => { throw new Error("resolver"); } } })).toThrow("resolver");
    expect(draw(minimalGraph, architecture).svg).toBe(baseline);
    const style = { colours: ["#333333"] };
    withStyle(style, () => {
      expect(currentStyle()).toBe(style);
      expect(() => withStyle({}, () => { throw new Error("nested"); })).toThrow("nested");
      expect(currentStyle()).toBe(style);
    });
    expect(currentStyle()).toBeUndefined();
  });

  it("uses collision-safe hex marker ids and refuses non-hex marker colours", () => {
    expect(new Set(["#abc", "#aabbcc", "#abcd", "#aabbccdd"].map((colour) => colourMarkerId(colour))).size).toBe(4);
    expect(() => colourMarkerId("#abcde")).toThrow();
    expect(() => colourMarkerId("red")).toThrow();
  });
});

describe("recorded flow geometry", () => {
  it("retains every participant heading instance across two flows", () => {
    const original = postmarkRefactorGraph.flows[0]!;
    const doc: GraphDoc = { ...postmarkRefactorGraph, views: [], flows: [
      { ...original, id: "first-flow" },
      { ...original, id: "second-flow" },
    ] };
    const layout = layoutDataFlow(doc.flows, doc.nodes, FLOW_MAX_PULSES_PER_MESSAGE);
    const { atlas, svg } = draw(doc, { lens: "data-flow", theme: "dark" });
    const canvas = { width: 0, height: 0, shiftX: atlas.shift!.x, shiftY: atlas.shift!.y };
    const expected = layout.flows.flatMap((flow) => flow.participants.map((participant) => ({
      id: participant.node.id,
      flow: flow.flow.id,
      box: atlasBox(participant.card, canvas),
    })));
    expect(atlas.nodeInstances).toEqual(expected);
    expect(atlas.nodeInstances).toHaveLength(original.participants.length * 2);
    const shared = atlas.nodeInstances!.filter((instance) => instance.id === original.participants[0]!.node);
    expect(shared).toHaveLength(2);
    expect(shared.map((instance) => instance.flow)).toEqual(["first-flow", "second-flow"]);
    expect(shared[0]!.box.y).toBeLessThan(shared[1]!.box.y);
    for (const instance of shared) {
      const combined = atlas.nodes[instance.id]!;
      expect(combined.y).toBeLessThanOrEqual(instance.box.y);
      expect(combined.y + combined.height).toBeGreaterThanOrEqual(instance.box.y + instance.box.height);
      expect(svg).toContain(`y="${roundCoord(instance.box.y - atlas.shift!.y)}"`);
    }
    expect(draw(minimalGraph, architecture).atlas.nodeInstances).toBeUndefined();
  });

  it("exposes a nonzero canvas offset while atlas cards are already shifted", () => {
    const layout = layoutDataFlow(postmarkRefactorGraph.flows, postmarkRefactorGraph.nodes, FLOW_MAX_PULSES_PER_MESSAGE);
    const { atlas, svg } = draw(postmarkRefactorGraph, { lens: "data-flow", theme: "dark", style: { onLine: () => {} } });
    const shift = atlas.shift!;
    expect(shift.x).toBeGreaterThan(0);
    expect(shift.y).toBeGreaterThan(0);
    expect(svg).toContain(`translate(${shift.x},${shift.y})`);
    const participant = layout.flows[0]!.participants[0]!;
    expect(atlas.nodes[participant.node.id]?.x).toBe(roundCoord(participant.card.x + shift.x));
    expect(atlas.nodes[participant.node.id]?.y).toBe(roundCoord(participant.card.y + shift.y));
  });

  it("keeps flow-local ids, records actual self/straight paths and shifted pills", () => {
    const original = postmarkRefactorGraph.flows[0]!;
    const first = original.messages[0]!;
    const doc: GraphDoc = { ...postmarkRefactorGraph, views: [], flows: [
      { ...original, id: "first-flow", messages: [
        { ...first, id: "shared", kind: "async", animated: true },
        { ...first, id: "self-step", kind: "self", to: first.from, animated: true },
      ] },
      { ...original, id: "second-flow", messages: [{ ...first, id: "shared", animated: true }] },
    ] };
    const recorded: RecordedLine[] = [];
    const result = draw(doc, { lens: "data-flow", theme: "dark", style: {
      messageColour: () => "#fedcba", onLine: (line) => recorded.push(line),
    } });
    expect(recorded).toHaveLength(3);
    expect(recorded.map((line) => line.kind === "message" ? `${line.flow}/${line.id}` : line.id)).toEqual([
      "first-flow/shared", "first-flow/self-step", "second-flow/shared",
    ]);
    for (const line of recorded) {
      expect(line.kind).toBe("message");
      expect(result.svg).toContain(`d="${line.d}"`);
      expect(line.pill).toBeDefined();
      if (line.kind === "message") expect(result.atlas.messages[line.flow]?.[line.id]).toBeDefined();
    }
    expect(recorded[0]?.d).toMatch(/^M[\d.,]+ L[\d.,]+$/);
    expect(recorded[1]?.d).toContain(" a");
    expect(result.svg).toContain('marker-end="url(#mko-colour-fedcba)"');
    expect(result.svg).toContain('marker-end="url(#mk-colour-fedcba)"');
    expect(result.svg).toMatch(/<circle[^>]*fill="#fedcba"/);
    const shift = result.atlas.shift!;
    expect(shift.x).toBeGreaterThanOrEqual(0);
    expect(shift.y).toBeGreaterThanOrEqual(0);
    if (shift.x !== 0 || shift.y !== 0)
      expect(result.svg).toContain(`translate(${shift.x},${shift.y})`);
  });
});
