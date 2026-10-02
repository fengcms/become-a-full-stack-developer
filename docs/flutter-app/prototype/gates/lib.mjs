// M4 原型门禁 · 公共库：启动 Chrome、连 CDP、求值、收错误。
// 零外部依赖：Node 22 原生 fetch + WebSocket。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTOTYPE_DIR = path.resolve(HERE, '..');
export const FILE_02 = path.join(PROTOTYPE_DIR, '02-高保真可交互原型.html');
export const FILE_01 = path.join(PROTOTYPE_DIR, '01-基本页面样稿.html');
export const DART_FILE = path.join(PROTOTYPE_DIR, 'app_theme.dart');

/** 定位 Chrome。可用 CHROME_BIN 覆盖。 */
export function findChrome() {
  const cands = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('未找到 Chrome/Chromium。请设置环境变量 CHROME_BIN 指向可执行文件。');
}

/**
 * 启动一个页面并连接 CDP。
 * @param {{file:string, port?:number, width?:number, height?:number}} opts
 */
export async function launch({ file, port = 9200 + Math.floor(Math.random() * 700), width = 393, height = 852 }) {
  const chrome = findChrome();
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-extensions', '--disable-background-networking',
    // 本机/CI 常见：环境里设了 HTTP_PROXY，别让 Chrome 拿它去连 localhost
    '--no-proxy-server',
    `--user-data-dir=${path.join(process.env.TMPDIR || '/tmp', 'm4-gate-profile-' + port)}`,
    `--window-size=${width},${height}`,
    'file://' + encodeURI(file),
  ];
  // 沙箱在本环境（以及多数容器/CI）会初始化失败并连带拖垮网络服务，
  // 默认关闭；确需开启时设 M4_KEEP_SANDBOX=1。
  if (process.env.M4_KEEP_SANDBOX !== '1') args.splice(1, 0, '--no-sandbox');
  const proc = spawn(chrome, args, { stdio: 'ignore' });

  let target = null;
  const deadline = Date.now() + 20000;
  while (!target && Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      target = (await r.json()).find(t => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    } catch { /* 还没起来 */ }
    if (!target) await sleep(250);
  }
  if (!target) {
    proc.kill();
    throw new Error('CDP 目标 20s 内未就绪。排查：Chrome 能否启动（试试 M4_KEEP_SANDBOX=1）、端口是否被占、沙箱是否被拦。');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, m => (m.error ? reject(new Error(method + ': ' + JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('页面求值异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }

  /** 从此刻起收集的错误（先清空，便于只统计本轮交互） */
  function resetErrors() { events.length = 0; }
  function errors() {
    return {
      exceptions: events.filter(e => e.method === 'Runtime.exceptionThrown')
        .map(e => e.params?.exceptionDetails?.exception?.description || e.params?.exceptionDetails?.text || '(unknown)'),
      logErrors: events.filter(e => e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
        .map(e => e.params.entry.text),
      consoleErrors: events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
        .map(e => (e.params.args || []).map(a => a.value ?? a.description).join(' ')),
    };
  }

  return {
    proc,
    send,
    evaluate,
    events,
    resetErrors,
    errors,
    async close() {
      try { ws.close(); } catch {}
      proc.kill();
    },
  };
}

/** 简单断言收集器：打印明细 + 返回退出码。 */
export class Checker {
  constructor(title) { this.title = title; this.rows = []; }
  ok(name) { this.rows.push({ pass: true, name }); }
  bad(name, detail = '') { this.rows.push({ pass: false, name, detail }); }
  assert(name, cond, detail = '') { cond ? this.ok(name) : this.bad(name, detail); }
  report() {
    const pass = this.rows.filter(r => r.pass).length;
    for (const r of this.rows) console.log(`${r.pass ? '  PASS' : '  FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
    console.log(`\n[${this.title}] ${pass}/${this.rows.length} 通过`);
    return this.rows.every(r => r.pass) ? 0 : 1;
  }
}
