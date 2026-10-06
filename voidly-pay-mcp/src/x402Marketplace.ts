/** Keyless, bounded projection of the public x402 catalog. A 402 response sets payment terms. */
const GATEWAY = 'https://x402.voidly.ai';
const MAX_BYTES = 1_500_000;
const CURSOR = /^[A-Za-z0-9_-]{8,512}$/;
const SELLER_ID = /^[a-z0-9][a-z0-9_-]{7,63}$/;
const WALLET = /^0x[0-9a-fA-F]{40}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const FIRST_PARTY: Record<string, string> = {
  'voidly-verify-claim': `${GATEWAY}/v1/verify-claim`,
  'voidly-incident-report': `${GATEWAY}/data/incidents/report`,
  'voidly-accessibility-check': `${GATEWAY}/v1/accessibility/check`,
};
const USDC: Record<string, string> = {
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function x402Input(value: unknown): { cursor?: string; category?: string; search?: string } {
  if (!object(value) || Object.keys(value).some(k => !['cursor', 'category', 'search'].includes(k)))
    throw new Error('INVALID_INPUT');
  const result: { cursor?: string; category?: string; search?: string } = {};
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== 'string' || !CURSOR.test(value.cursor)) throw new Error('INVALID_INPUT');
    result.cursor = value.cursor;
  }
  for (const key of ['category', 'search'] as const) {
    const raw = value[key];
    if (raw !== undefined) {
      if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > (key === 'search' ? 80 : 64) ||
          /[\u0000-\u001f\u007f]/.test(raw)) throw new Error('INVALID_INPUT');
      result[key] = raw.trim();
    }
  }
  return result;
}

function displayPrice(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) throw new Error('INVALID_RESPONSE');
  const n = BigInt(value);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_RESPONSE');
  return `${n / 1_000_000n}.${String(n % 1_000_000n).padStart(6, '0')}`
    .replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

function schema(value: unknown): Record<string, unknown> {
  if (!object(value) || Buffer.byteLength(JSON.stringify(value)) > 32_768) throw new Error('INVALID_RESPONSE');
  return value;
}

function sellerDetailUrl(value: unknown, id: string, network: unknown, version: unknown): boolean {
  if (typeof value !== 'string' || typeof network !== 'string' ||
      !Number.isSafeInteger(version) || (version as number) < 1) return false;
  try {
    const url = new URL(value);
    return url.origin === GATEWAY && url.pathname === `/v1/services/${id}` &&
      !url.username && !url.password && !url.hash &&
      [...url.searchParams.keys()].length === 2 &&
      url.searchParams.getAll('network').length === 1 &&
      url.searchParams.getAll('version').length === 1 &&
      url.searchParams.get('network') === network &&
      url.searchParams.get('version') === String(version);
  } catch { return false; }
}

function listing(value: unknown) {
  if (!object(value) || (value.kind !== 'seller' && value.kind !== 'first_party') ||
      typeof value.id !== 'string' || (value.kind === 'seller' ? !SELLER_ID.test(value.id) : !FIRST_PARTY[value.id]) ||
      !Number.isSafeInteger(value.version) || (value.version as number) < 1 || value.status !== 'live' ||
      value.method !== 'POST' || typeof value.name !== 'string' || !value.name || value.name.length > 120 ||
      typeof value.description !== 'string' || value.description.length > 500 ||
      typeof value.category !== 'string' || !value.category || value.category.length > 64 ||
      (value.kind === 'seller' ? !sellerDetailUrl(value.detailUrl, value.id, value.network, value.version) : value.detailUrl != null) ||
      value.callUrl !== (value.kind === 'seller' ? `${GATEWAY}/v1/services/${value.id}/call` : FIRST_PARTY[value.id]) ||
      typeof value.network !== 'string' || !USDC[value.network] || typeof value.asset !== 'string' ||
      value.asset.toLowerCase() !== USDC[value.network].toLowerCase() ||
      typeof value.payTo !== 'string' || !WALLET.test(value.payTo) ||
      !Array.isArray(value.tags) || value.tags.length > 16 ||
      !value.tags.every(t => typeof t === 'string' && TAG.test(t)) ||
      !object(value.reputation) || !Number.isSafeInteger(value.reputation.delivered) ||
      (value.reputation.delivered as number) < 0 || !Number.isSafeInteger(value.reputation.refundOwed) ||
      (value.reputation.refundOwed as number) < 0) throw new Error('INVALID_RESPONSE');
  return { kind: value.kind, id: value.id, version: value.version, status: 'live',
    name: value.name, description: value.description, category: value.category,
    method: 'POST', detailUrl: value.kind === 'seller' ? value.detailUrl : null,
    callUrl: value.callUrl, network: value.network, asset: value.asset,
    priceUsdcAtomic: value.priceUsdcAtomic, priceUsdc: displayPrice(value.priceUsdcAtomic),
    inputSchema: schema(value.inputSchema), outputSchema: schema(value.outputSchema),
    tags: value.tags, reputation: { delivered: value.reputation.delivered, refundOwed: value.reputation.refundOwed },
    paymentAuthority: 'runtime-402' };
}

export function parseX402Page(value: unknown) {
  if (!object(value) || value.version !== '1' || !Array.isArray(value.items) || value.items.length > 20 ||
      !(value.nextCursor === null || (typeof value.nextCursor === 'string' && CURSOR.test(value.nextCursor))))
    throw new Error('INVALID_RESPONSE');
  return { version: 'voidpay.x402-marketplace-page.v1', availability: 'configured',
    listings: value.items.map(listing), nextCursor: value.nextCursor, searchScope: 'one-public-page',
    paymentPerformed: false };
}

export const x402Unavailable = () => ({ version: 'voidpay.x402-marketplace-page.v1',
  availability: 'unavailable', listings: null, nextCursor: null, searchScope: 'one-public-page',
  paymentPerformed: false });

export async function x402MarketplacePage(input: { cursor?: string; category?: string; search?: string }) {
  const url = new URL('/v1/services', GATEWAY);
  if (input.search) url.searchParams.set('query', input.search);
  if (input.category) url.searchParams.set('category', input.category);
  if (input.cursor) url.searchParams.set('cursor', input.cursor);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'manual',
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    if (response.status !== 200 || response.headers.has('set-cookie') || !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return x402Unavailable();
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > MAX_BYTES) return x402Unavailable();
      chunks.push(chunk.value);
    }
    return parseX402Page(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return x402Unavailable(); }
  finally { await reader?.cancel().catch(() => {}); }
}
