// 标签脉络 · 侧边栏
// 只读 storage.local 里的数据来显示；所有修改都发消息给后台（background.js 里的 actions）。
// 通用的小工具（图标、时间格式、标题整理）在 common.js。

const svg = (body, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
const STAR_PATH = '<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>';
const ICONS = {
  nextUnread: svg('<path d="M8 2.5v7M5 6.5l3 3 3-3"/><circle cx="8" cy="13.2" r="1.4" fill="currentColor" stroke="none"/>'),
  locate: svg('<circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>'),
  more: svg('<circle cx="3.5" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor" stroke="none"/>'),
  search: svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>', 'stroke-width="1.8"'),
  trash: svg('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>', 'stroke-width="1.5"'),
  reopen: svg('<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7"/><path d="M2.5 2.5v3.2h3.2"/>'),
  stash: svg('<rect x="1.8" y="2.5" width="12.4" height="3.3" rx=".8"/><path d="M3 5.8v7.2h10V5.8M6.5 8.5h3"/>', 'stroke-width="1.5"'),
  goto: svg('<path d="M5 11l6-6M6 4.5h5.5V10"/>'),
  read: svg('<circle cx="8" cy="8" r="5.8"/><path d="M5.4 8.2l1.8 1.8 3.4-3.6"/>', 'stroke-width="1.5"'),
  unread: svg('<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>'),
  unfold: svg('<path d="M5 3.5l3 3 3-3M5 9.5l3 3 3-3"/>'),
  fold: svg('<path d="M5 6.5l3-3 3 3M5 12.5l3-3 3 3"/>'),
  link: svg('<path d="M7 9a2.6 2.6 0 0 0 3.6 0l2.2-2.2a2.6 2.6 0 0 0-3.6-3.6l-.7.7M9 7a2.6 2.6 0 0 0-3.6 0L3.2 9.2a2.6 2.6 0 0 0 3.6 3.6l.7-.7"/>', 'stroke-width="1.5"'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  edit: svg('<path d="M10.5 2.5l3 3L6 13H3v-3z"/>', 'stroke-width="1.5"'),
  compact: svg('<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>'),
  eye: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>'),
  pin: svg('<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z"/><circle cx="8" cy="6.5" r="1.5"/>'),
  dup: svg('<rect x="5" y="5" width="8.5" height="8.5" rx="1.6"/><path d="M11 5V3.6A1.1 1.1 0 0 0 9.9 2.5H3.6a1.1 1.1 0 0 0-1.1 1.1v6.3A1.1 1.1 0 0 0 3.6 11H5"/>', 'stroke-width="1.5"'),
  tidy: svg('<path d="M3 4.5h10M3 8h6.5M3 11.5h4"/>'),
  history: svg('<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7"/><path d="M2.5 2.5v3.2h3.2M8 5v3.2l2 1.3"/>'),
  star: svg(STAR_PATH, 'stroke-width="1.4"'),
  starOn: svg(STAR_PATH, 'fill="currentColor" stroke-width="1.4"'),
  note: svg('<path d="M3 2.5h7l3 3v8H3z"/><path d="M5.5 8h5M5.5 10.5h3.5"/>', 'stroke-width="1.4"'),
  moon: svg('<path d="M13 9.8A5.5 5.5 0 1 1 6.2 3a4.4 4.4 0 0 0 6.8 6.8Z"/>', 'stroke-width="1.5"'),
  copy: svg('<rect x="5" y="5" width="8.5" height="8.5" rx="1.6"/><path d="M11 5V3.6A1.1 1.1 0 0 0 9.9 2.5H3.6a1.1 1.1 0 0 0-1.1 1.1v6.3A1.1 1.1 0 0 0 3.6 11H5"/>', 'stroke-width="1.5"'),
  download: svg('<path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10"/>'),
  exportIcon: svg('<path d="M8 10V2.5M4.8 5.5 8 2.3l3.2 3.2M3 9v4.5h10V9"/>'),
  move: svg('<path d="M2.5 8h9M8.5 4.5 12 8l-3.5 3.5M13.5 3v10"/>'),
  top: svg('<path d="M3 2.5h10M8 13.5V5.5M4.8 8.5 8 5.3l3.2 3.2"/>'),
  font: svg('<path d="M2.5 13 6 3.5 9.5 13M3.7 10h4.6M10.5 13l2-5.5 2 5.5M11 11.5h3"/>', 'stroke-width="1.4"'),
  bar: svg('<path d="M2.5 5h11M2.5 8.5h7M2.5 12h4"/>', 'stroke-width="2"'),
};
const TREE_ART = '<svg viewBox="0 0 56 56" fill="none"><rect x="1" y="1" width="54" height="54" rx="14" fill="var(--accent-soft)"/><path d="M19 17v22M19 28h14M19 39h14" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="19" cy="16" r="4.5" fill="var(--accent)"/><circle cx="37" cy="28" r="4.5" fill="var(--accent)"/><circle cx="37" cy="39" r="4.5" fill="none" stroke="var(--accent)" stroke-width="2.5"/></svg>';

const FILTERS = {
  all: { label: '全部', test: () => true },
  unread: { label: '未看', test: (n, v) => isLive(n) && isUnread(n, v), empty: ['都看完了', '这个工作区里没有未看的标签。'] },
  star: { label: '星标', test: n => !!n.star, empty: ['还没有星标', '鼠标移到一行上点 ☆，或者选中后按 <kbd>S</kbd>，重要的标签就不会找不到。'] },
  dup: { label: '重复', test: n => dupsOf(n).length > 0, empty: ['没有重复的标签', '同一个网页开了不止一个时，会出现在这里。'] },
  stashed: { label: '收起', tip: '已收起', test: n => n.st === 'stashed' || (n.st === 'open' && n.tab == null), empty: ['没有收起的标签', '在一个分支上右键选「收起这个分支」，就能先把它放到一边，以后一键恢复。'] },
  closed: { label: '关闭', tip: '已关闭', test: n => n.st === 'closed', empty: ['没有已关闭的记录', '关掉的标签会留在这里 30 天，方便回头找。加了星标或备注的会一直保留。'] },
};
const SLEEP_OPTIONS = [[0, '不自动休眠'], [30, '30 分钟'], [60, '1 小时'], [120, '2 小时'], [360, '6 小时']];

let state = null;
let myWin = null;
let query = '';
let filter = 'all';
let sel = -1;
let rows = [];          // 当前能用键盘选中的行：[{ n, el, dim }]
let lastActive = null;
let curView = null;
let IDX = null;         // 全部工作区的索引，见 common.js 的 buildIndex
let editing = null;     // 正在写备注的节点；写的时候先不重画，免得输入框被冲掉
let dragging = null;    // 正在拖动的节点；拖的时候同样先不重画
let pendingRender = false;
let showClosed = pref('showClosed', true);
let compact = pref('compact', false);
let cleanTitles = pref('cleanTitles', true);
let readBars = pref('readBars', true);
let fontSize = pref('fontSize', 'm');
const FONT_SIZES = [['s', '小'], ['m', '中'], ['l', '大']];

// ---------- 启动 ----------

(async function init() {
  $('#nextUnread').innerHTML = ICONS.nextUnread;
  $('#locate').innerHTML = ICONS.locate;
  $('#moreBtn').innerHTML = ICONS.more;
  $('#qIcon').innerHTML = ICONS.search;
  $('#qClear').innerHTML = ICONS.close;
  document.body.classList.toggle('compact', compact);
  document.body.dataset.fs = fontSize;

  myWin = (await api.windows.getCurrent()).id;
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      state = changes[KEY].newValue;
      render();
    }
  });
  state = (await api.storage.local.get(KEY))[KEY] || null;
  render();
  send('hello');                         // 叫醒后台，让它把这个窗口整理好
  setInterval(render, 30e3);             // 刷新「几分钟前」
})();

