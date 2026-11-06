// 标签脉络 · 并排页：把几个网页放在同一页里显示。放什么记在网址里（n = 节点 id，u = 网址，l = 排列方式），重启后还能恢复。
// 网页放在 iframe 里，这样它们用的还是浏览器里原来的登录状态。沙盒不给 allow-top-navigation：有些网站发现自己被嵌入，
// 会把整个页面跳走，不给这个权限就跳不走。

const SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation allow-pointer-lock';
const FEATURES = 'fullscreen; clipboard-read; clipboard-write; autoplay; encrypted-media; picture-in-picture';
const LOAD_TIMEOUT = 8e3;   // 同一网站排队时，前一个最多等这么久
const MIN_PANE = 140;       // 拖动缝隙时，一格最小的宽度和高度
const icon = body => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  reload: icon('<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7"/><path d="M2.5 2.5v3.2h3.2"/>'),
  max: icon('<path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/>'),
  pop: icon('<path d="M5 11l6-6M6 4.5h5.5V10"/>'),
  close: icon('<path d="M4 4l8 8M12 4l-8 8"/>'),
};

const params = new URLSearchParams(location.search);
const panes = params.getAll('u').map((url, i) => ({ node: params.getAll('n')[i] || '', url, frameId: null, retried: new Set() }));
let layout = params.get('l') || 'auto';
let myTab = null;
let nodes = {};
let cols = [];
let rowsFr = [];
const allowed = new Set();
const stage = $('#stage');

const send = (type, data = {}) => api.runtime.sendMessage({ type, ...data }).catch(() => null);
const hostOf = url => { try { return new URL(url).hostname; } catch { return ''; } };
const patternOf = url => { const u = new URL(url); return `${u.protocol}//${u.hostname}/*`; };
const isWeb = url => /^https?:/i.test(url);
const sameUrl = (a, b) => { try { return new URL(a).href === new URL(b).href; } catch { return a === b; } };

(async function init() {
  if (!panes.length) { stage.textContent = '这一页里没有网页了，可以关掉。'; return; }
  [myTab, nodes] = await Promise.all([
    api.tabs.getCurrent().then(t => t?.id ?? null),
    api.storage.local.get(KEY).then(s => s[KEY]?.nodes || {}),
  ]);
  panes.forEach(buildPane);
  layoutPanes();
  addEventListener('resize', placeGutters);
  for (const b of document.querySelectorAll('.seg button')) b.onclick = () => setLayout(b.dataset.l);
  $('#undo').onclick = undoAll;
  listenNavigation();
  paintTitle();
  const lack = await missing(panes.map(p => p.url));
  if (lack.length) askPermission(lack);
  panes.forEach(paintHead);
  if (!lack.length) start();
})();

// ---------- 权限 ----------

async function missing(urls) {
  const out = [];
  for (const origin of new Set(urls.filter(isWeb).map(patternOf))) {
    const has = await api.permissions.contains({ origins: [origin] }).catch(() => false);
    if (!has) out.push(origin);
  }
  return out;
}

function askPermission(lack) {
  $('#permSites').textContent = lack.map(o => o.split('/')[2]).join('、');
  $('#perm').hidden = false;
  // 浏览器要求必须在点击里直接请求，前面不能有 await。不允许也照样试着打开：有些网站本来就不限制
  const ask = origins => api.permissions.request({ origins }).catch(() => false).then(() => {
    $('#perm').hidden = true;
    panes.forEach(paintHead);
    start();
  });
  $('#permYes').onclick = () => ask(lack);
  $('#permAll').onclick = () => ask(['<all_urls>']);
  panes.forEach(p => { p.wait.textContent = '等你点上面的「允许」'; });
}

// ---------- 加载 ----------

const whenVisible = () => new Promise(res => {
  if (!document.hidden) { res(); return; }
  document.addEventListener('visibilitychange', function f() {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', f);
    res();
  });
});

// 返回的 Promise 等所有已经发出的规则更新都生效
let ruleWork = Promise.resolve();
function allowHosts(hosts) {
  const fresh = hosts.filter(h => h && !allowed.has(h));
  if (fresh.length) {
    fresh.forEach(h => allowed.add(h));
    ruleWork = ruleWork.then(() => send('paneRule', { hosts: [...allowed] }));
  }
  return ruleWork;
}

// 不在看的并排页先不加载（比如浏览器恢复会话时）。同一网站一个接一个加载，不同网站同时加载，以免被网站限制
async function start() {
  panes.forEach(p => { p.wait.textContent = '等前面的网页加载完…'; });
  await whenVisible();
  await allowHosts(panes.map(p => hostOf(p.url)));
  const groups = new Map();
  for (const p of panes) {
    const h = hostOf(p.url);
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(p);
  }
  await Promise.all([...groups.values()].map(async list => {
    for (const p of list) if (p.el.isConnected) await loadPane(p);
  }));
}

