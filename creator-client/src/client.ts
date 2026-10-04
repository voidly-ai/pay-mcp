/** Scoped creator transport. No wallet, human session, credential provisioning or automatic retries. */
import {
  parseCreatorId, parseCreatorOperation, type CreatorMutation,
} from '../../landing/lib/marketplacePublishingProtocol';
import {
  CREATOR_COLLECTION_API_VERSION, CREATOR_COLLECTION_CONFIG_VERSION, CREATOR_COLLECTION_MAX_BODY_BYTES, CREATOR_COLLECTION_MAX_RESPONSE_BYTES,
  captureCreatorCollectionJson, encodeCreatorConfigV2, hashCreatorRequestV2, parseCreatorConfigV2, parseCreatorRequestV2, parseCreatorResponseV2,
  type CreatorConfigV2, type CreatorRequestsV2, type CreatorResultsV2,
} from '../../landing/lib/marketplaceCollectionProtocol';
import {
  parseQualifiedInventoryPage, parseQualifiedInventoryRequest, qualifiedDefinitionDigest, type QualifiedInventoryRequest,
} from '../../landing/lib/marketplaceQualifiedInventory';
import {
  hashPublicServiceProjection, parsePublicServiceProjection, type PublicServiceProjection,
} from '../../landing/lib/marketplacePublicService';
export type { CreatorRequestsV2, CreatorResultsV2 } from '../../landing/lib/marketplaceCollectionProtocol';
export type { QualifiedInventoryRequest } from '../../landing/lib/marketplaceQualifiedInventory';
export type { PublicServiceProjection } from '../../landing/lib/marketplacePublicService';

