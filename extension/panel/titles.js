// 标签脉络 · 网页标题整理
// 去掉「- 知乎」「_哔哩哔哩_bilibili」这类网站名前后缀，识别 PDF，统一网址写法用来判断重复。
// 都是纯函数：侧边栏用它显示，test/titles.test.mjs 用它做测试。

(function (root) {
  // 常见网站名（小写、去掉空格后比较）。网址里的域名也会自动当作网站名，这里主要补中文名和不同写法
  const SITES = new Set([
    '知乎', '知乎专栏', 'zhihu', '哔哩哔哩', 'bilibili', '哔哩哔哩(゜-゜)つロ干杯~-bilibili', 'youtube', 'github', 'gitee',
    'stackoverflow', 'csdn博客', 'csdn', '博客园', 'cnblogs', '简书', '掘金', '稀土掘金', '微信公众平台',
    '百度百科', '百度知道', '百度文库', '百度', '百度一下，你就知道', '百度搜索', '维基百科，自由的百科全书', '维基百科',
    'wikipedia', 'google搜索', 'googlesearch', 'google学术搜索', 'googlescholar', '必应', '必应搜索', 'bing',
    '小红书', '豆瓣', '豆瓣电影', '豆瓣读书', '微博', '新浪微博', '腾讯视频', '优酷', '爱奇艺', '网易云音乐',
    '淘宝网', '淘宝', '天猫', '京东', '京东商城', 'sciencedirect', 'springerlink', 'ieeexplore', 'acmdigitallibrary',
    'arxiv.org', 'arxiv', 'semanticscholar', 'researchgate', 'medium', 'reddit', 'notion', '飞书文档', '飞书云文档',
    '语雀', '腾讯文档', 'mdnwebdocs', 'mdn', 'npm', 'pypi', 'huggingface', '中国知网', '知网', 'cnki', '万方数据',
    '少数派', '36氪', '虎嗅网', '澎湃新闻', '新浪网', '网易', '搜狐', '凤凰网', 'microsoftlearn', 'wileyonlinelibrary',
    'taylor&francisonline', 'pubmed', 'pmc', 'openreview', 'paperswithcode', 'leetcode', '力扣', 'v2ex',
  ]);
  // 不带空格的「-」「_」也常见（「标题-CSDN博客」「标题_哔哩哔哩」），但只在后面确实是网站名时才去掉
  const SEPS = [' - ', ' – ', ' — ', ' | ', ' · ', ' » ', ' :: ', ' ｜ ', '｜', '_', '-'];
  const GENERIC_TLD = /^(com|net|org|edu|gov|co|ac|cn|uk|jp|io|de|fr|info|me|tv|cc|xyz|top|ai|app|dev|hk|tw)$/;

  // 域名里最能代表网站的那一段：zhuanlan.zhihu.com → zhihu，blog.csdn.net → csdn
  function hostLabel(url) {
    try {
      const parts = new URL(url).hostname.toLowerCase().split('.').filter(Boolean);
      while (parts.length > 1 && GENERIC_TLD.test(parts[parts.length - 1])) parts.pop();
      return parts.pop() || '';
    } catch {
      return '';
    }
  }

  function isSite(seg, label) {
    const s = seg.trim().toLowerCase().replace(/\s+/g, '');
    if (!s || s.length > 30) return false;
    if (SITES.has(s)) return true;
    return label.length >= 3 && s.includes(label);
  }

  function split(t, last) {
    let at = last ? -1 : Infinity;
    let sep = '';
    for (const s of SEPS) {
      const i = last ? t.lastIndexOf(s) : t.indexOf(s);
      if (i > 0 && (last ? i > at : i < at)) { at = i; sep = s; }
    }
    if (sep === '') return null;
    return [t.slice(0, at), t.slice(at + sep.length), sep];
  }

  function cleanTitle(title, url) {
    if (!title) return '';
    let t = title.trim();
    const label = hostLabel(url);
    t = t.replace(/^[(（]\s*\d[^)）]{0,20}[)）]\s*/, '');         // 开头的未读数：「(3) 」「（2 封私信 / 8 条消息）」
    t = t.replace(/^\[\d{4}\.\d{4,5}(v\d+)?\]\s*/, '');            // arXiv 编号：「[1706.03762] 」
    for (let i = 0; i < 3; i++) {                                    // 结尾的网站名，可能有好几段
      const p = split(t, true);
      if (!p || p[0].trim().length < 2 || !isSite(p[1], label)) break;
      t = p[0].trim();
    }
    const p = split(t, false);                                       // 开头的网站名：「GitHub - owner/repo」，只认带空格的分隔符
    if (p && p[2].length > 1 && p[1].trim().length >= 2 && isSite(p[0], label)) t = p[1].trim();
    return t || title.trim();
  }

  function isPdf(url, title) {
    try {
      const u = new URL(url);
      if (/\.pdf$/i.test(u.pathname)) return true;
      if (/(^|\.)arxiv\.org$/.test(u.hostname) && u.pathname.startsWith('/pdf/')) return true;
    } catch {}
    return /\.pdf$/i.test(title || '');
  }

  // PDF 没有像样的标题时，用文件名
  function pdfName(url, title) {
    let name = title && /\.pdf$/i.test(title) ? title : '';
    if (!name) {
      try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch {}
    }
    return name.replace(/\.pdf$/i, '') || url;
  }

  function arxivId(url) {
    const m = /arxiv\.org\/(?:abs|pdf|html)\/(.+?)(?:v\d+)?(?:\.pdf)?\/?(?:[?#].*)?$/i.exec(url || '');
    return m ? m[1] : null;
  }

  // 判断「是不是同一个网页」用的写法：去掉 #锚点、utm 跟踪参数和末尾的 /
  function urlKey(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
      if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
      return u.href;
    } catch {
      return url || '';
    }
  }

  root.TitleKit = { cleanTitle, isPdf, pdfName, arxivId, urlKey, hostLabel };
})(globalThis);
