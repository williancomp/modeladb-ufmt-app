import {describe, it, expect, afterEach} from 'vitest';
import { dictionaries, t, setLanguage, detectLanguage } from '../index.js';
import {validateModel} from '../../validation/engine.js';
import {exportCode} from '../../export/index.js';
import {toCanonicalIR} from '../../persistence/canonicalIR.js';
import {R006} from '../../validation/rules/common/R006_entity_plural_name.js';
import {R009} from '../../validation/rules/common/R009_default_entity_name.js';
import {R010} from '../../validation/rules/common/R010_default_attribute_name.js';
import {R007} from '../../validation/rules/common/R007_generic_relationship_name.js';
afterEach(() => setLanguage('pt'));
it('exige as mesmas chaves e parâmetros nos dois idiomas', () => {
 expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.pt).sort());
 for (const key of Object.keys(dictionaries.pt)) {
  expect(dictionaries.en[key]?.trim(), key).toBeTruthy();
  expect(dictionaries.en[key].match(/__VAR\d+__/g)?.sort(), key).toEqual(dictionaries.pt[key].match(/__VAR\d+__/g)?.sort());
 }
});
it('seleciona o idioma persistido ou do navegador', () => {
 expect(detectLanguage(null,'en-US')).toBe('en');
 expect(detectLanguage(null,'pt-PT')).toBe('pt');
 expect(detectLanguage('pt','en-GB')).toBe('pt');
 expect(detectLanguage('fr','de-DE')).toBe('en');
});
it('traduz templates preservando nomes do usuário', () => {
 setLanguage('en');
 expect(t("O nome 'Pessoa' está repetido. Use nomes distintos para identificar as entidades.")).toBe("The name 'Pessoa' is duplicated. Use distinct names to identify the entities.");
 expect(t('Salvar arquivo')).toBe('Save file');
 expect(t('Minha entidade')).toBe('Minha entidade');
});
describe('heurísticas bilíngues', () => {
 it.each(['Clientes','Customers','Children','People'])("R006 sinaliza %s", name => expect(R006.check({entities:[{id:0,name}]})).toHaveLength(1));
 it.each(['Cliente','Customer','Status','Analysis','Species','Business'])("R006 conserva %s", name => expect(R006.check({entities:[{id:0,name}]})).toHaveLength(0));
 it.each(['Entidade','Entity','Nova Entidade','New Entity'])("R009 sinaliza %s", name => expect(R009.check({entities:[{id:0,name}]})).toHaveLength(1));
 it.each(['Simples','Simple','Atributo','Attribute','Subattribute','New Attribute'])("R010 sinaliza %s", name => expect(R010.check({attributes:[{id:0,name}]})).toHaveLength(1));
 it.each(['Rel.','Relacionamento','Relationship'])("R007 sinaliza %s", name => expect(R007.check({relationships:[{id:0,name}]})).toHaveLength(1));
});
it('traduz as mensagens realmente retornadas pela validação sem alterar ids', () => {
 setLanguage('en');
 const issues=validateModel({entities:[{id:0,name:'Entity'}]});
 expect(issues.find(v=>v.ruleId==='R009').message).toContain('default name');
 expect(issues.find(v=>v.ruleId==='R001').name).toBe('Entity without an identifying attribute');
});
it('traduz comentários SQL e ORM preservando nomes e DDL', () => {
 setLanguage('en');
 const ir=toCanonicalIR({entities:[{id:0,name:'Pessoa'},{id:1,name:'Aluno'}],attributes:[{id:0,name:'cpf',parentType:'entity',parentId:0,primary:true}],specializations:[{id:0,genType:'P,D',connections:[{entityId:0,vertex:0},{entityId:1,vertex:1}]}]});
 const sql=exportCode(ir,'postgres');
 expect(sql).toContain('-- Exported for POSTGRES');
 expect(sql).toContain('GENERALIZATIONS / SPECIALIZATIONS');
 expect(sql).toContain('Strategy:');
 expect(sql).not.toContain('Estratégia');
 expect(sql).toContain('CREATE TABLE pessoa');
 expect(exportCode(ir,'prisma')).toContain('// Generalizations:');
});

it('traduz rótulos curtos usados pelo canvas e pelos alvos das violações', () => {
 setLanguage('en');
 expect(t('Atributo')).toBe('Attribute');
 expect(t('entidade')).toBe('entity');
 expect(t('generalização')).toBe('generalization');
 expect(t('(sem nome)')).toBe('(unnamed)');
 expect(t('CP')).toBe('Partial');
 expect(t('Diagrama ER')).toBe('ER Diagram');
});
