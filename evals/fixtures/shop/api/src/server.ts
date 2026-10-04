import express from 'express';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { charge } from './paygate';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const orders = new Queue('orders', { connection: { url: process.env.REDIS_URL } });
const app = express();
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

app.get('/products', async (_request, response) => {
  response.json((await db.query('select id, name, price_cents from products')).rows);
});

app.post('/orders', async (request, response) => {
  const order = await db.query('insert into orders (cart, status) values ($1, $2) returning id', [request.body.cart, 'pending']);
  const payment = await charge(order.rows[0].id, request.body.cart);
  await db.query('update orders set status = $1 where id = $2', [payment.ok ? 'paid' : 'failed', order.rows[0].id]);
  if (payment.ok) await orders.add('fulfil', { orderId: order.rows[0].id });
  response.status(payment.ok ? 201 : 402).json({ id: order.rows[0].id });
});

app.listen(8080);
