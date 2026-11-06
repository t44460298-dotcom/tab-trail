// 一个极简的「假浏览器」：模拟标签、窗口、事件和存储，用来在 Node 里跑 background.js
import fs from 'node:fs';
import vm from 'node:vm';

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function event() {
  const ls = [];
  return { addListener: f => ls.push(f), fire: (...a) => ls.forEach(f => f(...a)), ls };
}

export function createClock(t = Date.UTC(2026, 10, 3, 8)) {
  return { t, advance(ms) { this.t += ms; } };
}

// firefoxStyle: 新标签在 onCreated 时网址是 about:blank，真实网址稍后通过 onUpdated 才到
// openerLate: onCreated 里没有 openerTabId，之后的 onUpdated 才带上（Edge / Chrome 实测会这样）
// openerLate: 'silent'：连 onUpdated 也还没来（页面在排队等连接）
// noSplit: 浏览器没有原生分屏接口；splitFails: 有接口，但这次分屏失败
export function createBrowser({ local = {}, firefoxStyle = false, eventsAfterCreate = false, openerLate = false, rejectData = false, noSplit = false, splitFails = false } = {}) {
  const store = { local: clone(local), session: {} };
  const tabs = new Map();
  const wins = new Map();
  let nextTab = 1;
  let nextWin = 1;
  let focused = null;

  const ev = {
    tabs: { onCreated: event(), onUpdated: event(), onActivated: event(), onRemoved: event(), onAttached: event(), onReplaced: event() },
    windows: { onCreated: event(), onRemoved: event() },
    runtime: { onMessage: event() },
    action: { onClicked: event() },
    alarms: { onAlarm: event() },
    commands: { onCommand: event() },
  };
  const alarms = new Map();
  const sessionRules = new Map();
  let nextSplit = 500;

  // 「点开才加载」的占位页会把标题设成它带着的原标题
  const title = url => (url.startsWith('data:') ? decodeURIComponent(url).match(/<title>(.*?)<\/title>/)?.[1] || ''
    : url.startsWith('http') ? '标题 ' + url.split('/').pop() : '新标签页');
  const reindex = w => w.tabs.forEach((id, i) => { tabs.get(id).index = i; });
  const later = fn => (eventsAfterCreate ? setImmediate(fn) : fn());

  function addTab(winId, url, { active = false, opener, index } = {}) {
    const w = wins.get(winId);
    const t = { id: nextTab++, windowId: winId, index: 0, url, title: title(url), active: false, favIconUrl: '' };
    if (opener != null) t.openerTabId = opener;
    if (index == null || index > w.tabs.length) w.tabs.push(t.id); else w.tabs.splice(index, 0, t.id);
    tabs.set(t.id, t);
    reindex(w);
    const created = clone(t);
    if (firefoxStyle) { created.url = 'about:blank'; created.title = ''; }
    if (openerLate) delete created.openerTabId;
    later(() => {
      ev.tabs.onCreated.fire(created);
      if (firefoxStyle) ev.tabs.onUpdated.fire(t.id, { url: t.url }, clone(t));
      else if (openerLate && openerLate !== 'silent') ev.tabs.onUpdated.fire(t.id, { status: 'loading' }, clone(t));
      if (active) activate(t.id);
    });
    if (eventsAfterCreate && active) { w.tabs.forEach(id => { tabs.get(id).active = id === t.id; }); }
    return t;
  }

  function openWindow(urls = ['chrome://newtab/'], type = 'normal') {
    const w = { id: nextWin++, type, tabs: [], left: 100, top: 50, width: 1200, height: 800 };
    wins.set(w.id, w);
    focused = w.id;
    ev.windows.onCreated.fire({ id: w.id, type });
    urls.forEach((u, i) => addTab(w.id, u, { active: i === 0 }));
    return w;
  }

  function activate(id) {
    const t = tabs.get(id);
    for (const other of wins.get(t.windowId).tabs) tabs.get(other).active = other === id;
    ev.tabs.onActivated.fire({ tabId: id, windowId: t.windowId });
    if (t.discarded) {   // 休眠的标签被点开，会重新加载
      t.discarded = false;
      t.status = 'loading';
      ev.tabs.onUpdated.fire(id, { discarded: false, status: 'loading' }, clone(t));
    }
  }

  // 只比较查询里给出的条件；没设过的布尔属性当作 false
  const matches = (t, q) => Object.entries(q).every(([k, v]) => (typeof v === 'boolean' ? !!t[k] === v : t[k] === v));

  function navigate(id, url) {
    const t = tabs.get(id);
    t.url = url;
    t.title = title(url);
    ev.tabs.onUpdated.fire(id, { url, title: t.title }, clone(t));
  }

  function closeTab(id) {
    const t = tabs.get(id);
    if (!t) return;
    const w = wins.get(t.windowId);
    if (w.tabs.length === 1) { closeWindow(w.id); return; }
    w.tabs = w.tabs.filter(x => x !== id);
    tabs.delete(id);
    reindex(w);
    ev.tabs.onRemoved.fire(id, { windowId: w.id, isWindowClosing: false });
    if (t.active) activate(w.tabs[Math.min(t.index, w.tabs.length - 1)]);
  }

  // 把标签挪到别的窗口；原窗口空了就自动关掉（和浏览器一样）
  function moveTab(id, winId, index) {
    const t = tabs.get(id);
    const from = wins.get(t.windowId);
    from.tabs = from.tabs.filter(x => x !== id);
    reindex(from);
    const to = wins.get(winId);
    if (index == null || index < 0 || index > to.tabs.length) to.tabs.push(id); else to.tabs.splice(index, 0, id);
    const sameWindow = from === to;
    t.windowId = winId;
    reindex(to);
    if (sameWindow) return;   // 同一个窗口里挪位置：不算换窗口，选中的标签也不变
    ev.tabs.onAttached.fire(id, { newWindowId: winId, newPosition: t.index });
    if (t.active) {
      t.active = false;
      if (from.tabs.length) activate(from.tabs[0]);
    }
    if (!from.tabs.length) {
      wins.delete(from.id);
      ev.windows.onRemoved.fire(from.id);
    }
  }

  function closeWindow(id) {
    const w = wins.get(id);
    for (const tid of w.tabs) { tabs.delete(tid); ev.tabs.onRemoved.fire(tid, { windowId: id, isWindowClosing: true }); }
    wins.delete(id);
    ev.windows.onRemoved.fire(id);
    if (focused === id) focused = [...wins.keys()][0] ?? null;
  }

  const populated = w => ({ id: w.id, type: w.type, left: w.left, top: w.top, width: w.width, height: w.height, tabs: w.tabs.map(id => clone(tabs.get(id))) });

  const api = {
    tabs: {
      ...ev.tabs,
      async create({ windowId, url = 'chrome://newtab/', active = true, index }) {
        if (rejectData && url.startsWith('data:')) throw new Error('不允许打开 data: 网址');
        return clone(addTab(windowId ?? focused, url, { active, index }));
      },
      async update(id, { active, url, pinned }) {
        if (active) activate(id);
        if (pinned != null) tabs.get(id).pinned = pinned;
        if (url) { tabs.get(id).status = 'loading'; tabs.get(id).discarded = false; navigate(id, url); }
        return clone(tabs.get(id));
      },
      // 和浏览器一样：新标签排在原标签后面并选中，来源就是原标签
      async duplicate(id) {
        const t = tabs.get(id);
        const copy = addTab(t.windowId, t.url, { active: true, opener: id, index: t.index + 1 });
        return clone(copy);
      },
      ...(noSplit ? {} : {
        async createSplit(ids) {
          if (splitFails) throw new Error('不能分屏');
          const [a, b] = ids.map(id => tabs.get(id));
          if (!a || !b || ids.length !== 2) throw new Error('必须是两个标签');
          if (a.windowId !== b.windowId || Math.abs(a.index - b.index) !== 1) throw new Error('必须相邻');
          if (!!a.pinned !== !!b.pinned || (a.groupId ?? -1) !== (b.groupId ?? -1)) throw new Error('固定状态和分组必须一样');
          if ((a.splitViewId ?? -1) !== -1 || (b.splitViewId ?? -1) !== -1) throw new Error('已经在分屏里');
          const sid = nextSplit++;
          for (const t of [a, b]) {
            t.splitViewId = sid;
            ev.tabs.onUpdated.fire(t.id, { splitViewId: sid }, clone(t));
          }
          return sid;
        },
        async unsplit(sid) {
          for (const t of tabs.values()) {
            if (t.splitViewId !== sid) continue;
            t.splitViewId = -1;
            ev.tabs.onUpdated.fire(t.id, { splitViewId: -1 }, clone(t));
          }
        },
      }),
      async group({ groupId, tabIds }) { for (const id of [].concat(tabIds)) tabs.get(id).groupId = groupId; return groupId; },
      async ungroup(ids) { for (const id of [].concat(ids)) tabs.get(id).groupId = -1; },
      async remove(ids) { for (const id of [].concat(ids)) closeTab(id); },
      async get(id) { if (!tabs.has(id)) throw new Error('No tab with id ' + id); return clone(tabs.get(id)); },
      async query(q = {}) { return [...tabs.values()].filter(t => matches(t, q)).map(clone); },
      async move(ids, { windowId, index }) {
        for (const id of [].concat(ids)) moveTab(id, windowId ?? tabs.get(id).windowId, index);   // 不给窗口就是在原窗口里挪位置
      },
      async discard(id) {
        const t = tabs.get(id);
        if (!t || t.active) throw new Error('不能让这个标签休眠');
        t.discarded = true;
        t.status = 'unloaded';
        ev.tabs.onUpdated.fire(id, { discarded: true, status: 'unloaded' }, clone(t));
        return clone(t);
      },
    },
    windows: {
      ...ev.windows,
      async getAll({ windowTypes } = {}) {
        return [...wins.values()].filter(w => !windowTypes || windowTypes.includes(w.type)).map(populated);
      },
      async getLastFocused() { return populated(wins.get(focused)); },
      async create({ url, type = 'normal', tabId } = {}) {
        if (tabId != null) {   // 用已有的标签开新窗口
          const w = { id: nextWin++, type, tabs: [], left: 100, top: 50, width: 1200, height: 800 };
          wins.set(w.id, w);
          focused = w.id;
          ev.windows.onCreated.fire({ id: w.id, type });
          moveTab(tabId, w.id);
          activate(tabId);
          return populated(w);
        }
        return populated(openWindow(url ? [].concat(url) : undefined, type));
      },
      async update(id) { if (!wins.has(id)) throw new Error('No window'); focused = id; return populated(wins.get(id)); },
      async remove(id) { closeWindow(id); },
      async getCurrent() { return populated(wins.get(focused)); },
    },
    storage: {
      local: { async get(k) { return { [k]: clone(store.local[k]) }; }, async set(o) { Object.assign(store.local, clone(o)); } },
      session: { async get(k) { return { [k]: store.session[k] }; }, async set(o) { Object.assign(store.session, o); } },
    },
    runtime: { ...ev.runtime, getURL: p => 'chrome-extension://test/' + p.replace(/^\//, '') },
    sidePanel: { async setPanelBehavior() {} },
    action: ev.action,
    alarms: {
      ...ev.alarms,
      async get(name) { return alarms.get(name); },
      create(name, info) { alarms.set(name, { name, ...info }); },
    },
    commands: ev.commands,
    declarativeNetRequest: {
      async getSessionRules() { return [...sessionRules.values()].map(clone); },
      async updateSessionRules({ removeRuleIds = [], addRules = [] }) {
        for (const id of removeRuleIds) sessionRules.delete(id);
        for (const r of addRules) sessionRules.set(r.id, clone(r));
      },
    },
  };

  const send = msg => new Promise(res => ev.runtime.onMessage.fire(msg, {}, res));
  // 从某个标签里的页面发消息（并排页就是这样）
  const sendFrom = (tabId, msg) => new Promise(res => ev.runtime.onMessage.fire(msg, { tab: clone(tabs.get(tabId)) }, res));
  // 模拟页面加载完成
  const complete = id => {
    const t = tabs.get(id);
    t.status = 'complete';
    ev.tabs.onUpdated.fire(id, { status: 'complete' }, clone(t));
  };
  const fireAlarm = name => ev.alarms.onAlarm.fire({ name });

  return { api, store, tabs, wins, alarms, sessionRules, openWindow, addTab, activate, navigate, closeTab, closeWindow, send, sendFrom, fireAlarm, complete, get focused() { return focused; } };
}

// 在独立的上下文里加载 background.js；时间和定时器由测试控制
export function bootBackground(browser, clock, file) {
  const timers = [];
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.t); }
    static now() { return clock.t; }
  }
  const ctx = {
    chrome: browser.api,
    console,
    URL,
    URLSearchParams,
    Date: FakeDate,
    setTimeout: fn => { const t = { fn }; timers.push(t); return t; },
    clearTimeout: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'background.js' });
  return {
    ctx,
    timers,
    // 等所有排队的事件处理完，并把延迟保存写进存储
    async settle() {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setImmediate(r));
        while (timers.length) timers.shift().fn();
      }
    },
  };
}
