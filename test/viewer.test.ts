import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseGraph, type Graph } from "../src/graph.js";
import { renderAll, type Diagram } from "../src/render.js";
import { renderHtml } from "../src/viewer.js";
import { VIEWER_SCRIPT_HASH } from "../src/viewer/client.generated.js";
import { webSystem } from "./fixtures.js";

type Payload = { graph: Graph; diagrams: { dark: Diagram[]; light: Diagram[] }; initialTheme: string };
function payload(html: string): Payload {
  const text = html.match(/<script id="viewer-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!text) throw new Error("Missing viewer payload");
  return JSON.parse(text) as Payload;
}

describe("offline HTML canvas", () => {
  it("is byte-deterministic, validates input and retains both themes and every nested view", () => {
    const graph = { ...webSystem, views: [{ id: "overview", title: "Overview", lens: "architecture", children: [{ id: "sequence", title: "Sequence", lens: "data-flow" }] }] };
    const before = JSON.stringify(graph);
    const html = renderHtml(graph, { theme: "light" });
    expect(renderHtml(graph, { theme: "light" })).toBe(html);
    expect(JSON.stringify(graph)).toBe(before);
    const data = payload(html);
    expect(data.initialTheme).toBe("light");
    expect(data.graph).toEqual(parseGraph(graph));
    for (const theme of ["dark", "light"] as const) {
      expect(data.diagrams[theme]).toEqual(renderAll(graph, { theme }));
      expect(data.diagrams[theme].map((diagram) => diagram.id)).toEqual(["overview", "sequence"]);
    }
    expect(() => renderHtml({ title: "invalid" })).toThrow();
    expect(() => Reflect.apply(renderHtml, undefined, [webSystem, { theme: "invalid" }])).toThrow();
    expect(() => Reflect.apply(renderHtml, undefined, [webSystem, { network: true }])).toThrow();
  });

  it("keeps malicious prose inert, escapes the HTML title and JSON script terminators", () => {
    const attack = '</script><script>alert("x")</script><img src="https://evil.test/x" onerror="alert(1)">';
    const graph = { ...webSystem, title: attack, summary: `${attack}\u2028\u2029`, nodes: webSystem.nodes.map((node) => ({ ...node, summary: attack })) };
    const html = renderHtml(graph);
    const data = payload(html);
    expect(data.graph.title).toBe(attack);
    expect(data.graph.summary).toBe(`${attack}\u2028\u2029`);
    const text = html.match(/<script id="viewer-data" type="application\/json">([\s\S]*?)<\/script>/)![1]!;
    expect(text).not.toContain("<");
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(text).toContain("\\u003c/script>");
    expect(html).toContain("<title>&lt;/script&gt;&lt;script&gt;alert(&quot;x&quot;)");
    expect(html.match(/<script\b/g)).toHaveLength(2);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).not.toContain('<img src="https://evil.test/x"');
  });

  it("takes the page theme from the validated render, not a second read of the option", () => {
    let reads = 0;
    const options = { get theme() { return reads++ < 1 ? "dark" : 'dark" onload="alert(1)'; } };
    const html = Reflect.apply(renderHtml, undefined, [webSystem, options]) as string;
    expect(html).toContain('<html lang="en" data-theme="dark">');
    expect(html).not.toContain("onload=");
  });

  it("embeds exactly one hashed classic script and an offline deny-by-default CSP", () => {
    const html = renderHtml(webSystem);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(createHash("sha256").update(script!).digest("base64")).toBe(VIEWER_SCRIPT_HASH);
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1]!.replace(/&#39;/g, "'");
    expect(csp).toContain(`script-src 'sha256-${VIEWER_SCRIPT_HASH}'`);
    for (const directive of ["default-src 'none'", "connect-src 'none'", "style-src 'unsafe-inline'", "img-src data: blob:", "form-action 'none'", "base-uri 'none'", "object-src 'none'"]) expect(csp).toContain(directive);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(html).not.toMatch(/<(?:script|link|img|iframe|font)\b[^>]*(?:src|href)=/i);
    expect(html).not.toMatch(/@import|@font-face/);
  });

  it("preserves each repeated-flow node instance, line path, pill and atlas translation", () => {
    const flows = webSystem.flows ?? [];
    const graph = { ...webSystem, flows: [...flows, ...flows.map((flow) => ({ ...flow, id: "second" }))], views: [{ id: "flows", title: "Both flows", lens: "data-flow" }] };
    const data = payload(renderHtml(graph));
    for (const theme of ["dark", "light"] as const) {
      const diagram = data.diagrams[theme][0]!;
      expect(diagram.atlas).toEqual(renderAll(graph, { theme })[0]!.atlas);
      expect(diagram.atlas.nodeInstances.filter((instance) => instance.id === "api")).toHaveLength(2);
      expect(diagram.atlas.nodeInstances.filter((instance) => instance.id === "api").map((instance) => instance.flow)).toEqual(["load-records", "second"]);
      expect(diagram.atlas.nodeInstances.filter((instance) => instance.id === "api")[0]!.box).not.toEqual(diagram.atlas.nodeInstances.filter((instance) => instance.id === "api")[1]!.box);
      expect(diagram.atlas.shift.x).toBeGreaterThan(0);
      expect(diagram.atlas.lines).toHaveLength(8);
      expect(diagram.atlas.lines.find((line) => line.id === "second/request")).toMatchObject({ kind: "message", flow: "second", d: expect.any(String), pill: expect.any(Object) });
    }
  });

  it("includes local icon notices for both themes and accessible canvas controls", () => {
    const notice = 'MIT · Fictional test icon <script>alert(1)</script>';
    const graph = { ...webSystem, nodes: webSystem.nodes.map((node) => ({ ...node, icon: "custom:test" })) };
    const html = renderHtml(graph, { icons: () => ({ mode: "stroke", notice, shapes: [{ tag: "path", attrs: { d: "M1 1 L23 23" } }] }) });
    const data = payload(html);
    for (const theme of ["dark", "light"] as const) for (const diagram of data.diagrams[theme]) expect(diagram.notices).toEqual([notice]);
    for (const id of ["canvas", "drawing", "view-select", "theme-toggle", "play-toggle", "fit", "zoom-in", "zoom-out", "step-next", "download", "details", "detail-title", "detail-body"]) expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain('id="licenses"');
    expect(html).toContain('id="canvas" tabindex="0"');
  });
});
