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
  expect(tools).toHaveLength(16);
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
const qualifiedEmpty = { version:'voidpay.qualified-service-inventory.v1', observedAtMs:1,
  services:[], nextCursor:null, selectionGrantsAuthority:false, publicationPerformed:false };
const seller = { kind:'seller', id:'seller_01', version:1, status:'live', name:'Synthetic seller',
  description:'Synthetic listing', category:'research', method:'POST',
  detailUrl:'https://x402.voidly.ai/v1/services/seller_01',
  callUrl:'https://x402.voidly.ai/v1/services/seller_01/call', network:'eip155:84532',
  asset:'0x036CbD53842c5426634e7929541eC2318f3dCF7e', priceUsdcAtomic:'1250000',
  payTo:'0x'+'a'.repeat(40), inputSchema:{type:'object'}, outputSchema:{type:'object'},
  tags:['research'], reputation:{delivered:2,refundOwed:0} };
it('keeps qualified text first while exposing an independent bounded x402 page',async()=>{
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : json({version:'1',items:[seller],nextCursor:null}));
  const result=await createToolRunner()('voidpay_services',{x402Category:'research',x402Search:'report'});
  expect(result.isError).toBeUndefined();
  expect(JSON.parse(result.content[0].text)).toEqual(qualifiedEmpty);
  expect(JSON.parse(result.content[1].text)).toMatchObject({availability:'configured',listings:[{id:'seller_01',
    detailUrl:seller.detailUrl,priceUsdc:'1.25',paymentAuthority:'runtime-402'}]});
  expect(result.structuredContent).toMatchObject({version:'voidpay.mcp-services.v2',qualifiedAvailability:'configured'});
  expect(fetcher.mock.calls[1][0].toString()).toBe('https://x402.voidly.ai/v1/services?query=report&category=research');
  expect(fetcher.mock.calls[1][1]).toMatchObject({redirect:'manual',credentials:'omit'});
  expect(fetcher.mock.calls[1][1].headers).toEqual({Accept:'application/json'});
});
it('retains healthy x402 listings when qualified inventory fails',async()=>{
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json({error:'unavailable'},503) : json({version:'1',items:[seller],nextCursor:null}));
  const result=await createToolRunner()('voidpay_services');
  expect(result.isError).toBeUndefined();
  expect(JSON.parse(result.content[0].text).error.code).toBe('PUBLIC_READ_UNAVAILABLE');
  expect(JSON.parse(result.content[1].text).listings).toHaveLength(1);
  expect(result.structuredContent).toMatchObject({qualifiedInventory:null,qualifiedAvailability:'unavailable'});
});
it('distinguishes a successful empty x402 page from both catalogs unavailable',async()=>{
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : json({version:'1',items:[],nextCursor:null}));
  const empty=await createToolRunner()('voidpay_services');
  expect(JSON.parse(empty.content[1].text)).toMatchObject({availability:'configured',listings:[]});
  expect(empty.isError).toBeUndefined();
  fetcher.mockReset();
  fetcher.mockResolvedValue(json({error:'down'},503));
  const unavailable=await createToolRunner()('voidpay_services');
  expect(unavailable.isError).toBe(true);
  expect(JSON.parse(unavailable.content[1].text)).toMatchObject({availability:'unavailable',listings:null});
});
it('marks a malformed or unavailable marketplace page without hiding qualified inventory',async()=>{
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : json({version:'1',items:[{...seller,callUrl:'https://evil.example/pay'}],nextCursor:null}));
  const result=await createToolRunner()('voidpay_services');
  expect(result.isError).toBeUndefined();
  expect(JSON.parse(result.content[0].text)).toEqual(qualifiedEmpty);
  expect(JSON.parse(result.content[1].text)).toMatchObject({availability:'unavailable',listings:null});
  fetcher.mockClear();
  expect(value(await createToolRunner()('voidpay_services',{x402Cursor:'bad'})).error.code).toBe('INVALID_INPUT');
  expect(fetcher).not.toHaveBeenCalled();
});
it('allows only canonical first-party x402 targets and Base native USDC terms',async()=>{
  const first={...seller,kind:'first_party',id:'voidly-verify-claim',
    detailUrl:null,
    callUrl:'https://x402.voidly.ai/v1/verify-claim',network:'eip155:8453',
    asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'};
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : json({version:'1',items:[first],nextCursor:'abcdefgh'}));
  const good=await createToolRunner()('voidpay_services');
  expect(JSON.parse(good.content[1].text)).toMatchObject({availability:'configured',nextCursor:'abcdefgh',
    listings:[{callUrl:'https://x402.voidly.ai/v1/verify-claim',priceUsdc:'1.25'}]});
  fetcher.mockReset();
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : json({version:'1',items:[{...first,asset:seller.asset}],nextCursor:null}));
  expect(JSON.parse((await createToolRunner()('voidpay_services')).content[1].text).availability).toBe('unavailable');
});
it('requires the canonical keyless seller detail URL and rejects caller-selected destinations',async()=>{
  for (const item of [{...seller,detailUrl:undefined},
    {...seller,detailUrl:'https://evil.example/v1/services/seller_01'}]) {
    fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
      ? json(qualifiedEmpty) : json({version:'1',items:[item],nextCursor:null}));
    const result=await createToolRunner()('voidpay_services');
    expect(JSON.parse(result.content[1].text)).toMatchObject({availability:'unavailable',listings:null});
    fetcher.mockReset();
  }
});
it('rejects invalid x402 payTo or price and never follows gateway redirects',async()=>{
  for (const invalid of [{...seller,payTo:'not-a-wallet'}, {...seller,priceUsdcAtomic:'0'}]) {
    fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
      ? json(qualifiedEmpty) : json({version:'1',items:[invalid],nextCursor:null}));
    const result=await createToolRunner()('voidpay_services');
    expect(JSON.parse(result.content[1].text).availability).toBe('unavailable');
    fetcher.mockReset();
  }
  fetcher.mockImplementation(async(url:string)=>String(url).startsWith('https://api.voidly.ai/')
    ? json(qualifiedEmpty) : new Response(null,{status:302,headers:{location:'https://evil.example/'}}));
  const redirected=await createToolRunner()('voidpay_services');
  expect(JSON.parse(redirected.content[1].text).availability).toBe('unavailable');
  expect(fetcher.mock.calls[1][1].redirect).toBe('manual');
});
const rootPost = { id:'01234567-89ab-cdef-0123-456789abcdef', board:'market-jobs',
  author_did:'did:voidly:abc123', title:'Synthetic request', body:'Synthetic public text',
  budget_amount:null,budget_currency:null,budget_network:null,tags:[],listing_url:null,
  reply_to:null,created_at:'2026-10-05T00:00:00.000Z',expires_at:null };
