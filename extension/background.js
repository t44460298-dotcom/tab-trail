// 标签脉络 · 后台
// 这里是唯一写数据的地方：监听标签和窗口的变化，维护「标签树 + 工作区」，存进 storage.local。
// 侧边栏只负责显示，要改数据时发消息过来（见文件末尾的 actions）。
//
// 数据结构（storage.local 里的 "trail"）：
//   nodes[id] = { id, url, title, icon, parent, ws, tab, st, created, seen, last, dwell, closed, hist?, fold?, stashedAt?, auto?, young? }
//     st: 'open' 打开中 | 'closed' 已关闭（留作记录）| 'stashed' 已收起（可恢复）
//     tab: 对应的浏览器标签 id；st 为 open 但 tab 为空的是「孤儿」：浏览器重启后还没接上的节点
//     seen: 第一次看的时间（0 = 没看过）；last: 最近一次看的时间；dwell: 累计停留毫秒
//     hist: 在这个标签里点链接跳转之前看过的页面 [{ url, title, at }]，旧的在前
//     star: 加了星标；note: 一句话备注；sleep: 标签处于休眠（已释放内存）
//     order: 手动拖动后在同一级里的位置（没有就按 created 排）；manual: 被手动移动过，不再自动认来源
//   settings = { sleepAfter }   多少分钟没看就让标签休眠，0 = 不自动休眠
//   ws[id] = { id, name, named?, win, created, stashed }   一个工作区对应一个浏览器窗口，win 为空表示已收起
//   act[windowId] = { tab, since, skip? }                   每个窗口当前激活的标签和开始看的时间

const api = globalThis.browser ?? globalThis.chrome;
const KEY = 'trail';
const IS_FIREFOX = typeof api.runtime.getBrowserInfo === 'function';

const DAY = 864e5;
const CLOSED_KEEP = 30 * DAY;     // 已关闭的记录保留 30 天
const REVIVE_WINDOW = 10 * 60e3;  // 10 分钟内重新打开同一网址（比如 Ctrl+Shift+T），接回原来的位置
const BOOT_GRACE = 2 * 60e3;      // 浏览器启动后 2 分钟内，按网址把恢复出来的标签接回原节点
const MIN_STINT = 1500;           // 停留超过 1.5 秒才算「看过」
const MAX_STINT = 30 * 60e3;      // 单次停留最多计 30 分钟，避免挂着不动时虚高
const MAX_HIST = 30;              // 每个标签最多记 30 个跳转前的页面
const DEFAULT_SETTINGS = { sleepAfter: 120 };

let state = null;
let bootAt = 0;                   // 本次浏览器启动的时间，用来判断是否还在「接回」期
let orphansPending = false;
let lastPrune = 0;
const winTypes = new Map();       // windowId -> 'normal' | 'popup' | ...
const pendingUrls = new Map();    // 插件自己正在打开的网址，避免被当成「重新打开」去接回别的节点

// ---------- 启动 ----------

