/**
 * src/db/client.ts
 * 数据库适配层（对应主计划"适配层"第一处）。业务代码统一通过 getDb() 访问，
 * 不感知底层是本地 SQLite 还是 Cloudflare D1——"脏活"收敛在边界。
 */

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import * as schema from '@/db/schema';

/** 本地 SQLite（better-sqlite3）的 Drizzle 数据库类型，作为全局统一类型。 */
export type Db = BetterSQLite3Database<typeof schema>;

/** Cloudflare D1 驱动入参类型，用 Parameters 反推避免引入 @cloudflare/workers-types。 */
type D1Binding = Parameters<typeof drizzleD1>[0];

let current: Db | null = null;

/**
 * 注入数据库实例（测试 / CF 入口调用）。
 * @param db Drizzle 数据库实例
 */
export const setDb = (db: Db): void => {
  current = db;
};

/** 取当前数据库实例；未初始化时抛错。 */
export const getDb = (): Db => {
  if (!current) throw new Error('Database not initialized; call setDb() first.');
  return current;
};

/**
 * 创建本地 SQLite 数据库（Node 开发 / 测试）。
 * @param file 文件路径，默认内存库 :memory:
 */
export const createLocalDb = (file = ':memory:'): Db => drizzle(new Database(file), { schema });

/**
 * 创建 Cloudflare D1 数据库。适配层边界：D1 驱动返回类型与本地 Db 不同，但二者共享
 * 同一 Drizzle SQLite 内核，在此做一次受控转换（非 any），业务层无感。
 * @param binding CF 注入的 D1Database
 */
export const createD1Db = (binding: D1Binding): Db =>
  drizzleD1(binding, { schema }) as unknown as Db;
