import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createCreatorClient, type CreatorClientSettings, type CreatorOriginal, type CreatorRequestsV2, type CreatorSaveInput } from '../../creator-client/src/client';
import { parseCreatorId } from '../../landing/lib/marketplacePublishingProtocol';
import { createJournal, AdapterError } from './journal.js';
import { services, storefront, checkoutLink } from './public.js';
import { tools } from './tools.js';
export { tools };
export interface ServerConfig { creator?: CreatorClientSettings; stateDirectory?: string }
const mutations = ['create', 'save', 'publish', 'unpublish'] as const;
type Mutation = typeof mutations[number];
const safeCodes = new Set(['INVALID_INPUT', 'AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'UNSUPPORTED_VERSION', 'CONFLICT', 'SLUG_CONFLICT',
  'STALE_VERSION', 'SERVICE_NOT_APPROVED', 'SERVICE_PROJECTION_CHANGED', 'LIMIT_REACHED', 'BODY_TOO_LARGE', 'RATE_LIMITED',
  'STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN', 'HASH_UNAVAILABLE', 'INVALID_RESPONSE', 'REQUEST_ABORTED', 'ORIGINAL_MISMATCH',
  'PRIVATE_STORAGE_UNAVAILABLE', 'PUBLIC_READ_UNAVAILABLE', 'STOREFRONT_SELECTION_CHANGED', 'CREATOR_SETUP_REQUIRED', 'TOOL_NOT_FOUND']);

export function createToolRunner(config: ServerConfig = {}) {
  const creator = config.creator ? createCreatorClient(config.creator) : null;
  const journal = config.stateDirectory ? createJournal(config.stateDirectory) : null;
  const owner = config.creator?.ownerAccountId;
  async function dispatch(original: CreatorOriginal) {
    if (!creator || !journal) throw new AdapterError('CREATOR_SETUP_REQUIRED');
    if (!journal.reserve(original)) {
      const previous = await creator.restore(journal.load(original.ownerAccountId, original.operation, original.idempotencyKey));
      if (previous.requestDigest !== original.requestDigest) throw new AdapterError('ORIGINAL_MISMATCH');
      return { recovered: true, result: await creator.recover(previous), resent: false };
    }
    // An interrupted/failed reservation is retained permanently. Never auto-replay.
    return { recovered: false, result: await creator.execute(original), resent: false };
  }
  return async function call(name: string, args: Record<string, unknown> = {}) {
    try {
      const tool = tools.find(t => t.name === name);
      if (!tool) throw new AdapterError('TOOL_NOT_FOUND');
      if (!args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key)) ||
        tool.inputSchema.required.some(key => !Object.hasOwn(args, key))) throw new AdapterError('INVALID_INPUT');
      let result: unknown;
      switch (name) {
        case 'voidpay_status': result = { version: '0.7.2', discovery: 'public', creatorConfigured: !!creator && !!journal,
          creatorSetupUrl: 'https://voidly.ai/pay/marketplace/create', checkout: 'owner-browser-handoff',
          creatorRecovery: 'original-only', autonomousPayments: false, walletKeysHeld: false,
          legacyCreditEscrowTools: false, hostedServiceAvailability: 'not-asserted' }; break;
        case 'voidpay_services': result = await services(args.query ?? {}); break;
        case 'voidpay_storefront': result = await storefront(args.slug); break;
        case 'voidpay_checkout_link': result = await checkoutLink(args.slug, args.publicationDigest, args.projectionId); break;
        case 'voidpay_checkout_recovery_link': result = { url: 'https://voidly.ai/pay/marketplace/checkout?recover=1',
          requiresOriginalOwnerBrowser: true, paymentPerformed: false }; break;
        default: {
          if (!creator || !journal || !owner) throw new AdapterError('CREATOR_SETUP_REQUIRED');
          const operation = name.replace('voidpay_creator_', '');
          if (operation === 'read') result = await creator.read(args as CreatorRequestsV2['read']);
          else if (operation === 'inventory') result = await creator.inventory({ ...args, query: args.query ?? {} } as Parameters<typeof creator.inventory>[0]);
          else if (operation === 'recover') {
            if (!(mutations as readonly unknown[]).includes(args.operation)) throw new AdapterError('INVALID_INPUT');
            const original = await creator.restore(journal.load(owner, args.operation as string, parseCreatorId(args.idempotencyKey)));
            result = { recovered: true, result: await creator.recover(original), resent: false };
          } else {
            const original = operation === 'save' ? await creator.prepareSave(args as CreatorSaveInput)
              : await creator.prepare(operation as Mutation, args as CreatorRequestsV2[Mutation]);
            result = await dispatch(original);
          }
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (e) {
      const candidate = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      const code = safeCodes.has(candidate) ? candidate : 'INVALID_INPUT';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: { code,
        ...(['OUTCOME_UNKNOWN', 'PRIVATE_STORAGE_UNAVAILABLE'].includes(code) ? { recovery: 'original-only', instruction: 'Retain the original key and journal. Do not resend or generate a replacement key.' } : {}) } }) }] };
    }
  };
}
export async function buildServer(config: ServerConfig = {}): Promise<{ server: Server }> {
  const call = createToolRunner(config);
  const server = new Server({ name: 'voidly-pay', version: '0.7.2' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async req => call(req.params.name, req.params.arguments ?? {}));
  return { server };
}