if (api.sidePanel?.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (api.sidebarAction) {
  api.action.onClicked.addListener(() => api.sidebarAction.toggle());
}

const ready = load().catch(e => {
  console.error('[标签脉络] 读取数据失败', e);
  state ??= emptyState();
});

async function load() {
  const got = await api.storage.local.get(KEY);
  state = got[KEY]?.v === 1 ? got[KEY] : emptyState();
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  // storage.session 在浏览器重启（以及插件重新加载）时会清空，借此判断是不是新启动
  let fresh = true;
  try {
    const s = await api.storage.session.get('bootAt');
    if (s.bootAt) { bootAt = s.bootAt; fresh = false; }
    else { bootAt = now(); await api.storage.session.set({ bootAt }); }
  } catch { bootAt = now(); }
  const wins = await api.windows.getAll({ populate: true });
  reconcile(wins, fresh);
  prune();
  save(true);
}

function emptyState() {
  return { v: 1, seq: 0, nodes: {}, ws: {}, act: {}, settings: { ...DEFAULT_SETTINGS } };
}

// 每个事件都排在数据读完之后、按到达顺序执行；处理完自动保存
function run(fn) {
  return ready.then(() => {
    maybeFinalizeOrphans();
    if (now() - lastPrune > DAY) prune();
    if (fn() !== false) save();
  }).catch(e => console.error('[标签脉络]', e));
}

let saveTimer = null;
function save(immediate) {
  clearTimeout(saveTimer);
  const write = () => { saveTimer = null; state.at = now(); return api.storage.local.set({ [KEY]: state }); };
  if (immediate) return write();
  saveTimer = setTimeout(write, 150);
}

// ---------- 小工具 ----------

function now() { return Date.now(); }
function newId(prefix) { state.seq += 1; return prefix + state.seq.toString(36); }
function tabUrl(tab) { return tab.url || tab.pendingUrl || ''; }
function cleanIcon(icon) { return icon && icon.length < 4096 ? icon : ''; }
// 同一级里的先后：手动拖动过的按 order，没拖过的按打开时间
const sortKey = n => n.order ?? n.created;
function byCreated(a, b) { return sortKey(a) - sortKey(b); }
function all() { return Object.values(state.nodes); }

function isBlank(url) {
  return !url || /^(about:(blank|newtab|home|privatebrowsing)|chrome:\/\/(newtab|new-tab-page)|edge:\/\/newtab|chrome-search:)/.test(url);
}

function nodeByTab(tabId) {
  if (tabId == null) return null;
  for (const n of all()) if (n.tab === tabId) return n;
  return null;
}

function childMap() {
  const m = new Map();
  for (const n of all()) {
    if (!n.parent) continue;
    if (!m.has(n.parent)) m.set(n.parent, []);
    m.get(n.parent).push(n);
  }
  return m;
}

function hasChildren(n) { return all().some(c => c.parent === n.id); }

function isAncestor(a, n) {
  for (let p = n.parent && state.nodes[n.parent]; p; p = p.parent && state.nodes[p.parent]) if (p === a) return true;
  return false;
}

// 某个节点和它在同一工作区里的全部后代，按树的先后顺序
function subtree(root) {
  const kids = childMap();
  const out = [];
  (function walk(n) {
    out.push(n);
    for (const c of (kids.get(n.id) || []).sort(byCreated)) if (c.ws === root.ws) walk(c);
  })(root);
  return out;
}

// 工作区里所有节点，按树的先后顺序
function wsInOrder(w) {
  const mine = all().filter(n => n.ws === w.id);
  const roots = mine.filter(n => !n.parent || state.nodes[n.parent]?.ws !== w.id).sort(byCreated);
  return roots.flatMap(subtree);
}

// 删除一批节点；被删节点下面还要保留的子节点，挂到最近的保留祖先上
function removeNodes(ids) {
  for (const n of all()) {
    if (ids.has(n.id)) continue;
    let p = n.parent;
    while (p && ids.has(p)) p = state.nodes[p]?.parent ?? null;
    n.parent = p && state.nodes[p] ? p : null;
  }
  for (const id of ids) delete state.nodes[id];
}

function isTracked(winId) {
  const t = winTypes.get(winId);
  return !t || t === 'normal';
}

function wsOfWindow(winId) {
  return Object.values(state.ws).find(w => w.win === winId) || null;
}

function ensureWs(winId) {
  let w = wsOfWindow(winId);
  if (!w) {
    w = { id: newId('w'), name: nextWsName(), win: winId, created: now(), stashed: 0 };
    state.ws[w.id] = w;
  }
  return w;
}

function nextWsName() {
  const names = new Set(Object.values(state.ws).map(w => w.name));
  for (let i = 1; ; i++) if (!names.has('工作区 ' + i)) return '工作区 ' + i;
}

function mergeWs(from, into) {
  for (const n of all()) if (n.ws === from.id) n.ws = into.id;
  delete state.ws[from.id];
}

// 刚为新窗口自动建出来、里面还什么都没有的工作区
function isThrowaway(w, keep) {
  return !w.named && now() - w.created < 60e3 &&
    all().every(n => n.ws !== w.id || n === keep || n.young || isBlank(n.url));
}

function makeNode(tab, parent, w) {
  const n = {
    id: newId('n'),
    url: tabUrl(tab),
    title: tab.title || '',
    icon: cleanIcon(tab.favIconUrl),
    parent: parent ? parent.id : null,
    ws: w.id,
    tab: tab.id,
    st: 'open',
    created: now(), seen: 0, last: 0, dwell: 0, closed: 0,
  };
  state.nodes[n.id] = n;
  return n;
}

// 把一个已有节点接到一个真实的标签上（重新打开、恢复、浏览器重启后接回都走这里）
function attach(n, tab) {
  const dup = nodeByTab(tab.id);
  if (dup && dup !== n) {
    // onCreated 可能已经为这个标签建了一个临时节点，把它并进来
    for (const c of all()) if (c.parent === dup.id) c.parent = n.id;
    if (dup.seen && !n.seen) n.seen = dup.seen;
    n.last = Math.max(n.last, dup.last);
    n.dwell += dup.dwell;
    delete state.nodes[dup.id];
  }
  const from = state.ws[n.ws];
  let w = wsOfWindow(tab.windowId);
  // 节点原来的工作区没有窗口，而这个窗口是刚开的空窗口：让窗口直接接回原工作区
  if (from && from.win == null && (!w || isThrowaway(w, n))) {
    if (w) mergeWs(w, from);
    from.win = tab.windowId;
    from.stashed = 0;
    w = from;
  }
  w ??= ensureWs(tab.windowId);
  n.ws = w.id;
  n.tab = tab.id;
  n.st = 'open';
  n.closed = 0;
  delete n.auto;
  delete n.young;
  const url = tabUrl(tab);
  if (url && !isBlank(url)) n.url = url;
  if (tab.title && !isBlank(url)) n.title = tab.title;
  if (tab.favIconUrl) n.icon = cleanIcon(tab.favIconUrl);
}

// 新出现的无来源标签，看看是不是「回来了」的老节点：重启后恢复的、刚关掉又重新打开的
function tryRevive(tab, url) {
  if (isBlank(url) || pendingUrls.has(url)) return false;
  const t = now();
  const here = wsOfWindow(tab.windowId);
  const cands = all().filter(n => n.tab == null && n.url === url && (
    n.st === 'open' ||
    (n.st === 'stashed' && n.auto && inGrace()) ||
    (n.st === 'closed' && here && n.ws === here.id && t - n.closed < REVIVE_WINDOW)
  ));
  if (!cands.length) return false;
  cands.sort((a, b) =>
    (b.st === 'open') - (a.st === 'open') ||
    (b.ws === here?.id) - (a.ws === here?.id) ||
    (b.last || b.created) - (a.last || a.created));
  attach(cands[0], tab);
  return true;
}

function inGrace() { return bootAt && now() - bootAt < BOOT_GRACE; }

// 结束当前窗口里这次「看」：累计停留时间，够久就记为看过
function settle(winId) {
  const a = state.act[winId];
  if (!a) return;
  delete state.act[winId];
  const n = nodeByTab(a.tab);
  const stint = now() - a.since;
  if (!n || stint < MIN_STINT) return;
  if (!a.skip) n.seen ||= a.since;
  n.dwell += Math.min(stint, MAX_STINT);
  n.last = now();
}

// 节点和标签解绑之前，先把正在计的停留时间结算掉
function detach(n) {
  for (const [win, a] of Object.entries(state.act)) if (a.tab === n.tab) settle(win);
  n.tab = null;
  delete n.sleep;
}

// 同一个标签里跳到新网址：把离开的页面记进 hist。只改了 #锚点的不算；回到上一页（后退）就把它从记录里拿掉
function recordHistory(n, url) {
  if (isBlank(n.url) || isBlank(url) || n.url.split('#')[0] === url.split('#')[0]) return;
  const h = n.hist || (n.hist = []);
  if (h.length && h[h.length - 1].url === url) { h.pop(); return; }
  h.push({ url: n.url, title: n.title, at: now() });
  if (h.length > MAX_HIST) h.splice(0, h.length - MAX_HIST);
}

function addPending(url) { pendingUrls.set(url, (pendingUrls.get(url) || 0) + 1); }
function dropPending(url) {
  const c = (pendingUrls.get(url) || 1) - 1;
  if (c > 0) pendingUrls.set(url, c); else pendingUrls.delete(url);
}

// ---------- 对账：后台刚启动时，把记录和真实的标签对齐 ----------

function reconcile(wins, fresh) {
  const t = now();
  winTypes.clear();
  for (const win of wins) winTypes.set(win.id, win.type);
  const normal = wins.filter(win => win.type === 'normal');
  const live = new Map(normal.flatMap(win => win.tabs || []).map(tab => [tab.id, tab]));

  // 0. 浏览器关闭时正在看的标签：按最后一次保存的时间结算这次停留，不然它永远是「没看过」
  if (fresh) {
    for (const a of Object.values(state.act || {})) {
      const n = nodeByTab(a.tab);
      const stint = (state.at || a.since) - a.since;
      if (!n || stint < MIN_STINT) continue;
      if (!a.skip) n.seen ||= a.since;
      n.dwell += Math.min(stint, MAX_STINT);
      n.last = Math.max(n.last, state.at);
    }
  }

  // 1. 还能对上的绑定保留。同一次浏览器运行里标签 id 不变；新启动后 id 会重新编号，要求网址也一致
  for (const n of all()) {
    if (n.tab == null) continue;
    const tab = live.get(n.tab);
    if (tab && (!fresh || tabUrl(tab) === n.url)) continue;
    n.tab = null;
  }

  // 2. 每个窗口归到它的标签大多数所属的工作区
  for (const w of Object.values(state.ws)) w.win = null;
  for (const win of normal) {
    const count = new Map();
    for (const tab of win.tabs || []) {
      const n = nodeByTab(tab.id);
      if (n && state.ws[n.ws]) count.set(n.ws, (count.get(n.ws) || 0) + 1);
    }
    const best = [...count].sort((a, b) => b[1] - a[1]).find(([id]) => state.ws[id].win == null);
    if (best) { state.ws[best[0]].win = win.id; state.ws[best[0]].stashed = 0; }
  }

  // 3. 还没对上的标签：按网址接回孤儿，接不上就新建节点
  for (const win of normal) {
    for (const tab of win.tabs || []) {
      if (nodeByTab(tab.id)) continue;
      if (tryRevive(tab, tabUrl(tab))) continue;
      const opener = tab.openerTabId != null ? nodeByTab(tab.openerTabId) : null;
      makeNode(tab, opener, ensureWs(win.id));
    }
  }

  // 4. 节点跟着标签所在的窗口走，顺便同步休眠状态
  for (const win of normal) {
    const w = wsOfWindow(win.id);
    for (const tab of win.tabs || []) {
      const n = nodeByTab(tab.id);
      if (!n) continue;
      if (w) n.ws = w.id;
      setSleep(n, tab.discarded);
    }
  }

  // 5. 每个窗口当前激活的标签
  const old = state.act || {};
  state.act = {};
  for (const win of normal) {
    const a = (win.tabs || []).find(tab => tab.active);
    if (!a) continue;
    const prev = old[win.id];
    state.act[win.id] = !fresh && prev?.tab === a.id ? prev : { tab: a.id, since: t };
  }

  orphansPending = all().some(n => n.st === 'open' && n.tab == null);
  maybeFinalizeOrphans();
  tidyWs();
}

// 接回期过了还没接上的孤儿：标签已经不在了，改成「已收起」，随时可以恢复
function maybeFinalizeOrphans() {
  if (!orphansPending || inGrace()) return;
  orphansPending = false;
  const t = now();
  for (const n of all()) {
    if (n.st === 'open' && n.tab == null) { n.st = 'stashed'; n.closed = t; }
  }
  tidyWs();
}

// 没有窗口的工作区：里面还有可恢复的东西就标为已收起，否则删掉
function tidyWs() {
  for (const w of Object.values(state.ws)) {
    if (w.win != null) continue;
    const ns = all().filter(n => n.ws === w.id);
    if (ns.some(n => n.st === 'stashed' || (n.st === 'open' && n.tab == null))) {
      w.stashed ||= now();
    } else {
      for (const n of ns) delete state.nodes[n.id];
      delete state.ws[w.id];
    }
  }
}

function setSleep(n, asleep) {
  if (asleep) n.sleep = true; else delete n.sleep;
}

// 加了星标或写了备注的，是用户特意留下的，不自动清理
const isKept = n => n.star || !!n.note;

function prune() {
  lastPrune = now();
  const old = new Set(all().filter(n => n.st === 'closed' && !isKept(n) && lastPrune - n.closed > CLOSED_KEEP).map(n => n.id));
  removeNodes(old);
  for (const n of all()) if (n.parent && !state.nodes[n.parent]) n.parent = null;
}

// ---------- 浏览器事件 ----------

api.windows.onCreated.addListener(win => run(() => {
  winTypes.set(win.id, win.type);
  if (win.type === 'normal') return false;
  // 弹窗（登录窗口之类）不算工作区；如果已经误建了，删掉
  const w = wsOfWindow(win.id);
  if (!w) return false;
  removeNodes(new Set(all().filter(n => n.ws === w.id).map(n => n.id)));
  delete state.ws[w.id];
}));

api.windows.onRemoved.addListener(winId => run(() => {
  if (winId === switcherWin) switcherWin = null;
  winTypes.delete(winId);
  delete state.act[winId];
  const w = wsOfWindow(winId);
  if (!w) return false;
  // 关闭窗口 = 收起这个工作区（标签在 tabs.onRemoved 里已经标成了已收起）
  w.win = null;
  tidyWs();
}));

api.tabs.onCreated.addListener(tab => run(() => {
  if (!isTracked(tab.windowId) || nodeByTab(tab.id)) return false;
  const opener = tab.openerTabId != null ? nodeByTab(tab.openerTabId) : null;
  if (!opener && tryRevive(tab, tabUrl(tab))) return;
  const n = makeNode(tab, opener, ensureWs(tab.windowId));
  if (!opener) n.young = now();
}));

api.tabs.onUpdated.addListener((tabId, info, tab) => run(() => {
  const n = nodeByTab(tabId);
  if (!n) return false;
  let changed = false;
  // Chrome / Edge 有时在 onCreated 里不带 openerTabId，要等后面的 onUpdated 才拿得到
  if (!n.parent && !n.manual && tab.openerTabId != null && now() - n.created < 30e3) {
    const p = nodeByTab(tab.openerTabId);
    if (p && p !== n && !isAncestor(n, p)) {
      n.parent = p.id;
      delete n.young;
      changed = true;
    }
  }
  const url = tabUrl(tab);
  if (url && url !== n.url) {
    // 无来源的新标签刚拿到真实网址：可能是重新打开了刚关掉的页面（Firefox 里网址常常这时才到）
    if (n.young && !isBlank(url)) {
      const young = n.young;
      delete n.young;
      if (now() - young < 15e3 && !hasChildren(n) && tryRevive(tab, url)) return;
    }
    recordHistory(n, url);
    n.url = url;
    changed = true;
  }
  if (tab.title && tab.title !== n.title) { n.title = tab.title; changed = true; }
  if (info.discarded !== undefined && !!info.discarded !== !!n.sleep) { setSleep(n, info.discarded); changed = true; }
  if (info.favIconUrl !== undefined && cleanIcon(info.favIconUrl) !== n.icon) { n.icon = cleanIcon(info.favIconUrl); changed = true; }
  return changed;
}));

api.tabs.onActivated.addListener(({ tabId, windowId }) => run(() => {
  if (!isTracked(windowId)) return false;
  settle(windowId);
  state.act[windowId] = { tab: tabId, since: now() };
}));

api.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => run(() => {
  if (state.act[windowId]?.tab === tabId) settle(windowId);
  const n = nodeByTab(tabId);
  if (!n) return false;
  n.tab = null;
  delete n.sleep;
  if (n.st === 'stashed') return;
  if (isBlank(n.url) && !hasChildren(n)) { removeNodes(new Set([n.id])); return; }
  n.closed = now();
  if (isWindowClosing) { n.st = 'stashed'; n.auto = true; }
  else n.st = 'closed';
}));

