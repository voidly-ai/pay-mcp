/** Inspectable descriptive inventory contract. Decoding grants no payment or publication authority. */
import { creatorInteger, creatorRecord, parseCreatorDigest, CreatorStoreError } from './marketplacePublishingProtocol';
import { parsePublicServiceProjection, type PublicServiceProjection } from './marketplacePublicService';
export const QUALIFIED_INVENTORY_VERSION = 'voidpay.qualified-service-inventory.v1' as const;
export type QualifiedInventoryRequest = Readonly<{
    limit?: number;
    after?: string;
    definitionDigest?: string;
}>;
export type QualifiedInventoryPage = Readonly<{
    version: typeof QUALIFIED_INVENTORY_VERSION;
    observedAtMs: number;
    services: readonly PublicServiceProjection[];
    nextCursor: string | null;
    selectionGrantsAuthority: false;
    publicationPerformed: false;
}>;
const invalid = (): never => { throw new CreatorStoreError('INVALID_INPUT'); };
export function parseQualifiedInventoryRequest(value: unknown): QualifiedInventoryRequest {
    const r = creatorRecord(value, [], ['limit', 'after', 'definitionDigest']);
    if (r.after !== undefined && r.definitionDigest !== undefined)
        return invalid();
    return Object.freeze({ ...(r.limit === undefined ? {} : { limit: creatorInteger(r.limit, 1, 10) }), ...(r.after === undefined ? {} : { after: parseCreatorDigest(r.after) }), ...(r.definitionDigest === undefined ? {} : { definitionDigest: parseCreatorDigest(r.definitionDigest) }) });
}
// Shallow descriptor capture avoids calling accessors and keeps this response's
// larger bounded nesting separate from the small creator mutation DTO limit.
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        return invalid();
    const d = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(d);
    if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k) || !d[k].enumerable || !('value' in d[k])))
        return invalid();
    return Object.fromEntries(keys.map(k => [k, d[k].value]));
}
export function qualifiedDefinitionDigest(id: string): string { return /^qualified-([0-9a-f]{64})$/.exec(id)?.[1] ?? invalid(); }
export function parseQualifiedInventoryPage(value: unknown, input: QualifiedInventoryRequest = {}): QualifiedInventoryPage {
    const request = parseQualifiedInventoryRequest(input), r = record(value, ['version', 'observedAtMs', 'services', 'nextCursor', 'selectionGrantsAuthority', 'publicationPerformed']);
    if (r.version !== QUALIFIED_INVENTORY_VERSION || r.selectionGrantsAuthority !== false || r.publicationPerformed !== false || !Array.isArray(r.services) || Object.getPrototypeOf(r.services) !== Array.prototype || r.services.length > (request.limit ?? 10) || Reflect.ownKeys(r.services).length !== r.services.length + 1)
        return invalid();
    let prior = request.after ?? null;
    const services = Object.freeze(Array.from({ length: r.services.length }, (_, i) => {
        const d = Object.getOwnPropertyDescriptor(r.services as unknown[], String(i));
        if (!d?.enumerable || !('value' in d))
            return invalid();
        const service = parsePublicServiceProjection(d.value), digest = qualifiedDefinitionDigest(service.projectionId);
        if (digest !== service.serviceRef.definitionDigest || (prior !== null && digest <= prior) || (request.definitionDigest !== undefined && digest !== request.definitionDigest))
            return invalid();
        prior = digest;
        return service;
    }));
    const nextCursor = r.nextCursor === null ? null : parseCreatorDigest(r.nextCursor);
    if ((nextCursor !== null && (services.length !== (request.limit ?? 10) || nextCursor !== prior)) || (request.definitionDigest !== undefined && (services.length > 1 || nextCursor !== null)))
        return invalid();
    return Object.freeze({ version: QUALIFIED_INVENTORY_VERSION, observedAtMs: creatorInteger(r.observedAtMs), services, nextCursor, selectionGrantsAuthority: false, publicationPerformed: false });
}
export function parseQualifiedInventoryEnvelope(value: unknown, input: QualifiedInventoryRequest = {}): QualifiedInventoryPage {
    const r = record(value, ['version', 'data']);
    if (r.version !== 'voidpay.provider-enrollment-http.v1')
        return invalid();
    return parseQualifiedInventoryPage(r.data, input);
}
