/** Browser-owned copy of the public wire contract at 8f8fbaabb14e66c548b882678acf965babd4c2de.
 * Runtime imports stay inside landing; parity is checked against the pinned source in tests. */
/** Presentation bytes only. Nothing parsed here authenticates an owner or grants payment authority. */
import { parsePublishedServiceProjection, parsePublicServiceProjection, hashPublicServiceProjection, type PublicServiceProjection } from './marketplacePublicService';

export const CREATOR_CONFIG_VERSION = 'voidpay.creator-presentation.v1' as const;
export const CREATOR_API_VERSION = 'voidpay.creator-api.v1' as const;
export const PUBLIC_STOREFRONT_VERSION = 'voidpay.public-storefront.v1' as const;
export const CREATOR_MAX_BODY_BYTES = 8192;
export const CREATOR_MAX_DEPTH = 4;
export const CREATOR_MAX_REVISIONS = 256;
export const CREATOR_MAX_PUBLICATION_VERSION = 256;
/** Reserve the final event for withdrawal, even when publication history is full. */
export const CREATOR_MAX_PUBLISH_VERSION = 255;
export const CREATOR_ORIGIN = 'https://voidly.ai' as const;
export const CREATOR_API_ORIGIN = 'https://api.voidly.ai' as const;
export const CREATOR_ROUTE_PREFIX = '/v1/marketplace/creator/' as const;
export const PUBLIC_STOREFRONT_PREFIX = '/v1/marketplace/storefronts/' as const;
export const CREATOR_OPERATIONS = Object.freeze(['create', 'save', 'read', 'publish', 'unpublish', 'recover'] as const);
export type CreatorOperation = typeof CREATOR_OPERATIONS[number];
export type CreatorMutation = Exclude<CreatorOperation, 'read' | 'recover'>;
export type CreatorConfig = Readonly<{
  version: typeof CREATOR_CONFIG_VERSION; name: string; description: string;
  brandPreset: 'slate' | 'ocean' | 'forest'; templateId: 'text-workbench-v1'; serviceProjectionId: string;
}>;
export type CreatorRequests = {
  create: Readonly<{ idempotencyKey: string; slug: string }>;
  save: Readonly<{ spaceId: string; idempotencyKey: string; expectedVersion: number; baseRevision: number; config: CreatorConfig; projectionDigest?:string }>;
  /** Empty input discovers this authenticated account's one space; revision requires an explicit spaceId. */
  read: Readonly<{ spaceId?: string; revision?: number }>;
  publish: Readonly<{ spaceId: string; idempotencyKey: string; expectedVersion: number; revision: number; configDigest: string }>;
  unpublish: Readonly<{ spaceId: string; idempotencyKey: string; expectedVersion: number; publicationId: string }>;
  recover: Readonly<{ operation: 'create'; idempotencyKey: string }> |
    Readonly<{ operation: Exclude<CreatorMutation, 'create'>; spaceId: string; idempotencyKey: string }>;
};
export type CreatorSpace = Readonly<{
  spaceId: string; slug: string; createKey: string; createRequestDigest: string; createdAtMs: number;
  stateVersion: number; headRevision: number; headRevisionId: string | null;
  publicationVersion: number; publicationId: string | null;
}>;
export type CreatorRevision = Readonly<{
  spaceId: string; revisionId: string; revision: number; baseRevision: number;
  idempotencyKey: string; requestDigest: string; configDigest: string; config: CreatorConfig; createdAtMs: number;
}>;
export type CreatorPublicationCommitment = Readonly<{
  spaceId: string; slug: string; publicationVersion: number; action: 'published' | 'withdrawn';
  revision: number; configDigest: string; projectionDigest: string;
}>;
export type CreatorPublication = CreatorPublicationCommitment & Readonly<{
  publicationId: string; revisionId: string; idempotencyKey: string; requestDigest: string;
  publicationDigest: string; createdAtMs: number; config: CreatorConfig; service: PublicServiceProjection; publicUrl: string | null;
}>;
export type CreatorRead = Readonly<{ space: CreatorSpace; revision: CreatorRevision | null; publication: CreatorPublication | null }>;
export type CreatorRecovery = { [K in CreatorMutation]: Readonly<{ operation: K; data: CreatorResults[K] }> }[CreatorMutation];
export type CreatorResults = {
  create: CreatorSpace; save: CreatorRevision; read: CreatorRead | null;
  publish: CreatorPublication; unpublish: CreatorPublication; recover: CreatorRecovery | null;
};
export type PublicStorefront = Readonly<{
  version: typeof PUBLIC_STOREFRONT_VERSION; slug: string; publicationVersion: number;
  publicationDigest: string; publishedAt: number; config: CreatorConfig; service: PublicServiceProjection;
  checkout: Readonly<{ href: '/pay/marketplace/checkout'; access: 'invited-only'; availability: 'not-asserted' }> |
    Readonly<{ href: null; access: 'not-open'; availability: 'not-asserted'; selection: Readonly<{
      serviceRef: PublicServiceProjection['serviceRef']; projectionDigest: string;
    }> }>;
}>;
export type CreatorErrorCode = 'INVALID_INPUT' | 'AUTH_REQUIRED' | 'NOT_FOUND' | 'CONFLICT' | 'SLUG_CONFLICT' |
  'STALE_VERSION' | 'SERVICE_NOT_APPROVED' | 'SERVICE_PROJECTION_CHANGED' | 'LIMIT_REACHED' |
  'BODY_TOO_LARGE' | 'RATE_LIMITED' | 'STORAGE_UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'HASH_UNAVAILABLE';
