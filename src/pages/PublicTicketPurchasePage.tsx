import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Download,
  ImagePlus,
  ExternalLink,
  MapPin,
  Minus,
  Plus,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPublicEvent,
  lookupPublicTickets,
  purchasePublicTicket,
} from "@/lib/api";
import { publicAssetSrc } from "@/lib/media";
import type {
  EventTicketCatalog,
  EventTicketMenuItem,
  Ticket,
  TicketType,
  VenueLocation,
} from "@/types/eventTicket";
import { DEFAULT_TICKET_TRANSFER } from "@/types/eventTicket";
import {
  isReasonableArPhone,
  isPublicEventPast,
  isTicketTypeSelectable,
  isValidEmail,
  remainingQuantity,
  selectedMenuItems,
  sortTicketTypes,
  ticketMenuAmount,
} from "@/lib/eventTickets";
import {
  FALLBACK_VENUE,
  mapsDirectionsUrl,
  mapsEmbedSrc,
  venueAddressLine,
} from "@/lib/venueMaps";
import { cn, formatTicketPrice } from "@/lib/utils";

type Phase = "landing" | "checkout" | "recover";
type CheckoutStep = "buyer" | "menu" | "pay" | "receipt" | "done";

const MAX_MENU_QTY = 20;

type CartLine = { type: TicketType; quantity: number };

function cartLinesFrom(
  types: TicketType[],
  quantities: Record<string, number>,
): CartLine[] {
  return sortTicketTypes(types)
    .map((type) => ({
      type,
      quantity: Math.min(
        remainingQuantity(type),
        Math.max(0, Math.floor(quantities[type.id] || 0)),
      ),
    }))
    .filter((line) => line.quantity > 0);
}

function cartSummary(lines: CartLine[], withMenu = false): string {
  if (!lines.length) return "Desde";
  const text = lines
    .map((line) => `${line.quantity} × ${line.type.name}`)
    .join(" + ");
  return withMenu ? `${text} + menú` : text;
}

