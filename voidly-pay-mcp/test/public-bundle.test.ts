import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import config from '../tsup.config';
const guard=resolve('scripts/check-public-bundle.mjs');
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fixture(){
 const cwd=mkdtempSync(resolve(tmpdir(),'voidpay-bundle-'));dirs.push(cwd);mkdirSync(resolve(cwd,'dist'));
 const output=(entryPoint:string)=>({entryPoint,inputs:{[entryPoint]:{bytesInOutput:1}},imports:[] as Array<{path:string,external:boolean}>});
 const esm={inputs:{'src/index.ts':{},'src/cli.ts':{}},outputs:{'dist/index.js':output('src/index.ts'),'dist/cli.js':output('src/cli.ts')}};
 const cjs={inputs:{'src/index.ts':{}},outputs:{'dist/index.cjs':output('src/index.ts')}};
 for(const name of ['index.js','index.cjs','index.d.ts','index.d.cts','cli.js'])writeFileSync(resolve(cwd,'dist',name),'public connector\n');
 const write=()=>{writeFileSync(resolve(cwd,'dist/metafile-esm.json'),JSON.stringify(esm));writeFileSync(resolve(cwd,'dist/metafile-cjs.json'),JSON.stringify(cjs));};
 write();return {cwd,esm,cjs,write};
}
function check(f:ReturnType<typeof fixture>){return spawnSync(process.execPath,[guard],{cwd:f.cwd,encoding:'utf8'});}
it('has one metadata writer per format and both ESM entrypoints',()=>{
 expect(Array.isArray(config)).toBe(true);
 const passes=config as Array<any>;
 expect(passes.flatMap(p=>p.format).sort()).toEqual(['cjs','esm']);
 expect(passes.find(p=>p.format[0]==='esm').entry).toEqual({index:'src/index.ts',cli:'src/cli.ts'});
 expect(passes.find(p=>p.format[0]==='cjs').entry).toEqual({index:'src/index.ts'});
 expect(passes.every(p=>p.metafile===true&&p.clean===false&&Object.keys(p.dts.entry).join()==='index')).toBe(true);
});
it('checks all outputs and removes metadata only on complete success',()=>{
 const f=fixture();expect(check(f).status).toBe(0);
 expect(readdirSync(resolve(f.cwd,'dist')).sort()).toEqual(['cli.js','index.cjs','index.d.cts','index.d.ts','index.js']);
});
it('refuses missing metadata',()=>{
 const f=fixture();rmSync(resolve(f.cwd,'dist/metafile-cjs.json'));expect(check(f).status).not.toBe(0);
 expect(readdirSync(resolve(f.cwd,'dist'))).toContain('metafile-esm.json');
});
it('refuses a valid overwritten ESM manifest missing its CLI output',()=>{
 const f=fixture();delete (f.esm.outputs as any)['dist/cli.js'];f.write();expect(check(f).status).not.toBe(0);
});
it('refuses torn metadata and preserves it',()=>{
 const f=fixture();const p=resolve(f.cwd,'dist/metafile-esm.json');const torn=JSON.stringify(f.esm)+'stale bytes';writeFileSync(p,torn);
 expect(check(f).status).not.toBe(0);expect(readFileSync(p,'utf8')).toBe(torn);expect(readdirSync(resolve(f.cwd,'dist'))).toContain('metafile-cjs.json');
});
it('refuses a private input present only in the CLI graph',()=>{
 const f=fixture();(f.esm.inputs as any)['../private-services/market/private.ts']={};
 (f.esm.outputs['dist/cli.js'].inputs as any)['../private-services/market/private.ts']={bytesInOutput:1};f.write();expect(check(f).status).not.toBe(0);
});
it('refuses an output input absent from the top-level closure',()=>{
 const f=fixture();f.cjs.outputs['dist/index.cjs'].inputs['src/public.ts']={bytesInOutput:1};f.write();expect(check(f).status).not.toBe(0);
});
it('refuses incorrect entrypoints even when public',()=>{
 const f=fixture();f.esm.outputs['dist/cli.js'].entryPoint='src/index.ts';f.write();expect(check(f).status).not.toBe(0);
});
it('checks external imports in every entrypoint',()=>{
 const f=fixture();f.esm.outputs['dist/cli.js'].imports.push({path:'unreviewed-package',external:true});f.write();expect(check(f).status).not.toBe(0);
});
it('preserves the output private-path gate',()=>{
 const f=fixture();writeFileSync(resolve(f.cwd,'dist/index.js'),'private-services/market/secret');expect(check(f).status).not.toBe(0);
 expect(readdirSync(resolve(f.cwd,'dist'))).toContain('metafile-esm.json');
});
