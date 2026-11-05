// 预览用的假插件接口：一份读文献场景的示例数据，侧边栏发来的操作在这里简单模拟
(() => {
  const now = Date.now();
  const M = 60e3, H = 3600e3, D = 864e5;
  let seq = 0;
  let tabSeq = 100;
  const nodes = {};
  const ws = {
    w1: { id: 'w1', name: '读论文 · 注意力机制', named: true, win: 1, created: now - 3 * D, stashed: 0 },
    w2: { id: 'w2', name: '工作', named: true, win: 2, created: now - 5 * D, stashed: 0 },
    w3: { id: 'w3', name: '装修参考', named: true, win: null, created: now - 20 * D, stashed: now - 4 * D },
  };

  function add(w, parent, title, url, o = {}) {
    const id = 'n' + ++seq;
    const st = o.st || 'open';
    nodes[id] = {
      id, url, title, icon: '', parent: parent || null, ws: w,
      tab: st === 'open' ? ++tabSeq : null, st,
      created: now - (o.ago ?? 3 * H) + seq * 1000,
      seen: o.seen ? now - o.seen : 0,
      last: o.seen ? now - o.seen : 0,
      dwell: o.dwell || 0,
      closed: st === 'open' ? 0 : now - (o.closedAgo || H),
      ...(o.extra || {}),
    };
    return id;
  }

  const A = add('w1', null, '[1706.03762] Attention Is All You Need', 'https://arxiv.org/abs/1706.03762', { seen: 2 * H, dwell: 25 * M, ago: 3 * H });
  const B = add('w1', A, 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', 'https://arxiv.org/abs/1810.04805', { seen: 40 * M, dwell: 18 * M, extra: { star: true, note: '预训练 + 微调的范式，第 3.1 节的掩码方法要引用' } });
  add('w1', B, 'Deep contextualized word representations (ELMo)', 'https://arxiv.org/abs/1802.05365', { st: 'closed', seen: 30 * M, dwell: 6 * M, closedAgo: 25 * M });
  const F = add('w1', B, 'Improving Language Understanding by Generative Pre-Training', 'https://openai.com/research/language-unsupervised', {
    dwell: 2 * M,
    extra: { hist: [
      { url: 'https://scholar.google.com/scholar?q=gpt+2018', title: 'gpt 2018 - Google 学术搜索', at: now - 12 * M },
      { url: 'https://jalammar.github.io/illustrated-gpt2/', title: 'The Illustrated GPT-2 – Jay Alammar', at: now - 7 * M },
    ] },
  });
  add('w1', B, 'Semi-supervised Sequence Learning', 'https://arxiv.org/abs/1511.01432');
  add('w1', A, '1706.03762v7.pdf', 'https://arxiv.org/pdf/1706.03762v7', { seen: 90 * M, dwell: 31 * M });
  const NMT = 'https://arxiv.org/abs/1409.0473';
  add('w1', A, 'Neural Machine Translation by Jointly Learning to Align and Translate', NMT);
  add('w1', A, 'Convolutional Sequence to Sequence Learning', 'https://arxiv.org/abs/1705.03122');
  const H1 = add('w1', A, 'Layer Normalization', 'https://arxiv.org/abs/1607.06450', { st: 'stashed', seen: 1 * D, dwell: 9 * M, closedAgo: 20 * H, extra: { stashedAt: now - 20 * H, fold: true } });
  add('w1', H1, 'Batch Normalization: Accelerating Deep Network Training', 'https://arxiv.org/abs/1502.03167', { st: 'stashed', closedAgo: 20 * H });
  add('w1', H1, 'Group Normalization', 'https://arxiv.org/abs/1803.08494', { st: 'stashed', closedAgo: 20 * H });
  const K = add('w1', null, '如何理解 Transformer 中的 Q、K、V？ - 知乎', 'https://www.zhihu.com/question/298810062', { seen: 1 * D, dwell: 4 * M, ago: 26 * H, extra: { sleep: true } });
  add('w1', K, 'The Illustrated Transformer – Jay Alammar', 'https://jalammar.github.io/illustrated-transformer/', { seen: 23 * H, dwell: 14 * M, extra: { sleep: true, star: true } });
  const S = add('w1', null, 'self-attention survey - Google 学术搜索', 'https://scholar.google.com/scholar?q=self-attention+survey', { seen: 50 * M, ago: 55 * M, extra: { fold: true } });
  add('w1', S, 'A Survey of Transformers', 'https://arxiv.org/abs/2106.04554');
  add('w1', S, 'Efficient Transformers: A Survey', 'https://arxiv.org/abs/2009.06732');
  add('w1', null, '[1409.0473] Neural Machine Translation by Jointly Learning to Align and Translate', NMT, { seen: 20 * M, ago: 25 * M });

  add('w2', null, '周报 - 飞书云文档', 'https://feishu.cn/docx/abc', { seen: 3 * H });
  add('w2', null, 'Issues · team/project', 'https://github.com/team/project/issues', { seen: 1 * H });
  add('w2', null, 'A Survey of Transformers', 'https://arxiv.org/abs/2106.04554', { st: 'closed', seen: 2 * D });
  add('w3', null, '小户型收纳设计 - 小红书', 'https://www.xiaohongshu.com/explore/1', { st: 'stashed', seen: 5 * D });
  add('w3', null, '岩板餐桌怎么选', 'https://www.zhihu.com/question/2', { st: 'stashed' });

  // 一个已保存的「刷题」工作区
  ws.w4 = { id: 'w4', name: '刷题 · 华为面试', named: true, win: null, created: now - 2 * D, stashed: now - 14 * H };
  const P = add('w4', null, '华为面试手撕高频题与备考规划 | Zero2Leetcode', 'https://zero2leetcode.com/huawei', { st: 'stashed', seen: 1 * D });
  const S1 = add('w4', P, '栈 - 基础题', 'https://zero2leetcode.com/stack', { st: 'stashed', seen: 1 * D });
  add('w4', S1, '有效的括号字符串 - problem_ide', 'https://zero2leetcode.com/p/20', { st: 'stashed', seen: 1 * D });
  add('w4', S1, '字符串解码问题 - problem_ide', 'https://zero2leetcode.com/p/394', { st: 'stashed' });
  const T2 = add('w4', P, '同向双指针', 'https://zero2leetcode.com/two-pointers', { st: 'stashed', seen: 15 * H });
  add('w4', T2, '最长的无重复字符的子串 - problem_ide', 'https://zero2leetcode.com/p/3', { st: 'stashed', seen: 15 * H });
  add('w4', T2, '最短覆盖子串 - problem_ide', 'https://zero2leetcode.com/p/76', { st: 'stashed' });
  add('w4', null, '字母异位词的分组 - problem_ide', 'https://zero2leetcode.com/p/49', { st: 'stashed', seen: 2 * D });

  // 预览「刚打开的空窗口」：网址里加 ?win=9
  const curWin = Number(new URLSearchParams(location.search).get('win')) || 1;
  if (curWin === 9 && location.pathname.endsWith('panel.html')) {
    ws.w9 = { id: 'w9', name: '工作区 3', win: 9, created: now, stashed: 0 };
    add('w9', null, '新标签页', 'chrome://newtab/', { ago: 0 });
  }

  const state = { v: 1, seq, nodes, ws, act: { 1: { tab: nodes[F].tab, since: now - 4 * M } }, settings: { sleepAfter: 120 } };
  const listeners = [];
  const snapshot = () => JSON.parse(JSON.stringify(state));
  const emit = () => listeners.forEach(f => f({ trail: { newValue: snapshot() } }, 'local'));

  function apply(msg) {
    const n = nodes[msg.id];
    switch (msg.type) {
      case 'fold': msg.ids.forEach(id => { if (nodes[id]) nodes[id].fold = msg.fold; }); break;
      case 'focus': {
        const a = state.act[1];
        const prev = Object.values(nodes).find(x => x.tab === a.tab);
        if (prev) { prev.seen ||= a.since; prev.last = Date.now(); }
        if (n.tab == null) { n.tab = ++tabSeq; n.st = 'open'; }
        state.act[1] = { tab: n.tab, since: Date.now() };
        break;
      }
      case 'close': n.st = 'closed'; n.tab = null; n.closed = Date.now(); break;
      case 'markRead': n.seen = msg.read ? Date.now() : 0; break;
      case 'renameWs': ws[msg.ws].name = msg.name.trim(); break;
      case 'stashBranch': for (const x of Object.values(nodes)) if ((x === n || x.parent === n.id) && x.st === 'open') { x.st = 'stashed'; x.tab = null; } n.stashedAt = Date.now(); n.fold = true; break;
      case 'restoreBranch': for (const x of Object.values(nodes)) if ((x === n || x.parent === n.id) && x.st === 'stashed') { x.st = 'open'; x.tab = ++tabSeq; } delete n.stashedAt; n.fold = false; break;
      case 'forget': delete nodes[msg.id]; break;
      case 'move': {
        const t = msg.target ? nodes[msg.target] : null;
        const key = x => x.order ?? x.created;
        const sibs = p => Object.values(nodes).filter(x => x !== n && x.ws === n.ws && (x.parent || null) === p).sort((a, b) => key(a) - key(b));
        if (msg.pos === 'inside' || msg.pos === 'first') {
          const k = sibs(t.id);
          n.parent = t.id;
          n.order = !k.length ? Date.now() : msg.pos === 'first' ? key(k[0]) - 1 : key(k[k.length - 1]) + 1;
          t.fold = false;
        } else if (msg.pos === 'root') {
          const k = sibs(null);
          n.parent = null;
          n.order = k.length ? key(k[k.length - 1]) + 1 : Date.now();
        } else {
          const p = t.parent || null;
          const k = sibs(p);
          const i = k.indexOf(t);
          const near = msg.pos === 'before' ? k[i - 1] : k[i + 1];
          n.parent = p;
          n.order = near ? (key(t) + key(near)) / 2 : key(t) + (msg.pos === 'before' ? -1 : 1);
        }
        break;
      }
      case 'moveToWs': {
        const list = [n];
        if (msg.branch) for (let i = 0; i < list.length; i++) list.push(...Object.values(nodes).filter(x => x.parent === list[i].id));
        for (const x of list) x.ws = msg.ws === 'new' ? 'w2' : msg.ws;
        break;
      }
      case 'saveAsGroup': {
        const id = 'w' + ++seq;
        ws[id] = { id, name: msg.name || '新的一组', named: true, win: null, created: Date.now(), stashed: Date.now() };
        const list = [n];
        for (let i = 0; i < list.length; i++) list.push(...Object.values(nodes).filter(x => x.parent === list[i].id));
        for (const x of list) { x.ws = id; if (x.st === 'open') { x.st = 'stashed'; x.tab = null; } }
        emit();
        return id;
      }
      case 'restoreWs': {
        const w = ws[msg.ws];
        if (msg.into) { for (const x of Object.values(nodes)) if (ws[x.ws]?.win === msg.into) delete nodes[x.id]; for (const k in ws) if (ws[k].win === msg.into) delete ws[k]; }
        w.win = msg.into || 50;
        w.stashed = 0;
        for (const x of Object.values(nodes)) if (x.ws === w.id && x.st === 'stashed') { x.st = 'open'; x.tab = ++tabSeq; }
        break;
      }
      case 'deleteWs': for (const x of Object.values(nodes)) if (x.ws === msg.ws) delete nodes[x.id]; delete ws[msg.ws]; break;
      case 'star': n.star = msg.star; break;
      case 'rename': if (msg.name.trim()) n.alias = msg.name.trim(); else delete n.alias; break;
      case 'note': if (msg.note.trim()) n.note = msg.note.trim(); else delete n.note; break;
      case 'setSettings': Object.assign(state.settings, msg.settings); break;
      case 'sleep': { let c = 0; for (const id of msg.ids) if (nodes[id].tab && !nodes[id].sleep) { nodes[id].sleep = true; c++; } emit(); return c; }
      case 'closeIds': for (const id of msg.ids) { nodes[id].st = 'closed'; nodes[id].tab = null; nodes[id].closed = Date.now(); } break;
      case 'openUrl': add(nodes[msg.parent].ws, msg.parent, msg.url.split('/').pop(), msg.url, { ago: 0 }); break;
    }
    emit();
  }

  window.browser = {
    storage: {
      local: { get: async () => ({ trail: snapshot() }) },
      onChanged: { addListener: f => listeners.push(f) },
    },
    runtime: {
      sendMessage: async msg => { console.log('[预览] 操作', msg); return { ok: true, r: apply(msg) }; },
      getURL: p => p,
    },
    windows: { getCurrent: async () => ({ id: curWin }) },
  };
})();
