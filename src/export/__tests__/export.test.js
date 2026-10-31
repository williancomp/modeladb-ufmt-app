import { expect, test, describe } from 'vitest';
import { exportCode } from '../index.js';

describe('Multi-Export', () => {
  const sampleIR = {
    entities: [
      {
        id: 'user',
        name: 'User',
        attributes: [
          { name: 'id', type: 'simple', dataType: 'integer', primaryKey: true },
          { name: 'email', type: 'simple', dataType: 'string', primaryKey: false }
        ]
      },
      {
        id: 'post',
        name: 'Post',
        attributes: [
          { name: 'title', type: 'simple', dataType: 'string', primaryKey: false }
        ]
      }
    ],
    relationships: [
      {
        id: 'user_post',
        name: 'Creates',
        participants: [
          { entityId: 'user', cardinality: { min: 1, max: 1 } },
          { entityId: 'post', cardinality: { min: 0, max: 'N' } }
        ]
      }
    ]
  };

  test('Export PostgreSQL DDL', () => {
    const code = exportCode(sampleIR, 'postgres');
    expect(code).toContain('CREATE TABLE "user"');
    expect(code).toContain('id SERIAL');
    expect(code).toContain('email VARCHAR(255)');
    expect(code).toContain('CREATE TABLE post');
    expect(code).toContain('FOREIGN KEY (user_id)');
  });

  test('Export Laravel', () => {
    const code = exportCode(sampleIR, 'laravel');
    expect(code).toContain('Schema::create(\'user\'');
    expect(code).toContain('$table->id()');
    expect(code).toContain('$table->string(\'email\')');
    expect(code).toContain('$table->foreign(\'user_id\')');
  });

  test('Export Prisma', () => {
    const code = exportCode(sampleIR, 'prisma');
    expect(code).toContain('model User {');
    expect(code).toContain('id Int @id @default(autoincrement())');
    expect(code).toContain('email String');
  });

  test('Export Django', () => {
    const code = exportCode(sampleIR, 'django');
    expect(code).toContain('class User(models.Model):');
    expect(code).toContain('email = models.CharField(max_length=255, null=True, blank=True)');
    expect(code).toContain('class Post(models.Model):');
    expect(code).toContain("user_id = models.ForeignKey('User', on_delete=models.CASCADE, db_column='user_id', related_name='+'");
  });

  test('Export GraphQL', () => {
    const code = exportCode(sampleIR, 'graphql');
    expect(code).toContain('type User {');
    expect(code).toContain('email: String');
    expect(code).toContain('post: [Post]');
    expect(code).toContain('type Post {');
  });

  test('Export JSON Schema', () => {
    const code = exportCode(sampleIR, 'jsonschema');
    const parsed = JSON.parse(code);
    expect(parsed.properties.user.properties.email.type).toBe('string');
  });
});