api.tabs.onAttached.addListener((tabId, { newWindowId }) => run(() => {
  const n = nodeByTab(tabId);
  if (!n || !isTracked(newWindowId)) return false;
  n.ws = ensureWs(newWindowId).id;
}));

// 标签换了 id（Edge / Chrome 让标签休眠时会这样），把记录接到新 id 上
api.tabs.onReplaced?.addListener((addedId, removedId) => {
  run(() => {
    const n = nodeByTab(removedId);
    if (n) n.tab = addedId;
    for (const a of Object.values(state.act)) if (a.tab === removedId) a.tab = addedId;
  });
  // 「已休眠」的通知有可能比换 id 先到，补查一次
  api.tabs.get(addedId).then(tab => run(() => {
    const n = nodeByTab(addedId);
    if (!n || !!n.sleep === !!tab.discarded) return false;
    setSleep(n, tab.discarded);
  })).catch(() => {});
});

// ---------- 自动休眠 ----------

// 每 5 分钟检查一次。后台每次被叫醒都会跑到这里，已有的闹钟不能重建，否则计时会被一直重置
api.alarms?.get('sleep').then(a => a || api.alarms.create('sleep', { periodInMinutes: 5 }));
api.alarms?.onAlarm.addListener(a => {
  if (a.name === 'sleep') ready.then(sleepIdle).catch(e => console.error('[标签脉络]', e));
});

