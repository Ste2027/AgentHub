import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Unassigned project";
}
export function date(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Date unavailable"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
