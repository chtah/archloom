import { describe, expect, it } from "vitest";
import { ArchloomError, render, renderAll } from "../src/index.js";
import { webSystem } from "./fixtures.js";

describe("system rendering", () => {
  it("renders a styled, script-free system with useful clickable geometry", () => {
    const drawn = render(webSystem);
    expect(drawn.lens).toBe("architecture");
    expect(drawn.svg).toContain("#58a6ff");
    expect(drawn.svg).toContain('fill-opacity="0.07"');
    expect(drawn.svg).toContain('stroke-dasharray="6 4"');
    expect(drawn.svg).not.toMatch(/<script\b|<foreignObject\b|<image\b/i);
    expect(drawn.atlas.nodes.api).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    expect(drawn.atlas.lines.find((line) => line.id === "query")).toMatchObject({ from: "api", to: "database", dashed: true });
    expect(drawn).not.toHaveProperty("provenance");
  });

  it("lays architecture out top to bottom for layout.direction down, leaving data flow alone", () => {
    const turned = { ...webSystem, layout: { ...webSystem.layout, direction: "down" as const } };
    const across = render(webSystem);
    const down = render(turned);
    expect(down.svg).not.toBe(across.svg);
    const lanes = webSystem.lanes.map((lane) => down.atlas.lanes[lane.id]);
    lanes.forEach((box, index) => {
      const next = lanes[index + 1];
      if (box !== undefined && next !== undefined) {
        expect(next.x).toBe(box.x);
        expect(next.y).toBeGreaterThan(box.y + box.height);
      }
    });
    expect(webSystem.flows.length).toBeGreaterThan(0);
    expect(render(turned, { lens: "data-flow" }).svg).toBe(render(webSystem, { lens: "data-flow" }).svg);
  });

  it("uses a local structured icon resolver and preserves its notice", () => {
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "custom:api" })) };
    const drawn = render(graph, { icons: () => ({ mode: "stroke", notice: "MIT — fictional test icon", shapes: [{ tag: "path", attrs: { d: "M2 2L22 22" } }] }) });
    expect(drawn.svg).toContain("M2 2L22 22");
    expect(drawn.svg).toContain("MIT — fictional test icon");
    expect(drawn.notices).toEqual(["MIT — fictional test icon"]);
    expect(() => render(graph)).toThrow(ArchloomError);
  });

  it("bounds label placement work on dense graphs with long labels", () => {
    const nodes = Array.from({ length: 24 }, (_, index) => ({ id: `n${index}`, label: `N${index}`, lane: index % 2 ? "a" : "b" }));
    const edges = Array.from({ length: 240 }, (_, index) => ({ id: `e${index}`, from: `n${index % 24}`, to: `n${(index * 7 + 13) % 24}`, label: "W".repeat(120) }));
    const graph = { title: "Dense", lanes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], nodes, edges };
    // Unbounded, this graph took minutes; the default test timeout is the assertion.
    expect(render(graph).atlas.lines).toHaveLength(240);
  });

  it("embeds notice text literally, including replacement patterns", () => {
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "custom:api" })) };
    const notice = "see $& and $` and $$5";
    const draw = (text: string) => render(graph, { icons: () => ({ mode: "stroke", notice: text, shapes: [{ tag: "path", attrs: { d: "M2 2L22 22" } }] }) }).svg;
    const drawn = draw(notice);
    expect(drawn).toContain(`<!--\n${notice}\n-->`);
    expect(drawn).toHaveLength(draw("x".repeat(notice.length)).length);
  });

  it("is byte-deterministic in both themes and does not mutate input", () => {
    const before = JSON.stringify(webSystem);
    for (const theme of ["dark", "light"] as const) {
      expect(render(webSystem, { theme }).svg).toBe(render(webSystem, { theme }).svg);
      expect(renderAll(webSystem, { theme }).map((item) => [item.id, item.lens]))
        .toEqual([["architecture", "architecture"], ["flow-load-records", "data-flow"]]);
    }
    expect(JSON.stringify(webSystem)).toBe(before);
  });

  it("keeps message IDs local to their flow and records every path", () => {
    const flows = webSystem.flows ?? [];
    const drawn = render({ ...webSystem, flows: [...flows, ...flows.map((flow) => ({ ...flow, id: "second" }))] }, { lens: "data-flow" });
    expect(drawn.atlas.lines).toHaveLength(8);
    expect(new Set(drawn.atlas.lines.map((line) => line.id)).size).toBe(8);
    expect(drawn.atlas.lines.some((line) => line.id === "second/request")).toBe(true);
    expect(drawn.atlas.shift.x).toBeGreaterThan(0);
  });

  it("renders explicit nested views and infers the view lens", () => {
    const views = [{ id: "api-detail", title: "API detail", lens: "architecture", scope: { kind: "selection", nodes: ["api"] },
      children: [{ id: "request-flow", title: "Request", lens: "data-flow", scope: { kind: "selection", flows: ["load-records"] } }] }];
    const graph = { ...webSystem, views };
    expect(renderAll(graph).map((diagram) => diagram.id)).toEqual(["api-detail", "request-flow"]);
    expect(Object.keys(render(graph, { view: "api-detail" }).atlas.nodes)).toEqual(["api"]);
    expect(render(graph, { view: "request-flow" }).lens).toBe("data-flow");
    expect(() => render(graph, { view: "request-flow", lens: "architecture" })).toThrow(ArchloomError);
    expect(() => render(graph, { view: "missing" })).toThrow(ArchloomError);
  });

  it("escapes authored HTML and refuses invalid JavaScript options", () => {
    const drawn = render({ ...webSystem, title: "<script>alert(1)</script>" });
    expect(drawn.svg).toContain("&lt;script&gt;");
    expect(drawn.svg).not.toContain("<script>");
    expect(() => Reflect.apply(render, undefined, [webSystem, { theme: "invented" }])).toThrow(ArchloomError);
    expect(() => render({ ...webSystem, flows: [] }, { lens: "data-flow" })).toThrow(ArchloomError);
  });
});
