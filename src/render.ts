import { z } from "zod";
import { assertNever } from "@coldtea/pr-lens-schema";
import { draw } from "../packages/renderer/src/draw.js";
import { PrLensRenderError } from "../packages/renderer/src/errors.js";
import type { RecordedLine, RenderStyle } from "../packages/renderer/src/style.js";
import { ArchloomError } from "./errors.js";
import { LensSchema, ThemeSchema, parseGraph, type Graph, type GraphEdge, type GraphMessage, type GraphView, type Lens, type NodeKind, type Theme } from "./graph.js";
import { toEngineGraph } from "./internal/adapter.js";
import { iconMarkup, type IconResolver } from "./icons.js";

export type Box = { x: number; y: number; width: number; height: number };
export type Line = {
  id: string; from: string; to: string; label: string; summary?: string;
  color: string; dashed: boolean; d: string; pill?: Box;
} & ({ kind: "edge" } | { kind: "message"; flow: string });
export type DiagramAtlas = {
  lanes: Record<string, Box>; nodes: Record<string, Box>; edges: Record<string, Box>;
  nodeInstances: Array<{ id: string; flow?: string; box: Box }>;
  messages: Record<string, Record<string, Box>>;
  /** Boxes are final canvas coordinates; line paths and pills use this translation. */
  shift: { x: number; y: number };
  lines: Line[];
};
export type Diagram = {
  id: string; title: string; lens: Lens; theme: Theme; svg: string;
  width: number; height: number; animated: boolean; atlas: DiagramAtlas; notices: string[];
};
export type RenderOptions = { theme?: Theme; lens?: Lens; view?: string; icons?: IconResolver };
export type RenderAllOptions = { theme?: Theme; icons?: IconResolver };

const Resolver = z.custom<IconResolver>((value) => typeof value === "function");
const Options = z.strictObject({
  theme: ThemeSchema.default("dark"), lens: LensSchema.optional(), view: z.string().min(1).max(128).optional(), icons: Resolver.optional(),
});
const AllOptions = z.strictObject({ theme: ThemeSchema.default("dark"), icons: Resolver.optional() });
const readOptions = (options: RenderOptions) => {
  const result = Options.safeParse(options);
  if (!result.success) throw new ArchloomError("INVALID_OPTIONS", "invalid render options");
  return result.data;
};

const paletteFor = (theme: Theme) => {
  switch (theme) {
    case "dark": return { blue: "#58a6ff", purple: "#a371f7", teal: "#39c5cf", pink: "#db61a2", orange: "#ffa657", yellow: "#e3b341", green: "#3fb950", grey: "#8b949e" };
    case "light": return { blue: "#0969da", purple: "#8250df", teal: "#087f8c", pink: "#bf3989", orange: "#b45309", yellow: "#946800", green: "#1a7f37", grey: "#57606a" };
    default: return assertNever(theme);
  }
};

export const diagramViews = (graph: Graph): GraphView[] => {
  if (graph.views.length > 0) {
    const flattened: GraphView[] = [];
    const visit = (views: readonly GraphView[]) => {
      for (const view of views) { flattened.push(view); visit(view.children); }
    };
    visit(graph.views);
    return flattened;
  }
  return [
    { id: "architecture", title: graph.title, lens: "architecture", scope: { kind: "all" }, children: [] },
    ...graph.flows.map((flow): GraphView => ({
      id: `flow-${flow.id}`, title: flow.title, lens: "data-flow", summary: flow.summary,
      scope: { kind: "selection", lanes: [], nodes: [], edges: [], flows: [flow.id] }, children: [],
    })),
  ];
};