function loadPane(p) {
  return new Promise(res => {
    const timer = setTimeout(res, LOAD_TIMEOUT);
    p.frame.addEventListener('load', () => { clearTimeout(timer); res(); }, { once: true });
    p.wait.hidden = true;
    p.frame.src = p.url;
  });
}

// ---------- 跟踪每一格里的网页 ----------

// 框架里的网页是别的网站的，页面脚本读不到它现在的网址，要靠浏览器的导航事件。parentFrameId 为 0 的才是格子本身，再往里嵌的不算
function listenNavigation() {
  const nav = api.webNavigation;
  if (!nav) return;
  const paneOf = d => {
    if (d.tabId !== myTab || d.parentFrameId !== 0) return null;
    const p = panes.find(x => x.frameId === d.frameId) || panes.find(x => x.frameId == null && sameUrl(x.url, d.url));
    if (p) p.frameId = d.frameId;
    return p;
  };
  nav.onBeforeNavigate.addListener(d => {
    if (paneOf(d) && isWeb(d.url)) allowHosts([hostOf(d.url)]);
  });
  const moved = d => {
    const p = paneOf(d);
    if (p && isWeb(d.url)) setPaneUrl(p, d.url);
  };
  nav.onCommitted.addListener(moved);
  nav.onHistoryStateUpdated.addListener(moved);
  nav.onReferenceFragmentUpdated.addListener(moved);
  // 被「不许嵌入」挡住了：可能是跳转到了还没放行的网站，或者放行得不够快。放行后重试一次
  nav.onErrorOccurred.addListener(async d => {
    const p = paneOf(d);
    if (!p || !isWeb(d.url) || !/BLOCKED_BY_RESPONSE/.test(d.error || '') || p.retried.has(d.url)) return;
    p.retried.add(d.url);
    await allowHosts([hostOf(d.url)]);
    setPaneUrl(p, d.url);
    p.frame.src = d.url;
  });
}

function setPaneUrl(p, url) {
  if (url === p.url) return;
  const newSite = hostOf(url) !== hostOf(p.url);
  p.url = url;
  if (newSite) p.head.querySelector('.fav').replaceWith(favicon({ url, title: '', icon: '' }));
  paintHead(p);
  paintTitle();
  saveToUrl();
}

// ---------- 显示 ----------

const nodeOf = p => nodes[p.node];
function paneTitle(p) {
  const n = nodeOf(p);
  if (n && sameUrl(n.url, p.url)) return n.alias || formatTitle(n.url, n.title);
  try { const u = new URL(p.url); return decodeURI(u.hostname + u.pathname); } catch { return p.url; }
}

function paintHead(p) {
  const t = p.head.querySelector('.t');
  t.textContent = paneTitle(p);
  t.title = p.url;
  checkHost(p);
}

function paintTitle() {
  document.title = '并排：' + panes.map(paneTitle).join(' ＋ ');
  $('#count').textContent = panes.length + ' 个';
}

// 这一格跳到了没允许过的网站：它可能显示不出来，给一个允许的按钮
async function checkHost(p) {
  const chip = p.head.querySelector('.chip-allow');
  if (!$('#perm').hidden || !isWeb(p.url)) { chip.hidden = true; return; }
  const origin = patternOf(p.url);
  chip.hidden = await api.permissions.contains({ origins: [origin] }).catch(() => true);
  chip.textContent = '允许 ' + hostOf(p.url);
  chip.onclick = () => api.permissions.request({ origins: [origin] }).catch(() => false).then(ok => {
    chip.hidden = true;
    if (ok) p.frame.src = p.url;
  });
}

function buildPane(p) {
  const n = nodeOf(p);
  const el = p.el = document.createElement('section');
  el.className = 'pane';
  const head = p.head = document.createElement('div');
  head.className = 'pane-head';
  head.ondblclick = e => { if (!e.target.closest('button')) toggleMax(p); };
  const t = document.createElement('span');
  t.className = 't';
  const chip = document.createElement('button');
  chip.className = 'chip-allow';
  chip.hidden = true;
  const btn = (name, title, run, cls = '') => {
    const b = document.createElement('button');
    b.className = 'ic ' + cls;
    b.innerHTML = ICON[name];
    b.title = title;
    b.onclick = run;
    return b;
  };
  head.append(
    favicon({ url: p.url, title: n?.title || '', icon: n?.icon || '' }), t, chip,
    btn('reload', '刷新这一格', () => { p.frame.src = p.url; }),
    btn('max', '放大这一格 / 还原（也可以双击标题）', () => toggleMax(p)),
    btn('pop', '变回单独的标签', () => { send('paneOut', { node: p.node, url: p.url, pop: true }); dropPane(p); }),
    btn('close', '从这一页拿掉', () => { send('paneOut', { node: p.node }); dropPane(p); }, 'danger'),
  );
  const body = document.createElement('div');
  body.className = 'pane-body';
  const frame = p.frame = document.createElement('iframe');
  frame.setAttribute('sandbox', SANDBOX);
  frame.setAttribute('allow', FEATURES);
  const wait = p.wait = document.createElement('div');
  wait.className = 'wait';
  wait.textContent = '正在准备…';
  body.append(frame, wait);
  el.append(head, body);
  stage.append(el);
}

