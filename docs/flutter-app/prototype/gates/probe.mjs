// 门禁 5/6 · 交互回归（无头 Chrome + CDP 实测）
//
// 原则：**测真行为，不测自陈**。要点是几条容易「看起来对」的地方：
//   · 目录点击必须真的改变 scrollTop，而不是只弹一句「已定位」；
//   · 拿不到锚点时必须如实提示，不能谎报成功（与复制链接同一原则）；
//   · 复制链接在无剪贴板权限的环境下必须报失败；
//   · 详情页不得渲染契约不可达的审核态徽章；
//   · 编辑器的保存按钮必须随稿件状态变化（否则「保存草稿」＝变相撤回）。
//
// 用法：node probe.mjs
// 退出码：0 全绿 / 1 有断言失败 / 2 输入缺失
import { launch, FILE_02, Checker } from './lib.mjs';

const ck = new Checker('交互回归');

const PAGE = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $  = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const scr = () => document.getElementById('screen');
  const txt = () => (scr().textContent || '').replace(/\s+/g, ' ').trim();
  const toastText = () => (document.getElementById('toast') || {}).textContent || '';
  const sheetText = () => (($('.sheet.show') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  const snap = async (hash) => { location.hash = hash; await sleep(220); };

  const out = {};
  const slug = (ARTICLES[0].slug || ARTICLES[0].id);

  // ---- 1. 点赞 / 收藏 / 未登录回跳 ----
  S.auth = 'in';
  await snap('#/articles/' + slug);
  const likedBefore = !!$('.act.on');
  handleAct('like:' + ARTICLES[0].id); await sleep(80);
  out.like = { before: likedBefore, after: !!$('.act.on'), text: (($('.act') || {}).textContent || '').trim() };
  handleAct('like:' + ARTICLES[0].id); await sleep(80);
  out.like.unlike = !$('.act.on');
  handleAct('fav:' + ARTICLES[0].id); await sleep(80);
  out.fav = { saved: S.faved.has(ARTICLES[0].id), label: ($$('.act')[1].textContent || '').trim() };
  handleAct('fav:' + ARTICLES[0].id); await sleep(80);
  out.fav.unsaved = !S.faved.has(ARTICLES[0].id);

  S.auth = 'out';
  await snap('#/articles/' + slug);
  handleAct('like:' + ARTICLES[0].id); await sleep(150);
  out.gate = { hash: location.hash, redirect: S.redirect };
  handleAct('auth:submit'); await sleep(200);
  out.gate.backTo = location.hash;
  out.gate.loggedIn = S.auth === 'in';

  // ---- 2. 文章「更多」面板：无举报、有复制链接与系统分享 ----
  await snap('#/articles/' + slug);
  ($('[data-act="article:more"]') || {click(){}}).click(); await sleep(150);
  out.more = {
    text: sheetText(),
    hasReport: /举报/.test(sheetText()),
    hasCopy: /复制链接/.test(sheetText()),
    hasShare: /系统分享/.test(sheetText()),
  };
  const copy = $('.sheet.show [data-act^="copy:"]');
  if (copy) { copy.click(); await sleep(200); }
  out.more.copyToast = toastText();
  out.more.copyReportedSuccess = /已复制/.test(toastText());

  // ---- 3. 详情页评论：删除入口可达性 + 措辞 + 不得出现审核态徽章 ----
  await snap('#/articles/' + slug);
  // 契约允许作者删除自己的评论（含回复），所以「我发的评论」必须点得到删除。
  const mineCount = COMMENTS.reduce((n, c) =>
    n + (c.userId === ME.id ? 1 : 0) + c.replies.filter(x => x.userId === ME.id).length, 0);
  const delBtns = $$('[data-act^="cmt-del:"]');
  out.comment = { mineCount, deleteEntries: delBtns.length };
  if (delBtns[0]) { delBtns[0].click(); await sleep(180); }
  out.comment.delSheet = sheetText();
  out.comment.delWording = /一并删除/.test(out.comment.delSheet);
  handleAct('sheet:close'); await sleep(120);

  // ---- 4. 发帖被拒即时反馈（状态注入，契约可达的那一种） ----
  const rj = $('[data-state-set="reject"]');
  if (rj) { rj.click(); await sleep(220); }
  await snap('#/articles/' + slug);
  const bar = $('.cmtrej');
  const barTxt = bar ? bar.textContent : '\u0000__no_bar__';
  // 反馈条自身写着「评论未通过审核」，属正常；要查的是**除它之外**不得出现审核态字样。
  const restTxt = txt().split(barTxt).join(' ');
  out.reject = {
    barShown: !!bar,
    text: (barTxt === '\u0000__no_bar__' ? '' : barTxt).replace(/\s+/g, ' ').trim(),
    statusBadges: $$('.cmt .chip, .cmt [class*="badge"]').length,
    hasReviewingWord: /复核中/.test(restTxt),
    hasRejectedWord: /未通过|已被拒/.test(restTxt),
  };
  const nn = $('[data-state-set="normal"]'); if (nn) { nn.click(); await sleep(150); }

  // ---- 5. 目录：顶栏入口 + 真滚动 + 缺锚点时不谎报 ----
  //      期望值一律从页面自身的 TOC 派生。上一版把锚点写死成一个本地序号序列
  //      （"h-" 加数字，形如 h-1…h-5），既违反「期望值程序化推导」，又在 A-1 整改后直接失效——已改。
  //      注：此处刻意不写出那个字面量形态，免得与自家 README 规则 #4（源码断言别被注释救活）自相矛盾。
  await snap('#/articles/' + slug);
  /* 涉及接口栏：契约里存在但本阶段不渲染成 UI 的端点必须分栏并带角标（第四轮 A-8） */
  out.apiMark = (() => {
    const main = $('.notes .api:not(.opt)');
    const optional = $('.notes .api.opt');
    const marks = $$('.notes .api.opt .optmark');
    return {
      hasMain: !!main,
      mainHasRelated: main ? /\/related/.test(main.textContent) : null,
      hasOptional: !!optional,
      optCount: marks.length,
      optText: marks.length ? marks[0].textContent.trim() : '',
      optLineHasPath: optional
        ? /\/articles\/\{id\}\/related/.test(optional.textContent.replace(/\s+/g, '')) : false,
    };
  })();
  const tocAnchors = TOC.map(t => t.anchor);
  const heads = $$('.prose h2, .prose h3');
  const headIds = heads.map(h => h.id);
  out.toc = {
    entries: TOC.length,
    anchors: tocAnchors,
    levels: TOC.map(t => t.level),
    headingIds: headIds,
    headingTags: heads.map(h => h.tagName),
    anchorUnique: new Set(tocAnchors).size === tocAnchors.length && tocAnchors.every(a => !!a),
    /* P1 回归探测器：锚点若退回「本地序号形态」（^h-数字$）即命中 */
    localSeqAnchors: headIds.filter(id => /^h-\d+$/.test(id)),
    /* 正文标题 id 必须与 TOC.anchor 逐条相等、且同序 */
    idsMatchToc: heads.length === TOC.length && heads.every((h, i) => h.id === tocAnchors[i]),
  };

  ($('[data-act="toc:panel"]') || {click(){}}).click(); await sleep(150);
  out.toc.panelOpen = /本文目录/.test(sheetText());
  out.toc.panelItems = $$('.sheet.show [data-act^="toc:"]').length;

  const item = $$('.sheet.show [data-act^="toc:"]')[2] || $$('.sheet.show [data-act^="toc:"]')[0];
  scr().scrollTop = 0; await sleep(60);
  const b3 = scr().scrollTop;
  if (item) item.click();
  await sleep(250);
  out.toc.pick = { before: b3, after: scr().scrollTop, delta: scr().scrollTop - b3, toast: toastText() };
  out.toc.closedAfterPick = !/本文目录/.test(sheetText());

  /* 缺锚点时不谎报：临时摘掉第 4 节标题的 id，再点它 */
  const h4 = document.getElementById(tocAnchors[3]);
  const savedId = h4 && h4.id;
  if (h4) h4.removeAttribute('id');
  scr().scrollTop = 0; await sleep(60);
  handleAct('toc:' + tocAnchors[3]); await sleep(200);
  out.toc.missing = { scrollTop: scr().scrollTop, toast: toastText() };
  if (h4 && savedId) h4.id = savedId;

  // ---- 6. 我的文章：撤回已移除 + 待审文案 ----
  await snap('#/member/articles');
  out.mine = { text: txt() };
  out.mine.hasWithdrawWord = /撤回/.test(out.mine.text);
  out.mine.pendingChip = /审核中，可以继续编辑/.test(out.mine.text);
  out.mine.oldChip = /编辑后撤回/.test(out.mine.text);

  // ---- 7. 编辑器按钮矩阵（N-1） ----
  const grab = () => $$('.editor-acts button').map(b => (b.textContent || '').trim());
  const editor = async (id) => { await snap('#/member/articles/' + id + '/edit'); return { btns: grab(), text: txt() }; };
  out.editor = { draft: await editor(201), pending: await editor(202), published: await editor(203) };

  // ---- 8. 兜底路由 ----
  await snap('#/definitely-not-a-route-' + Date.now());
  out.fallback = { len: txt().length, hasExit: /返回首页/.test(txt()) };

  // ---- 9. 四态注入 / 搜索 / 分类展开 / 通知已读 / 主题切换 ----
  const inject = async (state) => {
    const b = $('[data-state-set="' + state + '"]');
    if (b) { b.click(); await sleep(200); }
    await snap('#/');
    return txt();
  };
  const home = await inject('normal');
  out.states = {
    normal: { len: home.length, skeleton: $$('.skline, .skcard, [class*="skeleton"]').length },
    loading: { skeleton: (await inject('loading')).length, hasSkeletonEl: $$('.skline, .skcard, [class*="skeleton"]').length },
    empty: { text: (await inject('empty')).slice(0, 60) },
    error: { text: (await inject('error')).slice(0, 60) },
  };
  const nn2 = $('[data-state-set="normal"]'); if (nn2) { nn2.click(); await sleep(150); }

  await snap('#/search');
  // 搜索的 act 形态是 search:quick:<kw>（k=a 两段，不是 quick:<kw>）
  handleAct('search:quick:双部署'); await sleep(220);
  out.search = { hit: /双部署/.test(txt()), text: txt().slice(0, 60) };
  handleAct('search:quick:zzzz不存在zzzz'); await sleep(220);
  out.search.missText = txt().slice(0, 70);
  out.search.missIsEmptyNotError = !/加载失败|出错了|500/.test(out.search.missText);
  handleAct('search:quick:'); await sleep(150);

  await snap('#/categories');
  const before = S.catOpen.size;
  // 展开热区在 .crow 上（.cnode 只有 data-cat，没有 data-act）
  const toggle = $('[data-act^="cat:toggle"]');
  if (toggle) { toggle.click(); await sleep(200); }
  out.category = { before, after: S.catOpen.size, changed: S.catOpen.size !== before, found: !!toggle };

  S.auth = 'in';
  await snap('#/member/notifications');
  out.notify = { unreadBefore: unreadCount() };
  handleAct('notif:readall'); await sleep(200);
  out.notify.unreadAfter = unreadCount();
  out.notify.toast = toastText();

  const themeBefore = document.documentElement.getAttribute('data-theme');
  applyTheme('dark'); await sleep(120);
  out.theme = { before: themeBefore, dark: document.documentElement.getAttribute('data-theme') };
  applyTheme('light'); await sleep(120);
  out.theme.light = document.documentElement.getAttribute('data-theme');

  // ---- 10. 会员中心 Cell 菜单 + 个人资料/设置分拆（本轮 UI 调整） ----
  S.auth = 'in';
  S.readNotif.clear();                      // 还原未读，便于验证角标
  await snap('#/member');
  const cells = $$('.cellgroup .cell');
  // 期望顺序从 NAV 表的「会员中心」分组推导，不手写清单
  const navGroup = (NAV.find(x => x.g === '会员中心') || { items: [] }).items
    .map(i => i.n).filter(n => n !== '会员首页');
  out.memberUi = {
    grid6: $$('.grid6').length,
    groups: $$('.cellgroup').length,
    labels: cells.map(c => (c.querySelector('.ct strong') || {}).textContent || ''),
    icons: cells.map(c => {
      const u = c.querySelector('use'); return u ? u.getAttribute('href') : null;
    }),
    navTargets: cells.map(c => c.getAttribute('data-nav')).filter(Boolean),
    expectedOrder: navGroup,
    badge: ($('.cell .cd') || {}).textContent || null,
    appbarCogTo: $('.appbar .iconbtn[aria-label="设置"]')?.getAttribute('data-nav') ?? null,
    leftoverTile: $$('button.cell .n, .grid6 button').length,
  };

  await snap('#/member/profile');
  {
    const t = txt();
    out.split = {
      profileTitle: ($('.appbar-title') || {}).textContent,
      profileInputs: $$('.card-pad input, .card-pad textarea').length,
      profileHasBio: /个人简介/.test(t),
      profileHasTheme: /跟随系统/.test(t),
      profileHasLogout: /退出登录/.test(t),
      profileHasPassword: /修改密码/.test(t),
      readonlyLabels: $$('.cellgroup .cell.plain .ct strong').map(e => e.textContent.trim()),
      readonlyValues: $$('.cellgroup .cell.plain .cv').map(e => e.textContent.trim()),
    };
  }
  await snap('#/member/settings');
  {
    const t = txt();
    const opts = $$('.cellgroup .cell[data-act^="setting:theme"]');
    const idx = $$('.cellgroup .cell .radio').findIndex(x => x.classList.contains('on'));
    out.split.settingsTitle = ($('.appbar-title') || {}).textContent;
    out.split.themeOptions = opts.length;
    out.split.themeAct = opts.map(o => o.getAttribute('data-act'));
    out.split.radioOnIdx = idx;
    out.split.settingsHasPassword = /修改密码/.test(t);
    out.split.settingsHasLogout = /退出登录/.test(t);
    out.split.settingsHasVersion = /版本/.test(t);
    out.split.dangerCells = $$('.cell.danger').length;
    // 设置页真切主题：点深色 → data-theme 必须变，且选中态迁移
    const t0 = document.documentElement.getAttribute('data-theme');
    const dk = $('.cell[data-act="setting:theme:dark"]');
    if (dk) { dk.click(); await sleep(220); }
    out.split.themeAfter = document.documentElement.getAttribute('data-theme');
    out.split.themeBefore = t0;
    out.split.themeToast = toastText();
    out.split.radioOnIdxAfter = $$('.cellgroup .cell .radio').findIndex(x => x.classList.contains('on'));
    const sys = $('.cell[data-act="setting:theme:system"]');
    if (sys) { sys.click(); await sleep(180); }
  }

  // ---- 11. 通用组件形态（本轮修复的运行时回归探测器） ----
  // 静态侧由 check_ui_standard.py 守（选择器/令牌/死图标），这里守「渲染出来到底对不对」。
  await snap('#/member/settings');
  {
    // 先切到浅色再量：深色下 06 §2.4 未给 color.line.button 取值，原型与 app_theme 都
    // 只能沿用 line.strong，两者同值 → 在深色里量「边界是否用了 line.button」没有区分力。
    const lightCell = $('.cell[data-act="setting:theme:light"]');
    if (lightCell) { lightCell.click(); await sleep(220); }

    const host = $('.screen');
    const probeBorder = (val) => {
      const e = document.createElement('div');
      e.style.borderTop = '1px solid ' + val;
      host.appendChild(e);
      const c = getComputedStyle(e).borderTopColor;
      e.remove();
      return c;
    };
    out.ctl = {
      theme: document.documentElement.getAttribute('data-theme'),
      lineButton: probeBorder('var(--line-button)'),
      lineStrong: probeBorder('var(--line-strong)'),
    };
    const sec = document.createElement('button');
    sec.className = 'b sec';
    sec.textContent = 'x';
    host.appendChild(sec);
    out.ctl.secBorder = getComputedStyle(sec).borderTopColor;
    sec.remove();

    const inp = document.createElement('input');
    inp.className = 'inp';
    host.appendChild(inp);
    inp.focus();
    const ics = getComputedStyle(inp);
    out.ctl.focusWidth = ics.outlineWidth;
    out.ctl.focusOffset = ics.outlineOffset;
    inp.remove();

    const on = $('.cellgroup .cell .radio.on');
    const off = $$('.cellgroup .cell .radio').find(x => !x.classList.contains('on'));
    const onCs = on ? getComputedStyle(on, '::after') : null;
    const offCs = off ? getComputedStyle(off, '::after') : null;
    const cellEl = on ? on.closest('.cell') : null;
    out.ctl.onChildren = on ? on.children.length : -1;
    out.ctl.onBox = on ? [on.getBoundingClientRect().width, on.getBoundingClientRect().height] : null;
    out.ctl.onDot = onCs ? { w: onCs.width, h: onCs.height, transform: onCs.transform, bg: onCs.backgroundColor } : null;
    out.ctl.offDot = offCs ? { transform: offCs.transform } : null;
    out.ctl.cellTapH = cellEl ? Math.round(cellEl.getBoundingClientRect().height) : -1;
    out.ctl.durFast = getComputedStyle(document.documentElement).getPropertyValue('--dur-fast').trim();

    // 还原为「跟随系统」，不给后续/复跑留状态
    const sysCell = $('.cell[data-act="setting:theme:system"]');
    if (sysCell) { sysCell.click(); await sleep(180); }
    out.ctl.themeRestored = document.documentElement.getAttribute('data-theme');
  }

  return out;
})()`;

if (!(await import('node:fs')).existsSync(FILE_02)) {
  console.error('输入缺失：', FILE_02); process.exit(2);
}

const ses = await launch({ file: FILE_02 });
let r;
try {
  r = await ses.evaluate(PAGE);
} finally {
  var errs = ses.errors();
  await ses.close();
}

// ---------------- 断言 ----------------
ck.assert('点赞按钮状态可切换', r.like.before === false && r.like.after === true);
ck.assert('取消点赞生效', r.like.unlike === true);
ck.assert('收藏写入并可取消', r.fav.saved === true && r.fav.unsaved === true);
ck.assert('收藏按钮文案变化', /已收藏/.test(r.fav.label), r.fav.label);
ck.assert('未登录点赞跳登录', r.gate.hash === '#/login', r.gate.hash);
ck.assert('未登录时记录回跳地址', r.gate.redirect === '#/articles/dual-deploy', String(r.gate.redirect));
ck.assert('登录后回跳原路径', r.gate.backTo === '#/articles/dual-deploy', r.gate.backTo);
ck.assert('登录态已置为已登录', r.gate.loggedIn === true);

ck.assert('文章操作面板不含「举报」', r.more.hasReport === false, r.more.text.slice(0, 80));
ck.assert('文章操作面板含「复制链接」', r.more.hasCopy === true);
ck.assert('文章操作面板含「系统分享」', r.more.hasShare === true);
ck.assert('复制链接失败时不谎报成功', r.more.copyReportedSuccess === false, `toast=${r.more.copyToast}`);

ck.assert('我发的评论都有可点的删除入口（删除流程必须可达）',
  r.comment.mineCount > 0 && r.comment.deleteEntries === r.comment.mineCount,
  `我的评论 ${r.comment.mineCount} 条 / 删除入口 ${r.comment.deleteEntries} 个`);
ck.assert('删除评论措辞含「一并删除」', r.comment.delWording === true, r.comment.delSheet.slice(0, 60));

ck.assert('发帖被拒反馈条可达', r.reject.barShown === true);
ck.assert('发帖被拒文案说明非历史状态', /不是可回查的历史状态/.test(r.reject.text));
ck.assert('详情页不渲染任何审核态徽章', r.reject.statusBadges === 0, `数量 ${r.reject.statusBadges}`);
ck.assert('除被拒反馈条外无「复核中」字样', r.reject.hasReviewingWord === false);
ck.assert('除被拒反馈条外无「未通过」字样', r.reject.hasRejectedWord === false);

ck.assert('目录条目数与正文标题数一致', r.toc.entries === 5 && r.toc.headingIds.length === 5,
  `条目 ${r.toc.entries} / 标题 ${r.toc.headingIds.length}`);
/* ⚠️ 下面这两条锚点断言的能力边界（第四轮 A-7，别过度解读）：
   ① 正文 id 与 TOC.anchor 逐条相等：因二者同源于 SECTIONS，是**构造上必然成立**的，
      它只能拦「两处各写一份锚点」，**不能**证明锚点与服务端一致；
   ② 本地序号形态：只拦 "h-" 加数字这一种回退形态，换成 sec-1 / heading-1 等其它
      本地编号方案，两条断言都会通过。
   → 「配对规则成立」的证据只能来自 Phase 2 用含重复标题 / 代码块内 # 行 / Setext 标题的
     夹具文章实测（产品侧 03 §6），本原型不具备这三类样本，门禁全绿 ≠ 目录可上线。 */
ck.assert('正文标题 id 与 TOC.anchor 逐条相等且同序（A-1 核心）', r.toc.idsMatchToc === true,
  `标题 id ${JSON.stringify(r.toc.headingIds)}`);
ck.assert('锚点不得是本地序号形态 h-数字（A-1 回归探测器）', r.toc.localSeqAnchors.length === 0,
  `命中 ${JSON.stringify(r.toc.localSeqAnchors)}`);
ck.assert('TOC.anchor 唯一且非空', r.toc.anchorUnique === true, JSON.stringify(r.toc.anchors));
/* 本断言验证的是原型自己的派生假设（level+1 → h 标签），属自洽校验、非契约校验：
   mock 只到 2 级，且 level=6 时会比较 'H7' === 'H7' 而**照样通过**。故它不能证明
   「3 级以上的标签口径正确」——那取决于产品口径「目录最多支持几级」，尚未冻结。 */
ck.assert('标题层级由 TOC.level 决定（level+1 → h 标签）',
  r.toc.levels.every((lv, i) => r.toc.headingTags[i] === 'H' + (lv + 1)),
  `${JSON.stringify(r.toc.headingTags)} / levels ${JSON.stringify(r.toc.levels)}`);
ck.assert('顶栏「目录」入口能打开面板', r.toc.panelOpen === true);
ck.assert('目录面板列出全部条目', r.toc.panelItems === 5, `条目 ${r.toc.panelItems}`);
ck.assert('点目录后关闭面板', r.toc.closedAfterPick === true);
ck.assert('点目录真的滚动到标题（不是只报成功）', Math.abs(r.toc.pick.delta) > 100,
  `scrollTop ${r.toc.pick.before} → ${r.toc.pick.after}`);
ck.assert('点目录成功后提示为「已定位到」', /已定位到/.test(r.toc.pick.toast), r.toc.pick.toast);
ck.assert('锚点缺失时不滚动', r.toc.missing.scrollTop === 0, `scrollTop=${r.toc.missing.scrollTop}`);
ck.assert('锚点缺失时如实提示而非谎报', /没有对应位置/.test(r.toc.missing.toast), r.toc.missing.toast);

/* 第四轮 A-8：可选端点不能和「本页会调用」混在一栏里 */
ck.assert('可选端点从「涉及接口」主栏分出单独一栏', r.apiMark.hasMain === true && r.apiMark.hasOptional === true
  && r.apiMark.mainHasRelated === false,
  `主栏存在=${r.apiMark.hasMain} / 可选栏存在=${r.apiMark.hasOptional} / 主栏含 related=${r.apiMark.mainHasRelated}`);
ck.assert('可选端点那条确实带「本阶段不实现」角标', r.apiMark.optCount === 1 && r.apiMark.optText === '本阶段不实现'
  && r.apiMark.optLineHasPath === true, `角标 ${r.apiMark.optCount} 个 / 文案「${r.apiMark.optText}」`);

ck.assert('我的文章无「撤回」字样', r.mine.hasWithdrawWord === false);
ck.assert('待审卡片文案为「审核中，可以继续编辑」', r.mine.pendingChip === true);
ck.assert('旧文案「编辑后撤回」已消失', r.mine.oldChip === false);

ck.assert('草稿态：保存草稿 + 提交审核',
  r.editor.draft.btns.includes('保存草稿') && r.editor.draft.btns.includes('提交审核'),
  JSON.stringify(r.editor.draft.btns));
ck.assert('待审态：按钮为「保存」而非「保存草稿」',
  r.editor.pending.btns.includes('保存') && !r.editor.pending.btns.includes('保存草稿'),
  JSON.stringify(r.editor.pending.btns));
ck.assert('待审态不出现「提交审核」', !r.editor.pending.btns.includes('提交审核'),
  JSON.stringify(r.editor.pending.btns));
ck.assert('待审态给出「会员端不提供撤回」说明', /会员端不提供撤回/.test(r.editor.pending.text));
ck.assert('已发布态：按钮为「保存」', r.editor.published.btns.includes('保存'), JSON.stringify(r.editor.published.btns));

ck.assert('未知路由不白屏', r.fallback.len > 10, `文本长度 ${r.fallback.len}`);
ck.assert('未知路由给出明确出口', r.fallback.hasExit === true);

ck.assert('三态注入：加载中渲染骨架元素', r.states.loading.hasSkeletonEl > 0, `骨架元素 ${r.states.loading.hasSkeletonEl}`);
ck.assert('三态注入：空态给出文案', r.states.empty.text.length > 5, r.states.empty.text);
ck.assert('三态注入：错误态给出文案', r.states.error.text.length > 5, r.states.error.text);
ck.assert('搜索命中关键词', r.search.hit === true);
ck.assert('搜索无结果走空态而非错误态', r.search.missIsEmptyNotError === true, r.search.missText);
ck.assert('分类节点可展开', r.category.changed === true, `${r.category.before} → ${r.category.after}`);
ck.assert('通知全部已读后未读数归零', r.notify.unreadBefore > 0 && r.notify.unreadAfter === 0,
  `${r.notify.unreadBefore} → ${r.notify.unreadAfter}`);
ck.assert('通知全部已读有反馈', /已全部标为已读/.test(r.notify.toast), r.notify.toast);
ck.assert('主题可切到深色', r.theme.dark === 'dark', String(r.theme.dark));
ck.assert('主题可切回浅色', r.theme.light === 'light', String(r.theme.light));

ck.assert('会员中心已无磁贴形态（.grid6）', r.memberUi.grid6 === 0, `.grid6 ×${r.memberUi.grid6}`);
ck.assert('会员中心入口为分组 Cell 列表', r.memberUi.groups === 2, `分组 ${r.memberUi.groups}`);
ck.assert('每个 Cell 入口都存在于 NAV「会员中心」分组（无孤立入口）',
  r.memberUi.labels.every(l => r.memberUi.expectedOrder.includes(l)),
  JSON.stringify(r.memberUi.labels.filter(l => !r.memberUi.expectedOrder.includes(l))));
// 顺序判定用「保序子序列」而不是全等：NAV 分组里还有「会员首页 / 修改密码」等
// 不在本页出现的条目，全等会把「分组包含更多条目」误判为缺陷。
{
  const nav = r.memberUi.expectedOrder;
  let i = 0;
  for (const l of r.memberUi.labels) {
    const j = nav.indexOf(l, i);
    if (j < 0) { i = -1; break; }
    i = j + 1;
  }
  const isSubseq = i >= 0;
  ck.assert('Cell 顺序与 NAV 表「会员中心」分组保持相对次序（期望值由 NAV 推导）', isSubseq,
    `实际 ${JSON.stringify(r.memberUi.labels)} / NAV ${JSON.stringify(nav)}`);
}
ck.assert('每个 Cell 都有跳转目标', r.memberUi.navTargets.length === r.memberUi.labels.length,
  `目标 ${r.memberUi.navTargets.length} / 条 ${r.memberUi.labels.length}`);
ck.assert('设置项用 cog 图标（语义不串到「个人资料」）',
  r.memberUi.icons[r.memberUi.labels.indexOf('设置')] === '#i-cog',
  JSON.stringify(r.memberUi.icons));
ck.assert('个人资料项用 user 图标', r.memberUi.icons[r.memberUi.labels.indexOf('个人资料')] === '#i-user',
  JSON.stringify(r.memberUi.icons));
ck.assert('通知 Cell 有未读角标', !!r.memberUi.badge, `角标 ${r.memberUi.badge}`);
ck.assert('顶栏 cog 指向设置页（不再指向资料页）', r.memberUi.appbarCogTo === '#/member/settings',
  String(r.memberUi.appbarCogTo));
ck.assert('无磁贴样式残留', r.memberUi.leftoverTile === 0, `残留 ${r.memberUi.leftoverTile}`);

ck.assert('资料页只剩可编辑字段（输入框 2 个：昵称+邮箱）', r.split.profileInputs === 2,
  `输入框 ${r.split.profileInputs} 个`);
ck.assert('资料页已移除「个人简介」（契约无 bio 字段）', r.split.profileHasBio === false);
ck.assert('资料页已移除主题设置', r.split.profileHasTheme === false);
ck.assert('资料页已移除退出登录', r.split.profileHasLogout === false);
ck.assert('资料页已移除修改密码入口', r.split.profileHasPassword === false);
ck.assert('资料页给出三项只读账号信息',
  JSON.stringify(r.split.readonlyLabels) === JSON.stringify(['用户名', '会员等级', '注册时间']),
  JSON.stringify(r.split.readonlyLabels));

ck.assert('设置页标题正确', r.split.settingsTitle === '设置', String(r.split.settingsTitle));
ck.assert('设置页含三个主题选项', r.split.themeOptions === 3, `选项 ${r.split.themeOptions}`);
ck.assert('主题选项 act 形态正确',
  JSON.stringify(r.split.themeAct) === JSON.stringify(
    ['setting:theme:system', 'setting:theme:light', 'setting:theme:dark']),
  JSON.stringify(r.split.themeAct));
ck.assert('设置页有且仅有一个主题选中态', r.split.radioOnIdx >= 0, `index ${r.split.radioOnIdx}`);
ck.assert('设置页含修改密码 / 退出登录 / 版本', r.split.settingsHasPassword && r.split.settingsHasLogout
  && r.split.settingsHasVersion);
ck.assert('退出登录按危险项呈现', r.split.dangerCells === 1, `危险项 ${r.split.dangerCells}`);
ck.assert('设置页切主题真的改变了主题', r.split.themeAfter === 'dark',
  `${r.split.themeBefore} → ${r.split.themeAfter}`);
ck.assert('设置页切主题后选中态迁移到「深色」', r.split.radioOnIdxAfter === 2,
  `index ${r.split.radioOnIdxAfter}`);
ck.assert('设置页切主题有用户反馈', /主题已切换/.test(r.split.themeToast), r.split.themeToast);

// ---- 11. 通用组件形态（本轮修复的回归） ----
// 单选：只允许一个指示器。旧写法在 grid 里放两个子项 → 排成两行 → 内容溢出圆框。
ck.assert('单选项内没有子元素叠加（修复 Grid 双行溢出）', r.ctl.onChildren === 0,
  `子元素 ${r.ctl.onChildren} 个`);
ck.assert('单选圆框为 22×22', Array.isArray(r.ctl.onBox) && r.ctl.onBox[0] === 22 && r.ctl.onBox[1] === 22,
  JSON.stringify(r.ctl.onBox));
ck.assert('选中态圆点可见（10×10 且已放大）',
  !!r.ctl.onDot && r.ctl.onDot.w === '10px' && !/matrix\(0,/.test(r.ctl.onDot.transform),
  JSON.stringify(r.ctl.onDot));
ck.assert('未选中态圆点隐藏（scale 0）',
  !!r.ctl.offDot && /matrix\(0,/.test(r.ctl.offDot.transform),
  JSON.stringify(r.ctl.offDot));
ck.assert('单选命中区由所在 Cell 承担且 ≥44', r.ctl.cellTapH >= 44, `Cell 高 ${r.ctl.cellTapH}`);

// 令牌：次级按钮边界必须是 line.button，且与 line.strong 确实不同值（否则断言无区分力）
ck.assert('组件形态取样前已切到浅色（深色下两令牌同值，无区分力）',
  r.ctl.theme === 'light', String(r.ctl.theme));
ck.assert('次级按钮边界用 color.line.button 而非 line.strong',
  r.ctl.secBorder === r.ctl.lineButton && r.ctl.lineButton !== r.ctl.lineStrong,
  `sec=${r.ctl.secBorder} button=${r.ctl.lineButton} strong=${r.ctl.lineStrong}`);
ck.assert('输入框焦点环 2dp / offset 2（对齐 06 §6.2）',
  r.ctl.focusWidth === '2px' && r.ctl.focusOffset === '2px',
  `width=${r.ctl.focusWidth} offset=${r.ctl.focusOffset}`);
ck.assert('动效时长已令牌化（duration.fast = 120ms）', r.ctl.durFast === '120ms', r.ctl.durFast);

ck.assert('全程零运行时异常', errs.exceptions.length === 0, errs.exceptions.slice(0, 3).join(' | '));
ck.assert('全程零 console.error', errs.consoleErrors.length === 0, errs.consoleErrors.slice(0, 3).join(' | '));
ck.assert('全程零 error 级日志', errs.logErrors.length === 0, errs.logErrors.slice(0, 3).join(' | '));

process.exit(ck.report());
