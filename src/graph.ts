import { z } from "zod";
import { ArchloomError } from "./errors.js";

export const GRAPH_SCHEMA_VERSION = "0.1.0" as const;

const Id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, "use a lowercase slug starting with a letter, up to 64 characters");
const xmlText = (text: string): boolean => Array.from(text).every((character) => {
  const point = character.codePointAt(0) ?? 0;
  return point === 9 || point === 10 || point === 13 ||
    (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
    (point >= 0x10000 && point <= 0x10ffff);
});
const Label = z.string().min(1).max(120).refine(xmlText, "text must be valid XML Unicode").regex(/^[^\r\n\t]*$/, "labels must be single-line");
const Summary = z.string().min(1).max(2000).refine(xmlText, "text must be valid XML Unicode");
export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use a six-digit hex colour");

export const NodeKindSchema = z.enum([
  "service", "app", "module", "function", "route", "job", "queue", "datastore",
  "cache", "external", "ui", "config", "test", "package", "other",
]);

const LaneSchema = z.strictObject({
  id: Id,
  label: Label,
  subtitle: Label.optional(),
  summary: Summary.optional(),
  color: ColorSchema.optional(),
});

const NodeSchema = z.strictObject({
  id: Id,
  label: Label,
  lane: Id,
  kind: NodeKindSchema.default("service"),
  icon: z.string().max(128).regex(/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9_-]*$/, "use namespace:icon-name").optional(),
  color: ColorSchema.optional(),
  subtitle: Label.optional(),
  summary: Summary.optional(),
});

export const EdgeKindSchema = z.enum(["call", "http", "rpc", "event", "queue", "data", "dependency", "render", "other"]);
export const MessageKindSchema = z.enum(["sync", "async", "return", "self"]);
export const LensSchema = z.enum(["architecture", "data-flow"]);
export const ThemeSchema = z.enum(["dark", "light"]);

const EdgeSchema = z.strictObject({
  id: Id,
  from: Id,
  to: Id,
  kind: EdgeKindSchema.default("call"),
  label: Label.optional(),
  summary: Summary.optional(),
  animated: z.boolean().default(true),
  emphasis: z.enum(["normal", "hero", "muted"]).default("normal"),
  readOnly: z.boolean().default(false),
});

const MessageSchema = z.strictObject({
  id: Id,
  from: Id,
  to: Id,
  label: Label,
  kind: MessageKindSchema.default("sync"),
  note: Summary.optional(),
  animated: z.boolean().default(true),
});

const FlowSchema = z.strictObject({
  id: Id,
  title: Label,
  summary: Summary.optional(),
  participants: z.array(Id).min(2).max(12),
  messages: z.array(MessageSchema).min(1).max(64),
});

const ScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("all") }),
  z.strictObject({
    kind: z.literal("selection"),
    lanes: z.array(Id).max(16).default([]),
    nodes: z.array(Id).max(256).default([]),
    edges: z.array(Id).max(512).default([]),
    flows: z.array(Id).max(16).default([]),
  }).refine((scope) => scope.lanes.length + scope.nodes.length + scope.edges.length + scope.flows.length > 0,
    "a selection must name at least one element"),
]);
export type ViewScope = z.output<typeof ScopeSchema>;
export type GraphView = {
  id: string; title: string; lens: Lens; summary?: string; scope: ViewScope; children: GraphView[];
};
export type GraphViewInput = {
  id: string; title: string; lens: Lens; summary?: string; scope?: z.input<typeof ScopeSchema>; children?: GraphViewInput[];
};
const ViewSchema: z.ZodType<GraphView, GraphViewInput> = z.lazy(() => z.strictObject({
  id: Id,
  title: Label,
  lens: LensSchema,
  summary: Summary.optional(),
  scope: ScopeSchema.default({ kind: "all" }),
  children: z.array(ViewSchema).max(32).default([]),
}));
const LayoutSchema = z.strictObject({
  direction: z.enum(["right", "down"]).default("right").describe("Architecture layout. right: lanes are columns left to right. down: lanes are bands stacked top to bottom. Data-flow views are unaffected."),
  laneOrder: z.array(Id).max(16).default([]),
  rank: z.record(Id, z.int().min(0).max(256)).optional(),
});

