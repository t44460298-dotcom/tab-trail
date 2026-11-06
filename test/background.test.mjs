// 用假浏览器跑 background.js 的主要场景：node test/background.test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowser, createClock, bootBackground } from './mock-browser.mjs';

const BG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../extension/background.js');
const SEC = 1000, MIN = 60e3;

function view(b) {
  const s = b.store.local.trail;
  const nodes = Object.values(s.nodes);
  const byTitle = t => nodes.find(n => n.title === '标题 ' + t);
  const parentOf = t => { const n = byTitle(t); return n?.parent ? s.nodes[n.parent].title.replace('标题 ', '') : null; };
  return { s, nodes, ws: Object.values(s.ws), byTitle, parentOf };
}

const url = name => 'https://papers.test/' + name;
// 占位页：data: 网页，真实网址放在 #tab-trail= 后面
const isLazyUrl = u => u.startsWith('data:text/html') && u.includes('#tab-trail=');
const realUrl = u => (isLazyUrl(u) ? decodeURIComponent(u.slice(u.indexOf('#tab-trail=') + 11)) : u);

// 读文献：A 里打开 B C D，看 B；B 里打开 E F G，看 F
async function readingSession(opts = {}) {
  const clock = createClock();
  const b = createBrowser(opts);
  const win = b.openWindow();
  const bg = bootBackground(b, clock, BG);
  await bg.settle();
  const tA = win.tabs[0];
  b.navigate(tA, url('A'));
  clock.advance(5 * SEC);
  const [tB, tC, tD] = ['B', 'C', 'D'].map(x => b.addTab(win.id, url(x), { opener: tA }).id);
  await bg.settle();
  b.activate(tB); await bg.settle();
  clock.advance(5 * SEC);
  const [tE, tF, tG] = ['E', 'F', 'G'].map(x => b.addTab(win.id, url(x), { opener: tB }).id);
  await bg.settle();
  b.activate(tF); await bg.settle();
  clock.advance(3 * SEC);
  return { clock, b, bg, win, t: { A: tA, B: tB, C: tC, D: tD, E: tE, F: tF, G: tG } };
}

// 把读文献的那棵树（再加一个别的网站的页面）存成一组，再打开：除了最近看的那个，都是占位标签
async function lazyGroup() {
  const s = await readingSession();
  const { b, bg, t, win } = s;
  b.addTab(win.id, 'https://other.test/x', { opener: t.A });
  await bg.settle();
  const group = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('A').id, name: '组' })).r;
  await bg.settle();
  await b.send({ type: 'restoreWs', ws: group }); await bg.settle();
  const tabs = b.wins.get(view(b).s.ws[group].win).tabs.map(id => b.tabs.get(id));
  const lazy = tabs.filter(x => isLazyUrl(x.url) && x.url.includes('papers.test')).map(x => ({ id: x.id, url: x.url }));
  return { ...s, group, lazy };
}

const pageOf = b => view(b).nodes.find(n => n.url.includes('split/split.html'));

// 把 C、E、G 三个标签合到一页
async function threeInPage(opts) {
  const s = await readingSession(opts);
  const ids = ['C', 'E', 'G'].map(x => view(s.b).byTitle(x).id);
  const r = await s.b.send({ type: 'split', ids });
  assert.equal(r.r, 'page', r.error);
  await s.bg.settle();
  return s;
}

