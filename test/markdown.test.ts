import { describe, expect, it } from "vitest";
import { ArchloomError } from "../src/errors.js";
import { renderMarkdown } from "../src/markdown.js";
import { renderAll } from "../src/render.js";
import { webSystem } from "./fixtures.js";

describe("Markdown images", () => {
  it("returns both themes per view, byte-equal to renderAll, with a picture snippet", () => {
    const images = renderMarkdown(webSystem, { base: "docs/architecture" });
    const light = renderAll(webSystem, { theme: "light" }), dark = renderAll(webSystem, { theme: "dark" });
    expect(images.map((image) => image.id)).toEqual(light.map((diagram) => diagram.id));
    images.forEach((image, index) => {
      expect(image.light).toEqual({ file: `${image.id}.light.svg`, svg: light[index]!.svg });
      expect(image.dark).toEqual({ file: `${image.id}.dark.svg`, svg: dark[index]!.svg });
      expect(image.light.svg).not.toBe(image.dark.svg);
    });
    expect(images[0]!.markdown).toBe([
      "<picture>",
      '  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture/architecture.dark.svg">',
      `  <img alt="${images[0]!.title}" src="docs/architecture/architecture.light.svg">`,
      "</picture>",
    ].join("\n"));
    expect(renderMarkdown(webSystem, { base: "docs/architecture" })).toEqual(images);
  });

  it("uses the same directory by default and encodes path segments", () => {
    expect(renderMarkdown(webSystem)[0]!.markdown).toContain('src="architecture.light.svg"');
    expect(renderMarkdown(webSystem, { base: "." })[0]!.markdown).toContain('src="architecture.light.svg"');
    expect(renderMarkdown(webSystem, { base: "../my%docs/a&b/" })[0]!.markdown).toContain('src="../my%25docs/a%26b/architecture.light.svg"');
    expect(renderMarkdown(webSystem, { base: "docs\\diagrams" })[0]!.markdown).toContain('src="docs/diagrams/architecture.light.svg"');
    expect(renderMarkdown(webSystem, { base: "/docs" })[0]!.markdown).toContain('src="/docs/architecture.light.svg"');
  });

  it("accepts an http(s) URL prefix for comments and rejects unsafe prefixes", () => {
    const url = "https://github.com/example/app/raw/0123abc/docs/architecture/";
    expect(renderMarkdown(webSystem, { base: url })[0]!.markdown).toContain('srcset="https://github.com/example/app/raw/0123abc/docs/architecture/architecture.dark.svg"');
    for (const base of ["docs/my diagrams", "a,b", "https://example.com/x?raw=true", "https://example.com/x#top", "https://", "x\u0000y"])
      expect(() => renderMarkdown(webSystem, { base }), base).toThrowError(ArchloomError);
    expect(() => renderMarkdown(webSystem, { theme: "dark" } as never)).toThrowError(ArchloomError);
  });

  it("escapes the title in the alt text", () => {
    const images = renderMarkdown({ ...webSystem, title: 'A "quoted" <system> & more' });
    expect(images[0]!.markdown).toContain('alt="A &quot;quoted&quot; &lt;system&gt; &amp; more"');
  });
});
