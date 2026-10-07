import type Database from 'better-sqlite3';
import type { Db } from './client';

export interface Statement {
  sql: string;
  params: (string | number | null)[];
}
interface D1Statement {
  bind(...values: Statement['params']): D1Statement;
}
interface D1Client {
  prepare(query: string): D1Statement;
  batch(queries: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
}

/** 同一批 SQL 在 SQLite 事务或 D1 batch 中执行；异常整体回滚。 */
export async function atomic(db: Db, statements: Statement[]): Promise<number[]> {
  const client = (db as unknown as { $client: Database.Database | D1Client }).$client;
  if ('batch' in client) {
    const results = await client.batch(
      statements.map((s) => client.prepare(s.sql).bind(...s.params)),
    );
    return results.map((r) => r.meta.changes);
  }
  return client.transaction(() =>
    statements.map((s) => client.prepare(s.sql).run(...s.params).changes),
  )();
}
