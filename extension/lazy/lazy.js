// 标签脉络 · 「点开才加载」的占位页
// 一次打开很多标签时，除了要看的那一个，其他标签先打开这个很轻的页面：标签栏里照样显示原来的标题和图标，
// 等这个标签被选中时，才换成真正的网页。地址用 replace，后退不会回到这里。

const api = globalThis.browser ?? globalThis.chrome;
const params = new URLSearchParams(location.search);
const url = params.get('u') || '';
const title = params.get('t') || url;

// 只放行普通网页，防止 javascript: 之类的地址在插件页面里执行
const safe = /^https?:\/\//i.test(url);

document.title = title;
document.getElementById('t').textContent = title;
document.getElementById('u').textContent = url;
const fav = document.getElementById('fav');
fav.onerror = () => fav.remove();
if (safe && api?.runtime?.getURL) {
  const icon = api.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(url) + '&size=32';
  document.getElementById('icon').href = icon;
  fav.src = icon;
} else {
  fav.remove();
}

let gone = false;
function go() {
  if (!safe || gone) return;
  gone = true;
  location.replace(url);
}
document.getElementById('go').onclick = go;

// 用「这个标签是不是被选中」来判断，比「页面是否可见」可靠（浏览器刚恢复会话时，选中的那个标签也能马上加载）
if (api?.tabs?.getCurrent) {
  api.tabs.getCurrent().then(me => {
    if (!me) return;
    if (me.active) { go(); return; }
    api.tabs.onActivated.addListener(({ tabId }) => { if (tabId === me.id) go(); });
  }).catch(() => {});
}
