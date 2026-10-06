/** Fixed-origin public board client. Signing and encryption remain with the caller. */
import { AdapterError } from './journal.js';

const API = 'https://api.voidly.ai';
const POSTS = '/v1/agent/board/posts';
const MAX_RESPONSE_BYTES = 262_144;
const BOARDS = new Set(['market-jobs', 'market-services', 'market-general']);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{8,256}$/;
const DID = /^did:voidly:[1-9A-HJ-NP-Za-km-z]{1,32}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,23}$/;
const SIGNATURE = /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const invalid = (): never => { throw new AdapterError('INVALID_INPUT'); };
const badResponse = (): never => { throw new AdapterError('INVALID_RESPONSE'); };

function inputString(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) return invalid();
  return value;
}
function limit(value: unknown): number {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 20) return invalid();
  return value as number;
}
function time(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function post(value: unknown): Record<string, unknown> {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id) ||
      !BOARDS.has(value.board as string) || typeof value.author_did !== 'string' || !DID.test(value.author_did) ||
      !(value.title === null || (typeof value.title === 'string' && value.title.length <= 120)) ||
      typeof value.body !== 'string' || value.body.length < 1 || value.body.length > 4_000 ||
      !(value.budget_amount === null || (typeof value.budget_amount === 'string' &&
        /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(value.budget_amount))) ||
      !(value.budget_currency === null || (typeof value.budget_currency === 'string' && /^[A-Z0-9]{2,12}$/.test(value.budget_currency))) ||
      !(value.budget_network === null || (typeof value.budget_network === 'string' && /^[a-z0-9:._-]{1,64}$/.test(value.budget_network))) ||
      !Array.isArray(value.tags) || value.tags.length > 5 || !value.tags.every(t => typeof t === 'string' && TAG.test(t)) ||
      !(value.listing_url === null || (typeof value.listing_url === 'string' && value.listing_url.length <= 500)) ||
      !(value.reply_to === null || (typeof value.reply_to === 'string' && UUID.test(value.reply_to))) ||
      !time(value.created_at) || !(value.expires_at === null || time(value.expires_at))) return badResponse();
  if (value.reply_to === null ? (typeof value.title !== 'string' || !value.title) :
    (value.title !== null || value.tags.length || value.listing_url !== null)) return badResponse();
  if (typeof value.listing_url === 'string') {
    try {
      const url = new URL(value.listing_url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return badResponse();
    } catch { return badResponse(); }
  }
  // Future API fields are not automatically exposed through this connector.
  return { id: value.id, board: value.board, author_did: value.author_did,
    title: value.title, body: value.body, budget_amount: value.budget_amount,
    budget_currency: value.budget_currency, budget_network: value.budget_network,
    tags: value.tags, listing_url: value.listing_url, reply_to: value.reply_to,
    created_at: value.created_at, expires_at: value.expires_at };
}
function nextCursor(value: unknown): string | null {
  if (value === null || (typeof value === 'string' && CURSOR.test(value))) return value as string | null;
  return badResponse();
}

async function request(path: string, init?: RequestInit, write = false,
  missing: 'NOT_FOUND' | 'PUBLIC_READ_UNAVAILABLE' | 'BOARD_WRITE_UNAVAILABLE' = 'NOT_FOUND'): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(API + path, { ...init, credentials: 'omit', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(5_000) });
  } catch { throw new AdapterError(write ? 'BOARD_WRITE_UNAVAILABLE' : 'PUBLIC_READ_UNAVAILABLE'); }
  if (response.status === 404) throw new AdapterError(missing);
  if (response.status === 429) throw new AdapterError('RATE_LIMITED');
  if (write && response.status === 401) throw new AdapterError('SIGNATURE_REJECTED');
  if (write && response.status === 409) throw new AdapterError('BOARD_POST_REPLAYED');
  if (write && response.status === 400) throw new AdapterError('INVALID_INPUT');
  if (response.status !== (write ? 201 : 200))
    throw new AdapterError(write ? 'BOARD_WRITE_UNAVAILABLE' : 'PUBLIC_READ_UNAVAILABLE');
  if (response.headers.has('set-cookie') || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body)
    return badResponse();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > MAX_RESPONSE_BYTES) return badResponse();
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return badResponse(); }
  finally { await reader.cancel().catch(() => {}); }
}

async function getPost(id: string) {
  const result = await request(`${POSTS}/${id}`);
  if (!record(result)) return badResponse();
  const found = post(result.post);
  if (found.id !== id) return badResponse();
  return found;
}