const API = 'https://api.voidly.ai/v2/marketplace/agents/';
const TIMEOUT_MS = 10_000;
const encoder = new TextEncoder();
const MUTATIONS = ['create', 'save', 'publish', 'unpublish'] as const;
const REMOTE_CODES = [
  'INVALID_INPUT', 'AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'UNSUPPORTED_VERSION', 'CONFLICT', 'SLUG_CONFLICT',
  'STALE_VERSION', 'SERVICE_NOT_APPROVED', 'SERVICE_PROJECTION_CHANGED', 'LIMIT_REACHED', 'BODY_TOO_LARGE',
  'RATE_LIMITED', 'STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN', 'HASH_UNAVAILABLE',
] as const;
type RemoteCode = typeof REMOTE_CODES[number];
export type CreatorClientErrorCode = RemoteCode | 'INVALID_RESPONSE' | 'REQUEST_ABORTED' | 'ORIGINAL_MISMATCH';
export class CreatorClientError extends Error {
  constructor(readonly code: CreatorClientErrorCode, readonly status?: number, readonly recovery?: 'original-only') {
    super(code); this.name = 'CreatorClientError';
  }
}
/** Safe to persist privately before dispatch. Contains the request, never a credential. */
export type CreatorOriginal = Readonly<{
  version: 'voidpay.creator-client-original.v1'; ownerAccountId: string; operation: CreatorMutation;
  requestBytes: string; requestDigest: string; idempotencyKey: string;
}>;
export type CreatorCallOptions = Readonly<{ signal?: AbortSignal }>;
export type CreatorClientSettings = Readonly<{
  credential: string; ownerAccountId: string; targetSpaceId?: string | null;
}>;
export type CreatorSaveInput = Readonly<{
  idempotencyKey: string;
  owned: NonNullable<CreatorResultsV2['read']>;
  presentation: Pick<CreatorConfigV2, 'name' | 'description' | 'brandPreset'>;
  selectedServices: readonly PublicServiceProjection[];
}>;
const fail = (code: CreatorClientErrorCode): never => { throw new CreatorClientError(code); };
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(descriptors);
  if (keys.some(key => !actual.includes(key)) || actual.some(key => typeof key !== 'string' || (!keys.includes(key) && !optional.includes(key)) ||
    !descriptors[key].enumerable || !('value' in descriptors[key]))) return fail('INVALID_INPUT');
  return Object.fromEntries((actual as string[]).map(key => [key, descriptors[key].value]));
}
function requestWire(value: unknown): string {
  const wire = JSON.stringify(captureCreatorCollectionJson(value, 'request'));
  if (encoder.encode(wire).length > CREATOR_COLLECTION_MAX_BODY_BYTES) return fail('BODY_TOO_LARGE');
  return wire;
}
function signalOf(options: CreatorCallOptions | undefined): AbortSignal | undefined {
  if (options === undefined) return undefined;
  const value = record(options, Object.hasOwn(options, 'signal') ? ['signal'] : []).signal;
  if (value !== undefined && !(value instanceof AbortSignal)) return fail('INVALID_INPUT');
  return value as AbortSignal | undefined;
}
function remoteError(raw: unknown, status: number): CreatorClientError | null {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'error')) return null;
  const envelope = record(raw, ['version', 'error']);
  const e = record(envelope.error, Object.hasOwn(envelope.error as object, 'recovery') ? ['code', 'recovery'] : ['code']);
  if (envelope.version !== CREATOR_COLLECTION_API_VERSION || !(REMOTE_CODES as readonly unknown[]).includes(e.code) ||
    (e.recovery !== undefined && e.recovery !== 'original-only') || status < 400 || status > 599) return fail('INVALID_RESPONSE');
  return new CreatorClientError(e.code as RemoteCode, status, e.recovery as 'original-only' | undefined);
}
// Bounded response bytes are checked before this walk. Preserve duplicate-key
// evidence while accepting ordinary JSON whitespace from compatible servers.
function parseJson(text: string): unknown {
  let cursor = 0;
  const whitespace = () => { while (/[\t\n\r ]/.test(text[cursor] ?? '\0')) cursor++; };
  const string = (): string => {
    const start = cursor;
    if (text[cursor++] !== '"') return fail('INVALID_RESPONSE');
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '\\') cursor++;
      else if (char === '"') return JSON.parse(text.slice(start, cursor));
    }
    return fail('INVALID_RESPONSE');
  };
  function value(depth: number): void {
    whitespace(); if (depth > 8) return fail('INVALID_RESPONSE');
    const char = text[cursor];
    if (char === '{' || char === '[') {
      const object = char === '{', end = object ? '}' : ']', keys = new Set<string>();
      cursor++; whitespace();
      if (text[cursor] === end) { cursor++; return; }
      for (;;) {
        if (object) {
          whitespace(); const key = string();
          if (keys.has(key)) return fail('INVALID_RESPONSE'); keys.add(key);
          whitespace(); if (text[cursor++] !== ':') return fail('INVALID_RESPONSE');
        }
        value(depth + 1); whitespace();
        if (text[cursor] === end) { cursor++; return; }
        if (text[cursor++] !== ',') return fail('INVALID_RESPONSE');
      }
    }
    if (char === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(cursor));
    if (!token) return fail('INVALID_RESPONSE'); cursor += token[0].length;
  }
  value(0); whitespace(); if (cursor !== text.length) return fail('INVALID_RESPONSE');
  return JSON.parse(text);
}

/** Callers supply the credential and owner ID from their approved grant metadata.
 * The owner ID only binds local recovery verification; it is never sent as authority.
 */
