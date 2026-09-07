import { useEffect } from "react";

export function HomePage() {
  useEffect(() => {
    document.title = "Terzo Posto";
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy px-8">
      <img
        src="/logo.svg"
        alt="Terzo Posto"
        className="w-[min(80vw,22rem)]"
      />
    </div>
  );
}