function pref(k, d) {
  try { const v = localStorage.getItem('tt.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
}
function setPref(k, v) {
  try { localStorage.setItem('tt.' + k, JSON.stringify(v)); } catch {}
}

async function send(type, data = {}) {
  try {
    const r = await api.runtime.sendMessage({ type, win: myWin, ...data });
    if (r && !r.ok) toast(r.error || '操作失败');
    return r;
  } catch (e) {
    toast('操作失败：' + e.message);
  }
}

// ---------- 数据整理 ----------

function myWs() {
  return state && Object.values(state.ws).find(w => w.win === myWin);
}

function buildView(ws) {
  const nodes = state.nodes;
  const mine = Object.values(nodes).filter(n => n.ws === ws.id);
  const kids = new Map();
  const roots = [];
  for (const n of mine) {
    const p = n.parent && nodes[n.parent];
    if (p && p.ws === ws.id) {
      if (!kids.has(p.id)) kids.set(p.id, []);
      kids.get(p.id).push(n);
    } else {
      roots.push(n);
    }
  }
  // 同一级里的先后：手动拖动过的按 order，没拖过的按打开时间（和后台一致）
  const byOrder = (a, b) => (a.order ?? a.created) - (b.order ?? b.created);
  roots.sort(byOrder);
  for (const list of kids.values()) list.sort(byOrder);
  const act = state.act?.[myWin] || null;
  const active = act ? mine.find(n => n.tab === act.tab) || null : null;
  const order = [];
  const walk = n => { order.push(n); (kids.get(n.id) || []).forEach(walk); };
  roots.forEach(walk);
  const path = new Set(active ? [active, ...ancestors(active)].map(n => n.id) : []);
  const view = { ws, mine, kids, roots, act, active, order, path };
  view.maxDwell = Math.max(0, ...mine.map(n => dwellOf(n, view)));
  return view;
}

function isUnread(n, view) {
  if (n.seen) return false;
  if (n === view.active && !view.act.skip) return false;   // 正在看的不算未看
  return true;
}

// 同一个网页还开在别处的标签
function dupsOf(n) {
  if (!IDX || !isLive(n) || isBlank(n.url)) return [];
  return (IDX.live.get(TK.urlKey(n.url)) || []).filter(x => x !== n);
}

// 这个网页以前在别的标签里看过
function seenBefore(n) {
  if (!IDX || isBlank(n.url)) return null;
  const s = IDX.seen.get(TK.urlKey(n.url));
  return s && s.n !== n ? s : null;
}

function descendants(n, view) {
  const out = [];
  const walk = x => (view.kids.get(x.id) || []).forEach(c => { out.push(c); walk(c); });
  walk(n);
  return out;
}

function ancestors(n) {
  const out = [];
  let p = n.parent && state.nodes[n.parent];
  while (p && p.ws === n.ws) { out.push(p); p = p.parent && state.nodes[p.parent]; }
  return out;
}

const titleOf = (url, title) => formatTitle(url, title, { arxiv: IDX?.arxiv, clean: cleanTitles });
// 用户起了名字就用名字，否则用整理过的网页标题
const displayTitle = n => n.alias || titleOf(n.url, n.title);
const histTitle = h => h.alias || titleOf(h.url, h.title);

function dwellOf(n, view) {
  let d = n.dwell || 0;
  if (n === view.active && view.act) d += Math.min(Date.now() - view.act.since, MAX_STINT);
  return d;
}

function wsLabel(id, here) {
  return id === here ? '本工作区' : state.ws[id]?.name || '别的工作区';
}

// 可以手动让它休眠的：打开着、没在睡、不是当前窗口正在看的
const canSleep = (n, view) => isLive(n) && !n.sleep && n !== view.active;

// ---------- 渲染 ----------

function render() {
  if (editing || dragging) { pendingRender = true; return; }
  hideCard();
  const tree = $('#tree');
  const scroll = tree.scrollTop;
  tree.replaceChildren();
  rows = [];
  curView = null;
  if (!state) { empty(tree, '正在读取…'); return; }
  IDX = buildIndex(state);
  const ws = myWs();
  $('#wsName').textContent = ws ? ws.name : '…';
  $('#wsDot').style.background = ws ? wsColor(ws) : '';
  if (!ws) { empty(tree, '正在整理这个窗口的标签…'); $('#filters').replaceChildren(); $('#crumbs').hidden = true; return; }

  const view = curView = buildView(ws);
  renderFilters(view);
  if (query || filter !== 'all') renderFiltered(tree, view);
  else renderTree(tree, view);
  renderCrumbs(view);

  tree.scrollTop = scroll;
  if (sel >= rows.length) sel = rows.length - 1;
  paintSel();
  const act = view.active?.id ?? null;
  if (act !== lastActive) {
    lastActive = act;
    if (!query) requestAnimationFrame(() => scrollToActive('nearest'));
  }
}

function renderFilters(view) {
  const chips = Object.entries(FILTERS).map(([key, f]) => {
    const count = key === 'all' ? view.mine.filter(isLive).length : view.mine.filter(n => f.test(n, view)).length;
    if (!count && key !== 'all' && key !== filter) return null;
    const b = document.createElement('button');
    b.className = 'chip ' + key + (key === filter ? ' on' : '');
    b.append(f.label);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = count;
    b.append(n);
    b.title = key === 'all' ? `打开中的标签 ${count} 个` : `只看${f.tip || f.label}的（${count}）`;
    b.onclick = () => { filter = key; sel = -1; render(); $('#tree').scrollTop = 0; };
    return b;
  }).filter(Boolean);
  $('#filters').replaceChildren(...chips);
}

// 树形连线：每一行画出自己左边的竖线和拐角；从根到当前标签的那一路用蓝色
// cont[k]：第 k 级的竖线要不要穿过这一行（那一级后面还有兄弟）；hl[k]：第 k 级的竖线此刻是不是在当前路径上
function lineSpec(n, depth, cont, last, kidsShown, hasTwisty, view, hl) {
  hl.length = Math.min(hl.length, depth);
  const onPath = view.path.has(n.id);
  // 没有折叠箭头时，拐角一直画到图标前面
  const spec = { depth, cont: cont.map((c, k) => (c ? (hl[k] ? 2 : 1) : 0)), leaf: !hasTwisty };
  if (depth > 0) {
    const L = depth - 1;
    spec.elbow = onPath ? 2 : 1;
    spec.through = !!hl[L] && !onPath;
    if (onPath) hl[L] = false;
    spec.below = last ? 0 : hl[L] ? 2 : 1;
  }
  const isAncestor = onPath && n !== view.active;
  spec.down = kidsShown ? (isAncestor ? 2 : 1) : 0;
  if (kidsShown && isAncestor) hl[depth] = true;
  return spec;
}

function renderTree(tree, view) {
  const vis = new Map();
  const isVis = n => {
    if (vis.has(n.id)) return vis.get(n.id);
    let v = showClosed || n.st !== 'closed';
    for (const c of view.kids.get(n.id) || []) if (isVis(c)) v = true;
    vis.set(n.id, v);
    return v;
  };
  const hl = [];
  const emit = (n, depth, cont, last) => {
    const kids = (view.kids.get(n.id) || []).filter(isVis);
    const shown = n.fold ? [] : kids;
    const lines = lineSpec(n, depth, cont, last, shown.length > 0, kids.length > 0, view, hl);
    tree.append(row(n, depth, view, { kids: kids.length, lines, drag: true, kidsShown: shown.length > 0 }));
    const next = depth === 0 ? [] : [...cont, !last];
    shown.forEach((c, i) => emit(c, depth + 1, next, i === shown.length - 1));
  };
  view.roots.filter(isVis).forEach(n => emit(n, 0, [], true));

  if (rows.length) return;
  if (view.mine.length) {
    empty(tree, '已关闭的记录被隐藏了', '在右上角「更多」菜单里可以重新显示。');
  } else {
    empty(tree, '这棵树还没有长出来',
      '在网页里用 <kbd>Ctrl</kbd> + 点击 或 <b>鼠标中键</b> 打开链接，<br>新标签会自动挂在来源页面下面。<br><br>在任何页面按 <kbd>Alt</kbd> + <kbd>K</kbd> 可以快速搜索标签。', true);
  }
}

// 搜索和筛选共用：只显示命中的节点，以及它们的上级（淡色，作为位置参照）
function renderFiltered(tree, view) {
  const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : null;
  const f = FILTERS[filter];
  const match = s => terms.every(t => s.toLowerCase().includes(t));
  const textHit = n => !terms || match(displayTitle(n) + ' ' + (n.title || '') + ' ' + n.url + ' ' + (n.note || ''));
  // 在这个标签之前看过的页面里搜到的
  const histHit = n => (terms && !textHit(n) ? [...(n.hist || [])].reverse().find(h => match((h.alias || '') + ' ' + (h.title || '') + ' ' + h.url)) : null);
  const hit = n => f.test(n, view) && (textHit(n) || !!histHit(n));
  const keep = new Set();
  for (const n of view.mine) {
    if (!hit(n)) continue;
    keep.add(n.id);
    for (const a of ancestors(n)) keep.add(a.id);
  }
  const hl = [];
  const emit = (n, depth, cont, last) => {
    const kids = (view.kids.get(n.id) || []).filter(c => keep.has(c.id));
    const lines = lineSpec(n, depth, cont, last, kids.length > 0, false, view, hl);
    tree.append(row(n, depth, view, { dim: !hit(n), terms, kids: 0, lines, via: histHit(n) }));
    const next = depth === 0 ? [] : [...cont, !last];
    kids.forEach((c, i) => emit(c, depth + 1, next, i === kids.length - 1));
  };
  view.roots.filter(n => keep.has(n.id)).forEach(n => emit(n, 0, [], true));

  if (terms) {
    const others = Object.values(state.nodes)
      .filter(n => n.ws !== view.ws.id && state.ws[n.ws] && hit(n))
      .sort((a, b) => (b.last || b.created) - (a.last || a.created))
      .slice(0, 50);
    if (others.length) {
      const h = document.createElement('div');
      h.className = 'section';
      h.textContent = `其他工作区 · ${others.length}`;
      tree.append(h);
      for (const n of others) tree.append(row(n, 0, view, { terms, kids: 0, other: state.ws[n.ws], via: histHit(n) }));
    }
  }
  if (!rows.length) {
    if (terms) empty(tree, '没有找到', '搜索范围包括已关闭、已收起的记录，备注，以及每个标签之前跳转过的页面。');
    else empty(tree, ...f.empty);
  }
  if (sel < 0 || sel >= rows.length || rows[sel].dim) sel = rows.findIndex(r => !r.dim);
}

function renderCrumbs(view) {
  const box = $('#crumbs');
  const a = view.active;
  if (!a) { box.hidden = true; return; }
  const up = [...ancestors(a)].reverse();
  // 只显示最近的两级上级，更远的收成「…」，点它找最顶上那篇
  const path = up.length > 2 ? [{ more: up[0] }, ...up.slice(-2), a] : [...up, a];
  const pin = document.createElement('span');
  pin.className = 'pin';
  pin.innerHTML = ICONS.pin;
  pin.title = '当前标签在树上的位置';
  const parts = [pin];
  path.forEach((n, i) => {
    if (i) {
      const s = document.createElement('span');
      s.className = 'sep';
      s.textContent = '›';
      parts.push(s);
    }
    const b = document.createElement('button');
    if (n.more) {
      b.className = 'more';
      b.textContent = '…';
      b.title = `还有 ${up.length - 2} 级，最上面是：${displayTitle(n.more)}`;
      b.onclick = () => reveal(n.more);
    } else {
      b.textContent = displayTitle(n);
      b.title = displayTitle(n) + '\n点击在树上找到它';
      if (n === a) b.className = 'cur';
      b.onclick = () => reveal(n);
    }
    parts.push(b);
  });
  box.replaceChildren(...parts);
  box.hidden = false;
}

function row(n, depth, view, opt = {}) {
  const el = document.createElement('div');
  const live = isLive(n);
  const active = n === view.active;
  const unread = isUnread(n, view);
  el.className = 'row ' + (live ? 'live' : n.st === 'open' ? 'orphan' : n.st);
  if (depth === 0 && !opt.other) el.classList.add('root');
  if (active) el.classList.add('active');
  if (unread && live) el.classList.add('unread');
  if (live && n.sleep) el.classList.add('sleeping');
  if (opt.dim) el.classList.add('dim');
  el.style.setProperty('--depth', depth);
  el.dataset.id = n.id;

  const tw = document.createElement('button');
  tw.className = 'twisty';
  if (opt.kids) {
    tw.classList.add(n.fold ? 'folded' : 'open');
    tw.title = n.fold ? '展开' : '折叠';
    tw.onclick = e => { e.stopPropagation(); send('fold', { ids: [n.id], fold: !n.fold }); };
  } else {
    tw.classList.add('none');
  }

  const main = document.createElement('div');
  main.className = 'main';
  const title = document.createElement('div');
  title.className = 'title';
  highlight(title, displayTitle(n), opt.terms);
  main.append(title);
  const subText = n.stashedAt
    ? `${ago(n.stashedAt)}收起 · ${[n, ...descendants(n, view)].filter(x => x.st === 'stashed').length} 个标签`
    : opt.via ? `之前在这个标签里看过：${histTitle(opt.via)}`
    : opt.other ? opt.other.name : '';
  if (subText) {
    const sub = document.createElement('div');
    sub.className = 'sub' + (opt.via ? ' via' : '');
    sub.textContent = subText;
    main.append(sub);
  }
  if (n.note) {
    const note = document.createElement('div');
    note.className = 'sub note';
    highlight(note, n.note, opt.terms);
    note.title = '双击修改备注';
    note.ondblclick = e => { e.stopPropagation(); editNote(n); };
    main.append(note);
  }

  const fav = favicon(n);
  if (unread && live && seenBefore(n)) fav.querySelector('.dot').classList.add('ring');
  el.append(tw, fav, main, aside(n, view, { active, unread, live, kids: opt.kids }), actions(n, view, live));
  if (opt.lines) drawLines(el, opt.lines);
  // 阅读时长细条：读得越久越长（开平方，免得一篇特别长的把其他的都压没了）
  const dwell = dwellOf(n, view);
  if (readBars && dwell >= 60e3 && view.maxDwell) {
    const bar = document.createElement('div');
    bar.className = 'readbar';
    bar.style.setProperty('--w', Math.max(4, Math.sqrt(dwell / view.maxDwell) * 100).toFixed(1) + '%');
    el.append(bar);
  }
  if (opt.drag) makeDraggable(el, n, view, opt.kidsShown);

  el.onclick = () => openRow(n);
  el.onauxclick = e => { if (e.button === 1 && live) { e.preventDefault(); send('close', { id: n.id }); } };
  el.oncontextmenu = e => { e.preventDefault(); hideCard(); nodeMenu(n, view, e.clientX, e.clientY); };
  el.onmouseenter = () => scheduleCard(n, el);
  el.onmouseleave = hideCard;
  rows.push({ n, el, dim: !!opt.dim });
  return el;
}

function drawLines(el, spec) {
  if (!spec.depth && !spec.down) return;
  const box = document.createElement('div');
  box.className = 'lines';
  const add = (cls, k, level) => {
    const i = document.createElement('i');
    i.className = cls + (level === 2 ? ' hl' : '');
    i.style.setProperty('--k', k);
    box.append(i);
  };
  spec.cont.forEach((c, k) => { if (c) add('v', k, c); });
  if (spec.depth > 0) {
    const L = spec.depth - 1;
    if (spec.below) add('v bot', L, spec.below);
    add('elbow' + (spec.leaf ? ' leaf' : ''), L, spec.elbow);
    if (spec.through) add('v top', L, 2);
  }
  if (spec.down) add('v down', spec.depth, spec.down);
  el.prepend(box);
}

// 右侧的一小块：星标、重复、休眠，再加上 正在看 / 折叠数 / 收起 / 多久前看过
function aside(n, view, o) {
  const a = document.createElement('div');
  a.className = 'aside';
  const span = (cls, text, title) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (title) s.title = title;
    a.append(s);
    return s;
  };
  if (n.star) span('star', '★', '星标');
  const dups = dupsOf(n);
  if (dups.length) {
    const s = span('dup', '重复', `这个网页还开着 ${dups.length} 个，点击跳到另一个`);
    s.onclick = e => { e.stopPropagation(); send('focus', { id: dups[0].id }); };
  }
  if (o.live && n.sleep) {
    const s = span('sleep', '', '休眠中：已释放内存，点开时会重新加载');
    s.innerHTML = ICONS.moon;
  }
  if (n.stashedAt) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = '恢复';
    b.title = '重新打开这个分支里收起的标签';
    b.onclick = e => { e.stopPropagation(); send('restoreBranch', { id: n.id }); };
    a.append(b);
  } else if (o.active) {
    span('now', '在看');
  } else if (n.fold && o.kids) {
    const hidden = descendants(n, view);
    const unread = hidden.filter(x => isLive(x) && isUnread(x, view)).length;
    span('count' + (unread ? ' hot' : ''), unread ? `${unread} 未看` : `+${hidden.length}`,
      `折叠了 ${hidden.length} 个` + (unread ? `，其中 ${unread} 篇没看` : ''));
  } else if (n.st === 'stashed' || (n.st === 'open' && n.tab == null)) {
    span('tag', '收起');
  } else if (n.seen) {
    span('time', short(n.last || n.seen), `${ago(n.last || n.seen)}看过`);
  }
  return a;
}

