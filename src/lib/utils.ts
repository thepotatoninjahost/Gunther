import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function now(): number {
  return Date.now();
}

export function shortId(id: string, n = 8): string {
  return id.replace(/^.*-/, "").slice(0, n);
}

export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [${text.length - max} more chars]`;
}
