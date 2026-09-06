import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { QRCodeCanvas } from "qrcode.react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
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
import { getPublicEvent, purchasePublicTicket } from "@/lib/api";
import { publicAssetSrc } from "@/lib/media";
import type {
  EventTicketCatalog,
  Ticket,
  TicketType,
  VenueLocation,
} from "@/types/eventTicket";
import { TRANSFER_ALIAS } from "@/types/eventTicket";
import {
  isReasonableArPhone,
  remainingQuantity,
  sortTicketTypes,
} from "@/lib/eventTickets";
import {
  FALLBACK_VENUE,
  mapsDirectionsUrl,
  mapsEmbedSrc,
  venueAddressLine,
} from "@/lib/venueMaps";
import { cn, formatArsMoney } from "@/lib/utils";

const VENUE_KIND = "Club Cultural";

type Phase = "landing" | "checkout";
type CheckoutStep = "buyer" | "pay" | "receipt" | "done";

const CHECKOUT_STEPS: { id: CheckoutStep; label: string }[] = [
  { id: "buyer", label: "Datos" },
  { id: "pay", label: "Pago" },
  { id: "receipt", label: "Comprobante" },
];

function formatEventWhen(
  date: string | null,
  start?: string | null,
  end?: string | null,
) {
  if (!date) return { day: "Fecha a confirmar", time: null as string | null };
  try {
    const parsed = parseISO(date);
    const day = format(parsed, "EEEE d 'de' MMMM", { locale: es });
    const time = start && end ? `${start}–${end}` : start || null;
    return { day, time };
  } catch {
    return { day: date, time: start && end ? `${start}–${end}` : null };
  }
}