const renderDiagram = (graph: Graph, view: GraphView, theme: Theme, icons?: IconResolver): Diagram => {
  if (view.lens === "data-flow" && graph.flows.length === 0)
    throw new ArchloomError("NOTHING_TO_RENDER", "a data-flow diagram needs at least one flow");
  const colors = paletteFor(theme);
  const nodeColors: Record<NodeKind, string> = {
    service: colors.teal, app: colors.blue, module: colors.grey, function: colors.teal,
    route: colors.blue, job: colors.pink, queue: colors.orange, datastore: colors.purple,
    cache: colors.purple, external: colors.orange, ui: colors.green, config: colors.yellow,
    test: colors.grey, package: colors.grey, other: colors.grey,
  };
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const lanes = new Map(graph.lanes.map((lane) => [lane.id, lane]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const messages = new Map(graph.flows.flatMap((flow) => flow.messages.map((message) => [`${flow.id}/${message.id}`, message] as const)));
  const edgeColor = (edge: Pick<GraphEdge, "kind" | "to">): string => {
    switch (edge.kind) {
      case "http": return nodes.get(edge.to)?.kind === "external" ? colors.orange : colors.blue;
      case "rpc": case "call": return colors.teal;
      case "data": return colors.purple;
      case "event": case "queue": return colors.green;
      case "dependency": case "render": case "other": return colors.grey;
      default: return assertNever(edge.kind);
    }
  };
  const messageColor = (message: Pick<GraphMessage, "kind">): string => {
    switch (message.kind) {
      case "sync": return colors.blue;
      case "async": return colors.purple;
      case "return": return colors.green;
      case "self": return colors.pink;
      default: return assertNever(message.kind);
    }
  };
  const notices = new Set<string>();
  const resolvedIcons = new Map<string, { markup: string; notice: string }>();
  const resolveNodeIcon = (node: { id: string; kind: NodeKind }): string | undefined => {
    const authored = nodes.get(node.id);
    const key = authored?.icon;
    if (key === undefined) return undefined;
    if (icons === undefined) throw new ArchloomError("UNKNOWN_ICON", `provide a local resolver for '${key}' (CLI: --icons)`);
    const color = authored?.color ?? nodeColors[node.kind];
    const cacheKey = `${key}/${color}`;
    let resolved = resolvedIcons.get(cacheKey);
    if (resolved === undefined) {
      const asset = icons(key);
      if (asset === undefined) throw new ArchloomError("UNKNOWN_ICON", `unknown icon '${key}'`);
      resolved = iconMarkup(asset, color);
      resolvedIcons.set(cacheKey, resolved);
    }
    notices.add(resolved.notice);
    return resolved.markup;
  };
  const lines: Line[] = [];
  const record = (line: RecordedLine): void => {
    switch (line.kind) {
      case "edge": {
        const edge = edges.get(line.id);
        if (edge === undefined) return;
        lines.push({ ...line, label: edge.label ?? edge.kind, summary: edge.summary, color: edgeColor(edge), dashed: edge.readOnly });
        return;
      }
      case "message": {
        const message = messages.get(`${line.flow}/${line.id}`);
        if (message === undefined) return;
        lines.push({ ...line, id: `${line.flow}/${line.id}`, label: message.label, summary: message.note, color: messageColor(message), dashed: message.kind === "return" });
        return;
      }
      default: return assertNever(line);
    }
  };
  const style: RenderStyle = {
    colours: Object.values(colors),
    nodeAccent: (node) => nodes.get(node.id)?.color ?? nodeColors[node.kind],
    nodeIcon: resolveNodeIcon,
    edgeColour: edgeColor,
    edgeDash: (edge) => edges.get(edge.id)?.readOnly ? "6 4" : undefined,
    laneTint: (lane) => lanes.get(lane.id)?.color,
    laneInfo: (lane) => lanes.get(lane.id)?.summary !== undefined ? "ⓘ" : undefined,
    messageColour: messageColor,
    onLine: record,
  };
  try {
    const drawn = draw(toEngineGraph(graph, view), { lens: view.lens, theme, view: view.id, style });
    return {
      id: view.id, title: view.title, lens: view.lens, theme,
      // A function replacement keeps `$&`-style patterns in notice text literal.
      svg: drawn.svg.replace(/<\/svg>\s*$/, () => `${[...notices].map((notice) => `<!--\n${notice.replace(/--/g, "- -")}\n-->`).join("\n")}\n</svg>`),
      width: drawn.width, height: drawn.height, animated: drawn.animated,
      atlas: { ...drawn.atlas, nodeInstances: drawn.atlas.nodeInstances ?? Object.entries(drawn.atlas.nodes).map(([id, box]) => ({ id, box })), shift: drawn.atlas.shift ?? { x: 0, y: 0 }, lines }, notices: [...notices],
    };
  } catch (error) {
    if (!(error instanceof PrLensRenderError)) throw error;
    switch (error.code) {
      case "UNKNOWN_VIEW": throw new ArchloomError("UNKNOWN_VIEW", error.message);
      case "NOTHING_TO_RENDER": case "NO_FLOW_IN_SCOPE": throw new ArchloomError("NOTHING_TO_RENDER", error.message);
      case "LENS_NOT_DECLARED": throw new ArchloomError("INVALID_OPTIONS", error.message);
      case "TOO_MANY_ASSETS": throw new ArchloomError("INVALID_GRAPH", error.message);
      default: return assertNever(error.code);
    }
  }
};

export const render = (input: unknown, options: RenderOptions = {}): Diagram => {
  const graph = parseGraph(input);
  const chosen = readOptions(options);
  if (chosen.view !== undefined) {
    const view = diagramViews(graph).find((candidate) => candidate.id === chosen.view);
    if (view === undefined) throw new ArchloomError("UNKNOWN_VIEW", `unknown view '${chosen.view}'`);
    if (chosen.lens !== undefined && chosen.lens !== view.lens)
      throw new ArchloomError("INVALID_OPTIONS", "view and lens must agree");
    return renderDiagram(graph, view, chosen.theme, chosen.icons);
  }
  const lens = chosen.lens ?? "architecture";
  return renderDiagram(graph, { id: lens, title: graph.title, lens, scope: { kind: "all" }, children: [] }, chosen.theme, chosen.icons);
};

export const renderAll = (input: unknown, options: RenderAllOptions = {}): Diagram[] => {
  const graph = parseGraph(input);
  const result = AllOptions.safeParse(options);
  if (!result.success) throw new ArchloomError("INVALID_OPTIONS", "invalid render options");
  return diagramViews(graph).map((view) => renderDiagram(graph, view, result.data.theme, result.data.icons));
};
