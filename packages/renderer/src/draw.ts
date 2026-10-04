import type { GraphDoc, Lens, View, ViewScope } from "@coldtea/pr-lens-schema";
import { assertNever } from "@coldtea/pr-lens-schema";
import type { RenderAtlas } from "./atlas.js";
import { PrLensRenderError } from "./errors.js";
import { findView, resolveScope, type ScopedGraph } from "./scope.js";
import { paletteFor, type Theme } from "./theme.js";
import { withStyle, type RenderStyle } from "./style.js";
import { paintArchitecture } from "./svg/architecture.js";
import { paintDataFlow } from "./svg/dataflow.js";
import { svgDocument } from "./svg/document.js";

export type DrawOptions = {
  lens: Lens;
  theme: Theme;
  view?: string;
  style?: RenderStyle;
};

export type DrawnSvg = {
  svg: string;
  width: number;
  height: number;
  lens: Lens;
  theme: Theme;
  view: string | undefined;
  animated: boolean;
  atlas: RenderAtlas;
};

const WHOLE_DOCUMENT: ViewScope = { kind: "all" };

const paint = (
  lens: Lens,
  graph: ScopedGraph,
  doc: GraphDoc,
  theme: Theme,
): { width: number; height: number; body: string; animated: boolean; atlas: RenderAtlas } => {
  const palette = paletteFor(theme);
  switch (lens) {
    case "architecture": {
      if (graph.nodes.length === 0)
        throw new PrLensRenderError("NOTHING_TO_RENDER", "no nodes are in scope for this view");
      const painting = paintArchitecture(graph, doc.layout, palette);
      return { ...painting, animated: graph.edges.some((edge) => edge.animated) };
    }
    case "data-flow": {
      if (graph.flows.length === 0)
        throw new PrLensRenderError("NO_FLOW_IN_SCOPE", "the data-flow lens needs a flow to draw");
      const painting = paintDataFlow(graph.flows, doc.nodes, palette);
      return {
        ...painting,
        animated: graph.flows.some((flow) => flow.messages.some((message) => message.animated)),
      };
    }
    default:
      return assertNever(lens, "Unhandled lens");
  }
};

/** Pure single-diagram rendering, without corrections, manifests or hashing. */
export const draw = (doc: GraphDoc, options: DrawOptions): DrawnSvg =>
  withStyle(options.style, () => {
    if (!doc.lenses.includes(options.lens))
      throw new PrLensRenderError(
        "LENS_NOT_DECLARED",
        `this document does not declare the '${options.lens}' lens`,
      );
    const view = options.view === undefined ? undefined : requireView(doc.views, options.view);
    const graph = resolveScope(doc, view?.scope ?? WHOLE_DOCUMENT);
    const { width, height, body, animated, atlas } = paint(options.lens, graph, doc, options.theme);
    const svg = svgDocument({
      width,
      height,
      palette: paletteFor(options.theme),
      title: view?.title ?? doc.title,
      description: view?.summary ?? doc.summary,
      body,
    });
    return { svg, width, height, lens: options.lens, theme: options.theme, view: view?.id, animated, atlas };
  });

const requireView = (views: readonly View[], id: string): View => {
  const view = findView(views, id);
  if (view === undefined)
    throw new PrLensRenderError("UNKNOWN_VIEW", `this document has no view '${id}'`);
  return view;
};
