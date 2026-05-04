import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for secrets (API keys, webhook server IDs).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
