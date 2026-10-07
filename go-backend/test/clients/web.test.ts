import { test } from '../../../manage-frontend/node_modules/vitest';
import { request } from '../../../web-frontend/lib/request/core';
import { useAuthStore } from '../../../web-frontend/store/auth';
import { browserFlow } from './browser-flow';
test('现有网页请求层访问真实Go服务并刷新重放',()=>browserFlow(request,useAuthStore));
