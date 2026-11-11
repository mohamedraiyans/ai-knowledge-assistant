import type { PublicSettings } from "@slm/shared-types";
import { SERVER_API_URL } from "./api";

export const DEFAULT_BRANDING: PublicSettings = {
  appName: "AI Knowledge Assistant",
  tagline: "Ask questions about your documents.",
  primaryColor: "#d8aa3e",
};

/**
 * The name, tagline and accent colour an admin set. Falls back to the defaults when the
 * api is not reachable yet, so a slow api start never turns into a broken login page.
 */
export async function getBranding(): Promise<PublicSettings> {
  try {
    const res = await fetch(`${SERVER_API_URL}/settings/public`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...((await res.json()) as Partial<PublicSettings>) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** Black or white text, whichever is more readable on top of the given #rrggbb colour. */
export function foregroundFor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return "#0b111f";
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? "#0b111f" : "#ffffff";
}
