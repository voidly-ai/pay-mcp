import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
const allowed = new Set([
  'src/index.ts','src/cli.ts','src/journal.ts','src/public.ts','src/tools.ts',
  'src/board.ts','src/x402Marketplace.ts',
  '../creator-client/src/client.ts',
  ...['marketplacePublishingProtocol','marketplaceCollectionProtocol','marketplacePublicService','marketplaceQualifiedInventory'].map(x=>'../landing/lib/'+x+'.ts'),
]);
const expected=['index.js','index.cjs','index.d.ts','index.d.cts','cli.js'].sort();
const manifests={
  'metafile-esm.json': {'dist/index.js':'src/index.ts','dist/cli.js':'src/cli.ts'},
  'metafile-cjs.json': {'dist/index.cjs':'src/index.ts'},
};
const metadata = fs.readdirSync('dist').filter(x=>x.startsWith('metafile') && x.endsWith('.json')).sort();
if (JSON.stringify(metadata)!==JSON.stringify(Object.keys(manifests).sort())) throw new Error('Missing or unexpected public import closure');
for (const file of metadata) {
  if(!fs.lstatSync(path.join('dist',file)).isFile()) throw new Error('Non-regular public closure');
  const info=JSON.parse(fs.readFileSync(path.join('dist',file),'utf8'));
  const outputs=manifests[file];
  if(JSON.stringify(Object.keys(info.outputs).sort())!==JSON.stringify(Object.keys(outputs).sort())) throw new Error('Incomplete public output closure');
  for (const input of Object.keys(info.inputs)) if (!allowed.has(input)) throw new Error('Unreviewed bundled input: '+input);
  for (const [name, output] of Object.entries(info.outputs)) {
    if(output.entryPoint!==outputs[name] || !Object.hasOwn(info.inputs,output.entryPoint) || !Object.hasOwn(output.inputs,output.entryPoint)) throw new Error('Public entrypoint mismatch');
    for(const input of Object.keys(output.inputs)) if(!allowed.has(input) || !Object.hasOwn(info.inputs,input)) throw new Error('Unreviewed output input');
    for(const imp of output.imports) {
      if (!imp.external || !(imp.path.startsWith('node:') || builtinModules.includes(imp.path) || imp.path.startsWith('@modelcontextprotocol/sdk/'))) throw new Error('Unreviewed external import');
    }
  }
}
if(JSON.stringify(fs.readdirSync('dist').filter(x=>!metadata.includes(x)).sort())!==JSON.stringify(expected)) throw new Error('Unexpected public output files');
for(const file of expected){
 if(!fs.lstatSync(path.join('dist',file)).isFile()) throw new Error('Non-regular public output');
 const text=fs.readFileSync(path.join('dist',file),'utf8');
 if(/\/Users\/|private-services\/|sourceMappingURL|\.codex\/|\.\.\/.*landing\//.test(text)) throw new Error('Private path or unbundled declaration in artifact');
}
// Retain every manifest if any gate fails; remove build-only files after all pass.
for(const file of metadata) fs.unlinkSync(path.join('dist',file));
console.log('Public closure verified: every ESM/CJS entrypoint, MCP connector, board/x402 public clients, creator client and four public protocol modules only. No source maps.');