function checkoutSteps(hasMenu: boolean, needsPayment: boolean) {
  const steps: { id: CheckoutStep; label: string }[] = [
    { id: "buyer", label: "Datos" },
  ];
  if (hasMenu) steps.push({ id: "menu", label: "Menú" });
  if (needsPayment || hasMenu) {
    steps.push({ id: "pay", label: "Pago" });
    steps.push({ id: "receipt", label: "Comprobante" });
  }
  return steps;
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatClock(raw?: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (twelveHour) {
    return `${Number(twelveHour[1])}:${twelveHour[2]}${twelveHour[3].toLowerCase()}`;
  }
  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!twentyFour) return trimmed;
  const hour24 = Number(twentyFour[1]);
  const minutes = twentyFour[2];
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minutes}${suffix}`;
}

function formatEventWhen(
  date: string | null,
  start?: string | null,
  end?: string | null,
) {
  const startClock = formatClock(start);
  const endClock = formatClock(end);
  const time =
    startClock && endClock ? `${startClock} - ${endClock}` : startClock || null;
  if (!date) {
    return { day: "Fecha a confirmar", time, dayNum: null, month: null };
  }
  try {
    const parsed = parseISO(date);
    return {
      day: capitalizeFirst(format(parsed, "EEEE d 'de' MMMM", { locale: es })),
      time,
      dayNum: format(parsed, "d"),
      month: format(parsed, "MMM", { locale: es }).replace(".", ""),
    };
  } catch {
    return { day: date, time, dayNum: null, month: null };
  }
}

export function PublicTicketPurchasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [catalog, setCatalog] = useState<EventTicketCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState<Phase>("landing");
  const [step, setStep] = useState<CheckoutStep>("buyer");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerErrors, setBuyerErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [createdTickets, setCreatedTickets] = useState<Ticket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [menuQty, setMenuQty] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setCatalog(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    getPublicEvent(slug)
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        const next: Record<string, number> = {};
        const available = sortTicketTypes(data?.ticket_types ?? []).filter(
          (type) => remainingQuantity(type) > 0,
        );
        for (const type of data?.ticket_types ?? []) next[type.id] = 0;
        if (available[0]) next[available[0].id] = 1;
        setQuantities(next);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const name = catalog?.event_name?.trim();
    document.title = name ? `${name} · Terzo Posto` : "Terzo Posto";
    return () => {
      document.title = "Terzo Posto";
    };
  }, [catalog?.event_name]);

  const cartLines = useMemo(
    () => cartLinesFrom(catalog?.ticket_types ?? [], quantities),
    [catalog, quantities],
  );
  const ticketCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const menuItems = catalog?.menu_items ?? [];
  const hasMenu = menuItems.length > 0;
  const extrasTotal = ticketMenuAmount(menuItems, menuQty);
  const ticketTotal = cartLines.reduce(
    (sum, line) => sum + line.type.price * line.quantity,
    0,
  );
  const fullyFree = ticketCount > 0 && ticketTotal <= 0 && !hasMenu;
  const total = ticketTotal;
  const checkoutTotal = ticketTotal + extrasTotal;
  const needsPayment = checkoutTotal > 0;
  const fromPrice = useMemo(() => {
    const prices = (catalog?.ticket_types ?? [])
      .filter((t) => remainingQuantity(t) > 0)
      .map((t) => t.price);
    return prices.length ? Math.min(...prices) : null;
  }, [catalog]);

  const when = formatEventWhen(
    catalog?.event_date ?? null,
    catalog?.event_start_time,
    catalog?.event_end_time,
  );
  const salesClosed = isPublicEventPast(catalog?.event_date);

  const validateBuyer = () => {
    const next: { name?: string; phone?: string; email?: string } = {};
    if (!buyerName.trim()) next.name = "Ingresá tu nombre";
    if (!buyerPhone.trim()) next.phone = "Ingresá tu teléfono";
    else if (!isReasonableArPhone(buyerPhone)) {
      next.phone = "Revisá el número (ej. 11 1234-5678)";
    }
    if (!buyerEmail.trim()) next.email = "Ingresá tu email";
    else if (!isValidEmail(buyerEmail)) {
      next.email = "Revisá el email";
    }
    setBuyerErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleReceiptChange = (file: File | null) => {
    if (receiptUrl.startsWith("blob:")) URL.revokeObjectURL(receiptUrl);
    if (!file) {
      setReceiptFile(null);
      setReceiptUrl("");
      setReceiptName("");
      return;
    }
    setReceiptFile(file);
    setReceiptUrl(URL.createObjectURL(file));
    setReceiptName(file.name);
  };

  const handleSubmit = async () => {
    if (!slug || !catalog || !cartLines.length || submitting) return;
    if (needsPayment && !receiptFile) return;
    setSubmitting(true);
    try {
      const tickets = await purchasePublicTicket({
        slug,
        lines: cartLines.map((line) => ({
          ticket_type_id: line.type.id,
          quantity: line.quantity,
        })),
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_email: buyerEmail.trim().toLowerCase(),
        receipt: needsPayment ? receiptFile : null,
        menu_items: selectedMenuItems(menuItems, menuQty),
      });
      setCreatedTickets(tickets);
      setStep("done");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo completar la compra",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === "buyer") {
      setPhase("landing");
      return;
    }
    if (step === "menu") setStep("buyer");
    else if (step === "pay") setStep(hasMenu ? "menu" : "buyer");
    else if (step === "receipt") setStep("pay");
  };

  return (
    <div className="relative min-h-dvh ticket-mesh text-cream">
      <Atmosphere />
      {loading ? (
        <p className="px-6 pt-24 text-center text-sm text-cream/55">
          Cargando evento…
        </p>
      ) : loadError ? (
        <Shell>
          <UnavailableState error />
        </Shell>
      ) : !catalog || !catalog.has_tickets ? (
        <Shell>
          <UnavailableState missing={!catalog} />
        </Shell>
      ) : phase === "recover" ? (
        <RecoverTicket
          slug={slug!}
          eventName={catalog.event_name}
          onBack={() => setPhase("landing")}
        />
      ) : phase === "landing" || salesClosed ? (
        <EventLanding
          catalog={catalog}
          venue={catalog.venue ?? FALLBACK_VENUE}
          when={when}
          salesClosed={salesClosed}
          quantities={quantities}
          lines={cartLines}
          total={total}
          fromPrice={fromPrice}
          isFree={fullyFree}
          hasMenu={hasMenu}
          onQuantityChange={(typeId, next) => {
            setQuantities((prev) => ({ ...prev, [typeId]: next }));
          }}
          onBuy={() => {
            if (salesClosed || ticketCount <= 0) return;
            setStep("buyer");
            setPhase("checkout");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onRecover={() => {
            setPhase("recover");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : (
        <EventCheckout
          catalog={catalog}
          venue={catalog.venue ?? FALLBACK_VENUE}
          step={step}
          lines={cartLines}
          total={checkoutTotal}
          extrasTotal={extrasTotal}
          hasMenu={hasMenu}
          menuItems={menuItems}
          menuQty={menuQty}
          needsPayment={needsPayment}
          buyerName={buyerName}
          buyerPhone={buyerPhone}
          buyerEmail={buyerEmail}
          buyerErrors={buyerErrors}
          receiptUrl={receiptUrl}
          receiptName={receiptName}
          receiptFile={receiptFile}
          submitting={submitting}
          createdTickets={createdTickets}
          fileInputRef={fileInputRef}
          onBack={goBack}
          onNameChange={(v) => {
            setBuyerName(v);
            setBuyerErrors((e) => ({ ...e, name: undefined }));
          }}
          onPhoneChange={(v) => {
            setBuyerPhone(v);
            setBuyerErrors((e) => ({ ...e, phone: undefined }));
          }}
          onEmailChange={(v) => {
            setBuyerEmail(v);
            setBuyerErrors((e) => ({ ...e, email: undefined }));
          }}
          onMenuQtyChange={(id, next) => {
            setMenuQty((prev) => ({ ...prev, [id]: next }));
          }}
          onContinueBuyer={() => {
            if (!validateBuyer()) return;
            if (hasMenu) {
              setStep("menu");
              return;
            }
            if (!needsPayment) void handleSubmit();
            else setStep("pay");
          }}
          onContinueMenu={() => {
            if (needsPayment) setStep("pay");
            else void handleSubmit();
          }}
          onContinuePay={() => setStep("receipt")}
          onPickReceipt={() => fileInputRef.current?.click()}
          onReceiptFile={handleReceiptChange}
          onSubmit={() => void handleSubmit()}
        />
      )}
    </div>
  );
}

function Atmosphere() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <div className="orb left-[-8rem] top-[-6rem] h-72 w-72 bg-[#003d7a]/70" />
      <div
        className="orb right-[-6rem] top-24 h-64 w-64 bg-[#001326]/80"
        style={{ animationDelay: "-4s" }}
      />
      <div
        className="orb bottom-[-4rem] left-1/3 h-80 w-80 bg-[#000814]/90"
        style={{ animationDelay: "-8s" }}
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <BrandMark />
      <div className="mt-10">{children}</div>
    </div>
  );
}

function BrandMark() {
  return (
    <img
      src="/logo.svg"
      alt="Terzo Posto"
      className="h-9 w-auto shrink-0 sm:h-10"
    />
  );
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-cream">
          {bold[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderEventDescription(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const heading = line.match(/^#\s+(.*)$/);
    return (
      <Fragment key={i}>
        {heading ? (
          <strong className="font-semibold text-cream">
            {renderInline(heading[1])}
          </strong>
        ) : (
          renderInline(line)
        )}
        {i < lines.length - 1 ? "\n" : null}
      </Fragment>
    );
  });
}

function EventDetail({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-lg whitespace-pre-wrap text-sm leading-relaxed text-cream/70 lg:mx-0 lg:max-w-none">
      {renderEventDescription(text)}
    </div>
  );
}

function EventLanding({
  catalog,
  venue,
  when,
  quantities,
  lines,
  total,
  fromPrice,
  isFree,
  hasMenu = false,
  onQuantityChange,
  onBuy,
  onRecover,
  salesClosed,
}: {
  catalog: EventTicketCatalog;
  venue: VenueLocation;
  when: {
    day: string;
    time: string | null;
    dayNum: string | null;
    month: string | null;
  };
  salesClosed: boolean;
  quantities: Record<string, number>;
  lines: CartLine[];
  total: number;
  fromPrice: number | null;
  isFree: boolean;
  hasMenu?: boolean;
  onQuantityChange: (typeId: string, quantity: number) => void;
  onBuy: () => void;
  onRecover: () => void;
}) {
  const flyer = publicAssetSrc(catalog.flyer_url);
  const detail = catalog.description?.trim() ?? "";
  const hasDetail = Boolean(detail);

  return (
    <div className={salesClosed ? "pb-10" : "pb-28"}>
      <div className="mx-auto grid max-w-5xl gap-5 px-4 pt-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:px-6 lg:pt-5">
        <div className="contents lg:col-start-1 lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 flex justify-center">
            <BrandMark />
          </div>

          <div className="order-3">
            <div
              className={cn(
                "relative mx-auto overflow-hidden rounded-[1.35rem] border border-cream/15 lg:mt-2",
                hasDetail ? "w-4/5" : "w-4/5 lg:w-full",
              )}
            >
              <div className="aspect-[4/5] w-full overflow-hidden rounded-[1.2rem]">
                {flyer ? (
                  <img
                    src={flyer}
                    alt={catalog.event_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full bg-navy" />
                )}
              </div>
            </div>
            {hasDetail ? (
              <div className="mt-4 hidden lg:block">
                <EventDetail text={detail} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="contents lg:col-start-2 lg:flex lg:flex-col lg:gap-5">
          <h1 className="order-2 text-center font-display text-4xl font-semibold uppercase leading-[1.2] tracking-[0.04em] text-orange sm:text-[2.5rem] lg:text-left lg:text-[2.85rem] lg:leading-[1.18]">
            {catalog.event_name}
          </h1>

          <div className="order-4 min-w-0">
            <div className="space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="ticket-orange flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-cream">
                  {when.dayNum && when.month ? (
                    <>
                      <span className="text-[9px] font-semibold uppercase leading-none tracking-wider">
                        {when.month}
                      </span>
                      <span className="mt-0.5 text-lg font-semibold leading-none">
                        {when.dayNum}
                      </span>
                    </>
                  ) : (
                    <Calendar className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{when.day}</p>
                  {when.time && (
                    <p className="mt-0.5 text-sm text-cream/55">{when.time}</p>
                  )}
                </div>
              </div>

              <a
                href={mapsDirectionsUrl(venue)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl transition-colors hover:bg-cream/[0.04]"
              >
                <div className="ticket-orange flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-cream">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 font-medium leading-tight">
                    {venue.name}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-cream/45" />
                  </p>
                  <p className="mt-0.5 text-sm text-cream/55">
                    {venueAddressLine(venue)}
                  </p>
                </div>
              </a>
            </div>

            {hasDetail ? (
              <div className="mt-5 lg:hidden">
                <EventDetail text={detail} />
              </div>
            ) : null}

            <section className="mt-7">
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cream/45">
                Entradas
              </h2>
              {salesClosed ? (
                <p className="mt-3 rounded-2xl border border-cream/15 bg-cream/[0.04] px-4 py-3 text-sm text-cream/70">
                  Este evento ya sucedió. La venta de entradas se encuentra
                  cerrada.
                </p>
              ) : null}
              {!salesClosed && (
                <div className="mt-3 space-y-2">
                  {sortTicketTypes(catalog.ticket_types).map((type) => {
                    const left = remainingQuantity(type);
                    const soldOut = left <= 0;
                    const selectable = isTicketTypeSelectable(type);
                    const quantity = Math.min(
                      left,
                      Math.max(0, Math.floor(quantities[type.id] || 0)),
                    );
                    const isSelected = quantity > 0;
                    return (
                      <div
                        key={type.id}
                        className={cn(
                          "flex w-full items-center justify-between gap-2.5 rounded-2xl px-3.5 py-3",
                          "border",
                          soldOut && "opacity-40",
                          isSelected
                            ? "ticket-orange border-transparent text-navy"
                            : "border-cream/15 bg-cream/[0.04]",
                        )}
                      >
                        <div className="min-w-0 flex-1 text-left">
                          <p
                            className={isSelected ? "font-bold" : "font-medium"}
                          >
                            {type.name}
                          </p>
                          {soldOut && (
                            <p className="mt-0.5 text-xs text-cream/50">
                              Agotado
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {selectable && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8",
                                  isSelected
                                    ? "bg-navy text-cream hover:bg-navy/90 hover:text-cream"
                                    : "bg-cream/10 text-cream hover:bg-cream/20 hover:text-cream",
                                )}
                                disabled={quantity <= 0}
                                onClick={() =>
                                  onQuantityChange(
                                    type.id,
                                    Math.max(0, quantity - 1),
                                  )
                                }
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-5 text-center text-base font-bold tabular-nums">
                                {quantity}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8",
                                  isSelected
                                    ? "bg-navy text-cream hover:bg-navy/90 hover:text-cream"
                                    : "bg-cream/10 text-cream hover:bg-cream/20 hover:text-cream",
                                )}
                                disabled={quantity >= left}
                                onClick={() =>
                                  onQuantityChange(
                                    type.id,
                                    Math.min(left, quantity + 1),
                                  )
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          <p
                            className={cn(
                              "relative shrink-0 text-right text-lg tabular-nums",
                              isSelected ? "font-bold" : "font-semibold",
                            )}
                          >
                            <span className="invisible font-bold" aria-hidden>
                              $20.000
                            </span>
                            <span className="absolute inset-y-0 right-0 flex items-center">
                              {formatTicketPrice(type.price)}
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <button
              type="button"
              onClick={onRecover}
              className={cn(
                "mt-5 text-sm text-cream/50 underline decoration-cream/25 underline-offset-4 transition-colors hover:text-cream",
                !salesClosed && "lg:hidden",
              )}
            >
              ¿Ya compraste? Recuperá tu QR
            </button>

            <VenueSection venue={venue} />
          </div>
        </div>
      </div>

      {!salesClosed && (
        <footer className="ticket-footer fixed bottom-0 left-0 right-0 z-[100] w-full px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-5xl items-center gap-4 lg:px-3">
            <button
              type="button"
              onClick={onRecover}
              className="hidden min-w-0 text-left text-sm text-cream/50 underline decoration-cream/25 underline-offset-4 transition-colors hover:text-cream lg:inline"
            >
              ¿Ya compraste? Recuperá tu QR
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:flex-none lg:justify-end lg:gap-5 lg:ml-auto">
              <div className="min-w-0 text-left lg:text-right">
                <p className="truncate text-[11px] uppercase tracking-wide text-cream/55">
                  {cartSummary(lines)}
                </p>
                <p className="text-xl font-semibold tabular-nums text-cream lg:text-2xl">
                  {formatTicketPrice(lines.length ? total : (fromPrice ?? 0))}
                </p>
                {hasMenu ? (
                  <p className="text-[11px] text-cream/45">
                    Podés sumar comida con reserva previa
                  </p>
                ) : null}
              </div>
              <Button
                size="lg"
                className="ticket-orange tracking-wide h-12 shrink-0 px-6 text-base font-bold text-navy hover:opacity-90 lg:px-8"
                disabled={lines.length === 0}
                onClick={onBuy}
              >
                {isFree ? "Reservar entradas" : "Comprar entradas"}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function VenueSection({ venue }: { venue: VenueLocation }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cream/45">
        Ubicación
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-cream/15 bg-cream/[0.04]">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">{venue.name}</p>
            <p className="mt-0.5 text-sm text-cream/55">
              {venueAddressLine(venue)}
            </p>
          </div>
          <a
            href={mapsDirectionsUrl(venue)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-orange hover:text-orange/80"
          >
            Cómo llegar
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <iframe
          title={`Mapa de ${venue.name}`}
          src={mapsEmbedSrc(venue)}
          className="h-40 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </section>
  );
}

function EventCheckout({
  catalog,
  step,
  lines,
  total,
  extrasTotal,
  hasMenu,
  menuItems,
  menuQty,
  needsPayment,
  buyerName,
  buyerPhone,
  buyerEmail,
  buyerErrors,
  receiptUrl,
  receiptName,
  receiptFile,
  submitting,
  createdTickets,
  fileInputRef,
  onBack,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onMenuQtyChange,
  onContinueBuyer,
  onContinueMenu,
  onContinuePay,
  onPickReceipt,
  onReceiptFile,
  onSubmit,
}: {
  catalog: EventTicketCatalog;
  venue: VenueLocation;
  step: CheckoutStep;
  lines: CartLine[];
  total: number;
  extrasTotal: number;
  hasMenu: boolean;
  menuItems: EventTicketMenuItem[];
  menuQty: Record<string, number>;
  needsPayment: boolean;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerErrors: { name?: string; phone?: string; email?: string };
  receiptUrl: string;
  receiptName: string;
  receiptFile: File | null;
  submitting: boolean;
  createdTickets: Ticket[];
  fileInputRef: RefObject<HTMLInputElement>;
  onBack: () => void;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onMenuQtyChange: (id: string, quantity: number) => void;
  onContinueBuyer: () => void;
  onContinueMenu: () => void;
  onContinuePay: () => void;
  onPickReceipt: () => void;
  onReceiptFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const steps = checkoutSteps(hasMenu, needsPayment);
  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === step),
  );
  const confirmNow = !hasMenu && !needsPayment;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header
        className={cn(
          "flex items-center gap-3 px-4 py-4",
          step === "done" && "justify-center text-center",
        )}
      >
        {step !== "done" && (
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-cream hover:bg-white/10 hover:text-cream"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className={cn("min-w-0", step === "done" && "max-w-full")}>
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-cream">
            Club Cultural Terzo Posto
          </p>
          <h1
            className={cn(
              "font-display text-2xl font-semibold uppercase leading-[1.2] tracking-[0.04em] text-cream sm:text-xl",
              step === "done" ? "text-balance" : "truncate",
            )}
          >
            {catalog.event_name}
          </h1>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">
        {step !== "done" && (
          <ol className="mb-8 flex gap-1">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= stepIndex ? "bg-orange" : "bg-cream/15",
                )}
              />
            ))}
          </ol>
        )}

        {step === "buyer" && (
          <BuyerStep
            name={buyerName}
            phone={buyerPhone}
            email={buyerEmail}
            errors={buyerErrors}
            isFree={!needsPayment && !hasMenu}
            onNameChange={onNameChange}
            onPhoneChange={onPhoneChange}
            onEmailChange={onEmailChange}
          />
        )}
        {step === "menu" && (
          <MenuStep
            items={menuItems}
            quantities={menuQty}
            onQuantityChange={onMenuQtyChange}
          />
        )}
        {step === "pay" && lines.length > 0 && (
          <PayStep
            lines={lines}
            total={total}
            extrasTotal={extrasTotal}
            transfer={catalog.transfer ?? DEFAULT_TICKET_TRANSFER}
          />
        )}
        {step === "receipt" && (
          <ReceiptStep
            fileInputRef={fileInputRef}
            receiptUrl={receiptUrl}
            receiptName={receiptName}
            onPick={onPickReceipt}
            onFile={onReceiptFile}
            onClear={() => onReceiptFile(null)}
          />
        )}
        {step === "done" && createdTickets.length > 0 && (
          <div className="space-y-10">
            {createdTickets.map((ticket, index) => (
              <DoneStep
                key={ticket.id}
                ticket={ticket}
                typeName={
                  ticket.ticket_type_name ||
                  lines.find((line) => line.type.id === ticket.ticket_type_id)
                    ?.type.name ||
                  "entrada"
                }
                eventName={catalog.event_name}
                heading={
                  createdTickets.length === 1
                    ? undefined
                    : index === 0
                      ? "¡Listo, ya están tus entradas!"
                      : "Esta es tu entrada"
                }
              />
            ))}
          </div>
        )}
      </main>

      {step !== "done" && (
        <footer className="ticket-footer fixed bottom-0 left-0 right-0 z-[100] w-full px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3 lg:justify-end lg:gap-5">
            <div className="min-w-0 text-left lg:text-right">
              <p className="truncate text-[11px] uppercase tracking-wide text-cream/55">
                {cartSummary(lines, extrasTotal > 0)}
              </p>
              <p className="text-xl font-semibold tabular-nums text-cream lg:text-2xl">
                {formatTicketPrice(total)}
              </p>
            </div>
            {step === "buyer" && (
              <Button
                size="lg"
                className="ticket-orange tracking-wideh-12 shrink-0 px-6 text-base font-bold text-navy hover:opacity-90"
                disabled={confirmNow && submitting}
                onClick={onContinueBuyer}
              >
                {confirmNow
                  ? submitting
                    ? "Generando…"
                    : "Confirmar"
                  : "Continuar"}
              </Button>
            )}
            {step === "menu" && (
              <Button
                size="lg"
                className="ticket-orange tracking-wideh-12 shrink-0 px-6 text-base font-bold text-navy hover:opacity-90"
                disabled={!needsPayment && submitting}
                onClick={onContinueMenu}
              >
                {needsPayment
                  ? "Continuar"
                  : submitting
                    ? "Generando…"
                    : "Confirmar"}
              </Button>
            )}
            {step === "pay" && (
              <Button
                size="lg"
                className="ticket-orange tracking-wideh-12 shrink-0 px-6 text-base font-bold text-navy hover:opacity-90"
                onClick={onContinuePay}
              >
                Ya transferí
              </Button>
            )}
            {step === "receipt" && (
              <Button
                size="lg"
                className="ticket-orange tracking-wide h-12 shrink-0 px-6 text-base font-bold text-navy hover:opacity-90"
                disabled={!receiptFile || submitting}
                onClick={onSubmit}
              >
                {submitting ? "Enviando…" : "Enviar comprobante"}
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function UnavailableState({
  missing,
  error,
}: {
  missing?: boolean;
  error?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-cream/15 bg-cream/[0.04] p-6 text-center">
      <p className="font-medium">
        {error
          ? "No pudimos cargar este evento"
          : missing
            ? "No encontramos este evento"
            : "Este evento no tiene entradas a la venta"}
      </p>
    </div>
  );
}

function MenuStep({
  items,
  quantities,
  onQuantityChange,
}: {
  items: EventTicketMenuItem[];
  quantities: Record<string, number>;
  onQuantityChange: (id: string, quantity: number) => void;
}) {
  const grouped = useMemo(() => {
    const comida = items.filter((item) => item.type === "comida");
    const bebida = items.filter((item) => item.type === "bebida");
    return [
      { key: "comida", label: "Comida", list: comida },
      { key: "bebida", label: "Bebida", list: bebida },
    ].filter((group) => group.list.length > 0);
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          ¿Sumás algo del menú?
        </h2>
        <p className="mt-1 text-sm text-cream/55">
          La comida es con reserva previa: pedila ahora y te la preparamos para
          el evento. Se suma al monto a transferir.
        </p>
      </div>
      {grouped.map((group) => (
        <section key={group.key} className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cream/45">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.list.map((item) => {
              const qty = quantities[item.id] || 0;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3 py-3",
                    qty > 0
                      ? "border-orange/50 bg-orange/10"
                      : "border-cream/15 bg-cream/[0.04]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-cream">
                      {item.name}
                    </p>
                    {item.description ? (
                      <p className="mt-0.5 truncate text-xs text-cream/50">
                        {item.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-semibold tabular-nums text-cream">
                      {formatTicketPrice(item.price)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-navy text-cream hover:bg-navy/90 hover:text-cream"
                      disabled={qty <= 0}
                      onClick={() =>
                        onQuantityChange(item.id, Math.max(0, qty - 1))
                      }
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-5 text-center text-base font-bold tabular-nums">
                      {qty}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-navy text-cream hover:bg-navy/90 hover:text-cream"
                      disabled={qty >= MAX_MENU_QTY}
                      onClick={() =>
                        onQuantityChange(
                          item.id,
                          Math.min(MAX_MENU_QTY, qty + 1),
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function BuyerStep({
  name,
  phone,
  email,
  errors,
  isFree,
  onNameChange,
  onPhoneChange,
  onEmailChange,
}: {
  name: string;
  phone: string;
  email: string;
  errors: { name?: string; phone?: string; email?: string };
  isFree?: boolean;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Tus datos
        </h2>
        <p className="mt-1 text-sm text-cream/55">
          {isFree
            ? "Con estos datos te generamos el QR al instante y te lo mandamos por mail."
            : "Te mandamos el QR por mail y te contactamos si hace falta confirmar el pago."}
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="buyer-name">Nombre y apellido</Label>
          <Input
            id="buyer-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoComplete="name"
            className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="buyer-email">Email</Label>
          <Input
            id="buyer-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="tumail@email.com"
            autoComplete="email"
            className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="buyer-phone">Teléfono</Label>
          <Input
            id="buyer-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="11 1234-5678"
            autoComplete="tel"
            className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PayStep({
  lines,
  total,
  extrasTotal,
  transfer,
}: {
  lines: CartLine[];
  total: number;
  extrasTotal: number;
  transfer: { alias: string; holder: string };
}) {
  const [copied, setCopied] = useState(false);
  const alias = transfer.alias.trim() || DEFAULT_TICKET_TRANSFER.alias;
  const holder = transfer.holder.trim() || DEFAULT_TICKET_TRANSFER.holder;

  const copyAlias = async () => {
    try {
      await navigator.clipboard.writeText(alias);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el alias");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Transferí el pago
        </h2>
        <p className="mt-1 text-sm text-cream/55">
          {cartSummary(lines, extrasTotal > 0)}
        </p>
      </div>
      <div className="rounded-2xl border border-cream/15 bg-cream/[0.04] p-6 text-center">
        <p className="text-sm text-cream/50">Monto a transferir</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {formatTicketPrice(total)}
        </p>
      </div>
      <div className="rounded-2xl border border-cream/15 bg-cream/[0.04] p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cream/45">
          Alias
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xl font-semibold tracking-wide">{alias}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-cream/20 bg-transparent text-cream hover:bg-cream/10"
            onClick={copyAlias}
          >
            {copied ? null : <Copy className="h-3.5 w-3.5" />}
            {copied ? "¡Copiado!" : "Copiar"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-cream/70">
          A nombre de{" "}
          <span className="font-semibold tracking-wide text-cream">
            {holder}
          </span>
        </p>
        <p className="mt-3 text-sm text-cream/50">
          Transferí desde tu banco o Mercado Pago. En el siguiente paso subí el
          comprobante.
        </p>
      </div>
    </div>
  );
}

function ReceiptStep({
  fileInputRef,
  receiptUrl,
  receiptName,
  onPick,
  onFile,
  onClear,
}: {
  fileInputRef: RefObject<HTMLInputElement>;
  receiptUrl: string;
  receiptName: string;
  onPick: () => void;
  onFile: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Subí el comprobante
        </h2>
        <p className="mt-1 text-sm text-cream/55">
          Foto o captura de la transferencia.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {receiptUrl ? (
        <div className="space-y-3">
          <img
            src={receiptUrl}
            alt="Comprobante"
            className="max-h-72 w-full rounded-2xl border border-cream/15 object-contain bg-cream/5"
          />
          <p className="truncate text-xs text-cream/45">{receiptName}</p>
          <Button
            type="button"
            variant="outline"
            className="border-cream/20 bg-transparent text-cream hover:bg-cream/10"
            onClick={onClear}
          >
            Elegir otra imagen
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/10 px-4 py-12 text-primary"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm font-medium">Elegir imagen</span>
        </button>
      )}
    </div>
  );
}

function RecoverTicket({
  slug,
  eventName,
  onBack,
}: {
  slug: string;
  eventName: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  const [searching, setSearching] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);

  const handleSearch = async () => {
    const next: { email?: string; phone?: string } = {};
    if (!email.trim()) next.email = "Ingresá tu email";
    else if (!isValidEmail(email)) next.email = "Revisá el email";
    if (!phone.trim()) next.phone = "Ingresá tu teléfono";
    else if (!isReasonableArPhone(phone)) {
      next.phone = "Revisá el número (ej. 11 1234-5678)";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || searching) return;
    setSearching(true);
    try {
      const found = await lookupPublicTickets(slug, {
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      setTickets(found);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo buscar la entrada";
      if (message.includes("No encontramos")) {
        setTickets([]);
        return;
      }
      toast.error(message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center gap-3 px-4 py-4">
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-cream hover:bg-white/10 hover:text-cream"
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-cream">
            Club Cultural Terzo Posto
          </p>
          <h1 className="truncate font-display text-2xl font-semibold uppercase leading-[1.2] tracking-[0.04em] text-cream sm:text-xl">
            {eventName}
          </h1>
        </div>
      </header>

      <main className="flex-1 space-y-8 px-5 pb-10 pt-2">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Recuperá tu entrada
          </h2>
          <p className="mt-1 text-sm text-cream/55">
            Ingresá el mail y el teléfono con los que compraste.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="recover-email">Email</Label>
            <Input
              id="recover-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setTickets(null);
                setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="tumail@email.com"
              autoComplete="email"
              className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recover-phone">Teléfono</Label>
            <Input
              id="recover-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setTickets(null);
                setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              placeholder="11 1234-5678"
              autoComplete="tel"
              className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full text-lg font-bold tracking-wide"
            disabled={searching}
          >
            {searching ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {tickets && tickets.length === 0 && (
          <p className="rounded-xl bg-cream/[0.06] px-4 py-3 text-sm text-cream/70">
            No encontramos una entrada con esos datos.
          </p>
        )}

        {tickets && tickets.length > 0 && (
          <div className="space-y-10">
            {tickets.map((ticket) => (
              <DoneStep
                key={ticket.id}
                ticket={ticket}
                typeName={ticket.ticket_type_name || "entrada"}
                eventName={eventName}
                heading="Esta es tu entrada"
                note="Presentá este QR para entrar."
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DoneStep({
  ticket,
  typeName,
  eventName,
  heading = "¡Listo, ya está tu entrada!",
  note = (
    <>
      Guardá el QR para ingresar al evento.
      <br />
      <br />
      También te lo enviamos por mail.
    </>
  ),
}: {
  ticket: Ticket;
  typeName: string;
  eventName: string;
  heading?: string;
  note?: ReactNode;
}) {
  const canvasId = `ticket-qr-canvas-${ticket.id}`;

  const saveQr = async () => {
    const canvas = document.getElementById(
      canvasId,
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], `entrada-${ticket.id}.png`, {
      type: "image/png",
    });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Entrada — ${eventName}`,
        });
        return;
      }
    } catch {
      // fall through
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("QR guardado");
  };

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="h-6 w-6" />
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {heading}
        </h2>
        <p className="mt-2 text-sm text-cream/55">
          {ticket.quantity} × {typeName} · {eventName}
        </p>
      </div>
      <div className="mx-auto w-full sm:w-72">
        <div className="rounded-2xl bg-orange p-5">
          <div className="overflow-hidden rounded-2xl bg-cream">
            <QRCodeSVG
              value={ticket.id}
              size={320}
              includeMargin
              bgColor="#F1ECD9"
              fgColor="#00234A"
              level="M"
              className="block h-auto w-full"
            />
            <QRCodeCanvas
              id={canvasId}
              value={ticket.id}
              size={320}
              includeMargin
              bgColor="#F1ECD9"
              fgColor="#00234A"
              level="M"
              className="hidden"
            />
          </div>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        className="w-full text-lg font-bold tracking-wide"
        onClick={saveQr}
      >
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Share2 className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Guardar QR
      </Button>
      <p className="rounded-xl bg-amber-500/15 px-3 py-2.5 text-sm tracking-wide text-amber-200">
        {note}
      </p>
    </div>
  );
}
