import { ArchloomError } from "../errors.js";
import type { IconResolver } from "../icons.js";

/** Optional brand adapter; package CC0 does not clear individual brand rights. */
export async function createSimpleIconsResolver(): Promise<IconResolver> {
  const library = await import("simple-icons");
  const icons = new Map(Object.values(library).filter((icon) => "slug" in icon).map((icon) => [icon.slug, icon]));
  return (key) => {
    if (!/^si:[a-z0-9_]+$/.test(key)) return undefined;
    const icon = icons.get(key.slice(3));
    if (!icon) return undefined;
    if (icon.license && icon.license.type !== "CC0-1.0") {
      throw new ArchloomError("INVALID_ICON", `Simple Icons ${icon.slug} declares ${icon.license.type}; review ${icon.license.url} and brand guidelines manually, then supply your own rights-reviewed IconResolver.`);
    }
    const color = `#${icon.hex}`;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(icon.hex.slice(offset, offset + 2), 16));
    const dark = channels.every((channel) => channel < 96);
    return {
      shapes: [{ tag: "path", attrs: { d: icon.path } }], mode: "fill", color,
      ...(dark ? { background: "#ffffff" } : {}), source: icon.source,
      notice: `Simple Icons (${icon.title}; ${icon.slug})\nPackage: CC0 1.0 Universal (CC0-1.0), https://creativecommons.org/publicdomain/zero/1.0/\nSource: ${icon.source}\n${icon.guidelines ? `Brand guidelines: ${icon.guidelines}\n` : ""}${icon.license ? `Declared icon license: ${icon.license.type}, ${icon.license.url}` : "Individual icon license metadata is absent: this is not clearance or evidence of unrestricted use."}\nSimple Icons is released under CC0, but this does not imply all individual icons are CC0. No trademark or patent rights are waived or licensed by CC0. Brand licenses and guidelines may apply or change; metadata may be incomplete or outdated. Obtain the correct permissions and review the source, individual license and brand guidelines before use. Simple Icons and Archloom do not clear third-party rights or warrant permitted use. See THIRD_PARTY_NOTICES.md and the Simple Icons DISCLAIMER.md.`,
    };
  };
}
