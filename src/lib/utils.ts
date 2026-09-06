import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatArs(value: number): string {
  return Math.round(value).toLocaleString("es-AR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export function formatArsMoney(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const rounded = Math.round(n);
  const core = formatArs(Math.abs(rounded));
  if (rounded < 0) return `-$${core}`;
  return `$${core}`;
}