// 太久没看的标签让它休眠。正在看的、固定的、正在播放声音的不动
async function sleepIdle() {
  const mins = state.settings?.sleepAfter || 0;
  if (!mins) return;
  const limit = now() - mins * 60e3;
  const tabs = await api.tabs.query({ active: false, pinned: false, audible: false, discarded: false });
  for (const tab of tabs) {
    const n = nodeByTab(tab.id);
    if (!n || isBlank(n.url) || tab.autoDiscardable === false) continue;
    if (Math.max(n.last || 0, n.seen || 0, n.created || 0) > limit) continue;
    try { await api.tabs.discard(tab.id); } catch {}
  }
}

// ---------- 快速搜索框 ----------

let switcherWin = null;

api.commands?.onCommand.addListener(cmd => {
  if (cmd === 'open-switcher') openSwitcher().catch(e => console.error('[标签脉络]', e));
});

// 在当前窗口正中偏上的位置弹出一个小窗口。用单独的小窗口而不是注入网页，任何页面上都能用（包括 PDF 和浏览器设置页）
async function openSwitcher() {
  if (switcherWin != null) {
    try { await api.windows.update(switcherWin, { focused: true }); return; } catch { switcherWin = null; }
  }
  const cur = await api.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  const width = 620, height = 500;
  const pos = cur?.width ? {
    left: Math.round(cur.left + (cur.width - width) / 2),
    top: Math.round(cur.top + Math.max(60, (cur.height - height) / 4)),
  } : {};
  const win = await api.windows.create({
    url: api.runtime.getURL('switcher/switcher.html') + (cur ? '?win=' + cur.id : ''),
    type: 'popup', width, height, focused: true, ...pos,
  });
  switcherWin = win.id;
}