export class CreatorStoreError extends Error {
  constructor(readonly code: CreatorErrorCode) { super(code); this.name = 'CreatorStoreError'; }
}
export type CreatorResponse<K extends CreatorOperation> = Readonly<{ version: typeof CREATOR_API_VERSION; data: CreatorResults[K] }> |
  Readonly<{ version: typeof CREATOR_API_VERSION; error: Readonly<{ code: CreatorErrorCode; recovery?: 'original-only' }> }>;
const invalid = (): never => { throw new CreatorStoreError('INVALID_INPUT'); };
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const encoder = new TextEncoder();
const invalidUnicode = new RegExp('[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]', 'u');
type Json = null | string | number | boolean | readonly Json[] | { readonly [key: string]: Json };

/** Bounded immutable JSON capture. Accessors, prototypes, symbols, cycles and toJSON never execute. */
export function captureCreatorJson(value: unknown): Json { return captureJson(value, CREATOR_MAX_DEPTH); }
/** Owner envelopes contain nested read/recovery payloads; request depth remains four. */
export const CREATOR_MAX_RESPONSE_DEPTH = 6;
function captureJson(value: unknown, maximumDepth: number): Json {
  let nodes = 0;
  const parents = new Set<object>();
  function visit(v: unknown, depth: number): Json {
    if (++nodes > CREATOR_MAX_BODY_BYTES || depth > maximumDepth) return invalid();
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { if (encoder.encode(v).length > CREATOR_MAX_BODY_BYTES || invalidUnicode.test(v)) return invalid(); return v; }
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) return invalid(); return v; }
    if (typeof v !== 'object' || parents.has(v)) return invalid();
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return invalid();
    parents.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(descriptors);
    if (keys.length > CREATOR_MAX_BODY_BYTES || keys.some(k => typeof k !== 'string')) return invalid();
    let out: Json;
    if (array) {
      if (v.length > CREATOR_MAX_BODY_BYTES || keys.length !== v.length + 1) return invalid();
      out = Object.freeze(Array.from({ length: v.length }, (_, i) => {
        const d = descriptors[String(i)]; if (!d?.enumerable || !('value' in d)) return invalid(); return visit(d.value, depth + 1);
      }));
    } else {
      const entries = keys.map(k => { const d = descriptors[k as string]!; if (!d.enumerable || !('value' in d)) return invalid(); return [k, visit(d.value, depth + 1)] as const; });
      out = Object.freeze(Object.fromEntries(entries));
    }
    parents.delete(v); return out;
  }
  const out = visit(value, 0);
  if (encoder.encode(JSON.stringify(out)).length > CREATOR_MAX_BODY_BYTES) throw new CreatorStoreError('BODY_TOO_LARGE');
  return out;
}
export function creatorRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  return exactRecord(captureCreatorJson(value), required, optional);
}
function exactRecord(v: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  const r = v as Record<string, unknown>, keys = Object.keys(r);
  if (required.some(k => !hasOwn(r, k)) || keys.some(k => !required.includes(k) && !optional.includes(k))) return invalid();
  return r;
}
export function parseCreatorId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) return invalid(); return value;
}
export function parseCreatorDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return invalid(); return value;
}
export function creatorInteger(value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) return invalid(); return value;
}
export function creatorText(value: unknown, minimum: number, maximum: number, bytes: number): string {
  if (typeof value !== 'string' || [...value].length < minimum || [...value].length > maximum || encoder.encode(value).length > bytes ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value) || invalidUnicode.test(value)) return invalid(); return value;
}
export function parseCreatorSlug(value: unknown): string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    ['api','admin','assets','create','creator','checkout','storefront','storefronts','preview','settings','account','login','logout','signup','support','www','voidly','voidpay'].includes(value)) return invalid(); return value;
}
export function creatorPublicUrl(slug: string): string { return `${CREATOR_ORIGIN}/pay/marketplace/s/${parseCreatorSlug(slug)}`; }
export function parseCreatorConfig(value: unknown): CreatorConfig {
  const r = creatorRecord(value, ['version','name','description','brandPreset','templateId','serviceProjectionId']);
  if (r.version !== CREATOR_CONFIG_VERSION || r.templateId !== 'text-workbench-v1' || !['slate','ocean','forest'].includes(r.brandPreset as string)) return invalid();
  return Object.freeze({ version: CREATOR_CONFIG_VERSION, name: creatorText(r.name,1,64,256), description: creatorText(r.description,0,160,640),
    brandPreset: r.brandPreset as CreatorConfig['brandPreset'], templateId: 'text-workbench-v1', serviceProjectionId: parseCreatorId(r.serviceProjectionId) });
}
export function parseCreatorOperation(value: unknown): CreatorOperation {
  if (!(CREATOR_OPERATIONS as readonly unknown[]).includes(value)) return invalid(); return value as CreatorOperation;
}
export function parseCreatorRequest<K extends CreatorOperation>(operation: K, value: unknown): CreatorRequests[K] {
  const op = parseCreatorOperation(operation), raw = captureCreatorJson(value);
  let out: CreatorRequests[CreatorOperation];
  if (op === 'create') { const r=creatorRecord(raw,['idempotencyKey','slug']); out={idempotencyKey:parseCreatorId(r.idempotencyKey),slug:parseCreatorSlug(r.slug)}; }
  else if (op === 'save') { const r=creatorRecord(raw,['spaceId','idempotencyKey','expectedVersion','baseRevision','config'],['projectionDigest']); out={spaceId:parseCreatorId(r.spaceId),idempotencyKey:parseCreatorId(r.idempotencyKey),expectedVersion:creatorInteger(r.expectedVersion),baseRevision:creatorInteger(r.baseRevision,0,CREATOR_MAX_REVISIONS),config:parseCreatorConfig(r.config),...(r.projectionDigest===undefined?{}:{projectionDigest:parseCreatorDigest(r.projectionDigest)})}; }
  else if (op === 'read') {
    const r=creatorRecord(raw,[],['spaceId','revision']);
    if (hasOwn(r,'revision')&&!hasOwn(r,'spaceId')) return invalid();
    out={...(hasOwn(r,'spaceId')?{spaceId:parseCreatorId(r.spaceId)}:{}),...(hasOwn(r,'revision')?{revision:creatorInteger(r.revision,1,CREATOR_MAX_REVISIONS)}:{})};
  }
  else if (op === 'publish') { const r=creatorRecord(raw,['spaceId','idempotencyKey','expectedVersion','revision','configDigest']); out={spaceId:parseCreatorId(r.spaceId),idempotencyKey:parseCreatorId(r.idempotencyKey),expectedVersion:creatorInteger(r.expectedVersion),revision:creatorInteger(r.revision,1,CREATOR_MAX_REVISIONS),configDigest:parseCreatorDigest(r.configDigest)}; }
  else if (op === 'unpublish') { const r=creatorRecord(raw,['spaceId','idempotencyKey','expectedVersion','publicationId']); out={spaceId:parseCreatorId(r.spaceId),idempotencyKey:parseCreatorId(r.idempotencyKey),expectedVersion:creatorInteger(r.expectedVersion),publicationId:parseCreatorId(r.publicationId)}; }
  else {
    const r=creatorRecord(raw,['operation','idempotencyKey'],['spaceId']), original=parseCreatorOperation(r.operation);
    if (original === 'read' || original === 'recover' || (original === 'create') === hasOwn(r,'spaceId')) return invalid();
    out=original === 'create'?{operation:original,idempotencyKey:parseCreatorId(r.idempotencyKey)}:{operation:original,spaceId:parseCreatorId(r.spaceId),idempotencyKey:parseCreatorId(r.idempotencyKey)};
  }
  return Object.freeze(out) as CreatorRequests[K];
}
export function encodeCreatorConfig(value: unknown): string {
  const c=parseCreatorConfig(value);return JSON.stringify(['voidpay.creator.config',1,c.name,c.description,c.brandPreset,c.templateId,c.serviceProjectionId]);
}
/** All byte capture occurs synchronously before crypto is awaited. Operational errors remain distinct. */
export async function hashCreatorBytes(text: string): Promise<string> {
  const bytes=encoder.encode(text);
  try { const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''); }
  catch { throw new CreatorStoreError('HASH_UNAVAILABLE'); }
}
export function hashCreatorConfig(value: unknown): Promise<string> { return hashCreatorBytes(encodeCreatorConfig(value)); }
export function encodeCreatorRequest<K extends CreatorMutation>(ownerId: string, operation: K, value: CreatorRequests[K]): string {
  const owner=parseCreatorId(ownerId),op=parseCreatorOperation(operation);
  if (op === 'read' || op === 'recover') return invalid();
  const r=parseCreatorRequest(op,value);
  let fields: unknown[];
  if (op==='create') { const x=r as CreatorRequests['create'];fields=[x.slug]; }
  else if(op==='save') { const x=r as CreatorRequests['save'];fields=[x.spaceId,x.expectedVersion,x.baseRevision,JSON.parse(encodeCreatorConfig(x.config)),...(x.projectionDigest===undefined?[]:[x.projectionDigest])]; }
  else if(op==='publish') { const x=r as CreatorRequests['publish'];fields=[x.spaceId,x.expectedVersion,x.revision,x.configDigest]; }
  else { const x=r as CreatorRequests['unpublish'];fields=[x.spaceId,x.expectedVersion,x.publicationId]; }
  return JSON.stringify(['voidpay.creator.request',1,owner,op,r.idempotencyKey,...fields]);
}
export function hashCreatorRequest<K extends CreatorMutation>(ownerId: string, operation: K, value: CreatorRequests[K]): Promise<string> {
  return hashCreatorBytes(encodeCreatorRequest(ownerId,operation,value));
}
export function encodeCreatorPublication(value: CreatorPublicationCommitment): string {
  const r=creatorRecord(value,['spaceId','slug','publicationVersion','action','revision','configDigest','projectionDigest']);
  if(r.action!=='published'&&r.action!=='withdrawn')return invalid();
  return JSON.stringify(['voidpay.creator.publication',1,parseCreatorId(r.spaceId),parseCreatorSlug(r.slug),
    creatorInteger(r.publicationVersion,1,r.action==='published'?CREATOR_MAX_PUBLISH_VERSION:CREATOR_MAX_PUBLICATION_VERSION),r.action,
    creatorInteger(r.revision,1,CREATOR_MAX_REVISIONS),parseCreatorDigest(r.configDigest),parseCreatorDigest(r.projectionDigest)]);
}
export function hashCreatorPublication(value: CreatorPublicationCommitment): Promise<string> { return hashCreatorBytes(encodeCreatorPublication(value)); }

