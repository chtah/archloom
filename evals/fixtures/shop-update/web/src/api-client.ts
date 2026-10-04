const base = process.env.API_URL ?? 'http://localhost:8080';

export async function listProducts() {
  return (await fetch(`${base}/products`)).json();
}

export async function placeOrder(cart: { productId: string; quantity: number }[]) {
  const response = await fetch(`${base}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cart }),
  });
  return response.json();
}
