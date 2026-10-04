import { ArchloomError } from "./errors.js";
import { renderHtml } from "./viewer.js";
import type { RenderAllOptions } from "./render.js";

export type CanvasHandle = {
  /** Re-render and reset the view. Omitted options retain the previous values. */
  update(input: unknown, options?: RenderAllOptions): void;
  /** Remove only this canvas. Safe to call more than once. */
  destroy(): void;
};

/**
 * Mount the native canvas and popup in an isolated iframe. The container is
 * exclusively owned by this mount and must have a definite CSS height.
 * Rendering errors leave the existing container or mounted view untouched.
 */
export function mountCanvas(container: HTMLElement, input: unknown, options: RenderAllOptions = {}): CanvasHandle {
  let currentOptions = { ...options };
  const html = renderHtml(input, currentOptions);
  const frame = container.ownerDocument.createElement("iframe");
  frame.title = "Archloom interactive system diagram";
  frame.setAttribute("sandbox", "allow-scripts allow-downloads");
  frame.referrerPolicy = "no-referrer";
  frame.style.cssText = "display:block;width:100%;height:100%;border:0";
  frame.srcdoc = html;
  container.replaceChildren(frame);
  let destroyed = false;
  return {
    update(nextInput, options) {
      if (destroyed) throw new ArchloomError("INVALID_OPTIONS", "cannot update a destroyed canvas");
      // An explicit undefined means "omitted", so it must not clear a retained value.
      const supplied = Object.fromEntries(Object.entries(options ?? {}).filter(([, value]) => value !== undefined)) as RenderAllOptions;
      const nextOptions = { ...currentOptions, ...supplied };
      const html = renderHtml(nextInput, nextOptions);
      frame.srcdoc = html;
      currentOptions = nextOptions;
    },
    destroy() {
      frame.remove();
      destroyed = true;
    },
  };
}
