import type {
  EventTicketMenuItem,
  Ticket,
  TicketType,
} from "@/types/eventTicket";

export const TICKET_TYPE_LABEL = "Tipo de entrada";

export function createTicketId(): string {
  return crypto.randomUUID();
}

export function remainingQuantity(type: TicketType): number {
  return Math.max(0, type.available_quantity - type.sold_quantity);
}

export function isFreeTicketType(type: { price: number } | null | undefined): boolean {
  return type != null && Number.isFinite(type.price) && type.price <= 0;
}

export function ticketMenuAmount(
  items: EventTicketMenuItem[] | undefined,
  quantities: Record<string, number>,
): number {
  if (!items?.length) return 0;
  return items.reduce(
    (sum, item) => sum + item.price * Math.max(0, quantities[item.id] || 0),
    0,
  );
}

export function selectedMenuItems(
  items: EventTicketMenuItem[] | undefined,
  quantities: Record<string, number>,
): Array<{ menu_item_id: string; quantity: number }> {
  if (!items?.length) return [];
  return items
    .map((item) => ({
      menu_item_id: item.id,
      quantity: Math.max(0, Math.floor(quantities[item.id] || 0)),
    }))
    .filter((item) => item.quantity > 0);
}

export function sortTicketTypes(types: TicketType[]): TicketType[] {
  return [...types].sort((a, b) => {
    const aOut = remainingQuantity(a) <= 0;
    const bOut = remainingQuantity(b) <= 0;
    if (aOut !== bOut) return aOut ? 1 : -1;
    return a.price - b.price;
  });
}

export function isTicketTypeSelectable(
  type: TicketType,
  types: TicketType[],
): boolean {
  if (remainingQuantity(type) <= 0) return false;
  const available = types.filter((t) => remainingQuantity(t) > 0);
  if (available.length <= 1) return true;
  const minPrice = Math.min(...available.map((t) => t.price));
  return type.price === minPrice;
}

export function todayYmdBuenosAires(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isPublicEventPast(date?: string | null): boolean {
  if (!date) return false;
  return String(date).slice(0, 10) < todayYmdBuenosAires();
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isReasonableArPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function soldQuantityFromTickets(
  tickets: Ticket[],
  ticket_type_id: string,
): number {
  return tickets
    .filter(
      (t) => t.ticket_type_id === ticket_type_id && t.status !== "rejected",
    )
    .reduce((sum, t) => sum + t.quantity, 0);
}