function actions(n, view, live) {
  const box = document.createElement('div');
  box.className = 'acts';
  const btn = (icon, title, fn, cls) => {
    const b = document.createElement('button');
    b.innerHTML = ICONS[icon];
    b.title = title;
    if (cls) b.className = cls;
    b.onclick = e => { e.stopPropagation(); fn(); };
    box.append(b);
  };
  if (n.stashedAt) return box;
  btn(n.star ? 'starOn' : 'star', n.star ? '取消星标（S）' : '加星标（S）', () => send('star', { id: n.id, star: !n.star }), n.star ? 'starred' : '');
  if (live) {
    if (descendants(n, view).some(isLive)) btn('stash', '收起这个分支（关闭标签、保留记录，之后可一键恢复）', () => send('stashBranch', { id: n.id }));
    btn('close', '关闭标签（中键单击也可以）', () => send('close', { id: n.id }));
  } else {
    btn('reopen', '重新打开', () => openRow(n));
    btn('trash', '从记录中删除', () => send('forget', { id: n.id }));
  }
  return box;
}

// title / html 都只用于上面写死的提示文字
function empty(tree, title, html = '', art = false) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML = (art ? TREE_ART : '') + `<h3>${title}</h3>` + (html ? `<p>${html}</p>` : '');
  tree.append(d);
}

