import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ArchloomError } from "../src/errors.js";
import { combineIconResolvers, iconMarkup, type IconAsset } from "../src/icons.js";
import { createLucideResolver } from "../src/icons/lucide.js";
import { createSimpleIconsResolver } from "../src/icons/simple-icons.js";
import { render } from "../src/render.js";
import { webSystem } from "./fixtures.js";

const asset: IconAsset = { mode: "stroke", notice: "Example notice", shapes: [{ tag: "path", attrs: { d: "M0 0L24 24" } }] };
const markup = (value: unknown) => iconMarkup(value, "#58a6ff");

describe("structured icons", () => {
  it("clips to 24x24, inherits accent, and is deterministic regardless of attribute insertion order", () => {
    const a = markup({ ...asset, shapes: [{ tag: "rect", attrs: { width: 24, height: 24, x: -10 } }] });
    const b = markup({ ...asset, shapes: [{ tag: "rect", attrs: { x: -10, height: 24, width: 24 } }] });
    expect(a).toEqual(b);
    expect(a.markup).toContain('viewBox="0 0 24 24" width="24" height="24" overflow="hidden"');
    expect(a.markup).toContain('stroke="#58a6ff"');
  });

  it.each(["onload", "onclick", "href", "xlink:href", "style", "filter", "id", "xmlns", "key", "__proto__"])("refuses malicious or unsupported %s attributes", (name) => {
    expect(() => markup({ ...asset, shapes: [{ tag: "path", attrs: { d: "M0 0", [name]: "javascript:alert(1)" } }] })).toThrow(ArchloomError);
  });

  it.each(["image", "script", "foreignObject", "use", "svg", "g"])("refuses %s tags and raw SVG", (tag) => {
    expect(() => markup({ ...asset, shapes: [{ tag, attrs: {} }] })).toThrow(ArchloomError);
    expect(() => markup("<svg/>" )).toThrow(ArchloomError);
  });

  it.each([
    { d: 'M0 0"/><script/>' }, { d: "M0 0LInfinity 2" }, { d: "M0 0L1000001 0" }, { d: "M0 0L1" },
    { d: "M0 0A1 1 0 2 0 1 1" }, { d: "M0 0", fill: "url(https://example.org)" },
    { d: "M0 0", transform: "translate(1) rotate(1);" }, { d: "M0 0", transform: "matrix(1 0 0 1 0 Infinity)" },
    { d: "M0 0", opacity: 2 }, { d: "M0 0", "stroke-width": NaN },
  ])("refuses invalid geometry and paint: %j", (attrs) => {
    expect(() => markup({ ...asset, shapes: [{ tag: "path", attrs }] })).toThrow(ArchloomError);
  });

  it("bounds complexity and validates asset metadata", () => {
    for (const value of [null, {}, { ...asset, svg: "<svg/>" }, { ...asset, shapes: Array(65).fill(asset.shapes[0]) },
      { ...asset, notice: "" }, { ...asset, notice: "a".repeat(12001) }, { ...asset, notice: "a\u0000" },
      { ...asset, source: "source\n" }, { ...asset, color: "red" }, { ...asset, background: "url(#x)" },
      { ...asset, shapes: [{ tag: "path", attrs: { d: "M0 0" + "L1 1".repeat(25000) } }] }]) {
      expect(() => markup(value)).toThrow(ArchloomError);
    }
    expect(() => iconMarkup(asset, "red")).toThrow(ArchloomError);
  });

  it("supports standard Lucide shapes, points, transforms and safe XML comments", () => {
    expect(markup({ ...asset, shapes: [{ tag: "polygon", attrs: { points: "0,0 24,0 12,24", transform: "translate(1 2) scale(.5)", "fill-rule": "evenodd" } }] }).markup).toContain('transform="translate(1 2) scale(.5)"');
    const notice = markup({ ...asset, notice: "a---b--c-\r\n" }).notice;
    expect(notice).not.toContain("--");
    expect(notice.endsWith("-")).toBe(false);
  });

  it("combines resolvers in order and leaves unknown keys undefined", () => {
    const first = () => asset;
    expect(combineIconResolvers(() => undefined, first, () => { throw new Error("unused"); })("custom:x")).toBe(asset);
    expect(combineIconResolvers()("unknown")).toBeUndefined();
  });
});

