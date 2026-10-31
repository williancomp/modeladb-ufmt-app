import {describe,it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const root=resolve('src');
const sources = directory => readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory() ? (entry.name==='__tests__'?[]:sources(resolve(directory,entry.name))) : entry.name.endsWith('.js') ? [resolve(directory,entry.name)] : []);
describe('grafo de produção',()=>{
 it('alcança cada módulo de src a partir do aplicativo',()=>{
  const visited=new Set();
  function visit(file){
   if(visited.has(file))return;visited.add(file);
   const source=readFileSync(file,'utf8');
   for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    if(match[1].startsWith('.')&&match[1].endsWith('.js'))visit(resolve(dirname(file),match[1]));
   }
  }
  visit(resolve(root,'app.js'));
  expect(sources(root).filter(file=>!visited.has(file))).toEqual([]);
 });
});
describe('identidade pública',()=>{
 it('mantém os $id dos esquemas alinhados com a base configurável',async()=>{
  const {schemaId}=await import('../config.js');
  for(const file of ['merdb-ir.schema.json','merdb-v2.schema.json']){
   const schema=JSON.parse(readFileSync(resolve('schemas',file),'utf8'));
   expect(schema.$id).toBe(schemaId(file));
  }
 });
});
