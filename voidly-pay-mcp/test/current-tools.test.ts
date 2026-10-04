import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { realpathSync, mkdtempSync, rmSync, readdirSync, readFileSync, statSync, chmodSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createToolRunner, tools } from '../src/index';
import { readPrivateJson } from '../src/journal';
import { hashCreatorRequestV2 } from '../../landing/lib/marketplaceCollectionProtocol';
import golden from '../../landing/lib/fixtures/creatorCollectionV2.golden.json';
const vector = golden.vectors.find(v => v.id === 'v2-two')!;
const owner = vector.ownerId, credential = 'vpc_' + 'a'.repeat(64);
const space = vector.input.ownerReadEnvelope.data.space;
const input = { idempotencyKey: space.createKey, slug: space.slug };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: {'content-type':'application/json'} });
const success = (data: unknown) => json({version:'voidpay.creator-api.v2', data});
const value = (result: Awaited<ReturnType<ReturnType<typeof createToolRunner>>>) => JSON.parse(result.content[0].text);
let directory: string, fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  directory = mkdtempSync(join(realpathSync(tmpdir()), 'voidpay-mcp-'));
  fetcher = vi.fn(() => { throw new Error('Unexpected network'); }); vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); rmSync(directory,{recursive:true,force:true}); });
const runner = () => createToolRunner({ creator: {credential,ownerAccountId:owner,targetSpaceId:null}, stateDirectory: directory });
it('has current tools and public discovery without a credential or wallet', async()=>{
  expect(tools).toHaveLength(12);
  expect(tools.some(t=>/escrow|transfer|credits|listing_register/.test(t.name))).toBe(false);
  const call=createToolRunner(); const result=value(await call('voidpay_status'));
  expect(result).toMatchObject({creatorConfigured:false,autonomousPayments:false,walletKeysHeld:false});
  expect(value(await call('voidpay_creator_create',input)).error.code).toBe('CREATOR_SETUP_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled();
});
it('journals privately before one mutation and recovers after restart without replay',async()=>{
  fetcher.mockImplementationOnce(async()=>{
    const files=readdirSync(directory); expect(files).toHaveLength(1);
    expect(readFileSync(join(directory,files[0]),'utf8')).not.toContain(credential);
    expect(statSync(join(directory,files[0])).mode & 0o777).toBe(0o600);
    return success(space);
  });
  expect(value(await runner()('voidpay_creator_create',input)).result).toEqual(space);
  fetcher.mockResolvedValueOnce(success({operation:'create',data:space}));
  const again=value(await runner()('voidpay_creator_create',input));
  expect(again).toMatchObject({recovered:true,resent:false});
  expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['create','recover'].map(op=>'https://api.voidly.ai/v2/marketplace/agents/'+op));
  expect(new Headers(fetcher.mock.calls[0][1].headers).get('authorization')).toBe('Bearer '+credential);
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'manual'});
});
it('does not repeat an interrupted mutation even when recovery returns null',async()=>{
  fetcher.mockRejectedValueOnce(new Error('secret '+credential));
  const first=await runner()('voidpay_creator_create',input);
  expect(value(first).error).toMatchObject({code:'OUTCOME_UNKNOWN',recovery:'original-only'});
  expect(JSON.stringify(first)).not.toContain(credential);
  fetcher.mockResolvedValueOnce(success(null));
  expect(value(await runner()('voidpay_creator_create',input))).toMatchObject({recovered:true,result:null,resent:false});
  expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith('/create'))).toHaveLength(1);
});
it('reserves once across concurrent runners and refuses changed original bytes',async()=>{
  fetcher.mockImplementation(async(url:string)=>url.endsWith('/create')?success(space):success(null));
  await Promise.all(Array.from({length:20},()=>runner()('voidpay_creator_create',input)));
  expect(fetcher.mock.calls.filter(c=>String(c[0]).endsWith('/create'))).toHaveLength(1);
  const count=fetcher.mock.calls.length;
  expect(value(await runner()('voidpay_creator_create',{...input,slug:'different-slug'})).error.code).toBe('ORIGINAL_MISMATCH');
  expect(fetcher).toHaveBeenCalledTimes(count);
});
it('validates historical journal bytes before any recovery network call',async()=>{
  fetcher.mockResolvedValueOnce(success(space)); await runner()('voidpay_creator_create',input);
  const file=join(directory,readdirSync(directory)[0]);const record=JSON.parse(readFileSync(file,'utf8'));record.ownerAccountId='wrong-owner';writeFileSync(file,JSON.stringify(record));
  expect(value(await runner()('voidpay_creator_recover',{operation:'create',idempotencyKey:input.idempotencyKey})).error.code).toBe('ORIGINAL_MISMATCH');
  expect(fetcher).toHaveBeenCalledOnce();
});
it('rejects public or symlinked credential files and public journal directories',async()=>{
  const file=join(directory,'setup.json');writeFileSync(file,JSON.stringify({credential}),{mode:0o644});
  expect(()=>readPrivateJson(file)).toThrow('PRIVATE_STORAGE_UNAVAILABLE');chmodSync(file,0o600);
  const link=join(directory,'link');symlinkSync(file,link);expect(()=>readPrivateJson(link)).toThrow('PRIVATE_STORAGE_UNAVAILABLE');
  chmodSync(directory,0o755);
  expect(value(await runner()('voidpay_creator_create',input)).error.code).toBe('PRIVATE_STORAGE_UNAVAILABLE');
  expect(fetcher).not.toHaveBeenCalled();
});
it('validates exact public storefront checkout selection without payment or credentials',async()=>{
  const view=vector.input.publicStorefront;expect(view.version).toBe('voidpay.public-storefront.v2');
  const selected=view.entries[1];fetcher.mockResolvedValueOnce(json(view));
  const output=value(await createToolRunner()('voidpay_checkout_link',{slug:view.slug,publicationDigest:view.publicationDigest,projectionId:selected.service.projectionId}));
  const url=new URL(output.url);expect(url.origin).toBe('https://voidly.ai');expect(url.searchParams.get('projection')).toBe(selected.projectionDigest);
  expect(output).toMatchObject({paymentPerformed:false,ownerApprovalRequired:true});
  expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
});
it('requires the selected service ID before reading a storefront for checkout',async()=>{
  const checkout=tools.find(tool=>tool.name==='voidpay_checkout_link');
  expect(checkout?.inputSchema.required).toContain('projectionId');
  const view=vector.input.publicStorefront;
  const result=value(await createToolRunner()('voidpay_checkout_link',{slug:view.slug,publicationDigest:view.publicationDigest}));
  expect(result.error.code).toBe('INVALID_INPUT');
  expect(fetcher).not.toHaveBeenCalled();
});
it('refuses changed publications and does not substitute a generic checkout',async()=>{
  const view=vector.input.publicStorefront;fetcher.mockResolvedValueOnce(json(view));
  const result=value(await createToolRunner()('voidpay_checkout_link',{slug:view.slug,publicationDigest:'0'.repeat(64),projectionId:view.entries[0].service.projectionId}));
  expect(result.error.code).toBe('STOREFRONT_SELECTION_CHANGED');expect(result.url).toBeUndefined();
});
it('does not equate unavailable catalog with empty inventory or follow arbitrary endpoints',async()=>{
  const call=createToolRunner();
  expect(value(await call('voidpay_services',{url:'https://evil.example'})).error.code).toBe('INVALID_INPUT');
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(json({error:{code:'STORAGE_UNAVAILABLE'}},503));
  expect(value(await call('voidpay_services')).error.code).toBe('PUBLIC_READ_UNAVAILABLE');
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit'});
});
it('uses original browser recovery without inventing authorization or sending requests',async()=>{
  expect(value(await createToolRunner()('voidpay_checkout_recovery_link'))).toMatchObject({url:'https://voidly.ai/pay/marketplace/checkout?recover=1',paymentPerformed:false});
  expect(fetcher).not.toHaveBeenCalled();
});
it('publishes only the exact observed revision',async()=>{
  fetcher.mockResolvedValueOnce(success(vector.input.ownerReadEnvelope.data.publication));
  const publication=value(await runner()('voidpay_creator_publish',vector.input.publishRequest));
  expect(publication.result).toEqual(vector.input.ownerReadEnvelope.data.publication);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.voidly.ai/v2/marketplace/agents/publish');
});

it('derives a saved collection from the exact observed state and full selected projections',async()=>{
  const owned=structuredClone(vector.input.ownerReadEnvelope.data), config=vector.input.save.config;
  const args={idempotencyKey:'save-from-mcp',owned,presentation:{name:config.name,description:config.description,brandPreset:config.brandPreset},selectedServices:vector.input.collectionSnapshot.entries.map(x=>x.service)};
  fetcher.mockImplementationOnce(async(_url:string,init:RequestInit)=>{
    const request=JSON.parse(init.body as string);
    expect(request.expectedVersion).toBe(owned.space.stateVersion);expect(request.baseRevision).toBe(owned.space.headRevision);
    expect(request.projectionDigests).toEqual(vector.input.save.projectionDigests);
    return success({...owned.revision,expectedVersion:request.expectedVersion,baseRevision:request.baseRevision,revision:request.baseRevision+1,idempotencyKey:request.idempotencyKey,requestDigest:await hashCreatorRequestV2(owner,'save',request)});
  });
  expect(value(await runner()('voidpay_creator_save',args)).result.revision).toBe(owned.space.headRevision+1);
});
