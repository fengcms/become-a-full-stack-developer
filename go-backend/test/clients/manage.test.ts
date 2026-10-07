import { test } from '../../../manage-frontend/node_modules/vitest';
import { request } from '../../../manage-frontend/src/lib/request/core';
import { useAuthStore } from '../../../manage-frontend/src/store/auth';
import { browserFlow } from './browser-flow';
test('现有管理后台请求层访问真实Go服务并刷新重放',()=>browserFlow(request,useAuthStore));
