import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { GraphSchema } from '../dist/index.js';

await mkdir('schema', { recursive: true });
const schema = z.toJSONSchema(GraphSchema, { target: 'draft-2020-12', io: 'input' });
await writeFile('schema/graph.schema.json', `${JSON.stringify(schema, null, 2)}\n`);
