/** Browser-owned mirror of Worker creatorCollectionProtocol.ts at 9d4601950046eaae4e147ea4fc152d8c6827f84b.
 * Imports are local browser equivalents; canonical parity uses independently generated pinned vectors. */
/** Collection presentation only. These parsers do not qualify a service or grant payment authority. */
import {
  CREATOR_MAX_PUBLISH_VERSION, CREATOR_MAX_REVISIONS, CreatorStoreError,
  creatorInteger, creatorText, encodeCreatorPublication, encodeCreatorRequest, hashCreatorBytes,
  parseCreatorDigest, parseCreatorId, parseCreatorOperation, parseCreatorRequest, parseCreatorSlug,
  type CreatorMutation, type CreatorOperation, type CreatorPublication,
  type CreatorPublicationCommitment, type CreatorRequests, type CreatorRevision, type CreatorSpace,
} from './marketplacePublishingProtocol';
import {
  hashPublicServiceProjection, parsePublicServiceProjection, type PublicServiceProjection,
} from './marketplacePublicService';
import { qualifiedDefinitionDigest } from './marketplaceQualifiedInventory';

export const CREATOR_COLLECTION_CONFIG_VERSION = 'voidpay.creator-presentation.v2' as const;
export const CREATOR_COLLECTION_API_VERSION = 'voidpay.creator-api.v2' as const;
export const CREATOR_COLLECTION_SNAPSHOT_VERSION = 'voidpay.creator-projections.v2' as const;
export const CREATOR_COLLECTION_PUBLICATION_VERSION = 'voidpay.creator-publication.v2' as const;
export const PUBLIC_STOREFRONT_V2_VERSION = 'voidpay.public-storefront.v2' as const;
export const CREATOR_COLLECTION_ROUTE_PREFIX = '/v2/marketplace/creator/' as const;
export const PUBLIC_STOREFRONT_V2_PREFIX = '/v2/marketplace/storefronts/' as const;
export const CREATOR_COLLECTION_MAX_SERVICES = 16;
export const CREATOR_COLLECTION_MAX_BODY_BYTES = 16 * 1024;
export const CREATOR_COLLECTION_MAX_RESPONSE_BYTES = 128 * 1024;
export const CREATOR_COLLECTION_MAX_CONFIG_BYTES = 8 * 1024;
export const CREATOR_COLLECTION_MAX_SNAPSHOT_BYTES = 64 * 1024;
export const CREATOR_COLLECTION_MAX_SERVICE_BYTES = 4 * 1024;
export const CREATOR_COLLECTION_MAX_DEPTH = 8;
export const CREATOR_COLLECTION_MAX_REQUEST_DEPTH = 4;

export type CreatorConfigV2 = Readonly<{
  version: typeof CREATOR_COLLECTION_CONFIG_VERSION;
  name: string;
  description: string;
  brandPreset: 'slate' | 'ocean' | 'forest';
  templateId: 'service-collection-v2';
  serviceProjectionIds: readonly string[];
}>;
export type CreatorSaveV2 = Readonly<{
  spaceId: string;
  idempotencyKey: string;
  expectedVersion: number;
  baseRevision: number;
  config: CreatorConfigV2;
  projectionDigests: readonly string[];
}>;
export type CreatorRequestsV2 = Omit<CreatorRequests, 'save'> & { save: CreatorSaveV2 };
export type CollectionEntryV2 = Readonly<{
  service: PublicServiceProjection;
  projectionDigest: string;
}>;
export type CollectionSnapshotV2 = Readonly<{
  version: typeof CREATOR_COLLECTION_SNAPSHOT_VERSION;
  entries: readonly CollectionEntryV2[];
}>;
export type CreatorRevisionV2 = Omit<CreatorRevision, 'config'> & Readonly<{
  config: CreatorConfigV2;
  expectedVersion: number;
  projectionDigests: readonly string[];
}>;
export type CreatorPublicationV2 = Omit<CreatorPublication, 'config' | 'service'> & Readonly<{
  version: typeof CREATOR_COLLECTION_PUBLICATION_VERSION;
  config: CreatorConfigV2;
  entries: readonly CollectionEntryV2[];
}>;
/** V2 reads may carry historical V1 records; readers must retain their original version and bytes. */
export type CreatorReadV2 = Readonly<{
  space: CreatorSpace;
  revision: CreatorRevision | CreatorRevisionV2 | null;
  publication: CreatorPublication | CreatorPublicationV2 | null;
}>;
export type CollectionCheckoutV2 = Readonly<{
  href: null;
  access: 'not-open';
  availability: 'not-asserted';
}>;
export type PublicStorefrontV2 = Readonly<{
  version: typeof PUBLIC_STOREFRONT_V2_VERSION;
  slug: string;
  publicationVersion: number;
  publicationDigest: string;
  publishedAt: number;
  config: CreatorConfigV2;
  projectionDigest: string;
  entries: readonly (CollectionEntryV2 & Readonly<{ checkout?: CollectionCheckoutV2 }>)[];
}>;

