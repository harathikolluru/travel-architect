// Short-lived tokens that let the PDF renderer reach the print page.
//
// Headless Chromium has no session cookie, so a gated /plan/[id]/print would
// redirect it to sign-in. Rather than exempting the route — which would expose
// every itinerary to anyone with an id — the PDF route mints a token scoped to
// one plan and valid for a couple of minutes.

import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 2 * 60 * 1000;

/** Reuses AUTH_SECRET, which the platform already provisions. */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required to sign print tokens');
  return s;
}

export function createPrintToken(planId: string): string {
  const expires = Date.now() + TTL_MS;
  const payload = `${planId}.${expires}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${expires}.${sig}`;
}

export function verifyPrintToken(planId: string, token: string | null): boolean {
  if (!token) return false;
  const [expiresRaw, sig] = token.split('.');
  const expires = Number(expiresRaw);
  if (!expires || !sig || Date.now() > expires) return false;

  const expected = createHmac('sha256', secret())
    .update(`${planId}.${expires}`)
    .digest('hex');

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
