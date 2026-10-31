import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {saveToLocalStorage,loadFromLocalStorage,scheduleLocalStorageSave} from '../localStorage.js';
const fixture = readFileSync(new URL('./fixtures/production-v1.merdb',import.meta.url),'utf8');
const createStorage = () => {
 const map=new Map();
 return {getItem:key=>map.get(key) || null, setItem:(key,value)=>map.set(key,value)};
};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('autosave real',()=>{
 it('lê a chave antiga e grava o formato v2 na chave atual',()=>{
  const storage=createStorage();storage.setItem('diagramData',fixture);
  const data=loadFromLocalStorage(storage);
  expect(saveToLocalStorage(data,storage)).toBe(true);
  expect(JSON.parse(storage.getItem('modeladb:diagramData')).version).toBe('2.0');
  expect(loadFromLocalStorage(storage)).toEqual(data);
 });
 it('não altera o documento se dados persistidos estiverem inválidos',()=>{
  const storage=createStorage();storage.setItem('modeladb:diagramData','{');
  expect(loadFromLocalStorage(storage)).toBeNull();
  expect(saveToLocalStorage({}, {setItem(){throw new Error('QuotaExceededError');}})).toBe(false);
 });
 it('agrupa edições e obtém o estado mais recente ao salvar',()=>{
  vi.useFakeTimers();const storage=createStorage();vi.stubGlobal('localStorage',storage);
  let data=JSON.parse(fixture);const onSaved=vi.fn();
  scheduleLocalStorageSave(()=>data,onSaved);
  data={...data,fontSize:24};scheduleLocalStorageSave(()=>data,onSaved);
  vi.advanceTimersByTime(800);
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(true);
  expect(loadFromLocalStorage(storage).fontSize).toBe(24);
 });
});