// ---------- 拖动调整树 ----------

// 拖到一行的上沿 = 放在它前面，下沿 = 放在它后面，中间 = 变成它的子节点。
// 下沿碰到展开着的节点时，放成它的第一个子节点（视觉上就在它下面）
function makeDraggable(el, n, view, kidsShown) {
  el.draggable = true;
  el.ondragstart = e => {
    dragging = n;
    hideCard();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/uri-list', n.url);   // 拖到别的软件里就是这个网址
    e.dataTransfer.setData('text/plain', n.url);
    requestAnimationFrame(() => el.classList.add('dragging'));
  };
  el.ondragend = endDrag;
  el.ondragover = e => {
    if (!dragging) return;
    e.stopPropagation();   // 不让它冒泡到树的空白处（那里表示「移到最上层」）
    if (dragging === n || ancestors(n).includes(dragging)) { clearDrop(); return; }   // 不能放进自己的分支
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    let pos = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
    if (pos === 'after' && kidsShown) pos = 'first';
    if (el.dataset.drop !== pos) { clearDrop(); el.dataset.drop = pos; }
  };
  el.ondragleave = e => { if (!el.contains(e.relatedTarget)) delete el.dataset.drop; };
  el.ondrop = e => {
    e.preventDefault();
    e.stopPropagation();
    const pos = el.dataset.drop;
    const moved = dragging;
    endDrag();
    if (moved && pos) send('move', { id: moved.id, target: n.id, pos });
  };
}

function clearDrop() {
  document.querySelectorAll('[data-drop]').forEach(x => delete x.dataset.drop);
}

function endDrag() {
  clearDrop();
  document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
  dragging = null;
  if (pendingRender) { pendingRender = false; render(); }
}

