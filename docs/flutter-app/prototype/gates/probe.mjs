// 门禁 4/4 · 交互回归（无头 Chrome + CDP 实测）
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
  //      期望值一律从页面自身的 TOC 派生。上一版把锚点写死成 ['h-1'..'h-5']，
  //      既违反「期望值程序化推导」，又在本次 A-1 整改后直接失效——已改掉。
  await snap('#/articles/' + slug);
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
ck.assert('正文标题 id 与 TOC.anchor 逐条相等且同序（A-1 核心）', r.toc.idsMatchToc === true,
  `标题 id ${JSON.stringify(r.toc.headingIds)}`);
ck.assert('锚点不得是本地序号形态 h-数字（A-1 回归探测器）', r.toc.localSeqAnchors.length === 0,
  `命中 ${JSON.stringify(r.toc.localSeqAnchors)}`);
ck.assert('TOC.anchor 唯一且非空', r.toc.anchorUnique === true, JSON.stringify(r.toc.anchors));
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

ck.assert('全程零运行时异常', errs.exceptions.length === 0, errs.exceptions.slice(0, 3).join(' | '));
ck.assert('全程零 console.error', errs.consoleErrors.length === 0, errs.consoleErrors.slice(0, 3).join(' | '));
ck.assert('全程零 error 级日志', errs.logErrors.length === 0, errs.logErrors.slice(0, 3).join(' | '));

process.exit(ck.report());
