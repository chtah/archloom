export async function book(courtId, slot) {
  const response = await fetch('/api/bookings', { method: 'POST', body: JSON.stringify({ courtId, slot }) });
  return response.json();
}