// 拖到树下面的空白处 = 移到最上层的最后
$('#tree').addEventListener('dragover', e => {
  if (!dragging) return;
  e.preventDefault();
  clearDrop();
  $('#tree').dataset.drop = 'root';
});
$('#tree').addEventListener('dragleave', e => { if (e.target === $('#tree')) delete $('#tree').dataset.drop; });
$('#tree').addEventListener('drop', e => {
  e.preventDefault();
  const moved = dragging;
  endDrag();
  if (moved) send('move', { id: moved.id, pos: 'root' });
});

// ---------- 导出 ----------

// 一组节点连同它们的整个分支（包括已关闭、已收起的），新标签页跳过但保留它下面的
function exportTree(roots, view) {
  const walk = (n, depth, out) => {
    const skip = isBlank(n.url);
    if (!skip) out.push({ n, depth });
    for (const c of view.kids.get(n.id) || []) walk(c, skip ? depth : depth + 1, out);
    return out;
  };
  return roots.flatMap(n => walk(n, 0, []));
}

function toMarkdown(title, items, view) {
  const lines = [`# ${title}`, '', `> 导出自「标签脉络」 · ${stamp(Date.now())} · 共 ${items.length} 个`, ''];
  for (const { n, depth } of items) {
    const pad = '  '.repeat(depth);
    const read = n.seen || n === view.active;
    const text = displayTitle(n).replace(/([[\]\\])/g, '\\$1');
    const link = /[\s()<>]/.test(n.url) ? `<${n.url}>` : n.url;
    const extra = [];
    if (n.star) extra.push('★');
    if (n.st === 'closed') extra.push('已关闭');
    else if (n.st === 'stashed') extra.push('已收起');
    const d = dwellOf(n, view);
    if (d >= 60e3) extra.push('读了 ' + duration(d));
    lines.push(`${pad}- [${read ? 'x' : ' '}] [${text}](${link})` + (extra.length ? ' · ' + extra.join(' · ') : ''));
    if (n.note) lines.push(`${pad}  > ${n.note}`);
  }
  return lines.join('\n') + '\n';
}

// 浏览器通用的书签文件格式：有子节点的变成文件夹（第一项是它自己）
function toBookmarks(title, items) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>', `<DT><H3>${esc(title)}</H3>`, '<DL><p>'];
  const open = [];
  items.forEach(({ n, depth }, i) => {
    while (open.length > depth) { out.push('</DL><p>'); open.pop(); }
    const a = `<DT><A HREF="${esc(n.url)}" ADD_DATE="${Math.floor(n.created / 1000)}">${esc(displayTitle(n))}</A>`;
    if (items[i + 1]?.depth > depth) {
      out.push(`<DT><H3>${esc(displayTitle(n))}</H3>`, '<DL><p>', a);
      open.push(n);
    } else {
      out.push(a);
    }
  });
  while (open.length) { out.push('</DL><p>'); open.pop(); }
  out.push('</DL><p>', '</DL><p>');
  return out.join('\n') + '\n';
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportItems(title, roots, view) {
  const items = exportTree(roots, view);
  const day = new Date();
  const base = `${title}-${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`
    .replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80);
  return [
    { head: `导出 ${items.length} 个（含已关闭、已收起的记录）` },
    { icon: 'copy', label: '复制为 Markdown', sub: '带层级、链接、已读', run: () => copy(toMarkdown(title, items, view), '已复制，可以粘贴到笔记里') },
    { icon: 'download', label: '下载 Markdown 文件', sub: '.md', run: () => { download(base + '.md', toMarkdown(title, items, view), 'text/markdown'); toast('已下载'); } },
    { icon: 'download', label: '下载书签文件', sub: '可导入浏览器书签', run: () => { download(base + '.html', toBookmarks(title, items), 'text/html'); toast('已下载，可在浏览器的「导入书签」里选这个文件'); } },
  ];
}

// 在当前菜单的位置换成下一级菜单
function subMenu(items) {
  const m = $('#menu');
  showMenu(items, parseFloat(m.style.left), parseFloat(m.style.top));
}

// ---------- 备注 ----------

// 在这一行里直接写备注：回车保存，Esc 放弃，清空就是删除
function editNote(n) {
  hideCard();
  hideMenu();
  const el = $(`#tree .row[data-id="${n.id}"]`);
  if (!el) return;
  const main = el.querySelector('.main');
  main.querySelector('.sub.note')?.remove();
  const input = document.createElement('input');
  input.className = 'note-edit';
  input.placeholder = '写一句备注，回车保存';
  input.maxLength = 200;
  input.value = n.note || '';
  main.append(input);
  editing = n.id;
  input.focus();
  input.onclick = e => e.stopPropagation();
  const done = save => {
    if (editing !== n.id) return;
    editing = null;
    input.onblur = null;
    if (save && input.value.trim() !== (n.note || '')) send('note', { id: n.id, note: input.value });
    pendingRender = false;
    render();
  };
  input.onblur = () => done(true);
  input.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  };
}

// 在这一行里直接改名字：标题变成输入框，回车保存，Esc 放弃；清空或改回原标题 = 不再用自定义名字
function renameNode(n) {
  hideCard();
  hideMenu();
  const el = $(`#tree .row[data-id="${n.id}"]`);
  if (!el) return;
  const original = titleOf(n.url, n.title);
  const input = document.createElement('input');
  input.className = 'title-edit';
  input.placeholder = '输入名字，清空就恢复原标题';
  input.maxLength = 100;
  input.value = displayTitle(n);
  el.querySelector('.title').replaceWith(input);
  el.draggable = false;   // 不然在输入框里拖选文字会变成拖动这一行
  editing = n.id;
  input.focus();
  input.select();
  input.onclick = e => e.stopPropagation();
  const done = save => {
    if (editing !== n.id) return;
    editing = null;
    input.onblur = null;
    const v = input.value.trim();
    if (save && v !== displayTitle(n)) send('rename', { id: n.id, name: v === original || v === n.title ? '' : v });
    pendingRender = false;
    render();
  };
  input.onblur = () => done(true);
  input.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  };
}

// ---------- 悬停卡片：完整标题和阅读记录 ----------

let cardTimer = null;
function scheduleCard(n, el) {
  clearTimeout(cardTimer);
  if (editing) return;
  cardTimer = setTimeout(() => showCard(n, el), 550);
}

