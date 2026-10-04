# Icons

Default glyphs need no icon package. Icon packs are optional peers: install the
one you use, and nothing is downloaded at render time.

```bash
npm install lucide        # keys such as lucide:monitor, lucide:server, lucide:database
npm install simple-icons  # keys such as si:postgresql
```

Set `icon` on nodes, then render with `--icons lucide`, `--icons simple-icons` or
`--icons both`.

## Library

```js
import { render, combineIconResolvers } from '@chtah/archloom';
import { createLucideResolver } from '@chtah/archloom/icons/lucide';
import { createSimpleIconsResolver } from '@chtah/archloom/icons/simple-icons';

const icons = combineIconResolvers(await createLucideResolver(), await createSimpleIconsResolver());
const { svg, notices } = render(graph, { icons });
```

The adapters load their peer packages lazily. A custom resolver is a function
from a key to a validated structured shape, never raw SVG. Keep resolvers
deterministic and use only resolver code you trust.

## Licenses and trademarks

Simple Icons keeps brand colors. Its package-level CC0 license does **not** clear
individual brand or trademark rights. The built-in adapter refuses icons with
explicit non-CC0 license metadata, and missing metadata is **not** clearance.
Review sources, individual licenses and brand guidelines before use.

Notices accompany generated SVGs and appear in the canvas's Licenses panel. Keep
them when redistributing assets. See [third-party notices](../THIRD_PARTY_NOTICES.md).
