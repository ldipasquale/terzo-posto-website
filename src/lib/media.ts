export function publicAssetSrc(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:")) return path;
  const api = String(import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
  return `${api}${path.startsWith("/") ? "" : "/"}${path}`;
}
