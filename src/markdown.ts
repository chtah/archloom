import { z } from "zod";
import { ArchloomError } from "./errors.js";
import type { Lens } from "./graph.js";
import type { IconResolver } from "./icons.js";
import { renderAll } from "./render.js";

export type MarkdownOptions = {
  icons?: IconResolver;
  /** Prefix for the image paths in the snippet: a relative path or an http(s) URL. Defaults to the same directory. */
  base?: string;
};
export type MarkdownImage = {
  id: string; title: string; lens: Lens; width: number; height: number;
  light: { file: string; svg: string }; dark: { file: string; svg: string };
  /** A `<picture>` element that follows the reader's colour scheme; the light image is the fallback. */
  markdown: string; notices: string[];
};

const Resolver = z.custom<IconResolver>((value) => typeof value === "function");
// Whitespace and commas would split a srcset; control characters have no place in a path.
const Options = z.strictObject({ icons: Resolver.optional(), base: z.string().max(2048).regex(/^[^\s,\u0000-\u001f\u007f]*$/).optional() });

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const prefixFor = (base: string | undefined): string => {
  if (base === undefined || base === "" || base === ".") return "";
  if (/^https?:\/\//i.test(base)) {
    if (!URL.canParse(base)) throw new ArchloomError("INVALID_OPTIONS", "base is not a valid URL");
    const url = new URL(base);
    if (url.search !== "" || url.hash !== "") throw new ArchloomError("INVALID_OPTIONS", "base must not carry a query or fragment");
    return `${url.href.replace(/\/+$/, "")}/`;
  }
  const segments = base.replace(/\\/g, "/").split("/").filter((segment, index) => segment !== "" || index === 0);
  if (segments.at(-1) === "") segments.pop();
  return `${segments.map((segment) => encodeURIComponent(segment)).join("/")}/`;
};

/** Render every view in both themes, with a Markdown snippet for each. */
export const renderMarkdown = (input: unknown, options: MarkdownOptions = {}): MarkdownImage[] => {
  const result = Options.safeParse(options);
  if (!result.success) throw new ArchloomError("INVALID_OPTIONS", "invalid markdown options");
  const prefix = prefixFor(result.data.base);
  const light = renderAll(input, { theme: "light", icons: result.data.icons });
  const dark = renderAll(input, { theme: "dark", icons: result.data.icons });
  return light.map((diagram, index) => {
    const lightFile = `${diagram.id}.light.svg`, darkFile = `${diagram.id}.dark.svg`;
    const markdown = [
      "<picture>",
      `  <source media="(prefers-color-scheme: dark)" srcset="${escapeHtml(prefix + darkFile)}">`,
      `  <img alt="${escapeHtml(diagram.title)}" src="${escapeHtml(prefix + lightFile)}">`,
      "</picture>",
    ].join("\n");
    return {
      id: diagram.id, title: diagram.title, lens: diagram.lens, width: diagram.width, height: diagram.height,
      light: { file: lightFile, svg: diagram.svg }, dark: { file: darkFile, svg: dark[index]!.svg },
      markdown, notices: diagram.notices,
    };
  });
};