type Json = null | string | number | boolean | readonly Json[] | { readonly [key: string]: Json };
export type CreatorCollectionJsonKind = 'request' | 'response' | 'config' | 'snapshot';
const CAPTURE_LIMITS = Object.freeze({
  request: { bytes: CREATOR_COLLECTION_MAX_BODY_BYTES, depth: CREATOR_COLLECTION_MAX_REQUEST_DEPTH },
  response: { bytes: CREATOR_COLLECTION_MAX_RESPONSE_BYTES, depth: CREATOR_COLLECTION_MAX_DEPTH },
  config: { bytes: CREATOR_COLLECTION_MAX_CONFIG_BYTES, depth: CREATOR_COLLECTION_MAX_REQUEST_DEPTH },
  snapshot: { bytes: CREATOR_COLLECTION_MAX_SNAPSHOT_BYTES, depth: CREATOR_COLLECTION_MAX_DEPTH },
});
const encoder = new TextEncoder();
const invalid = (): never => { throw new CreatorStoreError('INVALID_INPUT'); };
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
// Same Worker expression; construction keeps this module compatible with the browser's ES5 TypeScript target.
const loneSurrogate = new RegExp('[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]', 'u');

function enforceBytes(value: Json, maximum: number): void {
  if (encoder.encode(JSON.stringify(value)).length > maximum) throw new CreatorStoreError('BODY_TOO_LARGE');
}

/** Capture the whole graph synchronously; descriptors are read without invoking getters or toJSON. */
export function captureCreatorCollectionJson(value: unknown, kind: CreatorCollectionJsonKind = 'request'): Json {
  if (!own(CAPTURE_LIMITS, kind)) return invalid();
  const limit = CAPTURE_LIMITS[kind], parents = new Set<object>();
  let nodes = 0, usedBytes = 0;
  function consume(bytes: number): void {
    usedBytes += bytes;
    if (usedBytes > limit.bytes) throw new CreatorStoreError('BODY_TOO_LARGE');
  }
  function consumeString(text: string): void {
    // Every UTF-16 code unit costs at least one JSON byte. Refuse before encoding a large value.
    if (text.length + 2 > limit.bytes - usedBytes) throw new CreatorStoreError('BODY_TOO_LARGE');
    if (loneSurrogate.test(text)) return invalid();
    consume(2);
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if (char === '"' || char === '\\') consume(2);
      else if (code <= 0x1f) consume([8, 9, 10, 12, 13].includes(code) ? 2 : 6);
      else consume(code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
    }
  }
  function visit(input: unknown, depth: number): Json {
    if (++nodes > limit.bytes || depth > limit.depth) return invalid();
    if (input === null || typeof input === 'boolean') { consume(input === false ? 5 : 4); return input; }
    if (typeof input === 'string') {
      consumeString(input);
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isSafeInteger(input) || Object.is(input, -0)) return invalid();
      consume(String(input).length);
      return input;
    }
    if (typeof input !== 'object' || parents.has(input)) return invalid();
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return invalid();
    consume(2);
    parents.add(input);
    const keys = Reflect.ownKeys(input);
    if (keys.length > limit.bytes || keys.some(key => typeof key !== 'string')) return invalid();
    // Bound even descriptor allocation using the smallest possible JSON representation.
    if ((array ? Math.max(0, 2 * keys.length - 3) : keys.length * 4) > limit.bytes - usedBytes)
      throw new CreatorStoreError('BODY_TOO_LARGE');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    let output: Json;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > limit.bytes || keys.length !== length + 1) return invalid();
      output = Object.freeze(Array.from({ length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !own(descriptor, 'value')) return invalid();
        if (index > 0) consume(1);
        return visit(descriptor.value, depth + 1);
      }));
    } else {
      output = Object.freeze(Object.fromEntries(keys.map((key, index) => {
        const descriptor = descriptors[key as string]!;
        if (!descriptor.enumerable || !own(descriptor, 'value')) return invalid();
        if (index > 0) consume(1);
        consumeString(key as string);
        consume(1);
        return [key, visit(descriptor.value, depth + 1)];
      })));
    }
    parents.delete(input);
    return output;
  }
  const captured = visit(value, 0);
  enforceBytes(captured, limit.bytes);
  return captured;
}