function showCard(n, el) {
  if (!curView || !$('#menu').hidden || !el.isConnected || editing) return;
  const view = curView;
  const card = $('#card');
  const div = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  };
  const parts = [div('t', (n.star ? '★ ' : '') + (n.alias || (n.title && !isBlank(n.url) ? n.title : displayTitle(n)))), div('u', n.url)];
  if (n.note) parts.push(div('n', n.note));
  const dl = document.createElement('dl');
  const line = (k, v, cls) => {
    if (!v) return;
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    if (cls) dd.className = cls;
    dl.append(dt, dd);
  };
  const active = n === view.active;
  if (n.alias) line('原标题', n.title || n.url);
  line('状态', active ? '正在看'
    : isLive(n) ? (n.sleep ? '打开中 · 休眠（点开时重新加载）' : '打开中')
    : n.st === 'closed' ? `已关闭（${ago(n.closed)}）`
    : `已收起（${ago(n.stashedAt || n.closed)}）`);
  line('看过', active ? '现在' : n.seen ? `${ago(n.last || n.seen)}（${stamp(n.last || n.seen)}）` : '还没看过');
  const before = !n.seen && seenBefore(n);
  if (before) line('以前看过', `${ago(before.at)}，在${wsLabel(before.n.ws, n.ws)}`, 'note');
  const d = dwellOf(n, view);
  if (d >= 30e3) line('阅读', '累计 ' + duration(d));
  line('打开于', stamp(n.created));
  const dups = dupsOf(n);
  if (dups.length) {
    const where = [...new Set(dups.map(x => wsLabel(x.ws, n.ws)))].join('、');
    line('重复', `还开着 ${dups.length} 个（${where}）`, 'warn');
  }
  const kids = descendants(n, view);
  if (kids.length) {
    const unread = kids.filter(x => isLive(x) && isUnread(x, view)).length;
    line('下面', `${kids.length} 个标签` + (unread ? `，${unread} 篇没看` : ''));
  }
  parts.push(dl);
  // 来路：在这个标签里一路点过来的页面
  const hist = n.hist || [];
  if (hist.length) {
    const box = document.createElement('div');
    box.className = 'trail';
    box.append(div('h', `在这个标签里之前看过 ${hist.length} 个页面`));
    const shown = hist.slice(-4);
    if (hist.length > shown.length) box.append(div('more', `…更早的 ${hist.length - shown.length} 个`));
    for (const h of shown) {
      const item = document.createElement('div');
      item.className = 'step';
      item.append(div('st', histTitle(h)), div('sa', short(h.at)));
      box.append(item);
    }
    const now = document.createElement('div');
    now.className = 'step cur';
    now.append(div('st', displayTitle(n)), div('sa', '现在'));
    box.append(now);
    parts.push(box);
  }
  card.replaceChildren(...parts);
  card.hidden = false;
  const r = el.getBoundingClientRect();
  const h = card.getBoundingClientRect().height;
  card.style.top = (r.bottom + 6 + h < innerHeight - 40 ? r.bottom + 6 : Math.max(6, r.top - h - 6)) + 'px';
}

function hideCard() {
  clearTimeout(cardTimer);
  const card = $('#card');
  if (card) card.hidden = true;
}

// ---------- 操作 ----------

function openRow(n) {
  send('focus', { id: n.id });
  if (query) setQuery('');
}

function setQuery(q) {
  query = q;
  $('#q').value = q;
  $('#qClear').hidden = !q;
  $('#qHint').hidden = !!q;
  sel = -1;
  render();
}

function paintSel() {
  rows.forEach((r, i) => r.el.classList.toggle('sel', i === sel));
}

function moveSel(delta) {
  if (!rows.length) return;
  sel = sel < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, sel + delta));
  paintSel();
  rows[sel].el.scrollIntoView({ block: 'nearest' });
}

function scrollToActive(block) {
  const el = $('#tree .row.active');
  if (el) el.scrollIntoView({ block });
}

function unfold(list) {
  const ids = list.filter(x => x.fold).map(x => x.id);
  if (ids.length) send('fold', { ids, fold: false });
}

