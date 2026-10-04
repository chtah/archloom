# API reference

Archloom is ESM only. The package entry points are:

| Entry point | Contents |
| --- | --- |
| `@chtah/archloom` | Validation, SVG rendering and the offline HTML canvas. |
| `@chtah/archloom/browser` | `mountCanvas`; see [embedding](embedding.md). |
| `@chtah/archloom/icons/lucide` | `createLucideResolver`; see [icons](icons.md). |
| `@chtah/archloom/icons/simple-icons` | `createSimpleIconsResolver`. |

## Functions

| Export | Purpose |
| --- | --- |
| `parseGraph(input)` | Validate unknown input and return a graph with defaults applied. |
| `render(input, options?)` | Render one diagram. Options: `lens`, `view`, `theme`, `icons`. A given view and lens must agree. |
| `renderAll(input, options?)` | Render all named or default views. Options: `theme`, `icons`. |
| `renderMarkdown(input, options?)` | Render every view in both themes with a `<picture>` snippet each; see [Markdown](markdown.md). Options: `base`, `icons`. |
| `renderHtml(input, options?)` | Return a self-contained canvas holding both themes. Options: initial `theme`, `icons`. |
| `combineIconResolvers(...resolvers)` | Combine icon resolvers; the first match wins. |
| `ArchloomError` | Error with a stable `code` and validation `issues` carrying paths and messages. |

Without named views, `renderAll` produces an architecture overview and one
data-flow diagram per flow. With named views, it produces those views and their
descendants. Runtime validation goes beyond the JSON Schema: it also checks
references, uniqueness and whether each view can be rendered.

Rendering is deterministic: equal input and options produce equal SVG bytes.
`render()` returns a script-free SVG with no click behavior; interaction lives in
the HTML canvas.

## Example

```js
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseGraph, render, renderAll, renderHtml, ArchloomError } from '@chtah/archloom';

try {
  const graph = parseGraph(JSON.parse(await readFile('graph.json', 'utf8')));
  const architecture = render(graph, { lens: 'architecture', theme: 'dark' });
  const diagrams = renderAll(graph, { theme: 'light' });
  await mkdir('out', { recursive: true });
  await writeFile('out/architecture.svg', architecture.svg);
  await writeFile('out/index.html', renderHtml(graph));
  console.log(diagrams.map(({ id }) => id));
} catch (error) {
  if (error instanceof ArchloomError) console.error(error.code, error.issues);
  throw error;
}
```

## Diagrams and the atlas

A diagram contains `svg`, dimensions, view identity, lens, theme, animation
status, `atlas` and icon `notices`. The atlas gives the geometry needed to build
interaction on top of the SVG:

- Lane, node, edge and message boxes use final canvas coordinates.
- `atlas.lines` paths and label `pill` boxes need the translation in `atlas.shift`.
- `nodeInstances` lists repeated participant headings in multi-flow diagrams; the
  node map alone cannot represent every instance.
- Message line IDs are `flow-id/message-id`. The message-box map is nested by
  flow ID, then message ID.
