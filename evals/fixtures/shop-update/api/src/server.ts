import express from 'express';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { Queue } from 'bullmq';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const orders = new Queue('orders', { connection: { url: process.env.REDIS_URL } });
const app = express();
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

app.get('/products', async (_request, response) => {
  response.json((await db.query('select id, name, price_cents from products')).rows);
});

// Orders are paid on delivery now; there is no card payment step.
app.post('/orders', async (request, response) => {
  const order = await db.query('insert into orders (cart, status) values ($1, $2) returning id', [request.body.cart, 'placed']);
  await orders.add('fulfil', { orderId: order.rows[0].id });
  response.status(201).json({ id: order.rows[0].id });
});

app.listen(8080);
