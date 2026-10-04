// Scores a graph written by an agent against a case's answer key. No model is involved:
// every check is a comparison of the graph's nodes and edges with the key.
import type { Graph } from "../src/graph.js";

export type Component = { key: string; match: string[] };
export type ExpectedEdge = { from: string | string[]; to: string | string[]; either?: boolean };
export type Case = {
  id: string; title: string; prompt: string;
  /** Directory under evals/fixtures the agent works in; absent for a described system. */
  fixture?: string;
  /** A graph that already exists in the fixture and must be updated in place. */
  existing?: string;
  nodeRange: [number, number];
  /** Checked in order: a node belongs to the first component whose terms it contains. Put specific names first. */
  components: Component[];
  /** Acceptable but not required, such as the person using the system. */
  optional?: Component[];
  /** Things the code only appears to have: disabled services, dead code, test doubles, claims in prose. */
  forbidden?: Array<Component & { why: string }>;
  edges: ExpectedEdge[];
  forbiddenEdges?: ExpectedEdge[];
  /** IDs from the existing graph that must survive an update. */
  preserveIds?: string[];
  minFlows?: number;
};
export type Score = {
  case: string; pass: boolean; failures: string[];
  nodes: number; componentRecall: number; edgeRecall: number;
  missingComponents: string[]; missingEdges: string[]; forbidden: string[]; forbiddenEdges: string[];
  unexplained: string[]; lostIds: string[]; summaryCoverage: number; noteCoverage: number; flows: number;
};

/** Unexplained nodes tolerated before a case fails: one extra box is a judgement call, more is invention. */
export const UNEXPLAINED_ALLOWED = 1;
export const EDGE_RECALL_REQUIRED = 0.8;

const text = (node: { id: string; label: string }) => `${node.id} ${node.label}`.toLowerCase();
const matches = (node: { id: string; label: string }, component: Component) => component.match.some((term) => text(node).includes(term.toLowerCase()));
const list = (value: string | string[]) => (typeof value === "string" ? [value] : value);
const edgeName = (edge: ExpectedEdge) => `${list(edge.from).join("|")} ${edge.either === true ? "<->" : "->"} ${list(edge.to).join("|")}`;

export const grade = (definition: Case, graph: Graph): Score => {
  const forbidden = (definition.forbidden ?? []).flatMap((entry) => graph.nodes.filter((node) => matches(node, entry)).map((node) => `${node.id} (${entry.key}: ${entry.why})`));
  const forbiddenIds = new Set((definition.forbidden ?? []).flatMap((entry) => graph.nodes.filter((node) => matches(node, entry)).map((node) => node.id)));
  const known = [...definition.components, ...(definition.optional ?? [])];
  const assigned = new Map<string, string>();
  for (const node of graph.nodes) {
    if (forbiddenIds.has(node.id)) continue;
    const component = known.find((candidate) => matches(node, candidate));
    if (component !== undefined) assigned.set(node.id, component.key);
  }
  const present = new Set(assigned.values());
  const missingComponents = definition.components.filter((component) => !present.has(component.key)).map((component) => component.key);
  const unexplained = graph.nodes.filter((node) => !assigned.has(node.id) && !forbiddenIds.has(node.id)).map((node) => node.id);

  const connects = (from: string[], to: string[]) => graph.edges.some((edge) => from.includes(assigned.get(edge.from) ?? "") && to.includes(assigned.get(edge.to) ?? ""));
  const holds = (edge: ExpectedEdge) => connects(list(edge.from), list(edge.to)) || (edge.either === true && connects(list(edge.to), list(edge.from)));
  const missingEdges = definition.edges.filter((edge) => !holds(edge)).map(edgeName);
  const forbiddenEdges = (definition.forbiddenEdges ?? []).filter(holds).map(edgeName);

  const ids = new Set(graph.nodes.map((node) => node.id));
  const lostIds = (definition.preserveIds ?? []).filter((id) => !ids.has(id));
  const messages = graph.flows.flatMap((flow) => flow.messages);
  const componentRecall = definition.components.length === 0 ? 1 : 1 - missingComponents.length / definition.components.length;
  const edgeRecall = definition.edges.length === 0 ? 1 : 1 - missingEdges.length / definition.edges.length;

  const failures: string[] = [];
  if (missingComponents.length > 0) failures.push(`missing components: ${missingComponents.join(", ")}`);
  if (edgeRecall < EDGE_RECALL_REQUIRED) failures.push(`missing connections: ${missingEdges.join("; ")}`);
  if (forbidden.length > 0) failures.push(`invented or dead components: ${forbidden.join("; ")}`);
  if (forbiddenEdges.length > 0) failures.push(`connections that no longer exist: ${forbiddenEdges.join("; ")}`);
  if (unexplained.length > UNEXPLAINED_ALLOWED) failures.push(`unexplained nodes: ${unexplained.join(", ")}`);
  if (graph.nodes.length < definition.nodeRange[0] || graph.nodes.length > definition.nodeRange[1])
    failures.push(`${graph.nodes.length} nodes, expected ${definition.nodeRange[0]}-${definition.nodeRange[1]}`);
  if (lostIds.length > 0) failures.push(`existing IDs not kept: ${lostIds.join(", ")}`);
  if (graph.flows.length < (definition.minFlows ?? 0)) failures.push(`${graph.flows.length} flows, expected at least ${definition.minFlows}`);

  return {
    case: definition.id, pass: failures.length === 0, failures,
    nodes: graph.nodes.length, componentRecall, edgeRecall, missingComponents, missingEdges, forbidden, forbiddenEdges, unexplained, lostIds,
    summaryCoverage: graph.nodes.filter((node) => node.summary !== undefined).length / graph.nodes.length,
    noteCoverage: messages.length === 0 ? 1 : messages.filter((message) => message.note !== undefined).length / messages.length,
    flows: graph.flows.length,
  };
};
