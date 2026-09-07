import type { VenueLocation } from "@/types/eventTicket";

export const FALLBACK_VENUE: VenueLocation = {
  name: "Terzo Posto",
  address: "Julián Álvarez 985",
  city: "Buenos Aires",
  lat: -34.59527,
  lng: -58.42155,
};

export function venueAddressLine(venue: VenueLocation) {
  return [venue.address, venue.city].filter(Boolean).join(", ");
}

function mapsQuery(venue: VenueLocation) {
  const labeled = [venue.name, venue.address, venue.city]
    .filter(Boolean)
    .join(", ");
  if (labeled) return labeled;
  if (venue.lat != null && venue.lng != null) {
    return `${venue.lat},${venue.lng}`;
  }
  return "";
}

export function mapsEmbedSrc(venue: VenueLocation) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery(venue))}&z=16&output=embed&hl=es`;
}

export function mapsDirectionsUrl(venue: VenueLocation) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(venue))}`;
}
