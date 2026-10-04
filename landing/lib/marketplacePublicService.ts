/** Public descriptive projection only. No private imports, payment fields, runtime availability or caller approval seam. */
import { creatorRecord, creatorText, parseCreatorId, parseCreatorDigest, hashCreatorBytes, CreatorStoreError } from './marketplacePublishingProtocol';

export const PUBLIC_SERVICE_VERSION = 'voidpay.public-market-service.v1' as const;
export type PublicServiceRef = Readonly<{ providerId: string; serviceId: string; version: string; definitionDigest: string }>;
export type PublicServiceProjection = Readonly<{
  version: typeof PUBLIC_SERVICE_VERSION; projectionId: string; serviceRef: PublicServiceRef;
  providerLabel: string; title: string; description: string; checkoutPath: '/pay/marketplace/checkout';
  access: 'invited-only'; operationalAvailability: 'not-asserted';
}>;
export function parsePublicServiceProjection(value: unknown): PublicServiceProjection {
  const r=creatorRecord(value,['version','projectionId','serviceRef','providerLabel','title','description','checkoutPath','access','operationalAvailability']);
  if(r.version!==PUBLIC_SERVICE_VERSION||r.checkoutPath!=='/pay/marketplace/checkout'||r.access!=='invited-only'||r.operationalAvailability!=='not-asserted')throw new CreatorStoreError('INVALID_INPUT');
  const s=creatorRecord(r.serviceRef,['providerId','serviceId','version','definitionDigest']);
  return Object.freeze({version:PUBLIC_SERVICE_VERSION,projectionId:parseCreatorId(r.projectionId),
    serviceRef:Object.freeze({providerId:parseCreatorId(s.providerId),serviceId:parseCreatorId(s.serviceId),version:parseCreatorId(s.version),definitionDigest:parseCreatorDigest(s.definitionDigest)}),
    providerLabel:creatorText(r.providerLabel,1,64,256),title:creatorText(r.title,1,64,256),description:creatorText(r.description,0,160,640),
    checkoutPath:'/pay/marketplace/checkout',access:'invited-only',operationalAvailability:'not-asserted'});
}
export function encodePublicServiceProjection(value: unknown): string {
  const p=parsePublicServiceProjection(value),s=p.serviceRef;
  return JSON.stringify(['voidpay.creator.public-service',1,p.version,p.projectionId,[s.providerId,s.serviceId,s.version,s.definitionDigest],
    p.providerLabel,p.title,p.description,p.checkoutPath,p.access,p.operationalAvailability]);
}
export function hashPublicServiceProjection(value: unknown): Promise<string> { return hashCreatorBytes(encodePublicServiceProjection(value)); }

/** Root reviewed 2026-09-11 against the sole invited checkout service's native pins.
 * This source-owned first-party projection is not an availability or payment approval.
 * Extending it requires another explicit service/checkout review, never caller JSON. */
export const APPROVED_PUBLIC_SERVICE: PublicServiceProjection = Object.freeze({
    version: PUBLIC_SERVICE_VERSION,
    projectionId: 'voidly-catalog-pilot-v1',
    serviceRef: Object.freeze({ providerId: 'voidly-catalog-pilot', serviceId: 'catalog-refresh', version: '1',
      definitionDigest: 'ab61bb2b0dda870f934e98baa148616f89ca2205f81cf3f9024850e7c0724a1c' }),
    providerLabel: 'Voidly', title: 'Catalog page check',
    description: 'Read price and availability from the selected catalog page, with source evidence. One paid attempt; no stock count or comparison with earlier data.',
    checkoutPath: '/pay/marketplace/checkout', access: 'invited-only', operationalAvailability: 'not-asserted',
  });
export const ROOT_APPROVED_PUBLIC_SERVICES: readonly PublicServiceProjection[] = Object.freeze([APPROVED_PUBLIC_SERVICE]);
export function getApprovedPublicService(projectionId: string): PublicServiceProjection | null {
  const id=parseCreatorId(projectionId);return ROOT_APPROVED_PUBLIC_SERVICES.find(p=>p.projectionId===id)??null;
}
export function requireApprovedPublicService(projectionId: string): PublicServiceProjection {
  const service=getApprovedPublicService(projectionId);if(!service)throw new CreatorStoreError('SERVICE_NOT_APPROVED');return service;
}

export const APPROVED_PUBLIC_SERVICE_DIGEST = '597c28fafd34c3eafd053948723834f90e12458f80ec1499d980a9a5feda48e5' as const;
/** The browser may present only the source-owned service reviewed for this release. */
export function parseApprovedPublicService(value: unknown): PublicServiceProjection {
  const parsed = parsePublicServiceProjection(value);
  if (encodePublicServiceProjection(parsed) !== encodePublicServiceProjection(APPROVED_PUBLIC_SERVICE)) throw new CreatorStoreError('SERVICE_PROJECTION_CHANGED');
  return parsed;
}

/** Accepted stored/public response forms only; this decoder does not authorize a new save. */
export function parsePublishedServiceProjection(value:unknown):PublicServiceProjection {
 const service=parsePublicServiceProjection(value);
 if(service.projectionId===`qualified-${service.serviceRef.definitionDigest}`)return service;
 const approved=getApprovedPublicService(service.projectionId);
 if(!approved||encodePublicServiceProjection(approved)!==encodePublicServiceProjection(service))throw new CreatorStoreError('SERVICE_NOT_APPROVED');
 return service;
}
