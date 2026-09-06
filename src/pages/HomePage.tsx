export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-navy px-6 text-center text-cream">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm bg-cream/10">
        <div className="h-10 w-10 bg-[url('/logo.svg')] bg-contain bg-center bg-no-repeat" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Terzo Posto</h1>
      <p className="mt-2 max-w-sm text-sm text-cream/55">
        Las entradas se compran desde el link de cada evento.
      </p>
    </div>
  );
}
