export type TicketStatus = "pending" | "approved" | "rejected";

export interface TicketType {
  id: string;
  name: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
}

export interface TicketTransfer {
  alias: string;
  holder: string;
}

export const DEFAULT_TICKET_TRANSFER: TicketTransfer = {
  alias: "terzoposto.mp",
  holder: "Luciano Di Pasquale",
};

export interface VenueLocation {
  name: string;
  address: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface EventTicketCatalog {
  event_id: string;
  slug?: string | null;
  event_name: string;
  event_date: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  has_tickets: boolean;
  flyer_url?: string | null;
  description?: string | null;
  venue?: VenueLocation;
  transfer?: TicketTransfer;
  ticket_types: TicketType[];
}

export interface Ticket {
  id: string;
  event_id: string;
  ticket_type_id: string;
  ticket_type_name?: string;
  quantity: number;
  unit_price: number;
  buyer_name: string;
  buyer_phone: string;
  buyer_email?: string;
  receipt_url: string;
  status: TicketStatus;
  purchase_date: string;
  checked_in_at?: string | null;
}
