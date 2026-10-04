# Embedding the canvas

`@chtah/archloom/browser` mounts the same canvas and detail popups as the offline
HTML. It needs a browser bundler but no framework, click handlers or popup
renderer of your own.

```html
<div id="diagram" style="height: 640px"></div>
```

```js
import { mountCanvas } from '@chtah/archloom/browser';

const graph = {
  title: 'Example system',
  lanes: [{ id: 'application', label: 'Application' }],
  nodes: [{ id: 'api', label: 'API', lane: 'application', summary: 'Handles requests.' }],
};
const canvas = mountCanvas(document.getElementById('diagram'), graph, { theme: 'dark' });
canvas.update(graph, { theme: 'light' });
canvas.destroy();
```

## Behavior

- Mounting replaces the container's contents. Give the container a definite CSS
  height. The canvas fills it edge to edge and draws no border, so add your own
  if you want a frame.
- `update` merges the supplied options with the previous ones and resets
  selection, zoom and playback. Invalid input throws and leaves the current
  canvas untouched.
- `destroy` is idempotent and removes only its own iframe. Updating a destroyed
  canvas throws.
- Rendering is synchronous; iframe initialization is asynchronous.

## Isolation

Each canvas lives in a sandboxed iframe (`allow-scripts allow-downloads`, without
`allow-same-origin`), so IDs, styles and popup state do not collide between
canvases or with the host page. Popups stay inside the frame, and an outside
click means a click inside the canvas, not elsewhere on the host page. The host's
Content Security Policy may add restrictions of its own.
