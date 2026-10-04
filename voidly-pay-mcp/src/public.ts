/** Fixed-origin, credential-free discovery. Public DTOs only; no private service imports. */
import { parseCreatorSlug, parseCreatorId, parseCreatorDigest } from '../../landing/lib/marketplacePublishingProtocol';
import { parsePublicMarketplaceCompatible } from '../../landing/lib/marketplaceCollectionProtocol';
import { parseQualifiedInventoryPage, parseQualifiedInventoryRequest } from '../../landing/lib/marketplaceQualifiedInventory';
import { hashPublicServiceProjection } from '../../landing/lib/marketplacePublicService';
import { AdapterError } from './journal.js';
const ORIGIN = 'https://api.voidly.ai';
async function get(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(ORIGIN + path, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (response.status !== 200 || response.headers.has('set-cookie'))
      throw new AdapterError(response.status === 429 ? 'RATE_LIMITED' : response.status === 404 ? 'NOT_FOUND' : 'PUBLIC_READ_UNAVAILABLE');
    if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new AdapterError('INVALID_RESPONSE');
    reader = response.body.getReader();
    const parts: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > 131072) throw new AdapterError('INVALID_RESPONSE'); parts.push(part.value); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch (e) { if (e instanceof AdapterError) throw e; throw new AdapterError('PUBLIC_READ_UNAVAILABLE'); }
  finally { clearTimeout(timeout); await reader?.cancel().catch(() => {}); }
}
export async function services(input: unknown) {
  const query = parseQualifiedInventoryRequest(input);
  const params = new URLSearchParams({ limit: String(query.limit ?? 10) });
  if (query.after) params.set('cursor', query.after);
  if (query.definitionDigest) params.set('definitionDigest', query.definitionDigest);
  return parseQualifiedInventoryPage(await get('/v2/marketplace/services?' + params), query);
}
export async function storefront(slugInput: unknown) {
  const slug = parseCreatorSlug(slugInput);
  const view = await parsePublicMarketplaceCompatible(await get('/v2/marketplace/storefronts/' + slug));
  if (view.slug !== slug) throw new AdapterError('INVALID_RESPONSE');
  return view;
}
export async function checkoutLink(slug: unknown, publicationDigest: unknown, projectionId?: unknown) {
  const expected = parseCreatorDigest(publicationDigest), view = await storefront(slug);
  if (view.publicationDigest !== expected) throw new AdapterError('STOREFRONT_SELECTION_CHANGED');
  const params = new URLSearchParams({ storefront: view.slug, publication: view.publicationDigest });
  if (view.version === 'voidpay.public-storefront.v2') {
    const id = parseCreatorId(projectionId), entry = view.entries.find(x => x.service.projectionId === id);
    if (!entry || await hashPublicServiceProjection(entry.service) !== entry.projectionDigest) throw new AdapterError('STOREFRONT_SELECTION_CHANGED');
    params.set('service', id); params.set('projection', entry.projectionDigest);
  } else if (projectionId !== undefined && projectionId !== view.service.projectionId) throw new AdapterError('STOREFRONT_SELECTION_CHANGED');
  return { url: 'https://voidly.ai/pay/marketplace/checkout?' + params, ownerApprovalRequired: true,
    paymentPerformed: false, availability: 'not-asserted', instruction: 'Open in the owner browser. Review service, chain and amount there. This link grants no payment authority.' };
}
