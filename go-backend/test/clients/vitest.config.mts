import { defineConfig } from '../../../manage-frontend/node_modules/vitest/dist/config.js';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
const client=process.env.CLIENT || 'web';
const tree=client==='web'?'web-frontend':client==='manage'?'manage-frontend/src':'taro-miniprogram/src';
export default defineConfig({
 resolve:{alias:{'@':path.join(root,tree),'@tarojs/taro':path.join(import.meta.dirname,'taro-transport.ts')}},
 define:{__API_BASE__:JSON.stringify((process.env.GO_BASE_URL||'http://127.0.0.1:8080')+'/api/v1')},
 test:{environment:'node',include:[`**/go-backend/test/clients/${client}*.test.ts`],testTimeout:30000,fileParallelism:false},
});