// ---------- 侧边栏发来的操作 ----------

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  ready
    .then(() => {
      const fn = actions[msg?.type];
      if (!fn) throw new Error('未知操作 ' + msg?.type);
      return fn(msg);
    })
    .then(r => { save(true); reply({ ok: true, r }); },
          e => { console.error('[标签脉络]', e); save(true); reply({ ok: false, error: String(e) }); });
  return true;
});

function need(id) {
  const n = state.nodes[id];
  if (!n) throw new Error('找不到这个节点');
  return n;
}

// 打开一个不在标签栏里的节点（已关闭 / 已收起 / 孤儿）
async function openNode(n, winId, { active = true, nearParent = true } = {}) {
  if (isBlank(n.url)) return;
  const w = state.ws[n.ws];
  const target = w?.win ?? winId;
  const props = { windowId: target, url: n.url, active };
  const p = n.parent && state.nodes[n.parent];
  if (nearParent && p?.tab != null) {
    try {
      const pt = await api.tabs.get(p.tab);
      if (pt.windowId === target) props.index = pt.index + 1;
    } catch {}
  }
  if (IS_FIREFOX && !active) { props.discarded = true; props.title = n.title || n.url; }
  addPending(n.url);
  try {
    const tab = await api.tabs.create(props);
    attach(n, tab);
  } finally {
    dropPending(n.url);
  }
}

