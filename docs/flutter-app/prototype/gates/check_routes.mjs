// 门禁 1/6 · 路由覆盖
//
// 期望值来源：从被测文件自身抽取 `const ROUTES = [...]`，绝不手写路由清单。
// （手写清单会把「清单写错」伪装成「测试通过」——本轮整改的教训之一。）
//
// 用法：node check_routes.mjs
import { launch, FILE_02, Checker } from './lib.mjs';

const s = await import('node:fs').then(m => m.readFileSync(FILE_02, 'utf8'));

const tbl = s.match(/const ROUTES = \[([\s\S]*?)\n\];/);
if (!tbl) { console.error('未能在原型源码中定位 ROUTES 表'); process.exit(2); }
const paths = [...tbl[1].matchAll(/\{p:'([^']+)'/g)].map(m => m[1]);
if (!paths.length) { console.error('ROUTES 表解析出 0 条路由'); process.exit(2); }

const SUB = { slug: 'dual-deploy', id: '202' };
const routes = paths.map(p => Object.entries(SUB).reduce((q, [k, v]) => q.replaceAll(':' + k, v), p));

const ck = new Checker('路由覆盖');
console.log(`从源码 ROUTES 抽取 ${paths.length} 条路由 + 1 条未知路由（兜底）\n`);

const ses = await launch({ file: FILE_02 });
try {
  for (const r of routes) {
    const res = await ses.evaluate(`(async () => {
      location.hash = ${JSON.stringify('#' + r)};
      await new Promise(x => setTimeout(x, 180));
      const s = document.getElementById('screen');
      const txt = (s.textContent || '').replace(/\\s+/g, ' ').trim();
      return { len: txt.length, fallback: txt.includes('这个地址无法识别') };
    })()`);
    ck.assert(`路由 ${r} 有渲染内容`, res.len > 10, `文本长度 ${res.len}`);
    ck.assert(`路由 ${r} 未落入兜底`, res.fallback === false);
  }

  // 未知路由必须优雅兜底（不白屏）
  const fb = await ses.evaluate(`(async () => {
    location.hash = '#/definitely-not-a-route-' + Date.now();
    await new Promise(x => setTimeout(x, 200));
    const txt = (document.getElementById('screen').textContent || '').replace(/\\s+/g, ' ').trim();
    return { len: txt.length, hasExit: txt.includes('返回首页') };
  })()`);
  ck.assert('未知路由不白屏', fb.len > 10, `文本长度 ${fb.len}`);
  ck.assert('未知路由给出明确出口（返回首页）', fb.hasExit);

  const e = ses.errors();
  ck.assert('本轮零运行时异常', e.exceptions.length === 0, e.exceptions.slice(0, 3).join(' | '));
} finally {
  await ses.close();
}
process.exit(ck.report());
