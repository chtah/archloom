import Fastify from 'fastify';
import { TimeseriesClient } from '@fleet/cloud/timeseries';

const metrics = new TimeseriesClient(process.env.TIMESERIES_URL!, { readOnly: true });
const app = Fastify();

app.get<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/series', async (request) => {
  return metrics.query('select at, meanCelsius from device_minute where deviceId = ? order by at', [request.params.deviceId]);
});

app.listen({ port: 8082, host: '0.0.0.0' });