function toggleMax(p) {
  const on = !p.el.classList.contains('max');
  panes.forEach(x => x.el.classList.remove('max'));
  p.el.classList.toggle('max', on);
  stage.classList.toggle('has-max', on);
}

function dropPane(p) {
  panes.splice(panes.indexOf(p), 1);
  p.el.remove();
  stage.classList.remove('has-max');
  panes.forEach(x => x.el.classList.remove('max'));
  // 只剩一个就没必要并排了，让它变回单独的标签
  if (panes.length <= 1) { undoAll(); return; }
  layoutPanes();
  paintTitle();
  saveToUrl();
}

function undoAll() {
  $('#undo').disabled = true;
  send('paneUndo', { panes: panes.map(({ node, url }) => ({ node, url })) });
}

function saveToUrl() {
  const q = new URLSearchParams();
  for (const p of panes) { q.append('n', p.node); q.append('u', p.url); }
  if (layout !== 'auto') q.set('l', layout);
  history.replaceState(null, '', '?' + q);
}

// ---------- 排列 ----------

function setLayout(l) {
  layout = l;
  layoutPanes();
  saveToUrl();
}

function tracks() {
  const n = panes.length;
  const use = layout === 'auto' ? (n <= 3 ? 'cols' : 'grid') : layout;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.l === use));
  if (use === 'cols') return [n, 1];
  if (use === 'rows') return [1, n];
  const c = Math.ceil(Math.sqrt(n));
  return [c, Math.ceil(n / c)];
}

function layoutPanes() {
  const [c, r] = tracks();
  cols = Array(c).fill(1);
  rowsFr = Array(r).fill(1);
  applyTracks();
  // 最后一行不满时，最后一格占满剩下的位置。这里只改 CSS，不动元素的位置，网页不会重新加载
  panes.forEach((p, i) => {
    p.el.style.gridColumn = i === panes.length - 1 && c * r > panes.length ? `span ${c * r - panes.length + 1}` : '';
  });
  placeGutters();
}

function applyTracks() {
  stage.style.gridTemplateColumns = cols.map(x => `minmax(0, ${x}fr)`).join(' ');
  stage.style.gridTemplateRows = rowsFr.map(x => `minmax(0, ${x}fr)`).join(' ');
}

function trackPixels(prop) {
  return getComputedStyle(stage)[prop].split(' ').map(parseFloat);
}

function placeGutters() {
  stage.querySelectorAll('.gutter').forEach(g => g.remove());
  const [gap, pad] = [6, 6];
  const xs = trackPixels('gridTemplateColumns');
  const ys = trackPixels('gridTemplateRows');
  // 最后一格横跨几列时，它里面的竖缝只画到上一行为止，不盖住网页
  const lastRowStart = xs.length * (ys.length - 1);
  const spanFrom = xs.length * ys.length > panes.length ? panes.length - lastRowStart - 1 : Infinity;
  const add = (dir, list, i) => {
    const g = document.createElement('div');
    g.className = 'gutter ' + dir;
    const at = pad + list.slice(0, i + 1).reduce((a, b) => a + b, 0) + gap * i - 2;
    if (dir === 'v') {
      g.style.left = at + 'px';
      g.style.top = pad + 'px';
      g.style.bottom = (i >= spanFrom ? pad + ys[ys.length - 1] + gap : pad) + 'px';
    } else {
      g.style.top = at + 'px';
      g.style.left = pad + 'px';
      g.style.right = pad + 'px';
    }
    g.onpointerdown = e => dragGutter(e, g, dir, i);
    stage.append(g);
  };
  xs.slice(0, -1).forEach((_, i) => add('v', xs, i));
  ys.slice(0, -1).forEach((_, i) => add('h', ys, i));
}

function dragGutter(e, g, dir, i) {
  e.preventDefault();
  const isV = dir === 'v';
  const list = trackPixels(isV ? 'gridTemplateColumns' : 'gridTemplateRows');
  const start = isV ? e.clientX : e.clientY;
  const [a, b] = [list[i], list[i + 1]];
  g.setPointerCapture(e.pointerId);
  g.classList.add('on');
  document.body.classList.add('dragging');
  g.onpointermove = m => {
    const d = Math.max(MIN_PANE - a, Math.min(b - MIN_PANE, (isV ? m.clientX : m.clientY) - start));
    const next = [...list];
    next[i] = a + d;
    next[i + 1] = b - d;
    if (isV) cols = next; else rowsFr = next;
    applyTracks();
    const pos = (isV ? 'left' : 'top');
    g.style[pos] = 6 + next.slice(0, i + 1).reduce((x, y) => x + y, 0) + 6 * i - 2 + 'px';
  };
  g.onpointerup = g.onpointercancel = () => {
    g.onpointermove = g.onpointerup = g.onpointercancel = null;
    document.body.classList.remove('dragging');
    placeGutters();
  };
}
