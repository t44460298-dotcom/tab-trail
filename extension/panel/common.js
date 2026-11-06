// 标签脉络 · 侧边栏和快速搜索框共用的小工具（先于 panel.js / switcher.js 加载）

const api = globalThis.browser ?? globalThis.chrome;
const TK = globalThis.TitleKit;
const KEY = 'trail';
const FAVICON_API = !!api.sidePanel;   // Chrome / Edge 能直接取网站图标；Firefox 用记录下来的图标地址
const MAX_STINT = 30 * 60e3;
const WS_COLORS = ['#3b74e8', '#8b5cf6', '#e0518f', '#ec7a2c', '#22a05a', '#0e9fb8', '#c9a00f', '#6b7a90'];

const $ = s => document.querySelector(s);

const isLive = n => n.st === 'open' && n.tab != null;

function isBlank(url) {
  return !url || /^(about:(blank|newtab|home|privatebrowsing)|chrome:\/\/(newtab|new-tab-page)|edge:\/\/newtab|chrome-search:)/.test(url);
}

// 并排页：插件自己的页面，里面放着好几个网页
const isSplitPage = url => !!url && url.startsWith(api.runtime.getURL('split/split.html'));

function wsColor(w) {
  let h = 0;
  for (const ch of w.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return WS_COLORS[h % WS_COLORS.length];
}

// 全部工作区的索引：打开中的同网址标签（判断重复）、看过的网址（「以前看过」）、arXiv 编号 → 论文标题
function buildIndex(state) {
  const live = new Map();
  const seen = new Map();
  const arxiv = new Map();
  const mark = (key, at, n) => {
    const s = seen.get(key);
    if (!s || at > s.at) seen.set(key, { at, n });
  };
  const learn = (url, title) => {
    const id = TK.arxivId(url);
    if (id && title && !TK.isPdf(url, title) && !arxiv.has(id)) arxiv.set(id, TK.cleanTitle(title, url));
  };
  for (const n of Object.values(state.nodes)) {
    if (isBlank(n.url) || isSplitPage(n.url)) continue;
    const key = TK.urlKey(n.url);
    if (isLive(n) && !n.copy) {   // 特意复制出来的不算重复
      if (!live.has(key)) live.set(key, []);
      live.get(key).push(n);
    }
    if (n.seen) mark(key, n.last || n.seen, n);
    learn(n.url, n.title);
    for (const h of n.hist || []) {
      mark(TK.urlKey(h.url), h.at, n);
      learn(h.url, h.title);
    }
  }
  return { live, seen, arxiv };
}

// 显示用的标题：精简掉网站名；PDF 只有文件名时，换成同一篇 arXiv 论文的标题，或者去掉 .pdf 的文件名
function formatTitle(url, title, { arxiv, clean = true } = {}) {
  if (isBlank(url)) return '新标签页';
  if (TK.isPdf(url, title)) {
    const id = TK.arxivId(url);
    const known = id && arxiv?.get(id);
    if (known && (!title || /\.pdf$/i.test(title) || title.includes(id))) return known;
    if (!title || /\.pdf$/i.test(title)) return TK.pdfName(url, title);
  }
  if (!title) {
    try { const u = new URL(url); return u.hostname + u.pathname; } catch { return url; }
  }
  return clean ? TK.cleanTitle(title, url) : title;
}

function favicon(n) {
  const wrap = document.createElement('span');
  wrap.className = 'fav';
  const src = iconSrc(n);
  if (TK.isPdf(n.url, n.title)) {
    const p = document.createElement('span');
    p.className = 'pdf';
    p.textContent = 'PDF';
    wrap.append(p);
  } else if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = src;
    img.onerror = () => {
      if (n.icon && img.getAttribute('src') !== n.icon) img.src = n.icon;
      else img.replaceWith(letterIcon(n));
    };
    wrap.append(img);
  } else {
    wrap.append(letterIcon(n));
  }
  const dot = document.createElement('span');
  dot.className = 'dot';
  wrap.append(dot);
  return wrap;
}

function iconSrc(n) {
  if (FAVICON_API && /^https?:/.test(n.url)) {
    return api.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(n.url) + '&size=32';
  }
  return n.icon || '';
}

function letterIcon(n) {
  const s = document.createElement('span');
  s.className = 'letter';
  let host = '';
  try { host = new URL(n.url).hostname.replace(/^www\./, ''); } catch {}
  s.textContent = (host || n.title || '?').charAt(0).toUpperCase();
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) % 360;
  s.style.background = host ? `hsl(${h} 45% 52%)` : 'var(--faint)';
  return s;
}

// 把文字放进元素，搜索词标黄
function highlight(el, text, terms) {
  if (!terms?.length) { el.textContent = text; return; }
  const lower = text.toLowerCase();
  const marks = [];
  for (const t of terms) {
    let i = lower.indexOf(t);
    while (i >= 0) { marks.push([i, i + t.length]); i = lower.indexOf(t, i + t.length); }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    el.append(text.slice(pos, s));
    const m = document.createElement('mark');
    m.textContent = text.slice(s, e);
    el.append(m);
    pos = e;
  }
  el.append(text.slice(pos));
}

// ---------- 时间格式 ----------

function dayDiff(t) {
  return Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
}

function ago(t) {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const days = dayDiff(t);
  if (days === 0) return `${Math.floor(s / 3600)} 小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// 窄地方用的短格式
function short(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)}分钟`;
  const days = dayDiff(t);
  if (days === 0) return `${Math.floor(s / 3600)}小时`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function stamp(t) {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = dayDiff(t);
  if (days === 0) return '今天 ' + hm;
  if (days === 1) return '昨天 ' + hm;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function duration(ms) {
  const m = Math.round(ms / 60e3);
  if (m < 1) return '不到 1 分钟';
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}
