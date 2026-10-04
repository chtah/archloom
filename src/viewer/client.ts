import type { Graph, Theme } from "../graph.js";
import type { Box, Diagram, Line } from "../render.js";

type Payload = { graph: Graph; diagrams: Record<Theme, Diagram[]>; initialTheme: Theme };
const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing viewer element: ${id}`);
  return found as T;
};
const { graph, diagrams, initialTheme } = JSON.parse(element("viewer-data").textContent ?? "") as Payload;
const canvas = element("canvas");
const drawing = element("drawing");
const select = element<HTMLSelectElement>("view-select");
const play = element<HTMLButtonElement>("play-toggle");
const step = element<HTMLButtonElement>("step-next");
const eyebrowLabel = element("detail-eyebrow");
const title = element("detail-title");
const body = element("detail-body");
const popup = element("details");
const themeToggle = element<HTMLButtonElement>("theme-toggle");
const playbackGroup = element("playback");
const zoomLevel = element("zoom-level");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let theme = initialTheme;
let diagram: Diagram;
let activeSvg: SVGSVGElement;
let overlay: SVGSVGElement;
let paused = reducedMotion.matches;
let scale = 1;
let x = 0;
let y = 0;
let nextMessage = 0;
let drag: { pointer: number; clientX: number; clientY: number; x: number; y: number; moved: boolean } | undefined;
let suppressClick = false;
let popupAnchor: Box | undefined;
// Controls stay put on screen, so a popup opened from one must not follow pan and zoom.
let popupPinned = false;
let returnFocus: HTMLElement | SVGElement | undefined;
const namespace = "http://www.w3.org/2000/svg";

element("system-title").textContent = graph.title;
for (const candidate of diagrams[theme]) {
  const option = document.createElement("option");
  option.value = candidate.id;
  const lens = candidate.lens === "architecture" ? "Architecture" : "Data flow";
  // The system title already sits beside the selector.
  option.textContent = candidate.title === graph.title ? lens : `${candidate.title} · ${lens}`;
  select.append(option);
}

function transform(): void {
  drawing.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  drawing.dataset.scale = String(scale);
  drawing.dataset.x = String(x);
  drawing.dataset.y = String(y);
  zoomLevel.textContent = `${Math.round(scale * 100)}%`;
  // The dot grid belongs to the canvas, so it follows pan and zoom past the diagram's edges.
  let grid = 18 * scale;
  while (grid < 12) grid *= 2;
  canvas.style.setProperty("--grid-size", `${grid}px`);
  canvas.style.setProperty("--grid-dot", `${Math.max(.6, Math.min(2, scale))}px`);
  canvas.style.setProperty("--grid-x", `${x - grid / 2 + 1.5 * scale}px`);
  canvas.style.setProperty("--grid-y", `${y - grid / 2 + 1.5 * scale}px`);
  positionPopup();
}
function fit(): void {
  // Leave the top and bottom edges to the floating controls.
  const marginX = 24;
  const marginY = Math.min(64, canvas.clientHeight * .15);
  scale = Math.max(.02, Math.min(2, (canvas.clientWidth - marginX * 2) / diagram.width, (canvas.clientHeight - marginY * 2) / diagram.height));
  x = (canvas.clientWidth - diagram.width * scale) / 2;
  y = (canvas.clientHeight - diagram.height * scale) / 2;
  transform();
}
function zoom(factor: number, cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2): void {
  const updated = Math.max(.02, Math.min(8, scale * factor));
  x = cx - (cx - x) * updated / scale;
  y = cy - (cy - y) * updated / scale;
  scale = updated;
  transform();
}
function clearSelection(): void {
  overlay?.querySelectorAll(".selected").forEach((hit) => { hit.classList.remove("selected"); hit.setAttribute("aria-pressed", "false"); });
}
function positionPopup(): void {
  if (popup.hidden || !popupAnchor) return;
  const margin = 12;
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const left = popupPinned ? popupAnchor.x : x + popupAnchor.x * scale;
  const top = popupPinned ? popupAnchor.y : y + popupAnchor.y * scale;
  const right = left + popupAnchor.width * (popupPinned ? 1 : scale);
  const bottom = top + popupAnchor.height * (popupPinned ? 1 : scale);
  const maxLeft = canvas.clientWidth - width - margin;
  const maxTop = canvas.clientHeight - height - margin;
  const clampLeft = (value: number): number => Math.max(margin, Math.min(value, maxLeft));
  const clampTop = (value: number): number => Math.max(margin, Math.min(value, maxTop));
  // Sit beside the selection rather than on it: right, left, below, then above.
  const sides = [
    { room: maxLeft - (right + margin), left: right + margin, top: clampTop(top) },
    { room: left - margin - width - margin, left: left - margin - width, top: clampTop(top) },
    { room: maxTop - (bottom + margin), left: clampLeft((left + right - width) / 2), top: bottom + margin },
    { room: top - margin - height - margin, left: clampLeft((left + right - width) / 2), top: top - margin - height },
  ];
  // When no side has room, take the roomiest and let the clamp overlap the selection.
  const side = sides.find((candidate) => candidate.room >= 0) ?? sides.reduce((best, candidate) => candidate.room > best.room ? candidate : best);
  popup.style.left = `${clampLeft(side.left)}px`;
  popup.style.top = `${clampTop(side.top)}px`;
}
function point(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left - canvas.clientLeft - x) / scale, y: (clientY - rect.top - canvas.clientTop - y) / scale };
}
function box(target: Element): Box {
  const rect = target.getBoundingClientRect();
  const origin = point(rect.left, rect.top);
  return { ...origin, width: rect.width / scale, height: rect.height / scale };
}
function openPopup(opener: HTMLElement | SVGElement, anchor: Box = box(opener), pinned = false): void {
  popupAnchor = anchor;
  popupPinned = pinned;
  returnFocus = opener;
  popup.hidden = false;
  positionPopup();
  popup.focus({ preventScroll: true });
}
function closePopup(restoreFocus = false): void {
  popup.hidden = true;
  popupAnchor = undefined;
  clearSelection();
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = undefined;
}
type Details = { eyebrow: Array<string | undefined>; title: string; summary?: string; rows: Array<[string, string | undefined]>; stacked?: boolean };
function details({ eyebrow, title: heading, summary, rows, stacked = false }: Details): void {
  eyebrowLabel.textContent = eyebrow.filter(Boolean).join(" · ");
  title.textContent = heading;
  body.replaceChildren();
  if (summary) {
    const paragraph = document.createElement("p");
    paragraph.textContent = summary;
    body.append(paragraph);
  }
  const list = document.createElement("dl");
  list.classList.toggle("stacked", stacked);
  for (const [label, value] of rows) {
    if (value === undefined || value === "") continue;
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    description.classList.toggle("mono", label === "ID");
    list.append(term, description);
  }
  if (list.childElementCount) body.append(list);
}
const nodeLabel = (id: string): string => graph.nodes.find((node) => node.id === id)?.label ?? id;
const route = (from: string, to: string): string => `${nodeLabel(from)} → ${nodeLabel(to)}`;
function inspect(kind: string, id: string, flow?: string, click?: { x: number; y: number }): void {
  clearSelection();
  let opener: SVGElement | undefined;
  for (const hit of overlay.querySelectorAll<SVGElement>("[data-kind]")) {
    if (hit.dataset.kind === kind && hit.dataset.id === id && (flow === undefined || hit.dataset.flow === flow)) {
      hit.classList.add("selected");
      hit.setAttribute("aria-pressed", "true");
      opener ??= hit;
    }
  }
  switch (kind) {
    case "node": {
      const node = graph.nodes.find((candidate) => candidate.id === id);
      if (!node) return;
      details({ eyebrow: [node.kind, graph.lanes.find((lane) => lane.id === node.lane)?.label], title: node.label, summary: node.summary, rows: [["Subtitle", node.subtitle], ["Flow", graph.flows.find((candidate) => candidate.id === flow)?.title], ["ID", node.id]] });
      break;
    }
    case "lane": {
      const lane = graph.lanes.find((candidate) => candidate.id === id);
      if (lane) details({ eyebrow: ["Lane"], title: lane.label, summary: lane.summary, rows: [["Subtitle", lane.subtitle], ["ID", lane.id]] });
      break;
    }
    case "line": {
      const line = diagram.atlas.lines.find((candidate) => candidate.id === id);
      if (!line) return;
      if (line.kind === "edge") {
        const edge = graph.edges.find((candidate) => candidate.id === line.id);
        if (edge) details({ eyebrow: ["Edge", edge.kind], title: line.label, summary: edge.summary, rows: [["Route", route(edge.from, edge.to)], ["Access", edge.kind === "data" ? edge.readOnly ? "Read only" : "May write" : undefined], ["ID", edge.id]] });
      } else {
        const flow = graph.flows.find((candidate) => candidate.id === line.flow);
        const message = flow?.messages.find((candidate) => `${line.flow}/${candidate.id}` === line.id);
        if (message) details({ eyebrow: ["Message", message.kind], title: message.label, summary: message.note, rows: [["Route", route(message.from, message.to)], ["Flow", flow?.title], ["ID", line.id]] });
      }
      break;
    }
  }
  if (!opener) return;
  // Cards and line labels are small enough to sit beside; lanes and bare lines anchor at the click.
  const target = kind === "node" ? opener : kind === "line" ? opener.querySelector(".line-pill") : null;
  openPopup(opener, target ? box(target) : click ? { ...click, width: 0, height: 0 } : undefined);
}
function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const result = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, String(value));
  return result;
}
function hit<T extends SVGElement>(shape: T, kind: "node" | "lane" | "line", id: string, label: string, flow?: string): T {
  shape.classList.add("hit");
  shape.dataset.kind = kind;
  shape.dataset.id = id;
  if (flow !== undefined) shape.dataset.flow = flow;
  shape.setAttribute("tabindex", "0");
  shape.setAttribute("role", "button");
  shape.setAttribute("aria-label", label);
  shape.setAttribute("aria-pressed", "false");
  shape.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!suppressClick) inspect(kind, id, flow, event.detail > 0 ? point(event.clientX, event.clientY) : undefined);
  });
  shape.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      inspect(kind, id, flow);
    }
  });
  return shape;
}
function rectangle(box: Box): SVGRectElement {
  return svgElement("rect", { x: box.x, y: box.y, width: box.width, height: box.height, rx: 8 });
}
function buildOverlay(): void {
  overlay = svgElement("svg", { viewBox: `0 0 ${diagram.width} ${diagram.height}`, width: diagram.width, height: diagram.height, class: "hit-overlay", "aria-label": "Interactive diagram elements" });
  // Lane zones are behind every line and individual node instance.
  for (const [id, box] of Object.entries(diagram.atlas.lanes)) {
    overlay.append(hit(rectangle(box), "lane", id, `Lane: ${graph.lanes.find((lane) => lane.id === id)?.label ?? id}`));
  }
  const lines = svgElement("g", { transform: `translate(${diagram.atlas.shift.x} ${diagram.atlas.shift.y})` });
  const masks = svgElement("defs", {});
  lines.append(masks);
  for (const line of diagram.atlas.lines) {
    const group = hit(svgElement("g", {}), "line", line.id, `${line.kind === "message" ? "Message" : "Edge"}: ${line.label}`);
    group.classList.add("line-hit");
    const path = svgElement("path", { d: line.d, class: "hit line-path" });
    group.append(path);
    if (line.pill) {
      // Cut the label out of the line highlight so the selected stroke stops short of it.
      const gap = 3;
      const mask = svgElement("mask", { id: `line-mask-${masks.childElementCount}`, maskUnits: "userSpaceOnUse", x: -diagram.atlas.shift.x, y: -diagram.atlas.shift.y, width: diagram.width, height: diagram.height });
      mask.append(
        svgElement("rect", { x: -diagram.atlas.shift.x, y: -diagram.atlas.shift.y, width: diagram.width, height: diagram.height, fill: "#fff" }),
        svgElement("rect", { x: line.pill.x - gap, y: line.pill.y - gap, width: line.pill.width + gap * 2, height: line.pill.height + gap * 2, rx: line.pill.height / 2 + gap, fill: "#000" }),
      );
      masks.append(mask);
      // Applied by the stylesheet only while highlighted, so idle lines carry no mask layer.
      path.style.setProperty("--line-mask", `url(#${mask.id})`);
      const pill = rectangle(line.pill);
      pill.classList.add("hit", "line-pill");
      group.append(pill);
    }
    lines.append(group);
  }
  overlay.append(lines);
  for (const instance of diagram.atlas.nodeInstances) {
    overlay.append(hit(rectangle(instance.box), "node", instance.id, `Node: ${nodeLabel(instance.id)}${instance.flow ? ` in ${graph.flows.find((flow) => flow.id === instance.flow)?.title ?? instance.flow}` : ""}`, instance.flow));
  }
  drawing.append(overlay);
}
function playback(): void {
  const available = diagram.animated;
  play.disabled = !available;
  const label = available ? paused ? "Play" : "Pause" : "No animation";
  play.title = label;
  play.setAttribute("aria-label", label);
  playbackGroup.hidden = !available && step.hidden;
  play.setAttribute("aria-pressed", String(available && !paused));
  if (paused || !available) activeSvg.pauseAnimations();
  else activeSvg.unpauseAnimations();
}
function showView(): void {
  const selected = diagrams[theme].find((candidate) => candidate.id === select.value) ?? diagrams[theme][0];
  if (!selected) throw new Error("No diagrams available");
  diagram = selected;
  select.value = selected.id;
  nextMessage = 0;
  closePopup();
  // The only markup insertion is the trusted, pre-rendered SVG. Prose is textContent.
  drawing.innerHTML = diagram.svg;
  const svg = drawing.querySelector("svg");
  if (!svg) throw new Error("Diagram SVG is missing");
  activeSvg = svg;
  // The canvas paints the backdrop; the diagram's own full-size card would frame it.
  for (const child of [...svg.children]) {
    if (child.tagName === "rect" && Number(child.getAttribute("width")) === diagram.width && Number(child.getAttribute("height")) === diagram.height) child.remove();
  }
  drawing.style.width = `${diagram.width}px`;
  drawing.style.height = `${diagram.height}px`;
  buildOverlay();
  step.hidden = diagram.lens !== "data-flow";
  step.disabled = !diagram.atlas.lines.some((line) => line.kind === "message");
  document.documentElement.dataset.theme = theme;
  themeToggle.title = theme === "dark" ? "Light theme" : "Dark theme";
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  playback();
  fit();
}
select.addEventListener("change", showView);
themeToggle.addEventListener("click", () => {
  // Same view in other colours: keep where the reader was looking and stepping.
  const kept = { scale, x, y, nextMessage };
  theme = theme === "dark" ? "light" : "dark";
  showView();
  ({ scale, x, y, nextMessage } = kept);
  transform();
});
play.addEventListener("click", () => { paused = !paused; playback(); });
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) { paused = true; playback(); } });
element("fit").addEventListener("click", fit);
element("zoom-in").addEventListener("click", () => zoom(1.25));
element("zoom-out").addEventListener("click", () => zoom(.8));
step.addEventListener("click", () => {
  const messages = diagram.atlas.lines.filter((line): line is Line & { kind: "message" } => line.kind === "message");
  const message = messages[nextMessage % messages.length];
  if (!message) return;
  inspect("line", message.id);
  nextMessage++;
  paused = true;
  playback();
  // Keep focus on the button so repeated Enter keeps stepping; Escape returns here too.
  returnFocus = step;
  step.focus({ preventScroll: true });
});
element("licenses").addEventListener("click", () => {
  clearSelection();
  const notices = [...new Set([...diagrams.dark, ...diagrams.light].flatMap((candidate) => candidate.notices))];
  details({ eyebrow: ["About"], title: "Licenses & attribution", stacked: true, rows: [["Archloom", "Derived from PR Lens. MIT License · Copyright (c) 2026 Coldtea AI."], ...notices.map((notice): [string, string] => ["Icon notice", notice]), ...(notices.length ? [] : [["Icons", "No icon assets in this document."]] as Array<[string, string]>)] });
  const button = element("licenses").getBoundingClientRect();
  const area = canvas.getBoundingClientRect();
  openPopup(element("licenses"), { x: button.left - area.left - canvas.clientLeft, y: button.top - area.top - canvas.clientTop, width: button.width, height: button.height }, true);
});
element("detail-close").addEventListener("click", () => closePopup(true));
document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target && !popup.contains(target) && !target.closest("[data-kind]")) closePopup();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !popup.hidden) {
    event.preventDefault();
    closePopup(true);
  }
});
element("download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([diagram.svg], { type: "image/svg+xml;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${diagram.id}-${theme}.svg`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
canvas.addEventListener("wheel", (event) => {
  if (event.target instanceof Element && popup.contains(event.target)) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .002), event.clientX - rect.left - canvas.clientLeft, event.clientY - rect.top - canvas.clientTop);
}, { passive: false });
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || drag || (event.target instanceof Element && popup.contains(event.target))) return;
  const target = event.target instanceof Element ? event.target.closest<SVGElement>("[data-kind]") : null;
  if (target && target.dataset.kind !== "lane") return;
  suppressClick = false;
  drag = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y, moved: false };
  // Capture after movement so a stationary lane click still reaches its hit area.
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const dx = event.clientX - drag.clientX;
  const dy = event.clientY - drag.clientY;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("panning");
  x = drag.x + dx;
  y = drag.y + dy;
  transform();
});
function finishDrag(event: PointerEvent): void {
  if (!drag || drag.pointer !== event.pointerId) return;
  suppressClick = drag.moved;
  drag = undefined;
  canvas.classList.remove("panning");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  setTimeout(() => { suppressClick = false; }, 0);
}
// Before the drag threshold there is no capture; release outside still ends it.
window.addEventListener("pointerup", finishDrag);
window.addEventListener("pointercancel", finishDrag);
canvas.addEventListener("lostpointercapture", () => { drag = undefined; canvas.classList.remove("panning"); });
canvas.addEventListener("keydown", (event) => {
  if (event.target !== canvas) return;
  switch (event.key) {
    case "+": case "=": zoom(1.25); break;
    case "-": zoom(.8); break;
    case "0": fit(); break;
    case "ArrowLeft": x += 40; transform(); break;
    case "ArrowRight": x -= 40; transform(); break;
    case "ArrowUp": y += 40; transform(); break;
    case "ArrowDown": y -= 40; transform(); break;
    default: return;
  }
  event.preventDefault();
});
showView();
new ResizeObserver(() => fit()).observe(canvas);