export const GraphSchema = z.strictObject({
  schemaVersion: z.literal(GRAPH_SCHEMA_VERSION).default(GRAPH_SCHEMA_VERSION),
  title: Label,
  summary: Summary.optional(),
  lanes: z.array(LaneSchema).min(1).max(16),
  nodes: z.array(NodeSchema).min(1).max(256),
  edges: z.array(EdgeSchema).max(512).default([]),
  flows: z.array(FlowSchema).max(16).default([]),
  views: z.array(ViewSchema).max(32).default([]),
  layout: LayoutSchema.optional(),
}).superRefine((graph, context) => {
  const unique = (items: readonly { id: string }[], path: (string | number)[]): Set<string> => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id))
        context.addIssue({ code: "custom", path: [...path, index, "id"], message: `duplicate id '${item.id}'` });
      ids.add(item.id);
    });
    return ids;
  };
  const reference = (id: string, ids: ReadonlySet<string>, path: (string | number)[], kind: string) => {
    if (!ids.has(id)) context.addIssue({ code: "custom", path, message: `unknown ${kind} '${id}'` });
  };
  const lanes = unique(graph.lanes, ["lanes"]);
  const nodes = unique(graph.nodes, ["nodes"]);
  const edges = unique(graph.edges, ["edges"]);
  const flows = unique(graph.flows, ["flows"]);
  graph.nodes.forEach((node, index) => reference(node.lane, lanes, ["nodes", index, "lane"], "lane"));
  graph.edges.forEach((edge, index) => {
    reference(edge.from, nodes, ["edges", index, "from"], "node");
    reference(edge.to, nodes, ["edges", index, "to"], "node");
  });
  graph.flows.forEach((flow, flowIndex) => {
    const at = ["flows", flowIndex];
    const participants = new Set<string>();
    flow.participants.forEach((id, index) => {
      reference(id, nodes, [...at, "participants", index], "node");
      if (participants.has(id)) context.addIssue({ code: "custom", path: [...at, "participants", index], message: `duplicate participant '${id}'` });
      participants.add(id);
    });
    unique(flow.messages, [...at, "messages"]);
    flow.messages.forEach((message, index) => {
      const path = [...at, "messages", index];
      reference(message.from, participants, [...path, "from"], "participant");
      reference(message.to, participants, [...path, "to"], "participant");
      if ((message.kind === "self") !== (message.from === message.to))
        context.addIssue({ code: "custom", path: [...path, "kind"], message: "self messages must start and end at the same participant" });
    });
  });
  const viewIds = new Set<string>();
  let viewCount = 0;
  const visitViews = (views: readonly GraphView[], path: (string | number)[], depth: number) => {
    views.forEach((view, index) => {
      const at = [...path, index];
      if (viewIds.has(view.id)) context.addIssue({ code: "custom", path: [...at, "id"], message: `duplicate view '${view.id}'` });
      viewIds.add(view.id);
      if (++viewCount > 32 || depth > 8) context.addIssue({ code: "custom", path: at, message: "use at most 32 views and 8 nesting levels" });
      if (view.scope.kind === "selection") {
        const scope = view.scope;
        scope.lanes.forEach((id, i) => reference(id, lanes, [...at, "scope", "lanes", i], "lane"));
        scope.nodes.forEach((id, i) => reference(id, nodes, [...at, "scope", "nodes", i], "node"));
        scope.edges.forEach((id, i) => reference(id, edges, [...at, "scope", "edges", i], "edge"));
        scope.flows.forEach((id, i) => reference(id, flows, [...at, "scope", "flows", i], "flow"));
        if (view.lens === "architecture" && !scope.nodes.some((id) => nodes.has(id)) &&
          !scope.edges.some((id) => edges.has(id)) && !graph.nodes.some((node) => scope.lanes.includes(node.lane)))
          context.addIssue({ code: "custom", path: [...at, "scope"], message: "architecture views must contain at least one node" });
        if (view.lens === "data-flow" && scope.flows.length === 0)
          context.addIssue({ code: "custom", path: [...at, "scope"], message: "data-flow views need flows" });
      }
      if (view.lens === "data-flow" && graph.flows.length === 0)
        context.addIssue({ code: "custom", path: [...at, "lens"], message: "data-flow views need a flow to draw" });
      visitViews(view.children, [...at, "children"], depth + 1);
    });
  };
  visitViews(graph.views, ["views"], 1);
  const laneOrder = new Set<string>();
  graph.layout?.laneOrder.forEach((id, index) => {
    reference(id, lanes, ["layout", "laneOrder", index], "lane");
    if (laneOrder.has(id)) context.addIssue({ code: "custom", path: ["layout", "laneOrder", index], message: `duplicate lane '${id}'` });
    laneOrder.add(id);
  });
  for (const id of Object.keys(graph.layout?.rank ?? {})) reference(id, nodes, ["layout", "rank", id], "node");
});

export type GraphInput = z.input<typeof GraphSchema>;
export type Graph = z.output<typeof GraphSchema>;
export type GraphNode = Graph["nodes"][number];
export type GraphLane = Graph["lanes"][number];
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type GraphEdge = Graph["edges"][number];
export type GraphFlow = Graph["flows"][number];
export type GraphMessage = GraphFlow["messages"][number];
export type EdgeKind = z.infer<typeof EdgeKindSchema>;
export type MessageKind = z.infer<typeof MessageKindSchema>;
export type Lens = z.infer<typeof LensSchema>;
export type Theme = z.infer<typeof ThemeSchema>;

const checkTree = (input: unknown): void => {
  const active = new WeakSet<object>();
  let count = 0;
  const visit = (value: unknown, depth: number) => {
    if (++count > 100_000 || depth > 32)
      throw new ArchloomError("INVALID_GRAPH", "system graph is too large or deeply nested");
    if (typeof value !== "object" || value === null) return;
    if (active.has(value)) throw new ArchloomError("INVALID_GRAPH", "system graph must not contain cycles");
    // JSON.parse makes this an own key, which strict schemas would silently drop.
    if (Object.hasOwn(value, "__proto__")) throw new ArchloomError("INVALID_GRAPH", "system graph must not contain a __proto__ key");
    active.add(value);
    for (const child of Object.values(value)) visit(child, depth + 1);
    active.delete(value);
  };
  visit(input, 0);
};

export const parseGraph = (input: unknown): Graph => {
  checkTree(input);
  const result = GraphSchema.safeParse(input);
  if (!result.success)
    throw new ArchloomError("INVALID_GRAPH", "invalid system graph", result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })));
  return result.data;
};
