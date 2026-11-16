'use strict';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../worker/public/nexo-v17-pattern-core.js'),'utf8'),ctx);const core=ctx.NEXO_V17_PATTERN;
function add(out,nums,base){for(const n of nums)out.push({id:String(out.length+1),seq:out.length+1,minute_epoch:base+out.length*60,number:n,color:n===0?'white':n<=7?'red':'black'})}
test('V17: padrao 8 4 4 retorna cor oposta na 1a rodada 5x',()=>{
 const rows=[];for(let j=0;j<5;j++)add(rows,[8,4,4,10,2,7,0],1795000000);
 const result=core.mine(rows,{minHits:5,maxLength:3});const match=result.items.find(x=>x.tokens.join(',')==='n:8,n:4,n:4'&&x.target==='black');assert.ok(match);assert.equal(match.first,5);assert.equal(match.fail,0);
});
test('V17: padrao nao promete 100% quando possui falhas',()=>{
 const rows=[];for(let j=0;j<5;j++)add(rows,[8,4,4,10,2,7,0],1795000000);add(rows,[8,4,4,3,2,7,0],1795000000);
 const result=core.mine(rows,{minHits:5,maxLength:3});assert.ok(!result.items.some(x=>x.tokens.join(',')==='n:8,n:4,n:4'&&x.target==='black'));
});
test('V17: respeita sequencia de casas distintas e intervalos de coleta',()=>{
 const rows=[];for(let j=0;j<5;j++)add(rows,[8,4,4,3,10,2,7,0],1795000000);const result=core.mine(rows,{minHits:5,maxLength:3});const found=result.items.find(x=>x.tokens.join(',')==='n:8,n:4,n:4'&&x.target==='black');assert.ok(found);assert.equal(found.first,0);assert.equal(found.second,5);
});
test('V17: branco 0 e uma cor separada; padroes descontinuos nao contam',()=>{
 const rows=[];for(let j=0;j<5;j++)add(rows,[8,4,4,0,2,7],1795000000);let result=core.mine(rows,{minHits:5,maxLength:3});assert.ok(result.items.some(x=>x.tokens.join(',')==='n:8,n:4,n:4'&&x.target==='white'));
 rows[3].seq+=20;result=core.mine(rows,{minHits:5,maxLength:3});assert.ok(!result.items.some(x=>x.tokens.join(',')==='n:8,n:4,n:4'&&x.target==='white'));
});