it('reads a bounded board page and thread from the fixed public API',async()=>{
  fetcher.mockImplementation(async(url:string)=>String(url).includes('/replies?')
    ? json({replies:[],next_cursor:null}) : String(url).endsWith(rootPost.id)
      ? json({post:rootPost}) : json({posts:[rootPost],next_cursor:null}));
  const call=createToolRunner();
  expect(value(await call('board_search',{board:'market-jobs'}))).toMatchObject({posts:[{id:rootPost.id}],listingLinksVerified:false});
  expect(value(await call('board_read',{postId:rootPost.id}))).toMatchObject({post:{id:rootPost.id},replies:[]});
  expect(fetcher.mock.calls.every(c=>String(c[0]).startsWith('https://api.voidly.ai/v1/agent/board/posts'))).toBe(true);
  expect(fetcher.mock.calls.every(c=>c[1].credentials==='omit' && c[1].redirect==='manual')).toBe(true);
});
it('accepts 20 near-limit UTF-8 posts while retaining the bounded response cap',async()=>{
  const posts=Array.from({length:20},(_,i)=>({...rootPost,
    id:`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,
    body:'🧭'.repeat(1900)}));
  const page={posts,next_cursor:null};
  expect(Buffer.byteLength(JSON.stringify(page))).toBeGreaterThan(131_072);
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(262_144);
  fetcher.mockResolvedValueOnce(json(page));
  const result=value(await createToolRunner()('board_search',{limit:20}));
  expect(result.posts).toHaveLength(20);
  expect(result.posts[19].body).toBe(posts[19].body);
});
it('maps collection and root-write 404 to unavailable, keeping identifier 404 as not found',async()=>{
  const call=createToolRunner();
  fetcher.mockResolvedValueOnce(json({error:'not_found'},404));
  expect(value(await call('board_search')).error.code).toBe('PUBLIC_READ_UNAVAILABLE');
  fetcher.mockResolvedValueOnce(json({error:'not_found'},404));
  expect(value(await call('board_read',{postId:rootPost.id})).error.code).toBe('NOT_FOUND');
  fetcher.mockResolvedValueOnce(json({post:rootPost}));
  fetcher.mockResolvedValueOnce(json({error:'not_found'},404));
  expect(value(await call('board_read',{postId:rootPost.id})).error.code).toBe('NOT_FOUND');
  const rootArgs={bodyJson:JSON.stringify({board:'market-jobs',title:'Synthetic request',body:'Synthetic public text'}),
    did:rootPost.author_did,timestamp:'1791158400',nonce:'a'.repeat(32),signature:'A'.repeat(86)+'=='};
  fetcher.mockResolvedValueOnce(json({error:'not_found'},404));
  expect(value(await call('board_post',rootArgs)).error).toMatchObject({code:'BOARD_WRITE_UNAVAILABLE',
    instruction:expect.stringContaining('Publication is unconfirmed')});
  fetcher.mockResolvedValueOnce(json({error:'not_found'},404));
  expect(value(await call('board_post',{...rootArgs,bodyJson:JSON.stringify({body:'Synthetic public text'}),
    replyTo:rootPost.id})).error.code).toBe('NOT_FOUND');
  expect(fetcher).toHaveBeenCalledTimes(6);
});
it('forwards signed public JSON bytes and headers exactly once, without local signing',async()=>{
  const raw=' { "board" : "market-jobs", "title" : "Synthetic request", "body" : "Synthetic public text" } ';
  fetcher.mockResolvedValueOnce(json({post:rootPost},201));
  const output=value(await createToolRunner()('board_post',{bodyJson:raw,did:rootPost.author_did,
    timestamp:'1791158400',nonce:'a'.repeat(32),signature:'A'.repeat(86)+'=='}));
  expect(output).toMatchObject({posted:true,paymentPerformed:false});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe('https://api.voidly.ai/v1/agent/board/posts');
  expect(fetcher.mock.calls[0][1].body).toBe(raw);
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({'X-Agent-DID':rootPost.author_did,
    'X-Board-Timestamp':'1791158400','X-Board-Nonce':'a'.repeat(32)});
  expect(Object.keys(fetcher.mock.calls[0][1].headers).sort()).toEqual([
    'Accept','Content-Type','X-Agent-DID','X-Board-Nonce','X-Board-Signature','X-Board-Timestamp'].sort());
});
it('compares the normalized post and offer after 201 and strips unexpected API fields',async()=>{
  const listingUrl='https://example.org/offer';
  const bodyJson=JSON.stringify({board:'market-jobs',title:'  Synthetic request  ',
    body:'  Synthetic public text  ',budget_amount:'10',budget_currency:'USDC',
    budget_network:'eip155:8453',tags:['work'],listing_url:listingUrl});
  const returned={...rootPost,budget_amount:'10',budget_currency:'USDC',budget_network:'eip155:8453',
    tags:['work'],listing_url:listingUrl,private_column:'must not cross'};
  fetcher.mockResolvedValueOnce(json({post:returned},201));
  const args={bodyJson,did:rootPost.author_did,timestamp:'1791158400',nonce:'a'.repeat(32),signature:'A'.repeat(86)+'=='};
  const result=value(await createToolRunner()('board_post',args));
  expect(result.post.private_column).toBeUndefined();
  expect(fetcher.mock.calls[0][1].body).toBe(bodyJson);
  fetcher.mockResolvedValueOnce(json({post:{...returned,budget_amount:'11'}},201));
  expect(value(await createToolRunner()('board_post',{...args,nonce:'b'.repeat(32)})).error).toMatchObject({code:'INVALID_RESPONSE'});
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('private board reply returns only a local encryption handoff',async()=>{
  fetcher.mockResolvedValueOnce(json({post:rootPost}));
  const result=value(await createToolRunner()('board_reply_private',{postId:rootPost.id}));
  expect(result).toMatchObject({recipientDid:rootPost.author_did,clientEncryptionRequired:true,delivered:false});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  fetcher.mockClear();
  expect(value(await createToolRunner()('board_reply_private',{postId:rootPost.id,message:'secret'})).error.code).toBe('INVALID_INPUT');
  expect(fetcher).not.toHaveBeenCalled();
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