export function createCreatorClient(settings: CreatorClientSettings) {
  const input = record(settings, ['credential', 'ownerAccountId'], ['targetSpaceId']);
  if (typeof input.credential !== 'string' || !/^vpc_[0-9a-f]{64}$/.test(input.credential)) return fail('AUTH_REQUIRED');
  const credential = input.credential, ownerAccountId = parseCreatorId(input.ownerAccountId);
  if (ownerAccountId.includes(credential)) return fail('INVALID_INPUT');
  const targetSpaceId = input.targetSpaceId === null || !Object.hasOwn(input, 'targetSpaceId')
    ? null : parseCreatorId(input.targetSpaceId);
  if (targetSpaceId?.includes(credential)) return fail('INVALID_INPUT');
  const fetcher = globalThis.fetch.bind(globalThis);
  const originals = new WeakMap<object, CreatorRequestsV2[CreatorMutation]>();

  async function prepare<K extends CreatorMutation>(operation: K, value: CreatorRequestsV2[K]): Promise<CreatorOriginal> {
    // Capture the complete request before any cryptographic await.
    if (!(MUTATIONS as readonly unknown[]).includes(operation)) return fail('INVALID_INPUT');
    const request = parseCreatorRequestV2(operation, value), requestBytes = requestWire(request);
    if (requestBytes.includes(credential)) return fail('INVALID_INPUT');
    const requestDigest = await hashCreatorRequestV2(ownerAccountId, operation, request);
    const original = Object.freeze({ version: 'voidpay.creator-client-original.v1' as const,
      ownerAccountId, operation, requestBytes, requestDigest, idempotencyKey: request.idempotencyKey });
    originals.set(original, request);
    return original;
  }
  async function prepareSave(value: CreatorSaveInput): Promise<CreatorOriginal> {
    // One synchronous capture preserves the caller's selection, presentation and
    // observed versions across every hash await. This helper never contacts a server.
    const captured = captureCreatorCollectionJson(value, 'response');
    if (JSON.stringify(captured).includes(credential)) return fail('INVALID_INPUT');
    const r = record(captured, ['idempotencyKey', 'owned', 'presentation', 'selectedServices']);
    const idempotencyKey = parseCreatorId(r.idempotencyKey);
    const presentation = record(r.presentation, ['name', 'description', 'brandPreset']);
    if (!Array.isArray(r.selectedServices)) return fail('INVALID_INPUT');
    const selected = r.selectedServices.map(parsePublicServiceProjection);
    const config = parseCreatorConfigV2({ version: CREATOR_COLLECTION_CONFIG_VERSION, ...presentation,
      templateId: 'service-collection-v2', serviceProjectionIds: selected.map(service => service.projectionId) });
    if (selected.some(service => qualifiedDefinitionDigest(service.projectionId) !== service.serviceRef.definitionDigest))
      return fail('INVALID_INPUT');
    const owned = await parseCreatorResponseV2('read', { version: CREATOR_COLLECTION_API_VERSION, data: r.owned });
    if ('error' in owned || owned.data === null) return fail('INVALID_INPUT');
    const projectionDigests = await Promise.all(selected.map(hashPublicServiceProjection));
    return prepare('save', { spaceId: owned.data.space.spaceId, idempotencyKey,
      expectedVersion: owned.data.space.stateVersion, baseRevision: owned.data.space.headRevision,
      config, projectionDigests });
  }
  async function restore(value: CreatorOriginal): Promise<CreatorOriginal> {
    const r = record(value, ['version', 'ownerAccountId', 'operation', 'requestBytes', 'requestDigest', 'idempotencyKey']);
    if (r.version !== 'voidpay.creator-client-original.v1' || r.ownerAccountId !== ownerAccountId ||
      typeof r.requestBytes !== 'string' || r.requestBytes.length > CREATOR_COLLECTION_MAX_BODY_BYTES ||
      encoder.encode(r.requestBytes).length > CREATOR_COLLECTION_MAX_BODY_BYTES) return fail('ORIGINAL_MISMATCH');
    let request: unknown;
    try { request = JSON.parse(r.requestBytes); } catch { return fail('ORIGINAL_MISMATCH'); }
    // Canonical wire comparison also rejects duplicate keys and noncanonical persisted strings.
    const op = parseCreatorOperation(r.operation);
    if (!(MUTATIONS as readonly string[]).includes(op)) return fail('ORIGINAL_MISMATCH');
    const original = await prepare(op as CreatorMutation, request as CreatorRequestsV2[CreatorMutation]);
    if (original.requestBytes !== r.requestBytes || original.requestDigest !== r.requestDigest || original.idempotencyKey !== r.idempotencyKey) return fail('ORIGINAL_MISMATCH');
    return original;
  }
  function retained(original: CreatorOriginal): CreatorRequestsV2[CreatorMutation] {
    const request = originals.get(original);
    if (!request) return fail('ORIGINAL_MISMATCH');
    return request;
  }
  function correlate(original: CreatorOriginal, result: CreatorResultsV2[CreatorMutation]): void {
    const request = retained(original);
    const digest = 'createRequestDigest' in result ? result.createRequestDigest : result.requestDigest;
    const key = 'createKey' in result ? result.createKey : result.idempotencyKey;
    if (digest !== original.requestDigest || key !== original.idempotencyKey ||
      ('spaceId' in request && result.spaceId !== request.spaceId) ||
      (original.operation === 'create' && (!('slug' in result) || result.slug !== (request as CreatorRequestsV2['create']).slug))) return fail('ORIGINAL_MISMATCH');
    if (original.operation === 'save') {
      const expected = request as CreatorRequestsV2['save'], actual = result as CreatorResultsV2['save'];
      if (!('expectedVersion' in actual) || actual.expectedVersion !== expected.expectedVersion ||
        actual.baseRevision !== expected.baseRevision || actual.revision !== expected.baseRevision + 1 ||
        encodeCreatorConfigV2(actual.config) !== encodeCreatorConfigV2(expected.config) ||
        JSON.stringify(actual.projectionDigests) !== JSON.stringify(expected.projectionDigests)) return fail('ORIGINAL_MISMATCH');
    } else if (original.operation === 'publish' || original.operation === 'unpublish') {
      const actual = result as CreatorResultsV2['publish'];
      if (actual.action !== (original.operation === 'publish' ? 'published' : 'withdrawn') ||
        ('configDigest' in request && (actual.configDigest !== request.configDigest || actual.revision !== request.revision))) return fail('ORIGINAL_MISMATCH');
    }
  }

  async function exchange<T>(operation: string, wire: string, mutation: boolean,
    decode: (raw: unknown, status: number) => Promise<T>, options?: CreatorCallOptions): Promise<T> {
    if (wire.includes(credential)) return fail('INVALID_INPUT');
    const signal = signalOf(options);
    if (signal?.aborted) return fail('REQUEST_ABORTED');
    const controller = new AbortController();
    let dispatched = false, responseReceived = false, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let stop!: () => void;
    const timeout = new Promise<never>((_, reject) => {
      stop = () => {
        controller.abort(); void reader?.cancel().catch(() => {});
        reject(new CreatorClientError(mutation && dispatched ? 'OUTCOME_UNKNOWN' : signal?.aborted ? 'REQUEST_ABORTED' : 'STORAGE_UNAVAILABLE',
          undefined, mutation && dispatched ? 'original-only' : undefined));
      };
    });
    const timer = setTimeout(stop, TIMEOUT_MS);
    signal?.addEventListener('abort', stop, { once: true });
    const work = async () => {
      if (signal?.aborted) return fail('REQUEST_ABORTED');
      dispatched = true;
      const response = await fetcher(API + operation, {
        method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json',
          accept: 'application/json', 'accept-encoding': 'identity' },
        body: wire, credentials: 'omit', redirect: 'manual', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      responseReceived = true;
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); return fail('INVALID_RESPONSE'); }
      if (response.redirected || response.type === 'opaqueredirect' || (response.url && response.url !== API + operation) ||
        response.headers.has('location') || response.headers.has('set-cookie') || !response.body ||
        !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(response.headers.get('content-type') ?? '') ||
        ![null, 'identity'].includes(response.headers.get('content-encoding'))) {
        void response.body?.cancel().catch(() => {}); return fail('INVALID_RESPONSE');
      }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d{1,10}$/.test(length) || Number(length) > CREATOR_COLLECTION_MAX_RESPONSE_BYTES)) {
        void response.body.cancel().catch(() => {}); return fail('INVALID_RESPONSE');
      }
      reader = response.body.getReader();
      const bytes = new Uint8Array(CREATOR_COLLECTION_MAX_RESPONSE_BYTES);
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (controller.signal.aborted) return fail('INVALID_RESPONSE');
          if (part.done) break;
          if (part.value.byteLength > bytes.length - size) return fail('INVALID_RESPONSE');
          bytes.set(part.value, size); size += part.value.byteLength;
        }
        if (length !== null && Number(length) !== size) return fail('INVALID_RESPONSE');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
        if (text.includes(credential)) return fail('INVALID_RESPONSE');
        const raw = parseJson(text);
        captureCreatorCollectionJson(raw, 'response');
        if (JSON.stringify(raw).includes(credential)) return fail('INVALID_RESPONSE');
        const error = remoteError(raw, response.status);
        if (error) throw error;
        if (response.status !== 200) return fail('INVALID_RESPONSE');
        return await decode(raw, response.status);
      } finally { bytes.fill(0); void reader.cancel().catch(() => {}); }
    };
    try { return await Promise.race([work(), timeout]); }
    catch (error) {
      if (error instanceof CreatorClientError && error.status !== undefined) {
        // Server 5xx or original-only errors cannot establish that a mutation did not commit.
        if (mutation && (error.status >= 500 || error.recovery === 'original-only'))
          throw new CreatorClientError('OUTCOME_UNKNOWN', error.status, 'original-only');
        throw error;
      }
      if (mutation && dispatched) throw new CreatorClientError('OUTCOME_UNKNOWN', undefined, 'original-only');
      if (error instanceof CreatorClientError) throw error;
      throw new CreatorClientError(responseReceived ? 'INVALID_RESPONSE' : 'STORAGE_UNAVAILABLE');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', stop); controller.abort(); void reader?.cancel().catch(() => {});
    }
  }
  async function execute(original: CreatorOriginal, options?: CreatorCallOptions): Promise<CreatorResultsV2[CreatorMutation]> {
    retained(original);
    return exchange(original.operation, original.requestBytes, true, async raw => {
      const result = await parseCreatorResponseV2(original.operation, raw);
      if ('error' in result) return fail('INVALID_RESPONSE');
      correlate(original, result.data);
      return result.data;
    }, options);
  }
  async function recover(original: CreatorOriginal, options?: CreatorCallOptions): Promise<CreatorResultsV2['recover']> {
    const request = retained(original);
    const query = original.operation === 'create' ? { operation: 'create' as const, idempotencyKey: original.idempotencyKey }
      : { operation: original.operation, spaceId: (request as CreatorRequestsV2['save']).spaceId, idempotencyKey: original.idempotencyKey };
    const wire = requestWire(parseCreatorRequestV2('recover', query));
    return exchange('recover', wire, false, async raw => {
      const result = await parseCreatorResponseV2('recover', raw);
      if ('error' in result) return fail('INVALID_RESPONSE');
      if (result.data !== null) {
        if (result.data.operation !== original.operation) return fail('ORIGINAL_MISMATCH');
        correlate(original, result.data.data);
      }
      return result.data;
    }, options);
  }
  async function read(value: CreatorRequestsV2['read'] = {}, options?: CreatorCallOptions): Promise<CreatorResultsV2['read']> {
    const fields = record(captureCreatorCollectionJson(value, 'request'), [], ['spaceId', 'revision']);
    const request = parseCreatorRequestV2('read', targetSpaceId !== null && !Object.hasOwn(fields, 'spaceId')
      ? { ...fields, spaceId: targetSpaceId } : fields), wire = requestWire(request);
    return exchange('read', wire, false, async raw => {
      const result = await parseCreatorResponseV2('read', raw);
      if ('error' in result) return fail('INVALID_RESPONSE');
      if (result.data && (request.spaceId !== undefined && result.data.space.spaceId !== request.spaceId ||
        request.revision !== undefined && result.data.revision?.revision !== request.revision)) return fail('ORIGINAL_MISMATCH');
      return result.data;
    }, options);
  }
  async function inventory(value: Readonly<{ spaceId?: string | null; query: QualifiedInventoryRequest }>, options?: CreatorCallOptions) {
    const r = record(value, ['query'], ['spaceId']);
    const target = Object.hasOwn(r, 'spaceId') ? r.spaceId : targetSpaceId;
    const spaceId = target === null ? null : parseCreatorId(target), query = parseQualifiedInventoryRequest(r.query);
    const wire = requestWire({ spaceId, query });
    return exchange('inventory', wire, false, async raw => {
      const envelope = record(raw, ['version', 'data']);
      if (envelope.version !== CREATOR_COLLECTION_API_VERSION) return fail('INVALID_RESPONSE');
      return parseQualifiedInventoryPage(envelope.data, query);
    }, options);
  }
  return Object.freeze({ prepare, prepareSave, restore, execute, recover, read, inventory });
}
