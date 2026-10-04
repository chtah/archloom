# Diagrams in Markdown and comments

`archloom markdown` writes the images a README, a docs page or a comment needs,
and nothing else: one light and one dark SVG per view, plus a snippet that shows
the one matching the reader's colour scheme.

```bash
npx archloom markdown docs/architecture/system.archloom.json
```

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture/architecture.dark.svg">
  <img alt="A small web system" src="docs/architecture/architecture.light.svg">
</picture>
```

The snippets go to standard output, one per view, separated by a blank line; the
status line goes to standard error, so the output can be piped. Paste a snippet
into any Markdown file. GitHub shows the dark image to readers using a dark theme
and the light image otherwise; a renderer that ignores `<source>` shows the light
image.

## Options

| Option | Meaning |
| --- | --- |
| `--out <directory>` | Where the SVGs go. Default: the directory of the graph file. |
| `--base <path-or-url>` | Prefix of the image paths in the snippet. Default: the output directory relative to the current directory, which suits a file at the repository root when you run the command there. |
| `--icons lucide\|simple-icons\|both` | Resolve icon keys from installed peers; see [icons](icons.md). |
| `--force` | Overwrite existing SVGs of the same names. |
| `--check` | Write nothing; exit 1 with `STALE_OUTPUT` when an SVG is missing or differs from a fresh render. |

Files are named `<view-id>.light.svg` and `<view-id>.dark.svg`. Without named
views the IDs are `architecture` and `flow-<flow-id>`.

`--base` takes a relative path (`../architecture` for a Markdown file in a
sibling directory) or an `http(s)` URL without a query or fragment. Path segments
are percent-encoded; whitespace and commas are rejected because they would split
the `srcset`.

## Keeping the images current

Rendering is deterministic, so a committed SVG either equals a fresh render or is
out of date. Run the check in CI or a pre-commit hook, with the same `--out` and
`--icons` used to write the files:

```bash
npx archloom markdown docs/architecture/system.archloom.json --check
```

After editing the graph, write the images again with `--force`. The check proves
that the images match the graph. It cannot tell whether the graph still matches
the code. It also does not notice SVGs left behind by a view that was removed or
renamed; delete those by hand.

## In a comment

A pull request or issue comment cannot hold an image; it needs a URL. Commit the
SVGs, then pass the URL of their directory at that commit as `--base` and paste
the snippet into the comment.

## What the files contain

An SVG holds what its view shows, including labels and identifiers in the markup.
Unlike `archloom render`, this command writes no `index.html` or `atlas.json`,
which embed the whole graph. Read [PRIVACY.md](../PRIVACY.md) before publishing
diagrams of a private system.

## Library

```js
import { renderMarkdown } from '@chtah/archloom';

for (const image of renderMarkdown(graph, { base: 'docs/architecture' })) {
  // image.light.file, image.light.svg, image.dark.file, image.dark.svg
  console.log(image.markdown);
}
```

`renderMarkdown(input, options?)` renders every view in both themes. Options:
`base`, `icons`. Each result has `id`, `title`, `lens`, `width`, `height`,
`light`, `dark`, `markdown` and icon `notices`.
