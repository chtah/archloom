import { Worker } from 'bullmq';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

new Worker('orders', async (job) => {
  const { orderId } = job.data;
  await db.query('update orders set status = $1 where id = $2', ['fulfilling', orderId]);
  const order = await db.query('select email from orders where id = $1', [orderId]);
  await fetch(`${process.env.NOTIFIER_URL}/notifications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: order.rows[0].email, template: 'order-confirmed', orderId }),
  });
}, { connection: { url: process.env.REDIS_URL } });