/** Internal helpers only receive the captured, frozen JSON graph. */
function record(value: Json, required: readonly string[], optional: readonly string[] = []): Record<string, Json> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const result = value as Record<string, Json>, keys = Object.keys(result);
  if (required.some(key => !own(result, key)) || keys.some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return result;
}
function members(value: Json): readonly Json[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > CREATOR_COLLECTION_MAX_SERVICES) return invalid();
  return value;
}
function parseConfig(value: Json): CreatorConfigV2 {
  enforceBytes(value, CREATOR_COLLECTION_MAX_CONFIG_BYTES);
  const r = record(value, ['version', 'name', 'description', 'brandPreset', 'templateId', 'serviceProjectionIds']);
  if (r.version !== CREATOR_COLLECTION_CONFIG_VERSION || r.templateId !== 'service-collection-v2' ||
      !['slate', 'ocean', 'forest'].includes(r.brandPreset as string)) return invalid();
  const ids = members(r.serviceProjectionIds).map(value => {
    const id = parseCreatorId(value);
    qualifiedDefinitionDigest(id);
    return id;
  });
  if (new Set(ids).size !== ids.length) return invalid();
  return Object.freeze({
    version: CREATOR_COLLECTION_CONFIG_VERSION,
    name: creatorText(r.name, 1, 64, 256),
    description: creatorText(r.description, 0, 160, 640),
    brandPreset: r.brandPreset as CreatorConfigV2['brandPreset'],
    templateId: 'service-collection-v2',
    serviceProjectionIds: Object.freeze(ids),
  });
}
export function parseCreatorConfigV2(value: unknown): CreatorConfigV2 {
  return parseConfig(captureCreatorCollectionJson(value, 'config'));
}
export function parseCreatorRequestV2<K extends CreatorOperation>(operation: K, value: unknown): CreatorRequestsV2[K] {
  const op = parseCreatorOperation(operation);
  if (op !== 'save') return parseCreatorRequest(op, value) as CreatorRequestsV2[K];
  const raw = captureCreatorCollectionJson(value, 'request');
  const r = record(raw, ['spaceId', 'idempotencyKey', 'expectedVersion', 'baseRevision', 'config', 'projectionDigests']);
  const config = parseConfig(r.config), digests = members(r.projectionDigests).map(parseCreatorDigest);
  if (digests.length !== config.serviceProjectionIds.length) return invalid();
  return Object.freeze({
    spaceId: parseCreatorId(r.spaceId), idempotencyKey: parseCreatorId(r.idempotencyKey),
    expectedVersion: creatorInteger(r.expectedVersion), baseRevision: creatorInteger(r.baseRevision, 0, CREATOR_MAX_REVISIONS),
    config, projectionDigests: Object.freeze(digests),
  }) as CreatorRequestsV2[K];
}
function configTuple(config: CreatorConfigV2): Json {
  return ['voidpay.creator.config', 2, config.name, config.description, config.brandPreset, config.templateId, config.serviceProjectionIds];
}
export function encodeCreatorConfigV2(value: unknown): string {
  return JSON.stringify(configTuple(parseCreatorConfigV2(value)));
}
export function hashCreatorConfigV2(value: unknown): Promise<string> {
  return hashCreatorBytes(encodeCreatorConfigV2(value));
}
export function encodeCreatorRequestV2<K extends CreatorMutation>(ownerId: string, operation: K, value: CreatorRequestsV2[K]): string {
  const owner = parseCreatorId(ownerId), op = parseCreatorOperation(operation);
  if (op === 'read' || op === 'recover') return invalid();
  if (op !== 'save') return encodeCreatorRequest(owner, op, value as CreatorRequests[typeof op]);
  const r = parseCreatorRequestV2('save', value);
  return JSON.stringify(['voidpay.creator.request', 2, owner, 'save', r.idempotencyKey,
    r.spaceId, r.expectedVersion, r.baseRevision, configTuple(r.config), r.projectionDigests]);
}
export function hashCreatorRequestV2<K extends CreatorMutation>(ownerId: string, operation: K, value: CreatorRequestsV2[K]): Promise<string> {
  return hashCreatorBytes(encodeCreatorRequestV2(ownerId, operation, value));
}
export function encodeCreatorPublicationV2(value: CreatorPublicationCommitment): string {
  // Reuse the unchanged V1 metadata validation, including its reserved final withdrawal event.
  const tuple: Json[] = JSON.parse(encodeCreatorPublication(value));
  tuple[1] = 2;
  return JSON.stringify(tuple);
}
export function hashCreatorPublicationV2(value: CreatorPublicationCommitment): Promise<string> {
  return hashCreatorBytes(encodeCreatorPublicationV2(value));
}

