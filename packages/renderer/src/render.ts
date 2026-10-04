import type { Config, GraphDoc, Lens, RenderAsset, RenderManifest, View } from "@coldtea/pr-lens-schema";
import { MAX_RENDER_ASSETS } from "@coldtea/pr-lens-schema";
import { draw, type DrawOptions, type DrawnSvg } from "./draw.js";
import { applyCorrections } from "./corrections.js";
import { PrLensRenderError } from "./errors.js";
import { buildManifest, contentHash, renderAssetFileName, renderAssetId } from "./manifest.js";
import { flattenViews } from "./scope.js";
import { THEME_PAIR } from "./theme.js";

export type RenderOptions = DrawOptions & {
  /** The repository's corrections, applied as an overlay before layout. */
  config?: Config;
};

export type RenderedSvg = DrawnSvg;

const prepare = (doc: GraphDoc, config: Config | undefined): GraphDoc =>
  config === undefined ? doc : applyCorrections(doc, config.map);

/**
 * A schema-valid document in, one self-contained SVG out.
 *
 * Nothing here reads a clock, a file or a random number: the same document
 * and options produce the same bytes, on any machine, in any order. That is
 * what lets a render be addressed by its own hash, and what keeps a diagram
 * from rearranging itself between two pushes that barely changed anything.
 */
export const render = (doc: GraphDoc, options: RenderOptions): RenderedSvg =>
  draw(prepare(doc, options.config), options);

/**
 * What a render may be asked for: the `<picture>` pair, one half of it, or
 * the single self-contained render.
 *
 * Not `readonly Theme[]`, which would admit all three at once — three assets
 * per view against a view cap derived from two, so a document that validates
 * could produce a manifest that does not. The contract's promise is that if
 * it parses, it renders; this is the boundary that keeps it true.
 */
export type RenderThemes =
  | readonly ["light", "dark"]
  | readonly ["light"]
  | readonly ["dark"]
  | readonly ["neutral"];

export type RenderAllOptions = {
  config?: Config;
  /** The `<picture>` pair by default; `['neutral']` for a single-image surface. */
  themes?: RenderThemes;
};

export type RenderedAsset = RenderedSvg & { asset: RenderAsset };

export type RenderAllResult = {
  assets: RenderedAsset[];
  manifest: RenderManifest;
};

/**
 * Every drill-down section a comment will show, in both themes.
 *
 * A document with no sections still renders: it gets one diagram per lens it
 * declares, which is what a comment falls back to when extraction found
 * nothing worth splitting into a tree.
 */
export const renderAll = (doc: GraphDoc, options: RenderAllOptions = {}): RenderAllResult => {
  const prepared = prepare(doc, options.config);
  const themes = options.themes ?? THEME_PAIR;

  const targets: { lens: Lens; view: View | undefined }[] =
    prepared.views.length > 0
      ? flattenViews(prepared.views)
          .filter((view) => prepared.lenses.includes(view.lens))
          .map((view) => ({ lens: view.lens, view }))
      : prepared.lenses
          .filter((lens) => lens !== "data-flow" || prepared.flows.length > 0)
          .map((lens) => ({ lens, view: undefined }));

  /**
   * The contract caps a view tree at the number of views a two-theme render
   * fits inside a manifest, so a parsed document cannot reach this. A
   * hand-built one can: the cap lives in a refinement, and a refinement does
   * not survive into the inferred type. This is a postcondition on what is
   * about to be produced rather than a re-reading of what came in — the count
   * depends on how many themes the caller asked for, which no document knows.
   */
  if (targets.length * themes.length > MAX_RENDER_ASSETS)
    throw new PrLensRenderError(
      "TOO_MANY_ASSETS",
      `this document asks for ${targets.length * themes.length} pictures across ${targets.length} views ` +
        `and ${themes.length} themes, and a render manifest carries at most ${MAX_RENDER_ASSETS}`,
    );

  const assets: RenderedAsset[] = [];

  for (const target of targets)
    for (const theme of themes) {
      const rendered = render(prepared, {
        lens: target.lens,
        theme,
        view: target.view?.id,
      });
      const address = { lens: target.lens, theme, view: target.view?.id };
      const hash = contentHash(rendered.svg);

      assets.push({
        ...rendered,
        asset: {
          id: renderAssetId(address),
          lens: target.lens,
          theme,
          view: target.view?.id,
          mediaType: "image/svg+xml",
          contentHash: hash,
          bytes: Buffer.byteLength(rendered.svg, "utf8"),
          width: rendered.width,
          height: rendered.height,
          animated: rendered.animated,
          path: renderAssetFileName(address, hash),
        },
      });
    }

  if (assets.length === 0)
    throw new PrLensRenderError("NOTHING_TO_RENDER", "this document declares no renderable view");

  return { assets, manifest: buildManifest(prepared, assets.map(({ asset }) => asset)) };
};
