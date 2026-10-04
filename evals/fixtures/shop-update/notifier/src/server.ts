import express from 'express';

// The one place that talks to MailHop, the outside email provider.
const app = express();
app.use(express.json());

app.post('/notifications', async (request, response) => {
  const sent = await fetch(process.env.MAILHOP_URL!, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.MAILHOP_KEY}` },
    body: JSON.stringify(request.body),
  });
  response.status(sent.ok ? 202 : 502).end();
});

app.listen(8090);
