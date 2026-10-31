import { exportPostgres, exportMysql, exportSqlite, exportMariadb } from './sql.js';
import { exportLaravel, exportPrisma, exportDjango } from './orm.js';
import { exportGraphql, exportJsonSchema } from './schema.js';

export const exporters = {
  postgres: { name: 'PostgreSQL DDL', format: 'sql', generator: exportPostgres },
  mysql: { name: 'MySQL DDL', format: 'sql', generator: exportMysql },
  mariadb: { name: 'MariaDB DDL', format: 'sql', generator: exportMariadb },
  sqlite: { name: 'SQLite DDL', format: 'sql', generator: exportSqlite },
  laravel: { name: 'Laravel Migrations', format: 'php', generator: exportLaravel },
  prisma: { name: 'Prisma Schema', format: 'prisma', generator: exportPrisma },
  django: { name: 'Django Models', format: 'py', generator: exportDjango },
  graphql: { name: 'GraphQL SDL', format: 'graphql', generator: exportGraphql },
  jsonschema: { name: 'JSON Schema', format: 'json', generator: exportJsonSchema },
  ir: { name: 'MerDB-IR (JSON)', format: 'json', generator: (ir) => JSON.stringify(ir, null, 2) }
};

export function exportCode(ir, target) {
  if (!exporters[target]) throw new Error(`Unknown export target: ${target}`);
  return exporters[target].generator(ir);
}
