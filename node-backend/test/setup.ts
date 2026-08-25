/**
 * test/setup.ts
 * 测试前置：注入测试环境（JWT 密钥等）+ 内存 SQLite，确保导入应用模块时配置已就绪。
 * 本文件在测试用例之前执行。
 */
process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV ??= 'test';

import { readEnv, setActiveEnv } from '../src/config/env';
import { createLocalDb, setDb } from '../src/db/client';
import { migrate } from '../src/db/migrate';

const env = readEnv(process.env as Record<string, string | undefined>);
setActiveEnv(env);

const db = createLocalDb(':memory:');
migrate(db);
setDb(db);
