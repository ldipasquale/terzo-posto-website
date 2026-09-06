import type { Ticket, TicketType } from "@/types/eventTicket";

export const TICKET_TYPE_LABEL = "Tipo de entrada";

export function createTicketId(): string {
  return crypto.randomUUID();
}

export function remainingQuantity(type: TicketType): number {
  return Math.max(0, type.available_quantity - type.sold_quantity);
}

export function sortTicketTypes(types: TicketType[]): TicketType[] {
  return [...types].sort((a, b) => {
    const aOut = remainingQuantity(a) <= 0;
    const bOut = remainingQuantity(b) <= 0;
    if (aOut !== bOut) return aOut ? 1 : -1;
    return a.price - b.price;
  });
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
