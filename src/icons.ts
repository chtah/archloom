import { ArchloomError } from "./errors.js";

export type IconShape = {
  tag: "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse";
  attrs: Record<string, string | number>;
};
export type IconAsset = {
  shapes: IconShape[]; mode: "stroke" | "fill"; notice: string;
  color?: string; background?: string; source?: string;
};
export type IconResolver = (key: string) => IconAsset | undefined;

function invalid(message: string): never { throw new ArchloomError("INVALID_ICON", message); }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hex = (value: unknown): value is string => typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
const escape = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const numberPattern = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
const numeric = new RegExp(`^${numberPattern}$`);
const bounded = (value: unknown, limit = 10000): boolean => (typeof value === "number" || typeof value === "string" && numeric.test(value)) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
const numbers = (text: string, limit = 10000): number[] => {
  const tokens = text.match(new RegExp(numberPattern, "g")) ?? [];
  if (text.replace(new RegExp(numberPattern, "g"), "").replace(/[\s,]/g, "") !== "" || tokens.some((n) => !bounded(n, limit))) invalid("invalid icon numeric list");
  return tokens.map(Number);
};
const path = (text: string): boolean => {
  if (!text.length || text.length > 100000 || !/^[Mm]/.test(text)) return false;
  const arities: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const parts = text.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? [];
  if (parts.join("") !== text) return false;
  return parts.every((part) => {
    const command = part[0]!.toLowerCase();
    const count = arities[command]!;
    if (command !== "a") {
      const args = numbers(part.slice(1), 1000000);
      return count === 0 ? args.length === 0 : args.length > 0 && args.length % count === 0;
    }
    // SVG arc flags are single digits, including compact sequences such as 00.186.
    let remaining = part.slice(1).trim();
    let index = 0;
    while (remaining.length > 0) {
      remaining = remaining.replace(/^[\s,]+/, "");
      if (!remaining.length) break;
      const slot = index % 7;
      const token = remaining.match(slot === 3 || slot === 4 ? /^[01]/ : new RegExp(`^${numberPattern}`))?.[0];
      if (!token || !bounded(token, 1000000) || (slot === 0 || slot === 1) && Number(token) < 0) return false;
      remaining = remaining.slice(token.length);
      index++;
    }
    return index > 0 && index % 7 === 0;
  });
};
const transform = (text: string): boolean => {
  if (text.length > 2048) return false;
  const pattern = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*/g;
  let end = 0; let count = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== end || ++count > 16) return false;
    end += match[0].length;
    const args = numbers(match[2]!);
    const lengths: Record<string, number[]> = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
    if (!lengths[match[1]!]!.includes(args.length)) return false;
  }
  return count > 0 && end === text.length;
};
const geometry: Record<IconShape["tag"], string[]> = {
  path: ["d", "pathLength"], circle: ["cx", "cy", "r", "pathLength"],
  rect: ["x", "y", "width", "height", "rx", "ry", "pathLength"],
  line: ["x1", "y1", "x2", "y2", "pathLength"],
  polyline: ["points", "pathLength"], polygon: ["points", "pathLength"],
  ellipse: ["cx", "cy", "rx", "ry", "pathLength"],
};
const standard = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "transform", "vector-effect"];
const attribute = (name: string, value: unknown): boolean => {
  if (typeof value !== "string" && typeof value !== "number") return false;
  switch (name) {
    case "d": return typeof value === "string" && path(value);
    case "points": { if (typeof value !== "string" || value.length > 100000) return false; const list = numbers(value); return list.length >= 4 && list.length % 2 === 0; }
    case "transform": return typeof value === "string" && transform(value);
    case "fill": case "stroke": return value === "none" || value === "currentColor" || hex(value);
    case "stroke-linecap": return ["butt", "round", "square"].includes(String(value));
    case "stroke-linejoin": return ["miter", "round", "bevel"].includes(String(value));
    case "fill-rule": case "clip-rule": return value === "nonzero" || value === "evenodd";
    case "vector-effect": return value === "non-scaling-stroke" || value === "none";
    case "stroke-dasharray": return value === "none" || typeof value === "string" && value.length <= 256 && numbers(value).length > 0 && numbers(value).every((n) => n >= 0);
    case "opacity": case "fill-opacity": case "stroke-opacity": return bounded(value) && Number(value) >= 0 && Number(value) <= 1;
    default: return bounded(value) && (!["r", "rx", "ry", "width", "height", "pathLength", "stroke-width", "stroke-miterlimit"].includes(name) || Number(value) >= 0);
  }
};

/** Validate structured icon data; never accepts raw SVG or fetches sources. */
export function iconMarkup(asset: unknown, accent: string): { markup: string; notice: string } {
  if (!record(asset) || Object.keys(asset).some((key) => !["shapes", "mode", "notice", "color", "background", "source"].includes(key))) invalid("invalid icon asset");
  if (asset.mode !== "stroke" && asset.mode !== "fill") invalid("invalid icon mode");
  if (!hex(accent) || asset.color !== undefined && !hex(asset.color) || asset.background !== undefined && !hex(asset.background)) invalid("icon colors must be hexadecimal");
  if (typeof asset.notice !== "string" || !asset.notice.trim() || asset.notice.length > 12000 || /[^\x09\x0a\x0d\x20-\uD7FF\uE000-\uFFFD]/u.test(asset.notice)) invalid("invalid icon notice");
  if (asset.source !== undefined && (typeof asset.source !== "string" || asset.source.length > 4096 || /[\x00-\x1f]/.test(asset.source))) invalid("invalid icon attribution source");
  if (!Array.isArray(asset.shapes) || asset.shapes.length === 0 || asset.shapes.length > 64) invalid("icons require 1–64 shapes");
  const shapes = asset.shapes.map((shape: unknown) => {
    if (!record(shape) || Object.keys(shape).some((key) => key !== "tag" && key !== "attrs") || typeof shape.tag !== "string" || !Object.hasOwn(geometry, shape.tag) || !record(shape.attrs)) invalid("invalid icon shape");
    const allowed = geometry[shape.tag as IconShape["tag"]]!;
    if (Object.keys(shape.attrs).length > 32) invalid("too many icon attributes");
    const attrs = Object.entries(shape.attrs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => {
      if ((!allowed.includes(name) && !standard.includes(name)) || !attribute(name, value)) invalid(`invalid icon attribute: ${name}`);
      return ` ${name}="${escape(typeof value === "number" ? value : String(value))}"`;
    }).join("");
    return `<${shape.tag}${attrs}/>`;
  }).join("");
  const color = escape(String(asset.color ?? accent));
  const paint = asset.mode === "stroke" ? `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` : `fill="${color}" stroke="none"`;
  const background = asset.background === undefined ? "" : `<rect width="24" height="24" rx="3" fill="${escape(String(asset.background))}"/>`;
  // XML comments cannot contain double hyphens or end in a hyphen.
  const notice = asset.notice.replace(/\r\n?/g, "\n").trim().replace(/-{2,}/g, (hyphens) => hyphens.split("").join(" ")).replace(/-$/, "- ");
  return { markup: `<svg viewBox="0 0 24 24" width="24" height="24" overflow="hidden" color="${color}" ${paint}>${background}${shapes}</svg>`, notice };
}

export function combineIconResolvers(...resolvers: IconResolver[]): IconResolver {
  return (key) => { for (const resolver of resolvers) { const asset = resolver(key); if (asset !== undefined) return asset; } return undefined; };
}
