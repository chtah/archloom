import { describe, expect, it } from "vitest";
import { ArchloomError, parseGraph } from "../src/index.js";

const minimal = {
  title: "Web system",
  lanes: [{ id: "app", label: "Application" }],
  nodes: [{ id: "api", label: "API", lane: "app" }],
};

describe("architecture-only graph", () => {
  it("accepts a system without PR, commit or change metadata", () => {
    const graph = parseGraph(minimal);
    expect(graph.schemaVersion).toBe("0.1.0");
    expect(graph.nodes[0]?.kind).toBe("service");
    expect(graph).not.toHaveProperty("provenance");
    expect(graph.nodes[0]).not.toHaveProperty("delta");
  });

  it("describes calls and ordered request flows without a change model", () => {
    const graph = parseGraph({
      ...minimal,
      nodes: [...minimal.nodes, { id: "db", label: "Database", lane: "app", kind: "datastore" }],
      edges: [{ id: "query", from: "api", to: "db", kind: "data", label: "Query", readOnly: true }],
      flows: [{ id: "load", title: "Load data", participants: ["api", "db"], messages: [
        { id: "request", from: "api", to: "db", label: "Read records" },
        { id: "response", from: "db", to: "api", label: "Records", kind: "return" },
      ] }],
    });
    expect(graph.edges[0]?.animated).toBe(true);
    expect(graph.flows[0]?.messages[0]?.kind).toBe("sync");
    expect(JSON.stringify(graph)).not.toContain('"delta"');
  });

  it("supports named architecture views and layout hints", () => {
    const graph = parseGraph({ ...minimal,
      views: [{ id: "api-view", title: "API detail", lens: "architecture", scope: { kind: "selection", nodes: ["api"] } }],
      layout: { laneOrder: ["app"], rank: { api: 1 } },
    });
    expect(graph.views[0]).toMatchObject({ id: "api-view", children: [], scope: { kind: "selection", nodes: ["api"] } });
    expect(graph.layout?.direction).toBe("right");
  });

  it.each([
    ["unknown view node", { views: [{ id: "detail", title: "Detail", lens: "architecture", scope: { kind: "selection", nodes: ["missing"] } }] }],
    ["empty data-flow view", { views: [{ id: "flow", title: "Flow", lens: "data-flow" }] }],
    ["duplicate view", { views: [{ id: "detail", title: "Detail", lens: "architecture", children: [{ id: "detail", title: "Child", lens: "architecture" }] }] }],
    ["unknown layout lane", { layout: { laneOrder: ["missing"] } }],
    ["unknown layout node", { layout: { rank: { missing: 1 } } }],
    ["duplicate lane", { lanes: [...minimal.lanes, ...minimal.lanes] }],
    ["duplicate node", { nodes: [...minimal.nodes, ...minimal.nodes] }],
    ["missing edge endpoint", { edges: [{ id: "call", from: "api", to: "missing" }] }],
    ["duplicate edge", { edges: [{ id: "call", from: "api", to: "api" }, { id: "call", from: "api", to: "api" }] }],
    ["unknown participant", { flows: [{ id: "load", title: "Load", participants: ["api", "missing"], messages: [{ id: "step", from: "api", to: "missing", label: "Call" }] }] }],
    ["duplicate participant", { flows: [{ id: "load", title: "Load", participants: ["api", "api"], messages: [{ id: "step", from: "api", to: "api", kind: "self", label: "Compute" }] }] }],
  ])("rejects inconsistent graph identifiers: %s", (_name, changes) => {
    expect(() => parseGraph({ ...minimal, ...changes })).toThrow("invalid system graph");
  });

  it("rejects a __proto__ key instead of silently dropping it", () => {
    const input = JSON.parse('{"__proto__":{"x":1},"title":"T","lanes":[{"id":"a","label":"A"}],"nodes":[{"id":"n","label":"N","lane":"a"}]}');
    expect(() => parseGraph(input)).toThrow(/__proto__/);
  });

  it("rejects XML-invalid text but keeps Unicode and multiline summaries", () => {
    expect(() => parseGraph({ ...minimal, title: "bad\u0000label" })).toThrow(ArchloomError);
    expect(() => parseGraph({ ...minimal, summary: "bad\ufffftext" })).toThrow(ArchloomError);
    expect(parseGraph({ ...minimal, title: "ระบบ 🌱", summary: "First line\nSecond line" }).title).toBe("ระบบ 🌱");
  });

  it("rejects a view selecting only an empty lane", () => {
    expect(() => parseGraph({ ...minimal, lanes: [...minimal.lanes, { id: "empty", label: "Empty" }],
      views: [{ id: "empty-view", title: "Empty", lens: "architecture", scope: { kind: "selection", lanes: ["empty"] } }],
    })).toThrow(ArchloomError);
  });

  it("rejects cyclic input without overflowing the validator stack", () => {
    const children: unknown[] = [];
    children.push({ id: "cycle", title: "Cycle", lens: "architecture", children });
    expect(() => parseGraph({ ...minimal, views: children })).toThrow(ArchloomError);
  });

  it("rejects a node that points at a lane outside the system", () => {
    expect(() => parseGraph({ ...minimal, nodes: [{ id: "api", label: "API", lane: "missing" }] }))
      .toThrow("invalid system graph");
  });
});
