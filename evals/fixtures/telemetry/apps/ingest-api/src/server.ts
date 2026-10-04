import Fastify from 'fastify';
import { ObjectStore } from '@fleet/cloud/object-store';
import { MessageQueue } from '@fleet/cloud/queue';
import type { Reading, BatchRef } from '@fleet/shared';

const raw = new ObjectStore(process.env.RAW_BUCKET!);          // bucket: fleet-raw-readings
const batches = new MessageQueue(process.env.BATCH_QUEUE_URL!); // queue: reading-batches
const app = Fastify();

// Devices in the field call this endpoint.
app.post<{ Body: Reading[] }>('/v1/readings', async (request, reply) => {
  const key = `batches/${Date.now()}.json`;
  await raw.put(key, JSON.stringify(request.body));
  const ref: BatchRef = { bucket: raw.name, key, count: request.body.length };
  await batches.send(ref);
  reply.code(202).send({ accepted: request.body.length });
});

app.listen({ port: 8081, host: '0.0.0.0' });
