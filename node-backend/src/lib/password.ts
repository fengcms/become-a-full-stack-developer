/**
 * src/lib/password.ts
 * 密码哈希封装。选型 bcryptjs（纯 JS 实现，零原生编译依赖，契合 B0「本地 + CF 双端」诉求）。
 * 成本参数 12 轮：教程项目以安全可见性优先，注册/登录频次低，性能开销可接受。
 */
import { compare, hash } from 'bcryptjs';

/** bcrypt 成本因子（cost factor）。生产可据负载下调至 10–11。 */
const BCRYPT_ROUNDS = 12;

/**
 * 对明文密码做盐哈希。
 * @param plain 明文密码
 */
export const hashPassword = (plain: string): Promise<string> => hash(plain, BCRYPT_ROUNDS);

/**
 * 校验明文密码与存储哈希是否匹配。
 * @param plain 明文密码
 * @param storedHash 存储的 bcrypt 哈希
 */
export const verifyPassword = (plain: string, storedHash: string): Promise<boolean> =>
  compare(plain, storedHash);