export function PublicTicketPurchasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [catalog, setCatalog] = useState<EventTicketCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState<Phase>("landing");
  const [step, setStep] = useState<CheckoutStep>("buyer");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerErrors, setBuyerErrors] = useState<{
    name?: string;
    phone?: string;
  }>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
        const first = sortTicketTypes(data?.ticket_types ?? []).find(
          (t) => remainingQuantity(t) > 0,
        );
        if (first) {
          setSelectedTypeId(first.id);
          setQuantity(1);
        }
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

  const selectedType = catalog?.ticket_types.find((t) => t.id === selectedTypeId);
  const remaining = selectedType ? remainingQuantity(selectedType) : 0;
  const total =
    selectedType && quantity > 0 ? selectedType.price * quantity : 0;
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

  const validateBuyer = () => {
    const next: { name?: string; phone?: string } = {};
    if (!buyerName.trim()) next.name = "Ingresá tu nombre";
    if (!buyerPhone.trim()) next.phone = "Ingresá tu teléfono";
    else if (!isReasonableArPhone(buyerPhone)) {
      next.phone = "Revisá el número (ej. 11 1234-5678)";
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
    if (!slug || !catalog || !selectedType || !receiptFile || submitting) return;
    setSubmitting(true);
    try {
      const ticket = await purchasePublicTicket({
        slug,
        ticket_type_id: selectedType.id,
        quantity,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        receipt: receiptFile,
      });
      setCreatedTicket(ticket);
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
    if (step === "pay") setStep("buyer");
    else if (step === "receipt") setStep("pay");
  };

  return (
    <div className="min-h-dvh bg-navy text-cream">
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
      ) : phase === "landing" ? (
        <EventLanding
          catalog={catalog}
          venue={catalog.venue ?? FALLBACK_VENUE}
          when={when}
          selectedTypeId={selectedTypeId}
          quantity={quantity}
          remaining={remaining}
          total={total}
          fromPrice={fromPrice}
          onSelect={(type) => {
            const left = remainingQuantity(type);
            if (left <= 0) return;
            setSelectedTypeId(type.id);
            setQuantity((q) => Math.min(Math.max(1, q), left));
          }}
          onQuantityChange={setQuantity}
          onBuy={() => {
            if (!selectedTypeId || remaining <= 0) return;
            setStep("buyer");
            setPhase("checkout");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : (
        <EventCheckout
          catalog={catalog}
          venue={catalog.venue ?? FALLBACK_VENUE}
          step={step}
          selectedType={selectedType}
          quantity={quantity}
          total={total}
          buyerName={buyerName}
          buyerPhone={buyerPhone}
          buyerErrors={buyerErrors}
          receiptUrl={receiptUrl}
          receiptName={receiptName}
          receiptFile={receiptFile}
          submitting={submitting}
          createdTicket={createdTicket}
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
          onContinueBuyer={() => {
            if (validateBuyer()) setStep("pay");
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <BrandMark />
      <div className="mt-10">{children}</div>
    </div>
  );
}

function BrandMark({ name = FALLBACK_VENUE.name }: { name?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-cream/10">
        <div className="h-6 w-6 bg-[url('/logo.svg')] bg-contain bg-center bg-no-repeat" />
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-cream/60">
        {name}
      </p>
    </div>
  );
}

function EventLanding({
  catalog,
  venue,
  when,
  selectedTypeId,
  quantity,
  remaining,
  total,
  fromPrice,
  onSelect,
  onQuantityChange,
  onBuy,
}: {
  catalog: EventTicketCatalog;
  venue: VenueLocation;
  when: { day: string; time: string | null };
  selectedTypeId: string | null;
  quantity: number;
  remaining: number;
  total: number;
  fromPrice: number | null;
  onSelect: (type: TicketType) => void;
  onQuantityChange: (n: number) => void;
  onBuy: () => void;
}) {
  const flyer = publicAssetSrc(catalog.flyer_url);
  const selected = catalog.ticket_types.find((t) => t.id === selectedTypeId);

  return (
    <div className="min-h-dvh pb-28">
      <header className="mx-auto flex max-w-6xl items-center px-5 py-4 lg:px-8">
        <BrandMark name={venue.name} />
      </header>

      <div className="mx-auto grid max-w-6xl items-start gap-0 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pt-2">
        <div className="relative mx-auto w-full max-w-lg overflow-hidden bg-[#00182f] lg:sticky lg:top-6 lg:mx-0 lg:max-w-none lg:rounded-2xl lg:shadow-lg">
          <div className="aspect-[4/5] w-full">
            {flyer ? (
              <img
                src={flyer}
                alt={catalog.event_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-end bg-gradient-to-br from-navy via-[#00182f] to-[#001326] px-5 pb-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cream/50">
                  {VENUE_KIND}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pt-6 lg:flex lg:flex-col lg:px-0 lg:pt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-orange">
            {VENUE_KIND}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
            {catalog.event_name}
          </h1>

          <div className="mt-6 flex flex-col gap-2.5 text-sm text-cream/75 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <p className="flex items-center gap-2 capitalize">
              <Calendar className="h-4 w-4 shrink-0 text-orange" />
              {when.day}
            </p>
            {when.time && (
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-orange" />
                {when.time}
              </p>
            )}
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-orange" />
              {venueAddressLine(venue)}
            </p>
          </div>

          <section className="mt-8 lg:mt-10">
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cream/45">
              Entradas
            </h2>
            <div className="mt-3 space-y-2">
              {sortTicketTypes(catalog.ticket_types).map((type) => {
                const left = remainingQuantity(type);
                const soldOut = left <= 0;
                const isSelected = type.id === selectedTypeId;
                return (
                  <button
                    key={type.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => onSelect(type)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors",
                      soldOut && "cursor-not-allowed opacity-40",
                      isSelected
                        ? "border-orange bg-orange/15"
                        : "border-cream/15 bg-cream/[0.04] hover:bg-cream/[0.08]",
                    )}
                  >
                    <div>
                      <p className="font-medium">{type.name}</p>
                      {soldOut && (
                        <p className="mt-0.5 text-xs text-cream/50">Agotado</p>
                      )}
                    </div>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatArsMoney(type.price)}
                    </p>
                  </button>
                );
              })}
            </div>

            {selected && remaining > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-cream/15 bg-cream/[0.04] px-4 py-3">
                <span className="text-sm text-cream/65">Cantidad</span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 border-cream/20 bg-transparent text-cream hover:bg-cream/10"
                    disabled={quantity <= 1}
                    onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center text-lg font-semibold tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 border-cream/20 bg-transparent text-cream hover:bg-cream/10"
                    disabled={quantity >= remaining}
                    onClick={() =>
                      onQuantityChange(Math.min(remaining, quantity + 1))
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </section>

          <VenueSection venue={venue} />
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 border-t border-cream/10 bg-navy/95 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 lg:px-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-cream/45">
              {selected ? `${quantity} × ${selected.name}` : "Desde"}
            </p>
            <p className="text-xl font-semibold tabular-nums lg:text-2xl">
              {formatArsMoney(selected ? total : fromPrice ?? 0)}
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 min-w-[8.5rem] px-6 text-base lg:min-w-[10rem] lg:px-8"
            disabled={!selectedTypeId || remaining <= 0}
            onClick={onBuy}
          >
            Comprar
          </Button>
        </div>
      </footer>
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
        <div className="flex items-start justify-between gap-4 px-4 py-3">
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
  venue,
  step,
  selectedType,
  quantity,
  total,
  buyerName,
  buyerPhone,
  buyerErrors,
  receiptUrl,
  receiptName,
  receiptFile,
  submitting,
  createdTicket,
  fileInputRef,
  onBack,
  onNameChange,
  onPhoneChange,
  onContinueBuyer,
  onContinuePay,
  onPickReceipt,
  onReceiptFile,
  onSubmit,
}: {
  catalog: EventTicketCatalog;
  venue: VenueLocation;
  step: CheckoutStep;
  selectedType?: TicketType;
  quantity: number;
  total: number;
  buyerName: string;
  buyerPhone: string;
  buyerErrors: { name?: string; phone?: string };
  receiptUrl: string;
  receiptName: string;
  receiptFile: File | null;
  submitting: boolean;
  createdTicket: Ticket | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onBack: () => void;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onContinueBuyer: () => void;
  onContinuePay: () => void;
  onPickReceipt: () => void;
  onReceiptFile: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const stepIndex = CHECKOUT_STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center gap-3 px-4 py-4">
        {step !== "done" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-cream hover:bg-cream/10"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cream/45">
            {venue.name}
          </p>
          <h1 className="truncate text-base font-semibold">
            {catalog.event_name}
          </h1>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">
        {step !== "done" && (
          <ol className="mb-8 flex gap-1">
            {CHECKOUT_STEPS.map((s, i) => (
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
            errors={buyerErrors}
            onNameChange={onNameChange}
            onPhoneChange={onPhoneChange}
          />
        )}
        {step === "pay" && selectedType && (
          <PayStep
            typeName={selectedType.name}
            quantity={quantity}
            total={total}
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
        {step === "done" && createdTicket && selectedType && (
          <DoneStep
            ticket={createdTicket}
            typeName={selectedType.name}
            eventName={catalog.event_name}
          />
        )}
      </main>

      {step !== "done" && (
        <footer className="fixed inset-x-0 bottom-0 border-t border-cream/10 bg-navy/95 px-5 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              {total > 0 && (
                <p className="text-sm text-cream/55">
                  Total{" "}
                  <span className="font-semibold text-cream">
                    {formatArsMoney(total)}
                  </span>
                </p>
              )}
            </div>
            {step === "buyer" && (
              <Button size="lg" onClick={onContinueBuyer}>
                Continuar
              </Button>
            )}
            {step === "pay" && (
              <Button size="lg" onClick={onContinuePay}>
                Ya transferí
              </Button>
            )}
            {step === "receipt" && (
              <Button
                size="lg"
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
      <p className="mt-2 text-sm text-cream/55">
        Si llegaste por un link, pedile a Terzo Posto que lo vuelva a compartir.
      </p>
    </div>
  );
}

function BuyerStep({
  name,
  phone,
  errors,
  onNameChange,
  onPhoneChange,
}: {
  name: string;
  phone: string;
  errors: { name?: string; phone?: string };
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Tus datos</h2>
        <p className="mt-1 text-sm text-cream/55">
          Los usamos para contactarte si hace falta confirmar el pago.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="buyer-name">Nombre y apellido</Label>
          <Input
            id="buyer-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Como figura en el DNI"
            autoComplete="name"
            className="h-12 border-cream/15 bg-cream/[0.06] text-cream placeholder:text-cream/35"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
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
  typeName,
  quantity,
  total,
}: {
  typeName: string;
  quantity: number;
  total: number;
}) {
  const copyAlias = async () => {
    try {
      await navigator.clipboard.writeText(TRANSFER_ALIAS);
      toast.success("Alias copiado");
    } catch {
      toast.error("No se pudo copiar el alias");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Transferí el pago
        </h2>
        <p className="mt-1 text-sm text-cream/55">
          {quantity} × {typeName}
        </p>
      </div>
      <div className="rounded-2xl border border-cream/15 bg-cream/[0.04] p-6 text-center">
        <p className="text-sm text-cream/50">Monto a transferir</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {formatArsMoney(total)}
        </p>
      </div>
      <div className="rounded-2xl border border-cream/15 bg-cream/[0.04] p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cream/45">
          Alias
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xl font-semibold tracking-wide">{TRANSFER_ALIAS}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-cream/20 bg-transparent text-cream hover:bg-cream/10"
            onClick={copyAlias}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </Button>
        </div>
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
        <h2 className="text-2xl font-semibold tracking-tight">
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

function DoneStep({
  ticket,
  typeName,
  eventName,
}: {
  ticket: Ticket;
  typeName: string;
  eventName: string;
}) {
  const canvasId = "ticket-qr-canvas";

  const saveQr = async () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
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
        <h2 className="text-2xl font-semibold tracking-tight">
          ¡Listo, ya está tu entrada!
        </h2>
        <p className="mt-2 text-sm text-cream/55">
          {ticket.quantity} × {typeName} · {eventName}
        </p>
      </div>
      <div className="flex justify-center rounded-2xl bg-cream p-5">
        <QRCodeCanvas
          id={canvasId}
          value={ticket.id}
          size={220}
          includeMargin
          level="M"
        />
      </div>
      <Button type="button" size="lg" className="w-full" onClick={saveQr}>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Share2 className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Guardar QR
      </Button>
      <p className="rounded-xl bg-amber-500/15 px-3 py-2.5 text-sm text-amber-200">
        La entrada queda pendiente de confirmación de pago. Guardá el QR: lo
        vas a necesitar en la puerta.
      </p>
    </div>
  );
}
