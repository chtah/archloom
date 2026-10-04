import { ObjectStore } from '@fleet/cloud/object-store';
import { MessageQueue } from '@fleet/cloud/queue';
import { TimeseriesClient } from '@fleet/cloud/timeseries';
import type { Reading, BatchRef } from '@fleet/shared';

const raw = new ObjectStore(process.env.RAW_BUCKET!);
const batches = new MessageQueue(process.env.BATCH_QUEUE_URL!);
const metrics = new TimeseriesClient(process.env.TIMESERIES_URL!); // database: fleet_metrics

// Long-running consumer: one batch reference per message.
for await (const message of batches.receive<BatchRef>()) {
  const readings: Reading[] = JSON.parse(await raw.get(message.body.key));
  const byDevice = Map.groupBy(readings, (reading) => reading.deviceId);
  for (const [deviceId, rows] of byDevice) {
    const mean = rows.reduce((sum, row) => sum + row.celsius, 0) / rows.length;
    await metrics.insert('device_minute', { deviceId, at: rows[0]!.at, meanCelsius: mean, samples: rows.length });
  }
  await message.ack();
}