export const CREATOR_ERROR_CODES: readonly CreatorErrorCode[] = Object.freeze([
  'INVALID_INPUT', 'AUTH_REQUIRED', 'NOT_FOUND', 'CONFLICT', 'SLUG_CONFLICT', 'STALE_VERSION',
  'SERVICE_NOT_APPROVED', 'SERVICE_PROJECTION_CHANGED', 'LIMIT_REACHED', 'BODY_TOO_LARGE',
  'RATE_LIMITED', 'STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN', 'HASH_UNAVAILABLE',
]);

function nullableId(value: unknown): string | null { return value === null ? null : parseCreatorId(value); }
function parseSpace(value: unknown): CreatorSpace {
  const r = exactRecord(value, ['spaceId', 'slug', 'createKey', 'createRequestDigest', 'createdAtMs', 'stateVersion', 'headRevision', 'headRevisionId', 'publicationVersion', 'publicationId']);
  const out: CreatorSpace = Object.freeze({
    spaceId: parseCreatorId(r.spaceId), slug: parseCreatorSlug(r.slug), createKey: parseCreatorId(r.createKey),
    createRequestDigest: parseCreatorDigest(r.createRequestDigest), createdAtMs: creatorInteger(r.createdAtMs, 0),
    stateVersion: creatorInteger(r.stateVersion), headRevision: creatorInteger(r.headRevision, 0, CREATOR_MAX_REVISIONS),
    headRevisionId: nullableId(r.headRevisionId), publicationVersion: creatorInteger(r.publicationVersion, 0, CREATOR_MAX_PUBLICATION_VERSION), publicationId: nullableId(r.publicationId),
  });
  if ((out.headRevision === 0) !== (out.headRevisionId === null) ||
      (out.publicationVersion === 0) !== (out.publicationId === null) ||
      (out.headRevision === 0 && out.publicationVersion !== 0)) return invalid();
  return out;
}
function parseRevision(value: unknown): CreatorRevision {
  const r = exactRecord(value, ['spaceId', 'revisionId', 'revision', 'baseRevision', 'idempotencyKey', 'requestDigest', 'configDigest', 'config', 'createdAtMs']);
  const out: CreatorRevision = Object.freeze({
    spaceId: parseCreatorId(r.spaceId), revisionId: parseCreatorId(r.revisionId), revision: creatorInteger(r.revision, 1, CREATOR_MAX_REVISIONS),
    baseRevision: creatorInteger(r.baseRevision, 0, CREATOR_MAX_REVISIONS), idempotencyKey: parseCreatorId(r.idempotencyKey),
    requestDigest: parseCreatorDigest(r.requestDigest), configDigest: parseCreatorDigest(r.configDigest), config: parseCreatorConfig(r.config), createdAtMs: creatorInteger(r.createdAtMs, 0),
  });
  if (out.baseRevision >= out.revision) return invalid();
  return out;
}
function parsePublication(value: unknown): CreatorPublication {
  const r = exactRecord(value, ['spaceId', 'slug', 'publicationVersion', 'action', 'revision', 'configDigest', 'projectionDigest',
    'publicationId', 'revisionId', 'idempotencyKey', 'requestDigest', 'publicationDigest', 'createdAtMs', 'config', 'service', 'publicUrl']);
  if (r.action !== 'published' && r.action !== 'withdrawn') return invalid();
  const slug = parseCreatorSlug(r.slug), action = r.action;
  if (r.publicUrl !== (action === 'published' ? creatorPublicUrl(slug) : null)) return invalid();
  const out: CreatorPublication = Object.freeze({
    spaceId: parseCreatorId(r.spaceId), slug, publicationVersion: creatorInteger(r.publicationVersion, 1, action === 'published' ? CREATOR_MAX_PUBLISH_VERSION : CREATOR_MAX_PUBLICATION_VERSION), action,
    revision: creatorInteger(r.revision, 1, CREATOR_MAX_REVISIONS), configDigest: parseCreatorDigest(r.configDigest), projectionDigest: parseCreatorDigest(r.projectionDigest),
    publicationId: parseCreatorId(r.publicationId), revisionId: parseCreatorId(r.revisionId), idempotencyKey: parseCreatorId(r.idempotencyKey),
    requestDigest: parseCreatorDigest(r.requestDigest), publicationDigest: parseCreatorDigest(r.publicationDigest), createdAtMs: creatorInteger(r.createdAtMs, 0),
    config: parseCreatorConfig(r.config), service: parsePublicServiceProjection(r.service), publicUrl: action === 'published' ? creatorPublicUrl(slug) : null,
  });
  if (out.config.serviceProjectionId !== out.service.projectionId) return invalid();
  return out;
}
function parseRead(value: unknown): CreatorRead | null {
  if (value === null) return null;
  const r = exactRecord(value, ['space', 'revision', 'publication']);
  const space = parseSpace(r.space), revision = r.revision === null ? null : parseRevision(r.revision), publication = r.publication === null ? null : parsePublication(r.publication);
  if ((revision === null) !== (space.headRevision === 0) || (publication === null) !== (space.publicationVersion === 0)) return invalid();
  // A read of an explicit historical revision need not return the current head.
  if (revision && (revision.spaceId !== space.spaceId || revision.revision > space.headRevision ||
      (revision.revision === space.headRevision && revision.revisionId !== space.headRevisionId))) return invalid();
  if (publication && (publication.spaceId !== space.spaceId || publication.slug !== space.slug ||
      publication.publicationId !== space.publicationId || publication.publicationVersion !== space.publicationVersion || publication.revision > space.headRevision)) return invalid();
  if (revision && publication && revision.revision === publication.revision &&
      (revision.revisionId !== publication.revisionId || revision.configDigest !== publication.configDigest || encodeCreatorConfig(revision.config) !== encodeCreatorConfig(publication.config))) return invalid();
  return Object.freeze({ space, revision, publication });
}
function parseResult<K extends CreatorOperation>(operation: K, value: unknown): CreatorResults[K] {
  let out: CreatorResults[CreatorOperation];
  if (operation === 'create') out = parseSpace(value);
  else if (operation === 'save') out = parseRevision(value);
  else if (operation === 'read') out = parseRead(value);
  else if (operation === 'publish' || operation === 'unpublish') {
    const publication = parsePublication(value);
    if (publication.action !== (operation === 'publish' ? 'published' : 'withdrawn')) return invalid();
    out = publication;
  } else if (value === null) out = null;
  else {
    const r = exactRecord(value, ['operation', 'data']), original = parseCreatorOperation(r.operation);
    if (original === 'read' || original === 'recover') return invalid();
    out = Object.freeze({ operation: original, data: parseResult(original, r.data) }) as CreatorRecovery;
  }
  return out as CreatorResults[K];
}
/** Strict shape capture only. Successful owner data also requires verifyCreatorResult before use. */
export function parseCreatorResponse<K extends CreatorOperation>(operation: K, value: unknown): CreatorResponse<K> {
  const op = parseCreatorOperation(operation), captured = captureJson(value, CREATOR_MAX_RESPONSE_DEPTH);
  const r = exactRecord(captured, ['version'], ['data', 'error']);
  if (r.version !== CREATOR_API_VERSION || hasOwn(r, 'data') === hasOwn(r, 'error')) return invalid();
  if (hasOwn(r, 'error')) {
    const e = exactRecord(r.error, ['code'], ['recovery']);
    if (!(CREATOR_ERROR_CODES as readonly unknown[]).includes(e.code) || (hasOwn(e, 'recovery') && e.recovery !== 'original-only')) return invalid();
    return Object.freeze({ version: CREATOR_API_VERSION, error: Object.freeze({ code: e.code as CreatorErrorCode, ...(hasOwn(e, 'recovery') ? { recovery: 'original-only' as const } : {}) }) });
  }
  return Object.freeze({ version: CREATOR_API_VERSION, data: parseResult(op, r.data) }) as CreatorResponse<K>;
}
/** Capture precedes the first await; mutations of caller objects cannot change verified bytes. */
export async function verifyCreatorResult<K extends CreatorOperation>(operation: K, value: CreatorResults[K]): Promise<CreatorResults[K]> {
  const op = parseCreatorOperation(operation) as K, data = parseResult(op, captureJson(value, CREATOR_MAX_RESPONSE_DEPTH));
  async function verifyRevision(revision: Pick<CreatorRevision, 'config' | 'configDigest'>): Promise<void> {
    if (await hashCreatorConfig(revision.config) !== revision.configDigest) return invalid();
  }
  async function verifyPublication(publication: CreatorPublication): Promise<void> {
    await verifyRevision(publication);
    if (await hashPublicServiceProjection(publication.service) !== publication.projectionDigest) return invalid();
    const { spaceId, slug, publicationVersion, action, revision, configDigest, projectionDigest } = publication;
    if (await hashCreatorPublication({ spaceId, slug, publicationVersion, action, revision, configDigest, projectionDigest }) !== publication.publicationDigest) return invalid();
  }
  async function verify(original: CreatorOperation, result: CreatorResults[CreatorOperation]): Promise<void> {
    if (result === null || original === 'create') return;
    if (original === 'save') await verifyRevision(result as CreatorRevision);
    else if (original === 'publish' || original === 'unpublish') await verifyPublication(result as CreatorPublication);
    else if (original === 'read') {
      const read = result as CreatorRead;
      if (read.revision) await verifyRevision(read.revision);
      if (read.publication) await verifyPublication(read.publication);
    } else { const recovery = result as CreatorRecovery; await verify(recovery.operation, recovery.data); }
  }
  await verify(op, data);
  return data;
}
/** Public lookup success is this direct DTO, never an owner response envelope.
 * The DTO omits publication commitment inputs; publicationDigest is preserved, not independently verified. */
