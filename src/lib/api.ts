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
  lines: Array<{ ticket_type_id: string; quantity: number }>;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  receipt?: File | null;
  menu_items?: Array<{ menu_item_id: string; quantity: number }>;
}): Promise<Ticket[]> {
  const form = new FormData();
  form.append("lines", JSON.stringify(input.lines));
  form.append("buyer_name", input.buyer_name);
  form.append("buyer_phone", input.buyer_phone);
  form.append("buyer_email", input.buyer_email);
  if (input.menu_items?.length) {
    form.append("menu_items", JSON.stringify(input.menu_items));
  }
  if (input.receipt) form.append("receipt", input.receipt);

  const response = await fetch(
    `${API_BASE_URL}/public/events/${encodeURIComponent(input.slug)}/tickets`,
    { method: "POST", body: form },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { tickets?: Ticket[] } | Ticket;
  if (Array.isArray((body as { tickets?: Ticket[] }).tickets)) {
    return (body as { tickets: Ticket[] }).tickets;
  }
  if (body && typeof body === "object" && "id" in body) return [body];
  return [];
}

export async function lookupPublicTickets(
  slug: string,
  input: { email: string; phone: string },
): Promise<Ticket[]> {
  const response = await fetch(
    `${API_BASE_URL}/public/events/${encodeURIComponent(slug)}/tickets/lookup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        phone: input.phone,
      }),
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { tickets?: Ticket[] };
  return body.tickets ?? [];
}