function parseEntry(value: Json): CollectionEntryV2 {
  const r = record(value, ['service', 'projectionDigest']);
  enforceBytes(r.service, CREATOR_COLLECTION_MAX_SERVICE_BYTES);
  const service = parsePublicServiceProjection(r.service);
  if (qualifiedDefinitionDigest(service.projectionId) !== service.serviceRef.definitionDigest) return invalid();
  return Object.freeze({ service, projectionDigest: parseCreatorDigest(r.projectionDigest) });
}
function parseSnapshot(config: CreatorConfigV2, value: Json): CollectionSnapshotV2 {
  const r = record(value, ['version', 'entries']);
  if (r.version !== CREATOR_COLLECTION_SNAPSHOT_VERSION) return invalid();
  const entries = members(r.entries).map(parseEntry);
  if (entries.length !== config.serviceProjectionIds.length ||
      entries.some((entry, index) => entry.service.projectionId !== config.serviceProjectionIds[index])) return invalid();
  return Object.freeze({ version: CREATOR_COLLECTION_SNAPSHOT_VERSION, entries: Object.freeze(entries) });
}
async function verifyEntries(snapshot: CollectionSnapshotV2): Promise<void> {
  await Promise.all(snapshot.entries.map(async entry => {
    if (await hashPublicServiceProjection(entry.service) !== entry.projectionDigest) return invalid();
  }));
}
function collectionBytes(snapshot: CollectionSnapshotV2): string {
  return JSON.stringify(['voidpay.creator.projections', 2,
    snapshot.entries.map(entry => [entry.service.projectionId, entry.projectionDigest])]);
}
/** Checks descriptive integrity only. A current qualified inventory lookup is still required on save/publish. */
export async function parseCollectionSnapshotV2(config: unknown, value: unknown): Promise<CollectionSnapshotV2> {
  const parsedConfig = parseCreatorConfigV2(config);
  const snapshot = parseSnapshot(parsedConfig, captureCreatorCollectionJson(value, 'snapshot'));
  await verifyEntries(snapshot);
  return snapshot;
}
export async function encodeCollectionSnapshotV2(config: unknown, value: unknown): Promise<string> {
  return collectionBytes(await parseCollectionSnapshotV2(config, value));
}
export async function hashCollectionSnapshotV2(config: unknown, value: unknown): Promise<string> {
  return hashCreatorBytes(await encodeCollectionSnapshotV2(config, value));
}

