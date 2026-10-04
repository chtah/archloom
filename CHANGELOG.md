# Changelog

Notable changes to `@chtah/archloom`. Versions follow semantic versioning; while
the version is below 1.0, a minor release may change behavior.

## Unreleased

### Added

- `archloom markdown <graph.json>` writes `<view>.light.svg` and `<view>.dark.svg`
  and prints a `<picture>` snippet per view that follows the reader's colour
  scheme, for Markdown files and comments. It writes no `index.html` or
  `atlas.json`. `--base` sets the image path prefix, and `--check` fails with
  `STALE_OUTPUT` when the SVGs on disk differ from a fresh render.
- `renderMarkdown(input, options?)` returns the same images and snippets from the
  library.
- `ArchloomError` has a new code, `STALE_OUTPUT`.

## 0.2.0

### Changed

- The offline canvas is a single full-bleed surface. The header, toolbar, footer
  and bordered stage are gone; controls float in the corners and sharpen on hover
  or focus. `mountCanvas` embeds get the same look and no longer draw a border.
- The detail popup opens beside the selected card or line label instead of over
  it, leads with the summary, and lists the remaining fields in a compact grid.
- Switching theme keeps the zoom level, pan position and step position.
- Very dense graphs that exhaust the label placement budget leave some labels at
  the middle of their line, where they can overlap.
- `renderHtml` and `archloom render` reject view sets that would embed more than
  16 MiB of SVG in one canvas.
- `parseGraph` rejects a `__proto__` key instead of dropping it.
- `archloom render --out ""` is a usage error instead of writing into the
  current directory.
- `layout.direction` is documented as reserved: it is accepted but has no effect.

`render()` and `renderAll()` output is unchanged for ordinary diagrams, and the
graph `schemaVersion` stays `0.1.0`.

### Fixed

- Rendering a small graph with many long edge labels could take minutes. Label
  placement now spends a fixed work budget per diagram.
- A selected line's highlight no longer runs through its label.
- Icon notices containing `$`-patterns were expanded when embedded in the SVG.
- The step button lost keyboard focus after one press.
- `mountCanvas().update()` dropped a retained option when given an explicit
  `undefined`.
- `renderHtml` takes the page theme from the validated render.
- The CLI never writes through a symlink, refuses Windows device names as
  artifact names, and strips bidirectional and format characters from terminal
  output.

## 0.1.0

First release: architecture and data-flow diagrams from JSON, the offline HTML
canvas, the browser mount, optional icon adapters and the agent skill.
