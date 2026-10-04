// Card payments go through PayGate, an outside provider.
export async function charge(orderId: string, cart: unknown) {
  const response = await fetch(`${process.env.PAYGATE_URL}/charges`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.PAYGATE_KEY}` },
    body: JSON.stringify({ reference: orderId, cart }),
  });
  return { ok: response.ok };
}
