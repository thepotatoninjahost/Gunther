export async function sha256Hex(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) throw new Error("Path required");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error(`Unsafe project path: ${path}`);
  }
  return parts.join("/");
}

export const MISSING_CHECKSUM = "<missing>";