export async function boardTool(name: string, args: Record<string, unknown>) {
  if (name === 'board_search') {
    const params = new URLSearchParams({ limit: String(limit(args.limit)) });
    if (args.board !== undefined) params.set('board', inputString(args.board, /^(market-jobs|market-services|market-general)$/));
    if (args.q !== undefined) params.set('q', inputString(args.q, /^.{2,80}$/s));
    if (args.tag !== undefined) params.set('tag', inputString(args.tag, TAG));
    if (args.cursor !== undefined) params.set('cursor', inputString(args.cursor, CURSOR));
    const result = await request(`${POSTS}?${params}`, undefined, false, 'PUBLIC_READ_UNAVAILABLE');
    if (!record(result) || !Array.isArray(result.posts) || result.posts.length > 20) return badResponse();
    const posts = result.posts.map(post);
    if (posts.some(p => p.reply_to !== null)) return badResponse();
    return { posts, next_cursor: nextCursor(result.next_cursor), searchScope: 'one-public-page',
      publicContent: true, listingLinksVerified: false };
  }
  if (name === 'board_read' || name === 'board_reply_private') {
    const id = inputString(args.postId, UUID);
    const found = await getPost(id);
    if (name === 'board_reply_private') {
      if (found.reply_to !== null) return invalid();
      return { postId: id, recipientDid: found.author_did,
        recipientIdentityUrl: `${API}/v1/agent/identity/${found.author_did}`,
        clientEncryptionRequired: true, delivered: false,
        instruction: 'Resolve and verify the recipient identity, then encrypt and send using a local relay client that retains the per-post X25519 private key. This connector does not accept message text, ciphertext, agent keys or private keys.',
        privacyLimit: 'The current encrypted DM rail stores sender and recipient DIDs.' };
    }
    const count = limit(args.limit);
    if (found.reply_to !== null) {
      if (args.cursor !== undefined || args.limit !== undefined) return invalid();
      return { post: found, replies: [], next_cursor: null, publicContent: true, listingLinksVerified: false };
    }
    const params = new URLSearchParams({ limit: String(count) });
    if (args.cursor !== undefined) params.set('cursor', inputString(args.cursor, CURSOR));
    const result = await request(`${POSTS}/${id}/replies?${params}`);
    if (!record(result) || !Array.isArray(result.replies) || result.replies.length > 20) return badResponse();
    const replies = result.replies.map(post);
    if (replies.some(r => r.reply_to !== id || r.board !== found.board)) return badResponse();
    return { post: found, replies, next_cursor: nextCursor(result.next_cursor), publicContent: true,
      listingLinksVerified: false };
  }
  if (name === 'board_post') {
    const replyTo = args.replyTo === undefined ? undefined : inputString(args.replyTo, UUID);
    const raw = args.bodyJson;
    if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > 8192) return invalid();
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return invalid(); }
    const allowed = replyTo ? ['body'] : ['board', 'title', 'body', 'budget_amount', 'budget_currency',
      'budget_network', 'tags', 'expires_at', 'listing_url'];
    if (!record(data) || Object.keys(data).some(k => !allowed.includes(k)) ||
        typeof data.body !== 'string' || !data.body || data.body.length > 4_000 ||
        (!replyTo && (!BOARDS.has(data.board as string) || typeof data.title !== 'string' ||
          !data.title || data.title.length > 120))) return invalid();
    const body = data.body.trim();
    if (!body || body.length > 4_000) return invalid();
    const title = replyTo ? null : (data.title as string).trim();
    if (!replyTo && (!title || title.length > 120)) return invalid();
    const amount = data.budget_amount ?? null;
    const currency = data.budget_currency ?? null;
    const network = data.budget_network ?? null;
    const tags = data.tags ?? [];
    if (!replyTo && (
      !(amount === null || (typeof amount === 'string' && /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/.test(amount))) ||
      !(currency === null || (typeof currency === 'string' && /^[A-Z0-9]{2,12}$/.test(currency))) ||
      !(network === null || (typeof network === 'string' && /^[a-z0-9:._-]{1,64}$/.test(network))) ||
      (amount !== null && currency === null) || !Array.isArray(tags) || tags.length > 5 ||
      !tags.every(t => typeof t === 'string' && TAG.test(t)) || new Set(tags).size !== tags.length)) return invalid();
    let listingUrl: string | null = null;
    if (!replyTo && data.listing_url != null) {
      if (typeof data.listing_url !== 'string' || data.listing_url.length > 500) return invalid();
      try {
        const url = new URL(data.listing_url);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return invalid();
        listingUrl = url.toString();
      } catch { return invalid(); }
    }
    let expiresAt: string | null = null;
    if (!replyTo && data.expires_at != null) {
      if (typeof data.expires_at !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(data.expires_at) ||
          !Number.isFinite(Date.parse(data.expires_at))) return invalid();
      expiresAt = new Date(data.expires_at).toISOString();
    }
    const did = inputString(args.did, DID);
    const timestamp = inputString(args.timestamp, /^[0-9]{10}$/);
    const nonce = inputString(args.nonce, /^[0-9a-f]{32}$/);
    const signature = inputString(args.signature, SIGNATURE);
    const path = replyTo ? `${POSTS}/${replyTo}/replies` : POSTS;
    const result = await request(path, { method: 'POST', body: raw,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json',
        'X-Agent-DID': did, 'X-Board-Timestamp': timestamp, 'X-Board-Nonce': nonce,
        'X-Board-Signature': signature } }, true,
      replyTo ? 'NOT_FOUND' : 'BOARD_WRITE_UNAVAILABLE');
    if (!record(result)) return badResponse();
    const created = post(result.post);
    if (created.author_did !== did || created.reply_to !== (replyTo ?? null) || created.body !== body ||
        (!replyTo && (created.board !== data.board || created.title !== title ||
          created.budget_amount !== amount || created.budget_currency !== currency ||
          created.budget_network !== network || JSON.stringify(created.tags) !== JSON.stringify(tags) ||
          created.listing_url !== listingUrl || created.expires_at !== expiresAt))) return badResponse();
    return { post: created, posted: true, publicContent: true, paymentPerformed: false,
      listingLinksVerified: false };
  }
  return invalid();
}
