export type TicketStatus = "pending" | "approved" | "rejected";

export interface TicketType {
  id: string;
  name: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
}

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
  venue?: VenueLocation;
  ticket_types: TicketType[];
}

export interface Ticket {
  id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price: number;
  buyer_name: string;
  buyer_phone: string;
  receipt_url: string;
  status: TicketStatus;
  purchase_date: string;
}

export const TRANSFER_ALIAS = "terzoposto.mp";
