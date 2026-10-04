import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../src/graph.js";
import { renderAll } from "../src/render.js";
import { renderHtml } from "../src/viewer.js";

const skillPath = resolve("skills/archloom/SKILL.md");

describe("distributed Archloom authoring skill", () => {
  it("has discoverable metadata, readable resource links and local-only instructions", async () => {
    const text = await readFile(skillPath, "utf8");
    expect(text).toMatch(/^---\nname: archloom\ndescription: .+\ncompatibility: .+\n---/);
    expect(text.split("\n").length).toBeLessThan(500);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      expect((await stat(resolve(dirname(skillPath), match[1]!))).isFile()).toBe(true);
    }
    expect(text).toContain("archloom validate system.archloom.json");
    expect(text).toContain("archloom render system.archloom.json");
    expect(text).toContain("without separate approval");
    expect(text).not.toMatch(/prlens\.dev|npx\s+@coldtea|push-canvas/);
  });

  it("ships the canonical fictional example, valid and renderable without optional peers", async () => {
    const template = await readFile("skills/archloom/assets/web-system.archloom.json", "utf8");
    expect(template).toBe(await readFile("examples/web-system.archloom.json", "utf8"));
    const graph = parseGraph(JSON.parse(template));
    expect(graph.lanes.every((lane) => lane.summary)).toBe(true);
    expect(graph.nodes.every((node) => node.summary && !node.icon)).toBe(true);
    expect(graph.flows.every((flow) => flow.summary && flow.messages.every((message) => message.note))).toBe(true);
    for (const theme of ["dark", "light"] as const) {
      const diagrams = renderAll(graph, { theme });
      expect(diagrams.map((d) => d.id)).toEqual(["architecture", "flow-load-records"]);
      expect(diagrams.every((d) => d.svg.startsWith("<svg") && d.width > 0 && d.height > 0)).toBe(true);
      expect(renderHtml(graph, { theme })).toContain('id="canvas"');
    }
  });
});
