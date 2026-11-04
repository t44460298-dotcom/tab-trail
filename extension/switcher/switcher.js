// 标签脉络 · 快速搜索框
// 在任何页面按 Alt+K 弹出（后台的 openSwitcher 开的小窗口）。什么都不输入时列出最近看过的标签；
// 输入后在所有工作区里搜：打开中的、已收起的、已关闭的记录，备注，以及每个标签之前跳转过的页面。

const fromWin = Number(new URLSearchParams(location.search).get('win')) || null;   // 按快捷键时所在的窗口
const SEARCH_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>';

let state = null;
let IDX = null;
let results = [];
let sel = 0;
let terms = [];

const cleanTitles = (() => { try { return JSON.parse(localStorage.getItem('tt.cleanTitles') ?? 'true'); } catch { return true; } })();
const titleOf = (url, title) => formatTitle(url, title, { arxiv: IDX?.arxiv, clean: cleanTitles });
const recency = n => Math.max(n.last || 0, n.seen || 0, n.created || 0);

(async function init() {
  $('#qIcon').innerHTML = SEARCH_ICON;
  state = (await api.storage.local.get(KEY))[KEY] || null;
  if (state) IDX = buildIndex(state);
  update();
  $('#q').focus();
})();

function update() {
  terms = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  results = state ? search() : [];
  sel = 0;
  render();
}

function search() {
  const curTab = fromWin != null ? state.act?.[fromWin]?.tab : null;
  const nodes = Object.values(state.nodes).filter(n => state.ws[n.ws] && !isBlank(n.url));
  if (!terms.length) {
    // 最近看过的打开中标签，不含正在看的这个：回车就回到上一个标签，像 Alt+Tab
    return nodes.filter(n => isLive(n) && n.tab !== curTab)
      .sort((a, b) => recency(b) - recency(a))
      .slice(0, 30)
      .map(n => ({ n }));
  }
  const has = s => terms.every(t => s.toLowerCase().includes(t));
  const out = [];
  for (const n of nodes) {
    const title = titleOf(n.url, n.title);
    if (has(title + ' ' + (n.title || '') + ' ' + n.url + ' ' + (n.note || ''))) {
      out.push({ n, score: score(n, title) });
      continue;
    }
    const via = [...(n.hist || [])].reverse().find(h => has((h.title || '') + ' ' + h.url));
    if (via) out.push({ n, via, score: score(n, title) - 30 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}

// 排序：打开中的 > 已收起 > 已关闭；加星的、标题里直接有关键词的、最近看过的靠前
function score(n, title) {
  let s = isLive(n) ? 100 : n.st === 'stashed' ? 45 : 20;
  if (n.star) s += 25;
  const t = title.toLowerCase();
  if (terms.every(x => t.includes(x))) s += 20;
  if (t.startsWith(terms[0])) s += 10;
  s += Math.max(0, 20 - ((Date.now() - recency(n)) / 864e5) * 2);
  return s;
}

function render() {
  const list = $('#list');
  list.replaceChildren();
  if (!state) {
    list.innerHTML = '<div class="empty">还没有数据。先打开侧边栏用一会儿吧。</div>';
    return;
  }
  if (!results.length) {
    list.innerHTML = terms.length
      ? '<div class="empty">没有找到。<br>搜索范围：所有工作区里打开的、收起的、关闭的标签，备注，以及标签里跳转过的页面。</div>'
      : '<div class="empty">现在没有其他打开的标签。</div>';
    $('#count').textContent = '';
    return;
  }
  if (!terms.length) {
    const h = document.createElement('div');
    h.className = 'head';
    h.textContent = '最近看过的标签';
    list.append(h);
  }
  results.forEach((r, i) => list.append(item(r, i)));
  $('#count').textContent = terms.length ? `${results.length} 个结果` : '';
}

function item({ n, via }, i) {
  const el = document.createElement('div');
  el.className = 'item' + (i === sel ? ' sel' : '') + (isLive(n) ? '' : ' off');

  const main = document.createElement('div');
  main.style.minWidth = '0';
  const t = document.createElement('div');
  t.className = 't';
  highlight(t, titleOf(n.url, n.title), terms);
  const s = document.createElement('div');
  s.className = 's';
  const ws = state.ws[n.ws];
  const dot = document.createElement('span');
  dot.className = 'ws-dot';
  dot.style.background = wsColor(ws);
  const part = (text, cls) => {
    const p = document.createElement('span');
    if (cls) p.className = cls;
    p.textContent = text;
    return p;
  };
  const active = isLive(n) && ws.win != null && state.act?.[ws.win]?.tab === n.tab;
  const status = active ? part('正在看', 'now')
    : isLive(n) ? part(n.seen ? `${ago(recency(n))}看过` : '未看', n.seen ? '' : 'new')
    : part(n.st === 'closed' ? `已关闭 · ${ago(n.closed)}` : '已收起');
  s.append(dot, part(ws.name), part('·'), status);
  if (n.sleep && isLive(n)) s.append(part('· 休眠'));
  if (via) s.append(part('·'), part(`之前看过：${titleOf(via.url, via.title)}`, 'via'));
  else if (n.note) s.append(part('·'), part(n.note, 'note'));
  main.append(t, s);

  const r = document.createElement('div');
  r.className = 'r';
  if (n.star) r.append(part('★', 'star'));
  r.append(part(isLive(n) ? '切换 ↵' : '重新打开 ↵', 'enter'));

  el.append(favicon(n), main, r);
  el.onclick = () => choose(i);
  el.onmousemove = () => { if (sel !== i) { sel = i; paintSel(); } };
  return el;
}

function paintSel() {
  [...$('#list').querySelectorAll('.item')].forEach((el, i) => el.classList.toggle('sel', i === sel));
  $('#list').querySelectorAll('.item')[sel]?.scrollIntoView({ block: 'nearest' });
}

async function choose(i) {
  const r = results[i];
  if (!r) return;
  try {
    if (r.via) await api.runtime.sendMessage({ type: 'openUrl', url: r.via.url, parent: r.n.id, win: fromWin });
    else await api.runtime.sendMessage({ type: 'focus', id: r.n.id, win: fromWin });
  } finally {
    window.close();
  }
}

$('#q').addEventListener('input', update);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { window.close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    paintSel();
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
});

// 点到别的窗口就自动关掉，像一个弹出框
let focused = false;
addEventListener('focus', () => { focused = true; });
addEventListener('blur', () => {
  setTimeout(() => { if (focused && !document.hasFocus()) window.close(); }, 120);
});