function parseCheckout(value: Json): CollectionCheckoutV2 {
  const r = record(value, ['href', 'access', 'availability']);
  if (r.href !== null || r.access !== 'not-open' || r.availability !== 'not-asserted') return invalid();
  return Object.freeze({ href: null, access: 'not-open', availability: 'not-asserted' });
}
/** Checks the collection commitment, not independent authenticity of the server's publication digest. */
export async function parsePublicStorefrontV2(value: unknown): Promise<PublicStorefrontV2> {
  const r = record(captureCreatorCollectionJson(value, 'response'), [
    'version', 'slug', 'publicationVersion', 'publicationDigest', 'publishedAt', 'config', 'projectionDigest', 'entries',
  ]);
  if (r.version !== PUBLIC_STOREFRONT_V2_VERSION) return invalid();
  const config = parseConfig(r.config);
  const entries = Object.freeze(members(r.entries).map(value => {
    const item = record(value, ['service', 'projectionDigest'], ['checkout']);
    const entry = parseEntry({ service: item.service, projectionDigest: item.projectionDigest });
    return Object.freeze({ ...entry, ...(own(item, 'checkout') ? { checkout: parseCheckout(item.checkout) } : {}) });
  }));
  const parsed: PublicStorefrontV2 = Object.freeze({
    version: PUBLIC_STOREFRONT_V2_VERSION, slug: parseCreatorSlug(r.slug),
    publicationVersion: creatorInteger(r.publicationVersion, 1, CREATOR_MAX_PUBLISH_VERSION),
    publicationDigest: parseCreatorDigest(r.publicationDigest), publishedAt: creatorInteger(r.publishedAt),
    config, projectionDigest: parseCreatorDigest(r.projectionDigest), entries,
  });
  // Capture/check the stored form too; public checkout metadata is not part of that snapshot or its digest.
  const snapshot = parseSnapshot(config, captureCreatorCollectionJson({
    version: CREATOR_COLLECTION_SNAPSHOT_VERSION,
    entries: entries.map(({ service, projectionDigest }) => ({ service, projectionDigest })),
  }, 'snapshot'));
  await verifyEntries(snapshot);
  if (await hashCreatorBytes(collectionBytes(snapshot)) !== parsed.projectionDigest) return invalid();
  return parsed;
}

// Browser owner-envelope decoding is additive. The Worker mirror above stays
// pinned; historical records below delegate to the original browser V1 parser.
import {
  CREATOR_API_VERSION, CREATOR_ERROR_CODES, CREATOR_MAX_PUBLICATION_VERSION,
  creatorPublicUrl, encodeCreatorConfig, parseCreatorResponse, parsePublicStorefront,
  verifyCreatorResult, type CreatorErrorCode, type CreatorResults, type PublicStorefront,
} from './marketplacePublishingProtocol';

export type CreatorRecoveryV2 = { [K in CreatorMutation]: Readonly<{ operation: K; data: CreatorResultsV2[K] }> }[CreatorMutation];
export type CreatorResultsV2 = {
  create: CreatorSpace;
  save: CreatorRevision | CreatorRevisionV2;
  read: CreatorReadV2 | null;
  publish: CreatorPublication | CreatorPublicationV2;
  unpublish: CreatorPublication | CreatorPublicationV2;
  recover: CreatorRecoveryV2 | null;
};
export type CreatorErrorCodeV2 = CreatorErrorCode | 'UNSUPPORTED_VERSION';
export type CreatorResponseV2<K extends CreatorOperation> =
  Readonly<{ version: typeof CREATOR_COLLECTION_API_VERSION; data: CreatorResultsV2[K] }> |
  Readonly<{ version: typeof CREATOR_COLLECTION_API_VERSION; error: Readonly<{ code: CreatorErrorCodeV2; recovery?: 'original-only' }> }>;