const tests = {
  async '按打开关系建树，记录看没看过'() {
    const { b, bg, clock, t } = await readingSession();
    b.activate(t.G); await bg.settle();   // 离开 F，F 的停留被结算
    const v = view(b);
    assert.equal(v.ws.length, 1);
    assert.equal(v.ws[0].name, '工作区 1');
    assert.equal(v.parentOf('B'), 'A');
    assert.equal(v.parentOf('D'), 'A');
    assert.equal(v.parentOf('F'), 'B');
    assert.ok(v.byTitle('A').seen, 'A 看过');
    assert.ok(v.byTitle('B').seen, 'B 看过');
    assert.ok(v.byTitle('F').seen, 'F 看过');
    assert.ok(v.byTitle('F').dwell >= 3 * SEC);
    for (const x of ['C', 'D', 'E']) assert.equal(v.byTitle(x).seen, 0, x + ' 没看过');
    assert.equal(v.s.act[1].tab, t.G);
    assert.equal(v.nodes.length, 7, '新标签页导航后复用同一个节点，没有多余节点');
    void clock;
  },

  async 'onCreated 不带来源标签时，从 onUpdated 补上'() {
    const { b } = await readingSession({ openerLate: true });
    const v = view(b);
    assert.equal(v.parentOf('B'), 'A');
    assert.equal(v.parentOf('D'), 'A');
    assert.equal(v.parentOf('F'), 'B');
    assert.equal(v.nodes.length, 7);
  },

  async '页面还在排队、一个更新事件都没有时，也能马上挂到树上'() {
    const { b } = await readingSession({ openerLate: 'silent' });
    const v = view(b);
    assert.equal(v.parentOf('B'), 'A');
    assert.equal(v.parentOf('D'), 'A');
    assert.equal(v.parentOf('G'), 'B');
    assert.equal(v.nodes.length, 7);
  },

  async '一闪而过不算看过'() {
    const { b, bg, t } = await readingSession();
    b.activate(t.C); await bg.settle();    // 立刻切走
    b.activate(t.D); await bg.settle();
    assert.equal(view(b).byTitle('C').seen, 0);
  },

  async '关掉的标签留在树上；Ctrl+Shift+T 重新打开会接回原位置'() {
    const { b, bg, t, win } = await readingSession();
    const fId = view(b).byTitle('F').id;
    b.closeTab(t.F); await bg.settle();
    let F = view(b).byTitle('F');
    assert.equal(F.st, 'closed');
    assert.equal(view(b).parentOf('F'), 'B');
    b.addTab(win.id, url('F'), { active: true }); await bg.settle();   // 没有来源的新标签，网址一样
    F = view(b).byTitle('F');
    assert.equal(F.id, fId, '还是原来那个节点');
    assert.equal(F.st, 'open');
    assert.equal(view(b).parentOf('F'), 'B');
    assert.equal(view(b).nodes.filter(n => n.title === '标题 F').length, 1);
  },

  async 'Firefox 式事件顺序下也能接回'() {
    const { b, bg, t, win } = await readingSession({ firefoxStyle: true });
    const fId = view(b).byTitle('F').id;
    assert.equal(view(b).parentOf('F'), 'B');
    b.closeTab(t.F); await bg.settle();
    b.addTab(win.id, url('F'), { active: true }); await bg.settle();
    assert.equal(view(b).byTitle('F').id, fId);
    assert.equal(view(b).nodes.filter(n => n.title === '标题 F').length, 1);
  },

  async '点击已关闭的节点会在原位置重新打开'() {
    const { b, bg, t } = await readingSession();
    const F = view(b).byTitle('F');
    b.closeTab(t.F); await bg.settle();
    const r = await b.send({ type: 'focus', id: F.id, win: 1 }); await bg.settle();
    assert.ok(r.ok, r.error);
    const after = view(b).byTitle('F');
    assert.equal(after.st, 'open');
    assert.equal(after.id, F.id);
    assert.equal(view(b).nodes.length, 7, '没有产生重复节点');
    assert.equal(b.tabs.get(after.tab).index, b.tabs.get(t.B).index + 1, '开在父标签旁边');
  },

  async '收起分支再恢复：保留结构和看过的状态'() {
    for (const eventsAfterCreate of [false, true]) {
      const { b, bg } = await readingSession({ eventsAfterCreate });
      const B = view(b).byTitle('B');
      let r = await b.send({ type: 'stashBranch', id: B.id, win: 1 }); await bg.settle();
      assert.ok(r.ok, r.error);
      let v = view(b);
      for (const x of ['B', 'E', 'F', 'G']) assert.equal(v.byTitle(x).st, 'stashed', x + ' 已收起');
      assert.equal(v.byTitle('C').st, 'open');
      assert.ok(v.byTitle('B').stashedAt);
      assert.equal(b.tabs.size, 3, '只剩 A C D');
      r = await b.send({ type: 'restoreBranch', id: B.id, win: 1 }); await bg.settle();
      assert.ok(r.ok, r.error);
      v = view(b);
      for (const x of ['B', 'E', 'F', 'G']) assert.equal(v.byTitle(x).st, 'open', x + ' 恢复了');
      assert.equal(v.parentOf('F'), 'B');
      assert.ok(v.byTitle('F').seen, 'F 仍是看过');
      assert.equal(v.byTitle('E').seen, 0, 'E 仍是没看过');
      assert.equal(v.nodes.length, 7, `没有重复节点（eventsAfterCreate=${eventsAfterCreate}）`);
      assert.equal(b.tabs.size, 7);
      assert.ok(!v.byTitle('B').stashedAt);
    }
  },

  async '收起分支不会把窗口关掉'() {
    const { b, bg } = await readingSession();
    const A = view(b).byTitle('A');
    await b.send({ type: 'stashBranch', id: A.id, win: 1 }); await bg.settle();
    assert.equal(b.wins.size, 1, '窗口还在');
    assert.equal(view(b).ws[0].win, 1, '工作区还绑着这个窗口');
    assert.equal(view(b).nodes.filter(n => n.st === 'stashed').length, 7);
  },

  async '收起整个工作区，再恢复到新窗口'() {
    const { b, bg, clock } = await readingSession();
    const w2 = b.openWindow([url('X')]); await bg.settle();
    let v = view(b);
    assert.equal(v.ws.length, 2);
    const ws1 = v.ws.find(w => w.win === 1);
    await b.send({ type: 'renameWs', ws: ws1.id, name: '读论文' }); await bg.settle();
    let r = await b.send({ type: 'stashWs', ws: ws1.id }); await bg.settle();
    assert.ok(r.ok, r.error);
    v = view(b);
    assert.ok(!b.wins.has(1), '窗口 1 关掉了');
    assert.equal(v.s.ws[ws1.id].win, null);
    assert.ok(v.s.ws[ws1.id].stashed);
    assert.equal(v.nodes.filter(n => n.ws === ws1.id && n.st === 'stashed').length, 7);
    clock.advance(2 * MIN);
    r = await b.send({ type: 'restoreWs', ws: ws1.id }); await bg.settle();
    assert.ok(r.ok, r.error);
    v = view(b);
    assert.equal(v.ws.length, 2, '没有多出新的工作区');
    const back = v.s.ws[ws1.id];
    assert.ok(back.win && back.win !== w2.id);
    assert.equal(back.name, '读论文');
    assert.equal(b.wins.get(back.win).tabs.length, 7);
    assert.equal(v.nodes.filter(n => n.ws === ws1.id && n.st === 'open' && n.tab != null).length, 7);
    assert.equal(v.nodes.length, 8);
    assert.equal(v.parentOf('F'), 'B');
  },

  async '收起最后一个窗口时会先开一个新窗口'() {
    const { b, bg } = await readingSession();
    const ws1 = view(b).ws[0];
    await b.send({ type: 'stashWs', ws: ws1.id }); await bg.settle();
    assert.equal(b.wins.size, 1, '浏览器没有被整个关掉');
    const v = view(b);
    assert.equal(v.ws.length, 2);
    assert.ok(v.s.ws[ws1.id].stashed);
  },

  async '手动关掉窗口 = 自动收起工作区'() {
    const { b, bg } = await readingSession();
    const w2 = b.openWindow([url('X'), url('Y')]); await bg.settle();
    const wsX = view(b).ws.find(w => w.win === w2.id);
    b.closeWindow(w2.id); await bg.settle();
    const v = view(b);
    assert.equal(v.s.ws[wsX.id].win, null);
    assert.ok(v.s.ws[wsX.id].stashed);
    assert.equal(v.byTitle('X').st, 'stashed');
  },

  async '只有新标签页的窗口关掉后不留垃圾工作区'() {
    const { b, bg } = await readingSession();
    const w2 = b.openWindow(); await bg.settle();
    assert.equal(view(b).ws.length, 2);
    b.closeWindow(w2.id); await bg.settle();
    assert.equal(view(b).ws.length, 1);
  },

  async '弹出窗口（登录框之类）不算工作区'() {
    const { b, bg } = await readingSession();
    b.openWindow([url('login')], 'popup'); await bg.settle();
    assert.equal(view(b).ws.length, 1);
    assert.ok(!view(b).byTitle('login'));
  },

  async '后台被浏览器休眠后重启：数据原样对上'() {
    const { b, bg, clock } = await readingSession();
    await bg.settle();
    const before = JSON.stringify(view(b).s.nodes);
    const bg2 = bootBackground(b, clock, BG);   // 同一个浏览器、同一份 session 存储
    await bg2.settle();
    assert.equal(JSON.stringify(view(b).s.nodes), before);
  },

  async '浏览器重启并恢复上次的标签：按网址接回，id 变了也不乱'() {
    const { b, bg, clock } = await readingSession();
    const ws1 = view(b).ws[0];
    await b.send({ type: 'renameWs', ws: ws1.id, name: '读论文' }); await bg.settle();
    const old = view(b);
    // 新浏览器：同样的网页，但标签和窗口 id 从头编号；用户先开的窗口里也有一个新标签
    clock.advance(10 * 60 * MIN);
    const b2 = createBrowser({ local: b.store.local });
    b2.openWindow(['https://other.test/unrelated']);
    b2.openWindow(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(url));
    const bg2 = bootBackground(b2, clock, BG);
    await bg2.settle();
    const v = view(b2);
    for (const x of ['A', 'B', 'F', 'G']) {
      assert.equal(v.byTitle(x).id, old.byTitle(x).id, x + ' 接回原节点');
      assert.equal(v.byTitle(x).st, 'open');
      assert.equal(b2.tabs.get(v.byTitle(x).tab).url, url(x), x + ' 绑到了正确的标签');
    }
    assert.equal(v.parentOf('F'), 'B');
    assert.ok(v.byTitle('F').seen);
    assert.equal(v.byTitle('E').seen, 0);
    assert.equal(v.s.ws[ws1.id].name, '读论文');
    assert.equal(v.s.ws[ws1.id].win, 2, '工作区跟着窗口 2');
    assert.equal(v.ws.length, 2);
  },

  async '浏览器重启但没恢复标签：过一会儿变成可恢复的已收起工作区'() {
    const { b, clock } = await readingSession();
    clock.advance(10 * 60 * MIN);
    const b2 = createBrowser({ local: b.store.local });
    b2.openWindow();
    const bg2 = bootBackground(b2, clock, BG);
    await bg2.settle();
    let v = view(b2);
    assert.equal(v.byTitle('A').st, 'open', '启动后先等着');
    clock.advance(3 * MIN);
    b2.navigate(1, 'https://other.test/x'); await bg2.settle();   // 随便一个事件触发检查
    v = view(b2);
    const old = v.ws.find(w => w.win == null);
    assert.ok(old, '原工作区变成已收起');
    assert.ok(old.stashed);
    assert.equal(v.nodes.filter(n => n.ws === old.id && n.st === 'stashed').length, 7);
    const r = await b2.send({ type: 'restoreWs', ws: old.id }); await bg2.settle();
    assert.ok(r.ok, r.error);
    assert.equal(view(b2).nodes.filter(n => n.ws === old.id && n.st === 'open').length, 7);
  },

  async '标为未看 / 已看'() {
    const { b, bg } = await readingSession();
    const F = view(b).byTitle('F');
    await b.send({ type: 'markRead', id: F.id, read: false }); await bg.settle();
    assert.equal(view(b).byTitle('F').seen, 0);
    await b.send({ type: 'markRead', id: F.id, read: true }); await bg.settle();
    assert.ok(view(b).byTitle('F').seen);
  },

  async '从记录中删除：打开着的子标签往上挪'() {
    const { b, bg, t } = await readingSession();
    b.closeTab(t.B); await bg.settle();
    const B = view(b).byTitle('B');
    await b.send({ type: 'forget', id: B.id }); await bg.settle();
    const v = view(b);
    assert.ok(!v.byTitle('B'));
    assert.equal(v.parentOf('F'), 'A', 'F 挂到了 A 下面');
  },

  async '已关闭的记录 30 天后自动清理'() {
    const { b, bg, clock, t } = await readingSession();
    b.closeTab(t.E); await bg.settle();
    clock.advance(31 * 24 * 60 * MIN);
    b.navigate(t.A, url('A2')); await bg.settle();
    assert.ok(!view(b).byTitle('E'));
    assert.ok(view(b).byTitle('F'));
  },

  async '同一标签里跳转会记下之前的页面；后退会撤回；只改锚点不算'() {
    const { b, bg, t, clock } = await readingSession();
    b.navigate(t.C, url('C1')); await bg.settle();
    clock.advance(SEC);
    b.navigate(t.C, url('C1') + '#section-2'); await bg.settle();
    b.navigate(t.C, url('C2')); await bg.settle();
    let C = view(b).nodes.find(n => n.tab === t.C);
    assert.deepEqual(C.hist.map(h => h.url), [url('C'), url('C1') + '#section-2']);
    assert.equal(C.hist[0].title, '标题 C', '记的是离开时那一页的标题');
    b.navigate(t.C, url('C1') + '#section-2'); await bg.settle();   // 后退
    C = view(b).nodes.find(n => n.tab === t.C);
    assert.deepEqual(C.hist.map(h => h.url), [url('C')]);
    for (let i = 0; i < 40; i++) { b.navigate(t.D, url('D' + i)); await bg.settle(); }
    assert.equal(view(b).nodes.find(n => n.tab === t.D).hist.length, 30, '最多记 30 条');
  },

  async '从历史里重新打开：新标签挂在原标签下面'() {
    const { b, bg, t } = await readingSession({ openerLate: true });
    b.navigate(t.C, url('C1')); await bg.settle();
    const C = view(b).nodes.find(n => n.tab === t.C);
    const r = await b.send({ type: 'openUrl', url: url('C'), parent: C.id, win: 1 }); await bg.settle();
    assert.ok(r.ok, r.error);
    const opened = view(b).nodes.filter(n => n.url === url('C') && n.st === 'open');
    assert.equal(opened.length, 1);
    assert.equal(opened[0].parent, C.id);
    assert.equal(b.tabs.get(opened[0].tab).index, b.tabs.get(t.C).index + 1, '开在原标签旁边');
  },

  async '一次关闭多个标签（关重复）'() {
    const { b, bg, t } = await readingSession();
    const ids = ['C', 'D'].map(x => view(b).byTitle(x).id);
    await b.send({ type: 'closeIds', ids }); await bg.settle();
    assert.equal(view(b).byTitle('C').st, 'closed');
    assert.equal(view(b).byTitle('D').st, 'closed');
    assert.ok(b.tabs.has(t.A));
  },

  async '星标和备注：保存下来，并且不会被自动清理或「清空已关闭」删掉'() {
    const { b, bg, clock, t } = await readingSession();
    const E = view(b).byTitle('E'), G = view(b).byTitle('G');
    await b.send({ type: 'star', id: E.id, star: true });
    await b.send({ type: 'note', id: G.id, note: '  第三节的方法可以借鉴  ' });
    await bg.settle();
    assert.equal(view(b).byTitle('E').star, true);
    assert.equal(view(b).byTitle('G').note, '第三节的方法可以借鉴');
    b.closeTab(t.E); b.closeTab(t.G); b.closeTab(t.F); await bg.settle();
    await b.send({ type: 'clearClosed', ws: view(b).ws[0].id }); await bg.settle();
    assert.ok(view(b).byTitle('E'), '加星的保留');
    assert.ok(view(b).byTitle('G'), '有备注的保留');
    assert.ok(!view(b).byTitle('F'), '普通的已关闭记录被清空');
    clock.advance(40 * 24 * 60 * MIN);
    b.navigate(t.A, url('A9')); await bg.settle();
    assert.ok(view(b).byTitle('E') && view(b).byTitle('G'), '过了 30 天也不自动清理');
    await b.send({ type: 'note', id: G.id, note: '' }); await bg.settle();
    assert.equal(view(b).byTitle('G').note, undefined, '清空备注就删掉');
  },

  async '重命名：名字跟着网页走，跳走时留在记录里，后退时回来'() {
    const { b, bg, t } = await readingSession();
    const C = view(b).byTitle('C');
    await b.send({ type: 'rename', id: C.id, name: '  组会要讲的那篇  ' }); await bg.settle();
    assert.equal(view(b).byTitle('C').alias, '组会要讲的那篇');
    assert.equal(view(b).byTitle('C').title, '标题 C', '原标题还在');
    b.navigate(t.C, url('C') + '#part2'); await bg.settle();
    assert.equal(view(b).nodes.find(n => n.tab === t.C).alias, '组会要讲的那篇', '只改锚点，名字不变');
    b.navigate(t.C, url('C1')); await bg.settle();
    let n = view(b).nodes.find(n => n.tab === t.C);
    assert.equal(n.alias, undefined, '跳到别的网页，名字不带过去');
    assert.equal(n.hist.at(-1).alias, '组会要讲的那篇', '名字留在跳转记录里');
    b.navigate(t.C, url('C') + '#part2'); await bg.settle();   // 后退
    n = view(b).nodes.find(n => n.tab === t.C);
    assert.equal(n.alias, '组会要讲的那篇', '后退回来，名字也回来');
    b.closeTab(t.C); await bg.settle();
    await b.send({ type: 'focus', id: n.id, win: 1 }); await bg.settle();
    assert.equal(view(b).nodes.find(x => x.id === n.id).alias, '组会要讲的那篇', '关掉再打开还在');
    await b.send({ type: 'rename', id: n.id, name: '' }); await bg.settle();
    assert.equal(view(b).nodes.find(x => x.id === n.id).alias, undefined, '清空就恢复原标题');
  },

  async '另存为一组：整棵树变成一个起好名字的已收起工作区'() {
    const { b, bg, t } = await readingSession();
    const B = view(b).byTitle('B');
    const r = await b.send({ type: 'saveAsGroup', id: B.id, name: '预训练相关' }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    const g = v.s.ws[r.r];
    assert.equal(g.name, '预训练相关');
    assert.equal(g.win, null);
    assert.ok(g.stashed);
    for (const x of ['B', 'E', 'F', 'G']) {
      assert.equal(v.byTitle(x).ws, g.id, x + ' 进了新组');
      assert.equal(v.byTitle(x).st, 'stashed', x + ' 已收起');
    }
    assert.equal(v.parentOf('F'), 'B', '结构不变');
    assert.ok(b.tabs.has(t.A) && !b.tabs.has(t.B), 'A 还开着，B 分支的标签关了');
    assert.equal(b.wins.size, 1);
  },

  async '在空窗口里打开保存的组：不多开窗口，原来的新标签页关掉'() {
    const { b, bg } = await readingSession();
    const g = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('B').id, name: '预训练相关' })).r;
    await bg.settle();
    const empty = b.openWindow(); await bg.settle();   // 一个只有新标签页的窗口
    const r = await b.send({ type: 'restoreWs', ws: g, into: empty.id }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    assert.equal(b.wins.size, 2, '没有多开第三个窗口');
    assert.equal(v.s.ws[g].win, empty.id, '就在这个窗口里');
    const urls = b.wins.get(empty.id).tabs.map(id => realUrl(b.tabs.get(id).url));
    assert.deepEqual(urls, ['B', 'E', 'F', 'G'].map(url), '新标签页被换成了这组标签');
    assert.equal(v.parentOf('F'), 'B');
    assert.equal(v.ws.length, 2, '空窗口原来的工作区并掉了');
    // 不是空窗口时，还是开新窗口
    const g2 = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('C').id, name: 'C 组' })).r;
    await bg.settle();
    await b.send({ type: 'restoreWs', ws: g2, into: 1 }); await bg.settle();
    assert.equal(b.wins.size, 3, '当前窗口里有东西，就开新窗口');
  },

  async '打开保存的组：只加载最近看过的那一个，其余的点开才加载'() {
    const { b, bg, clock, t } = await readingSession();
    b.activate(t.E); await bg.settle();
    clock.advance(5 * SEC);
    b.activate(t.F); await bg.settle();   // E 是最近看完的那篇（F 正在看，还没结算）
    const g = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('B').id, name: '组' })).r;
    await bg.settle();
    clock.advance(60 * MIN);
    const r = await b.send({ type: 'restoreWs', ws: g }); await bg.settle();
    assert.equal(r.r, 4);
    const v = view(b);
    const win = v.s.ws[g].win;
    const tabs = b.wins.get(win).tabs.map(id => b.tabs.get(id));
    const loaded = tabs.filter(x => !isLazyUrl(x.url));
    assert.equal(loaded.length, 1, '只有一个真正加载');
    assert.ok(loaded[0].active, '加载的那个就是切过去的那个');
    for (const x of ['B', 'E', 'F', 'G']) {
      const n = v.byTitle(x);
      assert.equal(n.url, url(x), x + ' 记录里还是真实网址');
      assert.equal(n.title, '标题 ' + x, x + ' 标题没被占位页弄乱');
    }
    const focus = v.nodes.find(n => n.tab === loaded[0].id);
    assert.ok(['E', 'F'].includes(focus.title.slice(3)), '切过去的是最近看过的那篇');
    assert.equal(v.nodes.filter(n => n.ws === g && n.sleep).length, 3, '没加载的算作休眠');
    // 点开一个没加载的：占位页换成真网页，记录不变，也不算一次跳转
    const lazyTab = tabs.find(x => isLazyUrl(x.url));
    b.activate(lazyTab.id);
    b.navigate(lazyTab.id, realUrl(lazyTab.url)); await bg.settle();
    const n = view(b).nodes.find(x => x.tab === lazyTab.id);
    assert.equal(n.sleep, undefined, '加载后不再算休眠');
    assert.equal(n.hist, undefined, '占位页不算跳转记录');
    assert.equal(view(b).nodes.length, 7, '没有多出节点');
  },

  async '只打开组里的一棵树，其余的留在树上可以一键恢复'() {
    const { b, bg } = await readingSession();
    const ws1 = view(b).ws[0].id;
    await b.send({ type: 'stashWs', ws: ws1 }); await bg.settle();
    const r = await b.send({ type: 'restoreWs', ws: ws1, only: view(b).byTitle('B').id }); await bg.settle();
    assert.equal(r.r, 4, '只开了 B 这一棵（B E F G）');
    const v = view(b);
    assert.equal(v.byTitle('C').st, 'stashed', 'C 还收着');
    assert.equal(v.byTitle('A').stashedAt > 0, true, '最上层 A 标成可恢复的分支');
    assert.equal(v.byTitle('F').st, 'open');
  },

  async '浏览器重启时恢复出来的占位页标签，也能按真实网址接回'() {
    const { b, bg, clock } = await readingSession();
    const g = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('B').id, name: '组' })).r;
    await bg.settle();
    await b.send({ type: 'restoreWs', ws: g }); await bg.settle();
    const ids = Object.fromEntries(['B', 'E', 'F', 'G'].map(x => [x, view(b).byTitle(x).id]));
    const urls = [...b.tabs.values()].filter(x => x.windowId === view(b).s.ws[g].win).map(x => x.url);
    clock.advance(8 * 60 * MIN);
    const b2 = createBrowser({ local: b.store.local });
    b2.openWindow(urls);   // 浏览器恢复了上次的标签，里面有占位页
    const bg2 = bootBackground(b2, clock, BG);
    await bg2.settle();
    const v = view(b2);
    for (const x of ['B', 'E', 'F', 'G']) {
      assert.equal(v.byTitle(x).id, ids[x], x + ' 接回原节点');
      assert.equal(v.byTitle(x).st, 'open');
    }
    assert.equal(v.parentOf('F'), 'B');
  },

  async '浏览器不让打开占位页时，退回直接打开，标签不会丢'() {
    const { b, bg } = await readingSession({ rejectData: true });
    const g = (await b.send({ type: 'saveAsGroup', id: view(b).byTitle('B').id, name: '组' })).r;
    await bg.settle();
    await b.send({ type: 'restoreWs', ws: g }); await bg.settle();
    const v = view(b);
    for (const x of ['B', 'E', 'F', 'G']) assert.equal(v.byTitle(x).st, 'open', x + ' 打开了');
    assert.deepEqual(b.wins.get(v.s.ws[g].win).tabs.map(id => b.tabs.get(id).url).sort(), ['B', 'E', 'F', 'G'].map(url));
  },

  async '快速点过占位标签不加载，只加载停下来的那个'() {
    const { b, bg, clock, lazy } = await lazyGroup();
    clock.advance(5 * SEC);
    b.activate(lazy[0].id);
    b.activate(lazy[1].id);
    b.activate(lazy[2].id);
    await bg.settle();
    assert.ok(isLazyUrl(b.tabs.get(lazy[0].id).url), '路过的不加载');
    assert.ok(isLazyUrl(b.tabs.get(lazy[1].id).url), '路过的不加载');
    assert.equal(b.tabs.get(lazy[2].id).url, realUrl(lazy[2].url), '停下来的那个加载');
    assert.equal(view(b).nodes.find(n => n.tab === lazy[2].id).hist, undefined, '不算跳转记录');
  },

  async '同一网站排队：前面的加载完才开始，最多等 15 秒；不同网站不用等'() {
    const { b, bg, clock, lazy, group } = await lazyGroup();
    const win = view(b).s.ws[group].win;
    const other = await b.api.tabs.create({ windowId: win, url: url('Z'), active: false });
    b.tabs.get(other.id).status = 'loading';   // 同一网站有个页面还在加载
    await bg.settle();
    clock.advance(5 * SEC);
    b.activate(lazy[0].id); await bg.settle();
    assert.ok(isLazyUrl(b.tabs.get(lazy[0].id).url), '前面的还没加载完，先等着');
    clock.advance(2 * SEC); await bg.settle();
    assert.ok(isLazyUrl(b.tabs.get(lazy[0].id).url), '还在等');
    b.complete(other.id);
    clock.advance(SEC); await bg.settle();
    assert.equal(b.tabs.get(lazy[0].id).url, realUrl(lazy[0].url), '前面的加载完了，轮到它');
    b.complete(lazy[0].id);

    // 前面的一直加载不完：最多等 15 秒
    b.tabs.get(other.id).status = 'loading';
    clock.advance(5 * SEC);
    b.activate(lazy[1].id); await bg.settle();
    assert.ok(isLazyUrl(b.tabs.get(lazy[1].id).url));
    clock.advance(16 * SEC); await bg.settle();
    assert.equal(b.tabs.get(lazy[1].id).url, realUrl(lazy[1].url), '等太久就不等了');
    b.complete(lazy[1].id);

    // 别的网站不受影响
    const elsewhere = [...b.tabs.values()].find(x => isLazyUrl(x.url) && realUrl(x.url).startsWith('https://other.test/'));
    clock.advance(5 * SEC);
    b.activate(elsewhere.id); await bg.settle();
    assert.equal(b.tabs.get(elsewhere.id).url, 'https://other.test/x', '另一个网站不用排队');
  },

  async '点醒的休眠标签还没加载完就切走，就接着睡；加载完的不动'() {
    const { b, bg, t } = await readingSession();
    const ids = ['E', 'G', 'D'].map(x => view(b).byTitle(x).id);
    await b.send({ type: 'sleep', ids }); await bg.settle();
    b.activate(t.E); await bg.settle();
    assert.equal(b.tabs.get(t.E).discarded, false, '点开就醒');
    b.activate(t.G); await bg.settle();
    assert.equal(b.tabs.get(t.E).discarded, true, '还没加载完就切走：接着睡');
    assert.equal(view(b).byTitle('E').sleep, true);
    b.complete(t.G); await bg.settle();
    b.activate(t.D); await bg.settle();
    assert.notEqual(b.tabs.get(t.G).discarded, true, '已经加载完的不动');
  },

  async '浏览器恢复会话时选中的正好是占位标签：自动加载，也不会变成别的节点'() {
    const { b, bg, clock, lazy } = await lazyGroup();
    const target = view(b).nodes.find(n => n.tab === lazy[0].id);
    clock.advance(8 * 60 * MIN);
    const b2 = createBrowser({ local: b.store.local });
    const win = b2.openWindow([lazy[0].url]);   // 恢复出来的第一个标签就是选中的
    const bg2 = bootBackground(b2, clock, BG);
    await bg2.settle();
    const tab = b2.tabs.get(win.tabs[0]);
    assert.equal(tab.url, target.url, '选中的占位标签加载成真网页');
    assert.equal(view(b2).nodes.find(n => n.tab === tab.id).id, target.id, '还是原来的节点');
    void bg;
  },

  async '手动休眠：正在看的不动，点开后自动醒来'() {
    const { b, bg, t } = await readingSession();
    const ids = ['A', 'B', 'F', 'G'].map(x => view(b).byTitle(x).id);
    const r = await b.send({ type: 'sleep', ids }); await bg.settle();
    assert.equal(r.r, 3, 'F 正在看，不休眠');
    assert.equal(view(b).byTitle('A').sleep, true);
    assert.equal(view(b).byTitle('F').sleep, undefined);
    b.activate(t.A); await bg.settle();
    assert.equal(view(b).byTitle('A').sleep, undefined, '点开后醒来');
    b.closeTab(t.B); await bg.settle();
    assert.equal(view(b).byTitle('B').sleep, undefined, '关掉的不再标记休眠');
  },

  async '自动休眠：超过设定时间没看的标签由定时检查让它休眠'() {
    const { b, bg, clock, t } = await readingSession();
    assert.ok(b.alarms.get('sleep'), '装好了定时检查');
    await b.send({ type: 'setSettings', settings: { sleepAfter: 60 } }); await bg.settle();
    assert.equal(view(b).s.settings.sleepAfter, 60);
    clock.advance(30 * MIN);
    b.activate(t.C); await bg.settle();   // C 刚看过
    clock.advance(5 * SEC);
    b.activate(t.F); await bg.settle();
    clock.advance(40 * MIN);              // 其他的已经 70 分钟没看
    b.fireAlarm('sleep'); await bg.settle();
    const v = view(b);
    for (const x of ['A', 'B', 'D', 'E', 'G']) assert.equal(v.byTitle(x).sleep, true, x + ' 休眠了');
    assert.equal(v.byTitle('C').sleep, undefined, 'C 40 分钟前看过，不休眠');
    assert.equal(v.byTitle('F').sleep, undefined, 'F 正在看');
    await b.send({ type: 'setSettings', settings: { sleepAfter: 0 } }); await bg.settle();
    clock.advance(10 * 60 * MIN);
    b.fireAlarm('sleep'); await bg.settle();
    assert.equal(view(b).byTitle('C').sleep, undefined, '关掉自动休眠后不再处理');
  },

  async '快速搜索框：弹出小窗口，不当成工作区；再按一次只是切过去'() {
    const { b, bg } = await readingSession();
    b.api.commands.onCommand.fire('open-switcher'); await bg.settle();
    const pops = [...b.wins.values()].filter(w => w.type === 'popup');
    assert.equal(pops.length, 1);
    assert.match(b.tabs.get(pops[0].tabs[0]).url, /switcher\/switcher\.html\?win=1$/);
    assert.equal(view(b).ws.length, 1, '没有多出工作区');
    b.api.commands.onCommand.fire('open-switcher'); await bg.settle();
    assert.equal([...b.wins.values()].filter(w => w.type === 'popup').length, 1, '不会开第二个');
    b.closeWindow(pops[0].id); await bg.settle();
    assert.equal(view(b).ws.length, 1);
    b.api.commands.onCommand.fire('open-switcher'); await bg.settle();
    assert.equal([...b.wins.values()].filter(w => w.type === 'popup').length, 1, '关掉后能重新打开');
  },

  async '拖动调整树：前面、后面、里面、最上层，并且不能拖进自己的分支'() {
    const { b, bg } = await readingSession();
    const id = x => view(b).byTitle(x).id;
    const kids = x => {
      const s = view(b).s;
      const p = x ? id(x) : null;
      return Object.values(s.nodes).filter(n => (n.parent || null) === p && n.ws === Object.values(s.ws)[0].id)
        .sort((m, n) => (m.order ?? m.created) - (n.order ?? n.created)).map(n => n.title.replace('标题 ', ''));
    };
    const move = async (x, target, pos) => { const r = await b.send({ type: 'move', id: id(x), target: target && id(target), pos }); await bg.settle(); return r; };
    assert.deepEqual(kids('A'), ['B', 'C', 'D']);
    await move('D', 'B', 'before');
    assert.deepEqual(kids('A'), ['D', 'B', 'C']);
    await move('B', 'C', 'after');
    assert.deepEqual(kids('A'), ['D', 'C', 'B']);
    await move('C', 'D', 'after');
    assert.deepEqual(kids('A'), ['D', 'C', 'B'], '放回原位不变');
    await move('G', 'D', 'inside');
    assert.deepEqual(kids('D'), ['G']);
    assert.deepEqual(kids('B'), ['E', 'F']);
    await move('E', 'D', 'first');
    assert.deepEqual(kids('D'), ['E', 'G']);
    await move('F', null, 'root');
    assert.deepEqual(kids(null), ['A', 'F']);
    const r = await move('A', 'G', 'inside');
    assert.equal(r.ok, false, 'A 不能放到自己的子孙下面');
    assert.equal(view(b).byTitle('A').parent, null);
  },

  async '手动移动过的节点，不会被来源信息拉回去'() {
    const { b, bg, t, win } = await readingSession({ openerLate: true });
    const X = b.addTab(win.id, url('X'), { opener: t.A });
    await bg.settle();
    assert.equal(view(b).parentOf('X'), 'A');
    await b.send({ type: 'move', id: view(b).byTitle('X').id, pos: 'root' }); await bg.settle();
    b.navigate(X.id, url('X2')); await bg.settle();
    assert.equal(view(b).nodes.find(n => n.tab === X.id).parent, null);
  },

  async '整个分支移到另一个打开的工作区：标签跟着换窗口，结构不变'() {
    const { b, bg } = await readingSession();
    const w2 = b.openWindow([url('X')]); await bg.settle();
    const ws2 = view(b).ws.find(w => w.win === w2.id);
    const r = await b.send({ type: 'moveToWs', id: view(b).byTitle('B').id, ws: ws2.id, branch: true }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    for (const x of ['B', 'E', 'F', 'G']) {
      assert.equal(v.byTitle(x).ws, ws2.id, x + ' 换了工作区');
      assert.equal(b.tabs.get(v.byTitle(x).tab).windowId, w2.id, x + ' 的标签在新窗口里');
    }
    assert.equal(v.parentOf('F'), 'B', '分支结构不变');
    assert.equal(v.byTitle('C').ws, v.ws.find(w => w.win === 1).id, 'C 留在原处');
  },

  async '只移一个节点：它的子节点留下，挂到上一级'() {
    const { b, bg } = await readingSession();
    const w2 = b.openWindow([url('X')]); await bg.settle();
    const ws2 = view(b).ws.find(w => w.win === w2.id);
    await b.send({ type: 'moveToWs', id: view(b).byTitle('B').id, ws: ws2.id, branch: false }); await bg.settle();
    const v = view(b);
    assert.equal(v.byTitle('B').ws, ws2.id);
    assert.equal(v.parentOf('E'), 'A');
    assert.equal(v.byTitle('E').ws, v.ws.find(w => w.win === 1).id);
  },

  async '移到收起的工作区：标签关掉，记录放进去成为已收起'() {
    const { b, bg } = await readingSession();
    const w2 = b.openWindow([url('X')]); await bg.settle();
    const ws2 = view(b).ws.find(w => w.win === w2.id);
    await b.send({ type: 'stashWs', ws: ws2.id }); await bg.settle();
    await b.send({ type: 'moveToWs', id: view(b).byTitle('D').id, ws: ws2.id, branch: true }); await bg.settle();
    const D = view(b).byTitle('D');
    assert.equal(D.ws, ws2.id);
    assert.equal(D.st, 'stashed');
    assert.equal(D.tab, null);
    await b.send({ type: 'restoreWs', ws: ws2.id }); await bg.settle();
    assert.equal(view(b).byTitle('D').st, 'open', '恢复那个工作区时一起打开');
  },

  async '移到新工作区：开新窗口装下整个分支'() {
    const { b, bg } = await readingSession();
    const r = await b.send({ type: 'moveToWs', id: view(b).byTitle('B').id, ws: 'new', branch: true }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    assert.equal(v.ws.length, 2);
    const wsB = v.s.ws[v.byTitle('B').ws];
    assert.ok(wsB.win && wsB.win !== 1);
    assert.equal(b.wins.get(wsB.win).tabs.length, 4);
    assert.equal(v.parentOf('G'), 'B');
  },

  async '标签拖到别的窗口，跟着换工作区'() {
    const { b, bg, t } = await readingSession();
    const w2 = b.openWindow([url('X')]); await bg.settle();
    b.api.tabs.onAttached.fire(t.G, { newWindowId: w2.id, newPosition: 1 }); await bg.settle();
    const v = view(b);
    assert.equal(v.byTitle('G').ws, v.ws.find(w => w.win === w2.id).id);
  },

  // ---------- 复制标签 ----------

  async '复制标签：和原标签同一级，排在它后面，名字和跳转记录一起带上'() {
    const { b, bg, t } = await readingSession();
    b.navigate(t.C, url('C2')); await bg.settle();
    const id = view(b).byTitle('C2').id;
    await b.send({ type: 'rename', id, name: '我起的名字' });
    const r = await b.send({ type: 'duplicate', id }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    const copy = v.nodes.find(n => n.copy);
    assert.equal(copy.url, url('C2'));
    assert.equal(copy.parent, v.byTitle('A').id, '不是挂在原标签下面，而是同一级');
    assert.equal(copy.alias, '我起的名字');
    assert.deepEqual(copy.hist.map(h => h.url), [url('C')]);
    const sibs = v.nodes.filter(n => n.parent === v.byTitle('A').id).sort((x, y) => (x.order ?? x.created) - (y.order ?? y.created));
    assert.deepEqual(sibs.map(n => n.id).slice(1, 3), [id, copy.id], '紧跟在原标签后面');
    assert.equal(b.tabs.get(copy.tab).index, b.tabs.get(t.C).index + 1);
    assert.ok(b.tabs.get(copy.tab).active, '新标签被选中');
    b.navigate(copy.tab, url('别处')); await bg.settle();
    assert.equal(view(b).nodes.find(n => n.tab === copy.tab).copy, undefined, '跳到别的网页后就不再是副本');
  },

  async '复制最上层的标签：还在最上层，事件来得晚也不会被挂到原标签下面'() {
    const { b, bg } = await readingSession({ openerLate: true });
    const id = view(b).byTitle('A').id;
    await b.send({ type: 'duplicate', id }); await bg.settle();
    const v = view(b);
    const copy = v.nodes.find(n => n.copy);
    assert.equal(copy.parent, null);
    assert.equal(v.nodes.length, 8, '没有多出别的节点');
  },

  async '没打开的标签不能复制'() {
    const { b, bg, t } = await readingSession();
    const id = view(b).byTitle('C').id;
    b.closeTab(t.C); await bg.settle();
    const r = await b.send({ type: 'duplicate', id });
    assert.equal(r.ok, false);
  },

  // ---------- 两个标签：原生分屏 ----------

  async '两个不相邻的标签并排：挪到一起，用原生分屏，记录下来，也能取消'() {
    const { b, bg, t } = await readingSession();
    const [A, G] = [view(b).byTitle('A').id, view(b).byTitle('G').id];
    const r = await b.send({ type: 'split', ids: [A, G] }); await bg.settle();
    assert.equal(r.r, 'native');
    assert.equal(b.tabs.get(t.G).index, b.tabs.get(t.A).index + 1, '第二个紧贴在第一个右边');
    assert.ok(b.tabs.get(t.A).active);
    assert.equal(view(b).s.nodes[A].split, b.tabs.get(t.A).splitViewId);
    assert.equal(view(b).s.nodes[G].split, b.tabs.get(t.A).splitViewId);
    await b.send({ type: 'unsplit', id: G }); await bg.settle();
    assert.equal(view(b).s.nodes[A].split, undefined);
    assert.equal(view(b).s.nodes[G].split, undefined);
    assert.equal(view(b).nodes.filter(n => n.st === 'open').length, 7, '标签都还开着');
  },

  async '第二个在第一个左边：对调成第一个在左'() {
    const { b, bg, t } = await readingSession();
    const r = await b.send({ type: 'split', ids: [view(b).byTitle('G').id, view(b).byTitle('B').id] }); await bg.settle();
    assert.equal(r.r, 'native');
    assert.equal(b.tabs.get(t.B).index, b.tabs.get(t.G).index + 1);
  },

  async '已经在别的分屏里的、固定的、不同分组的、别的窗口的，都能并排'() {
    const { b, bg, t, win } = await readingSession();
    const id = x => view(b).byTitle(x).id;
    await b.send({ type: 'split', ids: [id('A'), id('B')] }); await bg.settle();
    const r1 = await b.send({ type: 'split', ids: [id('B'), id('C')] }); await bg.settle();
    assert.equal(r1.r, 'native', r1.error);
    assert.equal(view(b).byTitle('A').split, undefined, '原来的分屏拆开了');
    assert.equal(view(b).byTitle('B').split, b.tabs.get(t.C).splitViewId);
    b.tabs.get(t.D).pinned = true;
    b.tabs.get(t.E).groupId = 7;
    const r2 = await b.send({ type: 'split', ids: [id('D'), id('E')] }); await bg.settle();
    assert.equal(r2.r, 'native', r2.error);
    assert.equal(b.tabs.get(t.E).pinned, true);
    assert.equal(b.tabs.get(t.E).groupId, -1);
    const w2 = b.openWindow([url('X')]); await bg.settle();
    const r3 = await b.send({ type: 'split', ids: [id('F'), id('X')] }); await bg.settle();
    assert.equal(r3.r, 'native', r3.error);
    assert.equal(b.tabs.get(t.F).windowId, win.id);
    assert.equal(b.tabs.get(w2.id === win.id ? 0 : view(b).byTitle('X').tab).windowId, win.id, '别的窗口的标签挪过来了');
  },

  async '没加载的标签放进分屏时会加载，分屏里的不会被自动或手动休眠'() {
    const { b, bg, lazy } = await lazyGroup();
    const tabs = lazy.slice(0, 2).map(x => x.id);
    const v0 = view(b);
    const ids = tabs.map(id => v0.nodes.find(n => n.tab === id).id);
    const r = await b.send({ type: 'split', ids }); await bg.settle();
    assert.equal(r.r, 'native', r.error);
    for (const id of tabs) assert.ok(!isLazyUrl(b.tabs.get(id).url), '换成了真网页');
    b.activate([...b.tabs.values()].find(x => !tabs.includes(x.id)).id); await bg.settle();
    const r2 = await b.send({ type: 'sleep', ids }); await bg.settle();
    assert.equal(r2.r, 0, '手动休眠跳过分屏里的');
  },

  async '自动休眠跳过分屏里的标签'() {
    const { b, bg, clock, t } = await readingSession();
    const id = x => view(b).byTitle(x).id;
    await b.send({ type: 'split', ids: [id('C'), id('D')] }); await bg.settle();
    b.activate(t.A); await bg.settle();
    clock.advance(3 * 60 * MIN);
    b.fireAlarm('sleep'); await bg.settle();
    assert.ok(!b.tabs.get(t.C).discarded);
    assert.ok(!b.tabs.get(t.D).discarded);
    assert.ok(b.tabs.get(t.E).discarded, '别的标签照常休眠');
  },

  // ---------- 合到一页 ----------

  async '三个标签合到一页：原标签关掉，节点留在树上，点它们跳到并排页'() {
    const { b, bg, t } = await readingSession();
    const id = x => view(b).byTitle(x).id;
    const [C, E, G] = [id('C'), id('E'), id('G')];
    const before = b.tabs.size;
    const r = await b.send({ type: 'split', ids: [C, E, G] }); await bg.settle();
    assert.equal(r.r, 'page', r.error);
    const page = pageOf(b);
    assert.ok(page.tab != null);
    assert.equal(b.tabs.size, before - 2, '三个标签变成一个');
    assert.ok(b.tabs.get(page.tab).active);
    const q = new URL(page.url).searchParams;
    assert.deepEqual(q.getAll('u'), ['C', 'E', 'G'].map(url), '网址按选中的顺序记在页面网址里');
    assert.deepEqual(q.getAll('n'), [C, E, G]);
    for (const x of [C, E, G]) {
      const n = view(b).s.nodes[x];
      assert.equal(n.st, 'stashed');
      assert.equal(n.tab, null);
      assert.equal(n.inPage, page.id);
    }
    assert.equal(page.parent, view(b).s.nodes[C].parent, '并排页放在第一个的位置');
    b.activate(t.A); await bg.settle();
    await b.send({ type: 'focus', id: E, win: 1 }); await bg.settle();
    assert.ok(b.tabs.get(page.tab).active, '点原来的节点，跳到并排页');
    assert.equal(view(b).s.nodes[E].tab, null, '不会单独打开');
  },

  async '浏览器没有分屏接口，或者分屏失败：两个标签也合到一页'() {
    for (const opts of [{ noSplit: true }, { splitFails: true }]) {
      const { b, bg } = await readingSession(opts);
      const r = await b.send({ type: 'split', ids: [view(b).byTitle('C').id, view(b).byTitle('D').id] }); await bg.settle();
      assert.equal(r.r, 'page', r.error);
      assert.ok(pageOf(b));
    }
  },

  async '并排的数量有限制，浏览器自带的页面放不进并排页'() {
    const { b, bg, win } = await readingSession({ noSplit: true });
    const id = x => view(b).byTitle(x).id;
    assert.equal((await b.send({ type: 'split', ids: [id('A')] })).ok, false);
    assert.equal((await b.send({ type: 'split', ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(id) })).ok, false);
    const set = b.addTab(win.id, 'edge://settings/', { active: false }); await bg.settle();
    const r = await b.send({ type: 'split', ids: [id('A'), view(b).nodes.find(n => n.tab === set.id).id] });
    assert.equal(r.ok, false);
    assert.equal(view(b).byTitle('A').st, 'open', '失败时原标签不动');
  },

  async '关掉并排页：合进去的页面算关掉了，放行规则也清掉'() {
    const { b, bg } = await threeInPage();
    const page = pageOf(b);
    await b.sendFrom(page.tab, { type: 'paneRule', hosts: ['papers.test'] }); await bg.settle();
    assert.equal(b.sessionRules.size, 1);
    b.closeTab(page.tab); await bg.settle();
    for (const x of ['C', 'E', 'G']) {
      const n = view(b).byTitle(x);
      assert.equal(n.st, 'closed');
      assert.equal(n.inPage, undefined);
    }
    assert.equal(b.sessionRules.size, 0);
  },

  async '放行规则只管这个标签、这些网站的框架页面，换网站时更新，死标签的规则顺手清掉'() {
    const { b, bg } = await threeInPage();
    const page = pageOf(b);
    await b.sendFrom(page.tab, { type: 'paneRule', hosts: ['papers.test'] });
    const rule = b.sessionRules.get(page.tab);
    assert.deepEqual(rule.condition, { tabIds: [page.tab], requestDomains: ['papers.test'], resourceTypes: ['sub_frame'] });
    assert.deepEqual(rule.action.responseHeaders.map(h => h.header).sort(), ['content-security-policy', 'x-frame-options']);
    b.sessionRules.set(99999, { id: 99999, condition: { tabIds: [99999] } });
    await b.sendFrom(page.tab, { type: 'paneRule', hosts: ['papers.test', 'other.test'] }); await bg.settle();
    assert.deepEqual([...b.sessionRules.keys()], [page.tab]);
    assert.deepEqual(b.sessionRules.get(page.tab).condition.requestDomains, ['papers.test', 'other.test']);
  },

  async '全部拆开：回到原来的节点，只有第一个马上加载，并排页不留记录'() {
    const { b, bg } = await threeInPage();
    const page = pageOf(b);
    const q = new URL(page.url).searchParams;
    const panes = q.getAll('n').map((node, i) => ({ node, url: q.getAll('u')[i] }));
    await b.sendFrom(page.tab, { type: 'paneUndo', panes }); await bg.settle();
    assert.equal(pageOf(b), undefined);
    assert.ok(!b.tabs.has(page.tab));
    const [C, E, G] = ['C', 'E', 'G'].map(x => view(b).byTitle(x));
    for (const n of [C, E, G]) {
      assert.equal(n.st, 'open');
      assert.equal(n.inPage, undefined);
      assert.ok(n.tab != null);
    }
    assert.equal(view(b).parentOf('C'), 'A', '还在树上原来的位置');
    assert.equal(view(b).parentOf('E'), 'B');
    assert.equal(b.tabs.get(C.tab).url, url('C'), '第一个是真网页');
    assert.ok(b.tabs.get(C.tab).active);
    assert.ok(isLazyUrl(b.tabs.get(E.tab).url), '其余的先不加载');
  },

  async '拿走一格：变回单独的标签时带着这一格现在的网址；直接拿掉就算关掉'() {
    const { b, bg } = await threeInPage();
    const page = pageOf(b);
    const [C, E] = ['C', 'E'].map(x => view(b).byTitle(x).id);
    await b.sendFrom(page.tab, { type: 'paneOut', node: C, url: url('C-里面的链接'), pop: true }); await bg.settle();
    const c = view(b).s.nodes[C];
    assert.equal(c.st, 'open');
    assert.equal(c.url, url('C-里面的链接'));
    assert.equal(c.inPage, undefined);
    assert.deepEqual(c.hist.map(h => h.url), [url('C')], '原来的网页记进了跳转记录');
    assert.equal(b.tabs.get(c.tab).index, b.tabs.get(page.tab).index + 1, '排在并排页后面');
    await b.sendFrom(page.tab, { type: 'paneOut', node: E }); await bg.settle();
    assert.equal(view(b).s.nodes[E].st, 'closed');
    assert.equal(view(b).byTitle('G').inPage, page.id, '其余的不受影响');
  },

  async '并排页改网址不算跳转；关窗口再恢复时只打开并排页，不单独打开合进去的页面'() {
    const { b, bg, win } = await threeInPage();
    const page = pageOf(b);
    b.navigate(page.tab, page.url + '&l=rows'); await bg.settle();
    assert.equal(pageOf(b).hist, undefined);
    const other = b.openWindow([url('X')]); await bg.settle();
    void other;
    const ws = pageOf(b).ws;
    b.closeWindow(win.id); await bg.settle();
    assert.equal(pageOf(b).st, 'stashed');
    assert.equal(view(b).byTitle('C').inPage, pageOf(b).id, '关窗口不算关掉并排页');
    await b.send({ type: 'restoreWs', ws }); await bg.settle();
    const v = view(b);
    assert.ok(pageOf(b).tab != null, '并排页回来了');
    assert.equal(v.byTitle('C').tab, null, '合进去的页面不单独打开');
    assert.equal(v.byTitle('C').st, 'stashed');
    assert.ok(v.byTitle('A').tab != null, '其他标签照常恢复');
  },

  async '恢复分支时跳过已经合到并排页里的页面'() {
    const { b, bg } = await threeInPage();
    const A = view(b).byTitle('A').id;
    await b.send({ type: 'stashBranch', id: A }); await bg.settle();
    const r = await b.send({ type: 'restoreBranch', id: A }); await bg.settle();
    assert.ok(r.ok, r.error);
    const v = view(b);
    assert.equal(v.byTitle('C').inPage, pageOf(b).id);
    assert.equal(v.byTitle('C').tab, null);
    assert.ok(v.byTitle('D').tab != null, '没合进去的正常恢复');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.log('  ✗', name);
    console.log('     ', e.message.split('\n').join('\n      '));
  }
}
console.log(failed ? `\n${failed} 个失败` : `\n全部 ${Object.keys(tests).length} 个通过`);
process.exitCode = failed ? 1 : 0;
