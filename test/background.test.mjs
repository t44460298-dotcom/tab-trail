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
