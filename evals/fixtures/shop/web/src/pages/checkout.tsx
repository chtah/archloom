import { placeOrder } from '../api-client';

export default function Checkout({ cart }: { cart: { productId: string; quantity: number }[] }) {
  return <button onClick={() => placeOrder(cart)}>Pay</button>;
}