// 关闭一批标签；如果会把某个窗口关空，先给它留一个新标签页，免得整个窗口（工作区）被关掉
async function closeTabs(tabIds) {
  if (!tabIds.length) return;
  const closing = new Set(tabIds);
  const tabs = await api.tabs.query({});
  const perWin = new Map();
  for (const t of tabs) {
    const c = perWin.get(t.windowId) || { total: 0, closing: 0 };
    c.total++;
    if (closing.has(t.id)) c.closing++;
    perWin.set(t.windowId, c);
  }
  for (const [win, c] of perWin) {
    if (c.closing && c.closing === c.total) await api.tabs.create({ windowId: win, active: true });
  }
  await api.tabs.remove(tabIds);
}

const actions = {
  hello() {},

  // 点击节点：打开中的就切过去，不在标签栏的就重新打开
  async focus({ id, win }) {
    const n = need(id);
    if (n.tab != null) {
      const tab = await api.tabs.update(n.tab, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
    } else {
      await openNode(n, win);
    }
  },

  async close({ id, branch }) {
    const n = need(id);
    const list = branch ? subtree(n) : [n];
    await closeTabs(list.filter(x => x.tab != null).map(x => x.tab));
  },

  // 一次关掉一批（比如所有重复的标签）
  async closeIds({ ids }) {
    await closeTabs(ids.map(id => state.nodes[id]).filter(n => n?.tab != null).map(n => n.tab));
  },

  // 在新标签里打开一个网址，挂在 parent 下面（比如重新打开某个标签之前看过的页面）
  async openUrl({ url, parent, win }) {
    const p = state.nodes[parent];
    const props = { url, active: true, windowId: (p && state.ws[p.ws]?.win) ?? win };
    if (p?.tab != null) {
      props.openerTabId = p.tab;
      try {
        const pt = await api.tabs.get(p.tab);
        if (pt.windowId === props.windowId) props.index = pt.index + 1;
      } catch {}
    }
    addPending(url);
    try {
      const tab = await api.tabs.create(props);
      const n = nodeByTab(tab.id) || makeNode(tab, null, ensureWs(tab.windowId));
      if (p && !n.parent && p !== n) n.parent = p.id;
      delete n.young;
    } finally {
      dropPending(url);
    }
  },

  // 收起一个分支：关掉其中打开的标签，记录保留在树上，以后一键恢复
  async stashBranch({ id }) {
    const root = need(id);
    const list = subtree(root).filter(n => n.st === 'open');
    if (!list.length) return;
    const t = now();
    const tabIds = [];
    for (const n of list) {
      if (n.tab != null) tabIds.push(n.tab);
      detach(n);
      n.st = 'stashed';
      n.closed = t;
      delete n.auto;
    }
    root.stashedAt = t;
    root.fold = true;
    save(true);
    await closeTabs(tabIds);
  },

  async restoreBranch({ id, win }) {
    const root = need(id);
    const list = subtree(root).filter(n => n.st === 'stashed' || (n.st === 'open' && n.tab == null));
    delete root.stashedAt;
    root.fold = false;
    let first = true;
    for (const n of list) {
      try {
        await openNode(n, win, { active: first, nearParent: false });
        first = false;
      } catch (e) {
        console.warn('[标签脉络] 打不开', n.url, e);
      }
    }
  },

  // 从记录里删掉（只删不在标签栏里的；分支下还打开着的标签会往上挪一级）
  forget({ id }) {
    const n = need(id);
    removeNodes(new Set(subtree(n).filter(x => x.tab == null).map(x => x.id)));
  },

  markRead({ id, read }) {
    const n = need(id);
    n.seen = read ? (n.seen || now()) : 0;
    for (const a of Object.values(state.act)) if (a.tab === n.tab && n.tab != null) a.skip = !read;
  },

  fold({ ids, fold }) {
    for (const id of ids) if (state.nodes[id]) state.nodes[id].fold = !!fold;
  },

  clearClosed({ ws }) {
    removeNodes(new Set(all().filter(n => n.ws === ws && n.st === 'closed' && !isKept(n)).map(n => n.id)));
  },

  star({ id, star }) {
    need(id).star = !!star;
  },

  note({ id, note }) {
    const n = need(id);
    const text = (note || '').trim().slice(0, 200);
    if (text) n.note = text; else delete n.note;
  },

  // 拖动调整树：放到 target 前面 / 后面 / 里面（最后一个）/ 里面（第一个）/ 最上层
  move({ id, target, pos }) {
    const n = need(id);
    const t = target ? need(target) : null;
    if (t && (t === n || isAncestor(n, t))) throw new Error('不能放到自己的分支里面');
    const siblingsOf = parent => all()
      .filter(x => x !== n && x.ws === n.ws && (parent ? x.parent === parent : !x.parent || state.nodes[x.parent]?.ws !== n.ws))
      .sort(byCreated);
    if (pos === 'inside' || pos === 'first') {
      const kids = siblingsOf(t.id);
      n.parent = t.id;
      n.order = !kids.length ? now() : pos === 'first' ? sortKey(kids[0]) - 1 : sortKey(kids[kids.length - 1]) + 1;
      t.fold = false;
    } else if (pos === 'root' || !t) {
      const roots = siblingsOf(null);
      n.parent = null;
      n.order = roots.length ? sortKey(roots[roots.length - 1]) + 1 : now();
    } else {
      // 和 target 同一级，插在它前面或后面：取相邻两个的中间值
      const parent = t.parent && state.nodes[t.parent]?.ws === n.ws ? t.parent : null;
      const sibs = siblingsOf(parent);
      const i = sibs.indexOf(t);
      const near = pos === 'before' ? sibs[i - 1] : sibs[i + 1];
      const a = sortKey(t);
      n.parent = parent;
      n.order = near ? (a + sortKey(near)) / 2 : pos === 'before' ? a - 1 : a + 1;
    }
    n.manual = true;
  },

  // 把一个节点（或整个分支）移到别的工作区。ws 为 'new' 时开一个新窗口作为新工作区
  async moveToWs({ id, ws, branch }) {
    const n = need(id);
    const list = branch ? subtree(n) : [n];
    if (!branch) {
      for (const c of all()) if (c.parent === n.id && c.ws === n.ws) c.parent = n.parent;   // 子节点留下，挂到上一级
    }
    const live = list.filter(x => x.tab != null);
    let w = state.ws[ws];
    if (ws === 'new') {
      if (!live.length) throw new Error('没有打开的标签，没法新建工作区');
      const win = await api.windows.create({ tabId: live[0].tab, focused: true });
      w = ensureWs(win.id);
      const rest = live.slice(1).map(x => x.tab);
      if (rest.length) await api.tabs.move(rest, { windowId: win.id, index: -1 });
    } else if (!w) {
      throw new Error('找不到这个工作区');
    } else if (w.win != null) {
      if (live.length) await api.tabs.move(live.map(x => x.tab), { windowId: w.win, index: -1 });
    } else {
      // 目标工作区是收起的：标签关掉，记录变成「已收起」放进去
      const tabIds = live.map(x => x.tab);
      for (const x of live) { detach(x); x.st = 'stashed'; x.closed = now(); }
      save(true);
      await closeTabs(tabIds);
    }
    for (const x of list) x.ws = w.id;
    n.order = now();
    n.manual = true;
    tidyWs();
  },

  setSettings({ settings }) {
    state.settings = { ...state.settings, ...settings };
  },

  // 让一批标签休眠：释放内存，标签还在标签栏里，点开时重新加载
  async sleep({ ids }) {
    let count = 0;
    for (const id of ids) {
      const n = state.nodes[id];
      if (n?.tab == null || n.sleep) continue;
      try {
        const tab = await api.tabs.get(n.tab);
        if (tab.active || tab.discarded) continue;
        await api.tabs.discard(n.tab);
        count++;
      } catch {}
    }
    return count;
  },

  renameWs({ ws, name }) {
    const w = state.ws[ws];
    if (!w || !name?.trim()) return;
    w.name = name.trim().slice(0, 40);
    w.named = true;
  },

  async newWs() {
    await api.windows.create({ focused: true });
  },

  // 收起整个工作区：关闭它的窗口，所有标签留在记录里
  async stashWs({ ws }) {
    const w = state.ws[ws];
    if (!w || w.win == null) return;
    const win = w.win;
    const t = now();
    for (const n of all()) {
      if (n.ws !== w.id || n.st !== 'open') continue;
      detach(n);
      if (isBlank(n.url) && !hasChildren(n)) { delete state.nodes[n.id]; continue; }
      n.st = 'stashed';
      n.closed = t;
    }
    w.win = null;
    w.stashed = t;
    tidyWs();
    save(true);
    const wins = await api.windows.getAll({ windowTypes: ['normal'] });
    if (wins.length <= 1) await api.windows.create({ focused: true });
    await api.windows.remove(win);
  },

  // 恢复工作区：开一个新窗口，按树的顺序重新打开收起的标签
  async restoreWs({ ws }) {
    const w = state.ws[ws];
    if (!w) return;
    if (w.win != null) { await api.windows.update(w.win, { focused: true }); return; }
    const list = wsInOrder(w).filter(n => (n.st === 'stashed' || (n.st === 'open' && n.tab == null)) && !isBlank(n.url));
    const first = list.shift();
    let win, firstOpened = false;
    if (first) addPending(first.url);
    try {
      win = await api.windows.create({ focused: true, url: first?.url });
      firstOpened = !!first;
    } catch {
      win = await api.windows.create({ focused: true });   // 网址打不开（比如 Firefox 里的 about: 页面）就先开空窗口
    } finally {
      if (first) dropPending(first.url);
    }
    const auto = wsOfWindow(win.id);
    if (auto && auto !== w) mergeWs(auto, w);
    w.win = win.id;
    w.stashed = 0;
    for (const n of all()) if (n.ws === w.id && n.stashedAt) { delete n.stashedAt; n.fold = false; }
    if (firstOpened && win.tabs?.[0]) attach(first, win.tabs[0]);
    else if (first) list.unshift(first);
    for (const n of list) {
      try { await openNode(n, win.id, { active: false, nearParent: false }); }
      catch (e) { console.warn('[标签脉络] 打不开', n.url, e); }
    }
  },

  deleteWs({ ws }) {
    const w = state.ws[ws];
    if (!w || w.win != null) return;
    removeNodes(new Set(all().filter(n => n.ws === w.id).map(n => n.id)));
    delete state.ws[w.id];
  },
};
