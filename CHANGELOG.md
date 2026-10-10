# Changelog

Notable changes to `@chtah/archloom`. Versions follow semantic versioning; while
the version is below 1.0, a minor release may change behavior.

## 0.4.0

While the version is below 1.0, this minor release changes behavior: graphs
that set `layout.direction: "down"` now render differently.

### Added

- `layout.direction: "down"` lays architecture views out top to bottom: lanes
  become bands stacked down the page and connections run across them. `right`
  output is unchanged. Data-flow views are unaffected.

### Removed

- The HTML viewer no longer shows the `A` mark or the licenses popup.

## 0.3.0

### Added

- `archloom markdown <graph.json>` writes `<view>.light.svg` and `<view>.dark.svg`
  and prints a `<picture>` snippet per view that follows the reader's colour
  scheme, for Markdown files and comments. It writes no `index.html` or
  `atlas.json`. `--base` sets the image path prefix, and `--check` fails with
  `STALE_OUTPUT` when the SVGs on disk differ from a fresh render.
- `renderMarkdown(input, options?)` returns the same images and snippets from the
  library.
- `ArchloomError` has a new code, `STALE_OUTPUT`.

### Changed

- The agent skill is rewritten around reading a codebase: it looks for an
  existing `*.archloom.json` first, takes evidence from what declares and runs
  the system, draws only things that run or store on their own, updates a graph
  in place with stable IDs, and confirms labels and summaries with the user
  before a first commit or a comment. New references cover reading a codebase
  and sharing diagrams. `skills/archloom/evals/evals.json` is no longer shipped;
  the evaluations live in the repository's `evals/` directory.
- Releases are published from a GitHub Actions workflow through npm trusted
  publishing, so this and later versions carry a provenance attestation.
- The package description and keywords describe use with coding agents.

`render`, `validate`, `render()`, `renderAll()` and `renderHtml()` are unchanged,
and the graph `schemaVersion` stays `0.1.0`.

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
