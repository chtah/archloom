import type { GraphDoc } from "@coldtea/pr-lens-schema";
import type { Graph, GraphView } from "../graph.js";

/** Compatibility stays inside the layout engine, never in the public graph or artifacts. */
export const toEngineGraph = (graph: Graph, view: GraphView): GraphDoc => ({
  schemaVersion: "0.2.0",
  kind: "graph",
  title: graph.title,
  summary: graph.summary,
  lenses: graph.flows.length > 0 ? ["architecture", "data-flow"] : ["architecture"],
  provenance: {
    repo: { owner: "archloom", name: "local", host: "local" },
    base: { sha: "0000000" },
    head: { sha: "0000000" },
  },
  lanes: graph.lanes.map((lane, order) => ({ id: lane.id, label: lane.label, subtitle: lane.subtitle, summary: lane.summary, order })),
  nodes: graph.nodes.map((node) => ({
    id: node.id, label: node.label, lane: node.lane, kind: node.kind,
    subtitle: node.subtitle, summary: node.summary, delta: "unchanged", files: [], badges: [],
  })),
  edges: graph.edges.map((edge) => ({
    id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, label: edge.label,
    summary: edge.summary, animated: edge.animated, emphasis: edge.emphasis,
    delta: "unchanged", files: [],
  })),
  flows: graph.flows.map((flow) => ({
    id: flow.id, title: flow.title, summary: flow.summary, delta: "unchanged",
    participants: flow.participants.map((node) => ({ node })),
    messages: flow.messages.map((message) => ({
      id: message.id, from: message.from, to: message.to, label: message.label,
      kind: message.kind, note: message.note, animated: message.animated,
      delta: "unchanged", files: [],
    })),
  })),
  views: [{ id: view.id, title: view.title, lens: view.lens, summary: view.summary,
    scope: view.scope, defaultOpen: false, children: [] }],
  layout: graph.layout,
});