export function parsePublicStorefront(value: unknown): PublicStorefront {
  const r = exactRecord(captureJson(value, CREATOR_MAX_RESPONSE_DEPTH), ['version', 'slug', 'publicationVersion', 'publicationDigest', 'publishedAt', 'config', 'service', 'checkout']);
  if (r.version !== PUBLIC_STOREFRONT_VERSION) return invalid();
  const config = parseCreatorConfig(r.config), service = parsePublishedServiceProjection(r.service);
  if (config.serviceProjectionId !== service.projectionId) return invalid();
  let checkout: PublicStorefront['checkout'];
  if (service.projectionId.startsWith('qualified-')) {
    const c = exactRecord(r.checkout, ['href', 'access', 'availability', 'selection']);
    if (c.href !== null || c.access !== 'not-open' || c.availability !== 'not-asserted') return invalid();
    const selection = exactRecord(c.selection, ['serviceRef', 'projectionDigest']);
    const ref = exactRecord(selection.serviceRef, ['providerId', 'serviceId', 'version', 'definitionDigest']);
    if (Object.entries(service.serviceRef).some(([key, value]) => ref[key] !== value)) return invalid();
    checkout = Object.freeze({ href: null, access: 'not-open', availability: 'not-asserted',
      selection: Object.freeze({ serviceRef: service.serviceRef, projectionDigest: parseCreatorDigest(selection.projectionDigest) }) });
  } else {
    const c = exactRecord(r.checkout, ['href', 'access', 'availability']);
    if (c.href !== '/pay/marketplace/checkout' || c.access !== 'invited-only' || c.availability !== 'not-asserted') return invalid();
    checkout = Object.freeze({ href: '/pay/marketplace/checkout', access: 'invited-only', availability: 'not-asserted' });
  }
  return Object.freeze({ version: PUBLIC_STOREFRONT_VERSION, slug: parseCreatorSlug(r.slug), publicationVersion: creatorInteger(r.publicationVersion, 1, CREATOR_MAX_PUBLISH_VERSION),
    publicationDigest: parseCreatorDigest(r.publicationDigest), publishedAt: creatorInteger(r.publishedAt, 0), config, service,
    checkout,
  });
}