async function legacyResult<K extends CreatorOperation>(operation: K, value: Json): Promise<CreatorResults[K]> {
  const envelope = parseCreatorResponse(operation, { version: CREATOR_API_VERSION, data: value });
  if ('error' in envelope) return invalid();
  return verifyCreatorResult(operation, envelope.data);
}
function configEncoding(config: CreatorRevision['config'] | CreatorConfigV2): string {
  return config.version === CREATOR_COLLECTION_CONFIG_VERSION ? encodeCreatorConfigV2(config) : encodeCreatorConfig(config);
}
async function parseRevisionCompatible(value: Json): Promise<CreatorRevision | CreatorRevisionV2> {
  const tagged = record(value, ['config'], ['spaceId', 'revisionId', 'revision', 'baseRevision', 'idempotencyKey',
    'requestDigest', 'configDigest', 'createdAtMs', 'expectedVersion', 'projectionDigests']);
  const configRecord = record(tagged.config, ['version'], ['name', 'description', 'brandPreset', 'templateId', 'serviceProjectionId', 'serviceProjectionIds']);
  if (configRecord.version !== CREATOR_COLLECTION_CONFIG_VERSION) return legacyResult('save', value);
  const r = record(value, ['spaceId', 'revisionId', 'revision', 'baseRevision', 'idempotencyKey', 'requestDigest',
    'configDigest', 'config', 'createdAtMs', 'expectedVersion', 'projectionDigests']);
  const config = parseConfig(r.config), projectionDigests = Object.freeze(members(r.projectionDigests).map(parseCreatorDigest));
  if (projectionDigests.length !== config.serviceProjectionIds.length) return invalid();
  const revision: CreatorRevisionV2 = Object.freeze({
    spaceId: parseCreatorId(r.spaceId), revisionId: parseCreatorId(r.revisionId), revision: creatorInteger(r.revision, 1, CREATOR_MAX_REVISIONS),
    baseRevision: creatorInteger(r.baseRevision, 0, CREATOR_MAX_REVISIONS), idempotencyKey: parseCreatorId(r.idempotencyKey),
    requestDigest: parseCreatorDigest(r.requestDigest), configDigest: parseCreatorDigest(r.configDigest), config,
    createdAtMs: creatorInteger(r.createdAtMs, 0),
    expectedVersion: creatorInteger(r.expectedVersion), projectionDigests,
  });
  if (revision.baseRevision >= revision.revision || await hashCreatorConfigV2(revision.config) !== revision.configDigest) return invalid();
  return revision;
}
async function parsePublicationCompatible(value: Json, operation: 'publish' | 'unpublish'): Promise<CreatorPublication | CreatorPublicationV2> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  if (!own(value, 'version')) return legacyResult(operation, value);
  const r = record(value, ['version', 'spaceId', 'slug', 'publicationVersion', 'action', 'revision', 'configDigest', 'projectionDigest',
    'publicationId', 'revisionId', 'idempotencyKey', 'requestDigest', 'publicationDigest', 'createdAtMs', 'config', 'entries', 'publicUrl']);
  if (r.version !== CREATOR_COLLECTION_PUBLICATION_VERSION || r.action !== (operation === 'publish' ? 'published' : 'withdrawn')) return invalid();
  const slug = parseCreatorSlug(r.slug), action = r.action, config = parseConfig(r.config);
  if (r.publicUrl !== (action === 'published' ? creatorPublicUrl(slug) : null)) return invalid();
  const snapshot = parseSnapshot(config, captureCreatorCollectionJson({ version: CREATOR_COLLECTION_SNAPSHOT_VERSION, entries: r.entries }, 'snapshot'));
  const publication: CreatorPublicationV2 = Object.freeze({
    version: CREATOR_COLLECTION_PUBLICATION_VERSION, spaceId: parseCreatorId(r.spaceId), slug,
    publicationVersion: creatorInteger(r.publicationVersion, 1, action === 'published' ? CREATOR_MAX_PUBLISH_VERSION : CREATOR_MAX_PUBLICATION_VERSION), action,
    revision: creatorInteger(r.revision, 1, CREATOR_MAX_REVISIONS), configDigest: parseCreatorDigest(r.configDigest), projectionDigest: parseCreatorDigest(r.projectionDigest),
    publicationId: parseCreatorId(r.publicationId), revisionId: parseCreatorId(r.revisionId), idempotencyKey: parseCreatorId(r.idempotencyKey),
    requestDigest: parseCreatorDigest(r.requestDigest), publicationDigest: parseCreatorDigest(r.publicationDigest), createdAtMs: creatorInteger(r.createdAtMs, 0),
    config, entries: snapshot.entries, publicUrl: action === 'published' ? creatorPublicUrl(slug) : null,
  });
  await verifyEntries(snapshot);
  if (await hashCreatorConfigV2(config) !== publication.configDigest ||
    await hashCreatorBytes(collectionBytes(snapshot)) !== publication.projectionDigest) return invalid();
  const { spaceId, publicationVersion, revision, configDigest, projectionDigest } = publication;
  if (await hashCreatorPublicationV2({ spaceId, slug, publicationVersion, action, revision, configDigest, projectionDigest }) !== publication.publicationDigest) return invalid();
  return publication;
}
async function parseReadCompatible(value: Json): Promise<CreatorReadV2 | null> {
  if (value === null) return null;
  const r = record(value, ['space', 'revision', 'publication']);
  const space = await legacyResult('create', r.space);
  const revision = r.revision === null ? null : await parseRevisionCompatible(r.revision);
  let publication: CreatorPublication | CreatorPublicationV2 | null = null;
  if (r.publication !== null) {
    const p = r.publication;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return invalid();
    const action = (p as Record<string, Json>).action;
    if (action !== 'published' && action !== 'withdrawn') return invalid();
    publication = await parsePublicationCompatible(p, action === 'published' ? 'publish' : 'unpublish');
  }
  if ((revision === null) !== (space.headRevision === 0) || (publication === null) !== (space.publicationVersion === 0)) return invalid();
  if (revision && (revision.spaceId !== space.spaceId || revision.revision > space.headRevision ||
    (revision.revision === space.headRevision && revision.revisionId !== space.headRevisionId))) return invalid();
  if (publication && (publication.spaceId !== space.spaceId || publication.slug !== space.slug ||
    publication.publicationId !== space.publicationId || publication.publicationVersion !== space.publicationVersion || publication.revision > space.headRevision)) return invalid();
  if (revision && publication && revision.revision === publication.revision) {
    if (revision.revisionId !== publication.revisionId || revision.configDigest !== publication.configDigest ||
      configEncoding(revision.config) !== configEncoding(publication.config)) return invalid();
    if ('projectionDigests' in revision && 'entries' in publication) {
      const entries = publication.entries;
      if (revision.projectionDigests.length !== entries.length ||
        revision.projectionDigests.some((digest, index) => digest !== entries[index].projectionDigest)) return invalid();
    }
  }
  return Object.freeze({ space, revision, publication });
}
async function parseResultCompatible<K extends CreatorOperation>(operation: K, value: Json): Promise<CreatorResultsV2[K]> {
  let result: CreatorResultsV2[CreatorOperation];
  if (operation === 'create') result = await legacyResult('create', value);
  else if (operation === 'save') result = await parseRevisionCompatible(value);
  else if (operation === 'read') result = await parseReadCompatible(value);
  else if (operation === 'publish' || operation === 'unpublish') result = await parsePublicationCompatible(value, operation);
  else if (value === null) result = null;
  else {
    const r = record(value, ['operation', 'data']), original = parseCreatorOperation(r.operation);
    if (original === 'read' || original === 'recover') return invalid();
    result = Object.freeze({ operation: original, data: await parseResultCompatible(original, r.data) }) as CreatorRecoveryV2;
  }
  return result as CreatorResultsV2[K];
}
/** Fully captures the V2 envelope before any await; each retained record keeps its original version and hash domain. */
export async function parseCreatorResponseV2<K extends CreatorOperation>(operation: K, value: unknown): Promise<CreatorResponseV2<K>> {
  const op = parseCreatorOperation(operation) as K;
  const r = record(captureCreatorCollectionJson(value, 'response'), ['version'], ['data', 'error']);
  if (r.version !== CREATOR_COLLECTION_API_VERSION || own(r, 'data') === own(r, 'error')) return invalid();
  if (own(r, 'error')) {
    const e = record(r.error, ['code'], ['recovery']);
    if (![...CREATOR_ERROR_CODES, 'UNSUPPORTED_VERSION'].includes(e.code as string) ||
      (own(e, 'recovery') && (e.recovery !== 'original-only' || e.code === 'UNSUPPORTED_VERSION'))) return invalid();
    return Object.freeze({ version: CREATOR_COLLECTION_API_VERSION, error: Object.freeze({ code: e.code as CreatorErrorCodeV2,
      ...(own(e, 'recovery') ? { recovery: 'original-only' as const } : {}) }) });
  }
  return Object.freeze({ version: CREATOR_COLLECTION_API_VERSION, data: await parseResultCompatible(op, r.data) });
}
/** V2 endpoint can return a historical V1 DTO. Never synthesize a V2 collection from its first member. */
export async function parsePublicMarketplaceCompatible(value: unknown): Promise<PublicStorefront | PublicStorefrontV2> {
  const raw = captureCreatorCollectionJson(value, 'response');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  if ((raw as Record<string, Json>).version === PUBLIC_STOREFRONT_V2_VERSION) return parsePublicStorefrontV2(raw);
  const data = parsePublicStorefront(raw);
  if (data.checkout.access === 'not-open' && data.checkout.selection.projectionDigest !== await hashPublicServiceProjection(data.service)) return invalid();
  return data;
}