describe("render icon integration", () => {
  it("renders generic shapes with deduplicated XML-safe notices deterministically", async () => {
    const icons = await createLucideResolver();
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "lucide:server" })) };
    for (const lens of ["architecture", "data-flow"] as const) {
      const diagram = render(graph, { icons, lens });
      expect(diagram.svg).toContain('viewBox="0 0 24 24"');
      expect(diagram.svg).toContain("Copyright (c) 2013-present Cole Bemis");
      expect(diagram.notices).toHaveLength(1);
      expect(diagram.notices[0]).not.toContain("--");
      expect(diagram.svg).toBe(render(graph, { icons, lens }).svg);
    }
  });

  it("rejects unknown lookup and malicious assets through the public renderer", () => {
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "custom:icon" })) };
    expect(() => render(graph, { icons: () => undefined })).toThrow(/icon/i);
    expect(() => render(graph, { icons: () => ({ ...asset, shapes: [{ tag: "path", attrs: { d: "M0 0", onload: "alert(1)" } }] }) })).toThrow(ArchloomError);
  });

  it("preserves brand paint in rendered SVG rather than using node accent", async () => {
    const icons = await createSimpleIconsResolver();
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "si:docker", color: "#ff0000" })) };
    const { siDocker } = await import("simple-icons");
    const diagram = render(graph, { icons });
    expect(diagram.svg).toContain(`fill="#${siDocker.hex}"`);
    expect(diagram.svg).toContain("CC0 1.0 Universal");
    expect(diagram.notices).toHaveLength(1);
  });
});

describe("optional adapters", () => {
  it("produces generic Lucide shapes, kebab-case lookup, and exact license notices", async () => {
    const resolve = await createLucideResolver();
    const license = (await readFile(new URL("../node_modules/lucide/LICENSE", import.meta.url), "utf8")).trim();
    for (const key of ["lucide:monitor", "lucide:server", "lucide:database", "lucide:arrow-up-right", "lucide:circle"]) {
      const icon = resolve(key);
      expect(icon?.notice).toBe(license);
      expect(icon?.mode).toBe("stroke");
      expect(icon?.color).toBeUndefined();
      expect(markup(icon).markup).not.toContain("key=");
      expect(markup(icon)).toEqual(markup(resolve(key)));
    }
    expect(resolve("lucide:not-an-icon")).toBeUndefined();
    expect(resolve("si:github")).toBeUndefined();
  });

  it("preserves actual brand hex/source, warns about missing metadata, and backs dark brands with white", async () => {
    const resolve = await createSimpleIconsResolver();
    const { siGithub, siDocker } = await import("simple-icons");
    for (const original of [siGithub, siDocker]) {
      const icon = resolve(`si:${original.slug}`);
      expect(icon?.color).toBe(`#${original.hex}`);
      expect(icon?.source).toBe(original.source);
      const output = markup(icon);
      expect(output.markup).toContain(`fill="#${original.hex}"`);
      expect(output.notice).toContain("CC0 1.0 Universal");
      expect(output.notice).toContain("not clearance");
      expect(output.notice).toContain("trademark");
      expect(output).toEqual(markup(resolve(`si:${original.slug}`)));
    }
    expect(resolve("si:github")?.background).toBe("#ffffff");
    expect(resolve("si:notanicon")).toBeUndefined();
    expect(resolve("lucide:server")).toBeUndefined();
  });

  it("accepts every installed generic Lucide shape through the safe boundary", async () => {
    const { icons } = await import("lucide");
    for (const [name, nodes] of Object.entries(icons)) {
      const shapes = nodes.map(([tag, attrs]) => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).filter(([key, value]) => key !== "key" && value !== undefined)) }));
      expect(() => markup({ mode: "stroke", shapes, notice: name }), name).not.toThrow();
    }
  });

  it("accepts eligible installed brand paths, including compact arc flags", async () => {
    const resolve = await createSimpleIconsResolver();
    const library = await import("simple-icons");
    for (const icon of Object.values(library).filter((icon) => "slug" in icon)) {
      if (icon.license && icon.license.type !== "CC0-1.0") continue;
      expect(() => markup(resolve(`si:${icon.slug}`)), icon.slug).not.toThrow();
    }
  });

  it("refuses explicit non-CC0 licenses with actionable review instructions", async () => {
    const resolve = await createSimpleIconsResolver();
    const library = await import("simple-icons");
    const restricted = Object.values(library).filter((icon) => "slug" in icon).find((icon) => icon.license && icon.license.type !== "CC0-1.0");
    expect(restricted).toBeDefined();
    expect(() => resolve(`si:${restricted!.slug}`)).toThrow(/review .* manually.*IconResolver/);
  });

  it("retains installed third-party texts and upstream copyright in the distribution notice", async () => {
    const notices = await readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
    for (const file of ["lucide/LICENSE", "simple-icons/LICENSE.md", "simple-icons/DISCLAIMER.md", "zod/LICENSE"]) {
      const text = await readFile(new URL(`../node_modules/${file}`, import.meta.url), "utf8");
      expect(notices).toContain(text.trim());
    }
    expect(notices).toContain("Copyright (c) 2026 Coldtea AI");
  });
});
