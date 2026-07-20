import "server-only";
import { createHmac } from "crypto";

/**
 * HMAC-SHA256 webhook signing (M8 / P2-12), Stripe-style. The signed message
 * is `<timestamp>.<rawBody>`, so receivers can reject stale/replayed payloads
 * by checking the timestamp before verifying the signature. Provider-
 * independent — this is plain HMAC over HTTP, no vendor SDK.
 */
export function signPayload(secret: string, payload: string, timestampSec: number): string {
  return createHmac("sha256", secret).update(`${timestampSec}.${payload}`).digest("hex");
}

/** The `X-Webhook-Signature` header value: `t=<ts>,v1=<hex>`. */
export function buildSignatureHeader(secret: string, payload: string, timestampSec: number): string {
  return `t=${timestampSec},v1=${signPayload(secret, payload, timestampSec)}`;
}