// 在树上找到某个节点：清掉搜索和筛选、展开上级、滚过去并闪一下
function reveal(n) {
  if (query) setQuery('');
  if (filter !== 'all') { filter = 'all'; sel = -1; render(); }
  unfold(ancestors(n));
  setTimeout(() => {
    const el = $(`#tree .row[data-id="${n.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }, 150);
}

// 「看完 f，c 和 d 在哪？」——按树的顺序，从当前标签往后找第一篇还没看的
function nextUnread() {
  const ws = myWs();
  if (!ws) return;
  const view = buildView(ws);
  const start = view.active ? view.order.indexOf(view.active) : -1;
  const ok = n => isLive(n) && isUnread(n, view);
  const pick = view.order.slice(start + 1).find(ok) || view.order.slice(0, start + 1).find(ok);
  if (!pick) { toast('这个工作区里没有未看的标签了'); return; }
  unfold(ancestors(pick));
  send('focus', { id: pick.id });
}

function locate() {
  const ws = myWs();
  if (!ws) return;
  const view = buildView(ws);
  if (view.active) reveal(view.active);
}

// 本工作区里重复的标签：每组留一个（正在看的优先，否则留最早打开的），其余的
function extraDups(view) {
  const extra = [];
  const groups = new Map();
  for (const n of view.mine.filter(isLive)) {
    if (isBlank(n.url)) continue;
    const key = TK.urlKey(n.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = list.includes(view.active) ? view.active : list.reduce((a, b) => (a.created <= b.created ? a : b));
    extra.push(...list.filter(n => n !== keep));
  }
  return extra;
}

async function sleepTabs(list) {
  if (!list.length) return;
  const r = await send('sleep', { ids: list.map(n => n.id) });
  if (r?.ok) toast(r.r ? `${r.r} 个标签已休眠，释放了内存` : '没有可以休眠的标签');
}

function copy(text, msg = '链接已复制') {
  navigator.clipboard.writeText(text).then(() => toast(msg), () => {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    toast(msg);
  });
}

// ---------- 菜单 ----------

function nodeMenu(n, view, x, y) {
  const live = isLive(n);
  const sub = [n, ...descendants(n, view)];
  const openCount = sub.filter(isLive).length;
  const stashCount = sub.filter(s => s.st === 'stashed' || (s.st === 'open' && s.tab == null)).length;
  const sleepable = sub.filter(s => canSleep(s, view));
  const unread = isUnread(n, view);
  const dups = dupsOf(n);
  const items = [
    { icon: live ? 'goto' : 'reopen', label: live ? '切换到这个标签' : '重新打开', run: () => openRow(n) },
  ];
  if (dups.length) {
    items.push({ icon: 'dup', label: '跳到另一个相同的标签', sub: wsLabel(dups[0].ws, n.ws), run: () => send('focus', { id: dups[0].id }) });
    items.push({ icon: 'close', label: '关闭这个重复的', run: () => send('close', { id: n.id }) });
  }
  if (stashCount && (stashCount > 1 || !live)) items.push({ icon: 'reopen', label: '恢复这个分支', sub: `${stashCount} 个`, run: () => send('restoreBranch', { id: n.id }) });
  items.push('-');
  items.push(n.star
    ? { icon: 'starOn', label: '取消星标', sub: 'S', run: () => send('star', { id: n.id, star: false }) }
    : { icon: 'star', label: '加星标', sub: 'S', run: () => send('star', { id: n.id, star: true }) });
  items.push({ icon: 'edit', label: n.alias ? '修改名字' : '重命名', sub: 'F2', run: () => renameNode(n) });
  if (n.alias) items.push({ icon: 'reopen', label: '恢复原标题', run: () => send('rename', { id: n.id, name: '' }) });
  items.push({ icon: 'note', label: n.note ? '修改备注' : '写备注', run: () => editNote(n) });
  if (n.note) items.push({ icon: 'trash', label: '删除备注', run: () => send('note', { id: n.id, note: '' }) });
  items.push(unread
    ? { icon: 'read', label: '标为已看', run: () => send('markRead', { id: n.id, read: true }) }
    : { icon: 'unread', label: '标为未看', run: () => send('markRead', { id: n.id, read: false }) });
  items.push('-');
  if (openCount) items.push({ icon: 'stash', label: '收起这个分支', sub: `${openCount} 个，可恢复`, run: () => send('stashBranch', { id: n.id }) });
  if (sleepable.length) items.push({ icon: 'moon', label: sub.length > 1 ? '让这个分支休眠' : '让它休眠', sub: `${sleepable.length} 个，释放内存`, run: () => sleepTabs(sleepable) });
  if (openCount > 1) items.push({ icon: 'close', label: '关闭这个分支', sub: `${openCount} 个`, run: () => send('close', { id: n.id, branch: true }) });
  else if (live && !dups.length) items.push({ icon: 'close', label: '关闭', run: () => send('close', { id: n.id }) });
  if (sub.length > 1) {
    const folded = sub.filter(s => s.fold && view.kids.get(s.id)?.length);
    items.push(folded.length
      ? { icon: 'unfold', label: '展开整个分支', run: () => send('fold', { ids: folded.map(s => s.id), fold: false }) }
      : { icon: 'fold', label: '折叠', run: () => send('fold', { ids: [n.id], fold: true }) });
  }
  items.push('-');
  items.push({ icon: 'move', label: '移到工作区', sub: '›', keep: true, run: () => subMenu(moveItems(n, sub, true)) });
  if (n.parent && state.nodes[n.parent]?.ws === n.ws) items.push({ icon: 'top', label: '移到最上层', run: () => send('move', { id: n.id, pos: 'root' }) });
  items.push({ icon: 'exportIcon', label: sub.length > 1 ? '导出这个分支' : '导出', sub: '›', keep: true, run: () => subMenu(exportItems(displayTitle(n), [n], view)) });
  const hist = (n.hist || []).slice(-6).reverse();
  if (hist.length) {
    items.push('-');
    items.push({ head: '之前在这个标签里看过 · 点击在新标签打开' });
    for (const h of hist) {
      items.push({ icon: 'history', label: histTitle(h), sub: short(h.at), run: () => send('openUrl', { url: h.url, parent: n.id }) });
    }
  }
  items.push('-');
  items.push({ icon: 'link', label: '复制链接', run: () => copy(n.url) });
  if (!live) items.push({ icon: 'trash', label: sub.length > 1 ? '从记录中删除（含分支）' : '从记录中删除', danger: true, run: () => send('forget', { id: n.id }) });
  showMenu(items, x, y);
}

function wsMenu() {
  const r = $('#wsBtn').getBoundingClientRect();
  const all = Object.values(state?.ws || {});
  const nodes = Object.values(state?.nodes || {});
  const count = w => nodes.filter(n => n.ws === w.id && (w.win != null ? isLive(n) : n.st !== 'closed')).length;
  const open = all.filter(w => w.win != null).sort((a, b) => a.created - b.created);
  const stashed = all.filter(w => w.win == null).sort((a, b) => b.stashed - a.stashed);
  const items = [{ head: '打开中的工作区' }];
  for (const w of open) {
    items.push({ dot: wsColor(w), label: w.name, sub: `${count(w)} 个`, checked: w.win === myWin, run: () => send('restoreWs', { ws: w.id }) });
  }
  if (stashed.length) {
    items.push({ head: '已收起 · 点击恢复' });
    for (const w of stashed) {
      items.push({
        dot: wsColor(w), label: w.name, sub: `${count(w)} 个 · ${ago(w.stashed)}`,
        run: () => send('restoreWs', { ws: w.id }),
        extra: { label: '删除', armed: '确认删除', run: () => send('deleteWs', { ws: w.id }) },
      });
    }
  }
  items.push('-');
  items.push({ icon: 'plus', label: '新建工作区', sub: '新窗口', run: () => send('newWs') });
  items.push({ icon: 'edit', label: '重命名当前工作区', run: startRename });
  items.push({ icon: 'stash', label: '收起当前工作区', sub: '关闭窗口，记录保留', run: () => { const w = myWs(); if (w) send('stashWs', { ws: w.id }); } });
  showMenu(items, r.left, r.bottom + 4);
}

function sleepLabel(mins) {
  return (SLEEP_OPTIONS.find(([m]) => m === mins) || [mins, `${mins} 分钟`])[1];
}

// 「移到工作区」的下一级菜单。branch：连同下面的分支一起移
function moveItems(n, sub, branch) {
  const others = Object.values(state.ws).filter(w => w.id !== n.ws)
    .sort((a, b) => (a.win == null) - (b.win == null) || a.created - b.created);
  const live = (branch ? sub : [n]).some(isLive);
  const items = [{ head: '移到哪个工作区' }];
  if (sub.length > 1) {
    items.push({ icon: 'unfold', label: `连同下面 ${sub.length - 1} 个一起移`, checked: branch, keep: true, run: () => subMenu(moveItems(n, sub, !branch)) });
    items.push('-');
  }
  for (const w of others) {
    items.push({ dot: wsColor(w), label: w.name, sub: w.win == null ? '已收起' : '', run: () => send('moveToWs', { id: n.id, ws: w.id, branch }) });
  }
  if (live) items.push({ icon: 'plus', label: '新工作区', sub: '开一个新窗口', run: () => send('moveToWs', { id: n.id, ws: 'new', branch }) });
  if (!others.length && !live) items.push({ hint: '还没有别的工作区。' });
  return items;
}

function moreMenu() {
  const r = $('#moreBtn').getBoundingClientRect();
  const ws = myWs();
  const view = ws && buildView(ws);
  const closed = view ? view.mine.filter(n => n.st === 'closed').length : 0;
  const foldable = view ? view.mine.filter(n => view.kids.get(n.id)?.length) : [];
  const extra = view ? extraDups(view) : [];
  const sleepable = view ? view.mine.filter(n => canSleep(n, view)) : [];
  const sleepAfter = state?.settings?.sleepAfter ?? 120;
  const at = [r.right, r.bottom + 4, true];
  const flip = (key, get, set) => () => { set(!get()); setPref(key, get()); };
  const items = [
    { head: '显示' },
    { icon: 'compact', label: '紧凑显示', sub: '标题只占一行', checked: compact, run: flip('compact', () => compact, v => {
      compact = v;
      document.body.classList.toggle('compact', compact);
    }) },
    { icon: 'font', label: '字号', sub: FONT_SIZES.find(([k]) => k === fontSize)[1] + ' ›', keep: true, run: () => {
      showMenu([{ head: '字号' }, ...FONT_SIZES.map(([k, label]) => ({ label, checked: k === fontSize, run: () => {
        fontSize = k;
        setPref('fontSize', k);
        document.body.dataset.fs = k;
      } }))], ...at);
    } },
    { icon: 'tidy', label: '精简网页标题', sub: '去掉网站名', checked: cleanTitles, run: flip('cleanTitles', () => cleanTitles, v => { cleanTitles = v; render(); }) },
    { icon: 'bar', label: '阅读时长条', sub: '读得越久越长', checked: readBars, run: flip('readBars', () => readBars, v => { readBars = v; render(); }) },
    { icon: 'eye', label: '在「全部」里显示已关闭', checked: showClosed, run: flip('showClosed', () => showClosed, v => { showClosed = v; render(); }) },
    { head: '整理' },
    { icon: 'fold', label: '全部折叠', run: () => send('fold', { ids: foldable.map(n => n.id), fold: true }) },
    { icon: 'unfold', label: '全部展开', run: () => send('fold', { ids: foldable.map(n => n.id), fold: false }) },
  ];
  if (sleepable.length) items.push({ icon: 'moon', label: '让其他标签都休眠', sub: `${sleepable.length} 个`, run: () => sleepTabs(sleepable) });
  if (extra.length) items.push({ icon: 'dup', label: '关闭重复的标签', sub: `${extra.length} 个，每个网页留一个`, run: () => send('closeIds', { ids: extra.map(n => n.id) }) });
  if (view?.roots.length) items.push({ icon: 'exportIcon', label: '导出这个工作区', sub: '›', keep: true, run: () => showMenu(exportItems(ws.name, view.roots, view), ...at) });
  items.push(
    { icon: 'trash', label: '清空已关闭的记录', sub: `${closed} 条`, danger: true, run: () => ws && send('clearClosed', { ws: ws.id }) },
    { head: '设置' },
    { icon: 'moon', label: '自动休眠', sub: sleepAfter ? `${sleepLabel(sleepAfter)}没看就休眠 ›` : '已关闭 ›', keep: true, run: () => {
      showMenu([
        { head: '多久没看就让标签休眠（释放内存，标签不会关掉）' },
        ...SLEEP_OPTIONS.map(([m, label]) => ({ label, checked: m === sleepAfter, run: () => send('setSettings', { settings: { sleepAfter: m } }) })),
        '-',
        { hint: '正在看的、固定的、正在播放声音的标签不会休眠。<br>休眠的标签点开时会重新加载，没保存的表单内容可能丢失。' },
      ], ...at);
    } },
    '-',
    { hint: '<kbd>Alt</kbd>+<kbd>K</kbd> 在任何页面快速搜索标签<br><kbd>/</kbd> 搜索　<kbd>N</kbd> 下一篇未看　<kbd>S</kbd> 星标<br><kbd>F2</kbd> 重命名　<kbd>↑</kbd><kbd>↓</kbd> 选择　<kbd>←</kbd><kbd>→</kbd> 折叠/展开<br><kbd>Enter</kbd> 打开　<kbd>Esc</kbd> 清空<br>拖动一行可以调整位置' },
  );
  showMenu(items, ...at);
}

function showMenu(items, x, y, alignRight) {
  const m = $('#menu');
  m.replaceChildren();
  for (const it of items) {
    if (it === '-') { const d = document.createElement('div'); d.className = 'hr'; m.append(d); continue; }
    if (it.head) { const d = document.createElement('div'); d.className = 'head'; d.textContent = it.head; m.append(d); continue; }
    if (it.hint) { const d = document.createElement('div'); d.className = 'hint'; d.innerHTML = it.hint; m.append(d); continue; }
    const b = document.createElement('button');
    b.className = 'item' + (it.danger ? ' danger' : '');
    const lead = document.createElement('span');
    lead.className = 'lead';
    if (it.dot) {
      const d = document.createElement('span');
      d.className = 'ws-dot';
      d.style.background = it.dot;
      lead.append(d);
    } else if (it.icon) {
      lead.innerHTML = ICONS[it.icon];
    }
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = it.label;
    b.append(lead, label);
    if (it.sub) { const s = document.createElement('span'); s.className = 'sub'; s.textContent = it.sub; b.append(s); }
    if (it.checked) { const t = document.createElement('span'); t.className = 'tick'; t.textContent = '✓'; b.append(t); }
    if (it.extra) {
      const ex = document.createElement('span');
      ex.className = 'extra';
      ex.textContent = it.extra.label;
      ex.onclick = e => {
        e.stopPropagation();
        if (!ex.classList.contains('armed')) { ex.classList.add('armed'); ex.textContent = it.extra.armed; return; }
        hideMenu();
        it.extra.run();
      };
      b.append(ex);
    }
    // keep：点了之后菜单换成下一级，不先关掉
    b.onclick = () => { if (!it.keep) hideMenu(); it.run(); };
    m.append(b);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  const left = alignRight ? x - r.width : x;
  m.style.left = Math.max(6, Math.min(left, innerWidth - r.width - 6)) + 'px';
  m.style.top = (y + r.height > innerHeight - 6 ? Math.max(6, y - r.height) : y) + 'px';
}

function hideMenu() { $('#menu').hidden = true; }

function startRename() {
  const ws = myWs();
  if (!ws) return;
  const input = $('#wsRename');
  $('#wsBtn').hidden = true;
  input.hidden = false;
  input.value = ws.name;
  input.focus();
  input.select();
  const done = save => {
    input.onblur = input.onkeydown = null;
    input.hidden = true;
    $('#wsBtn').hidden = false;
    if (save && input.value.trim() && input.value.trim() !== ws.name) send('renameWs', { ws: ws.id, name: input.value });
  };
  input.onblur = () => done(true);
  input.onkeydown = e => {
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
    e.stopPropagation();
  };
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- 事件绑定 ----------

$('#wsBtn').onclick = wsMenu;
$('#moreBtn').onclick = moreMenu;
$('#nextUnread').onclick = nextUnread;
$('#locate').onclick = locate;
$('#q').oninput = e => {
  query = e.target.value.trim();
  $('#qClear').hidden = !e.target.value;
  $('#qHint').hidden = !!e.target.value;
  sel = -1;
  render();
};
$('#qClear').onclick = () => { setQuery(''); $('#q').focus(); };
// 侧边栏太窄、筛选项放不下时，用滚轮左右滚动
$('#filters').addEventListener('wheel', e => {
  const f = e.currentTarget;
  if (f.scrollWidth <= f.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  f.scrollLeft += e.deltaY;
}, { passive: false });
$('#tree').addEventListener('scroll', hideCard, { passive: true });

document.addEventListener('mousedown', e => {
  if (!$('#menu').hidden && !$('#menu').contains(e.target)) hideMenu();
}, true);
addEventListener('blur', () => { hideMenu(); hideCard(); });

document.addEventListener('keydown', e => {
  const typing = e.target.matches('input');
  if (e.key === 'Escape') {
    if (!$('#menu').hidden) hideMenu();
    else if (query) setQuery('');
    else if (filter !== 'all') { filter = 'all'; sel = -1; render(); }
    else $('#q').blur();
    return;
  }
  if (!typing && e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
  if (!typing && (e.key === 'n' || e.key === 'N')) { nextUnread(); return; }
  if (!typing && e.key === 'F2' && rows[sel]) { e.preventDefault(); renameNode(rows[sel].n); return; }
  if (!typing && (e.key === 's' || e.key === 'S') && rows[sel]) {
    const n = rows[sel].n;
    send('star', { id: n.id, star: !n.star });
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); return; }
  if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && rows[sel]) {
    const n = rows[sel].n;
    if (curView?.kids.get(n.id)?.length) send('fold', { ids: [n.id], fold: e.key === 'ArrowLeft' });
    return;
  }
  if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); openRow(rows[sel].n); }
});
