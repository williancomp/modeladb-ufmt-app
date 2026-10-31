import { expect, test, describe } from 'vitest';
import { parseSQLToModel } from '../sqlParser.js';

describe('SQL Parser (Engenharia Reversa)', () => {
  const sampleSQL = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      title VARCHAR(255),
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE user_roles (
      user_id INTEGER,
      role_id INTEGER,
      granted_at DATETIME,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE roles (
      id INTEGER PRIMARY KEY,
      name VARCHAR(50)
    );
  `;

  test('Deve extrair entidades corretamente', () => {
    const model = parseSQLToModel(sampleSQL);

    // Entidades: users, posts, roles. user_roles deve virar relacionamento N:M
    expect(model.entities.length).toBe(3);
    const entityNames = model.entities.map((e) => e.name);
    expect(entityNames).toContain('users');
    expect(entityNames).toContain('posts');
    expect(entityNames).toContain('roles');
    expect(entityNames).not.toContain('user_roles');
  });

  test('Deve extrair atributos corretamente', () => {
    const model = parseSQLToModel(sampleSQL);
    const usersE = model.entities.find((e) => e.name === 'users');
    const userAttrs = model.attributes.filter(
      (a) => a.parentType === 'entity' && a.parentId === usersE.id,
    );

    expect(userAttrs.length).toBe(3); // id, name, email
    expect(userAttrs.find((a) => a.name === 'id').primary).toBe(true);
  });

  test('Deve identificar tabela N:M como relacionamento', () => {
    const model = parseSQLToModel(sampleSQL);

    const relNM = model.relationships.find((r) => r.name === 'user_roles');
    expect(relNM).toBeDefined();

    // Deve ter atributo granted_at
    const relAttrs = model.attributes.filter(
      (a) => a.parentType === 'relationship' && a.parentId === relNM.id,
    );
    expect(relAttrs.length).toBe(1);
    expect(relAttrs[0].name).toBe('granted_at');

    // Conexões
    expect(relNM.connections.length).toBe(2);
  });

  test('Deve identificar chave estrangeira 1:N como relacionamento', () => {
    const model = parseSQLToModel(sampleSQL);

    const rel1N = model.relationships.find((r) => r.name === 'rel_posts_users');
    expect(rel1N).toBeDefined();
    expect(rel1N.connections.length).toBe(2);

    const cN = rel1N.connections.find((c) => c.cardinality === '0,N');
    const c1 = rel1N.connections.find((c) => c.cardinality === '0,1');

    const postsE = model.entities.find((e) => e.name === 'posts');
    const usersE = model.entities.find((e) => e.name === 'users');

    expect(cN.entityId).toBe(postsE.id);
    expect(c1.entityId).toBe(usersE.id);
  });
});
