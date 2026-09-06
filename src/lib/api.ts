import type { EventTicketCatalog, Ticket } from "@/types/eventTicket";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "http://localhost:3001/api";

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({ error: "" }));
  return body.error || `Error ${response.status}`;
}

export async function getPublicEvent(
  slug: string,
): Promise<EventTicketCatalog | null> {
  const response = await fetch(
    `${API_BASE_URL}/public/events/${encodeURIComponent(slug)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function purchasePublicTicket(input: {
  slug: string;
  ticket_type_id: string;
  quantity: number;
  buyer_name: string;
  buyer_phone: string;
  receipt: File;
}): Promise<Ticket> {
  const form = new FormData();
  form.append("ticket_type_id", input.ticket_type_id);
  form.append("quantity", String(input.quantity));
  form.append("buyer_name", input.buyer_name);
  form.append("buyer_phone", input.buyer_phone);
  form.append("receipt", input.receipt);

  const response = await fetch(
    `${API_BASE_URL}/public/events/${encodeURIComponent(input.slug)}/tickets`,
    { method: "POST", body: form },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
