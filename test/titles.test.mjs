// 标题整理的测试：node test/titles.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../extension/panel/titles.js');
const ctx = { URL };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
const { cleanTitle, isPdf, pdfName, arxivId, urlKey } = ctx.TitleKit;

const cases = [
  // [原标题, 网址, 期望]
  ['如何理解 Transformer 中的 Q、K、V？ - 知乎', 'https://www.zhihu.com/question/1', '如何理解 Transformer 中的 Q、K、V？'],
  ['(2 封私信 / 80 条消息) 如何评价 GPT-5？ - 知乎', 'https://www.zhihu.com/question/2', '如何评价 GPT-5？'],
  ['【官方MV】晴天_哔哩哔哩_bilibili', 'https://www.bilibili.com/video/BV1', '【官方MV】晴天'],
  ['Lofi beats to study to - YouTube', 'https://www.youtube.com/watch?v=1', 'Lofi beats to study to'],
  ['(3) Lofi beats - YouTube', 'https://www.youtube.com/watch?v=1', 'Lofi beats'],
  ['GitHub - openai/gpt-2: Code for the paper', 'https://github.com/openai/gpt-2', 'openai/gpt-2: Code for the paper'],
  ['Issues · team/project', 'https://github.com/team/project/issues', 'Issues · team/project'],
  ['Python 安装教程-CSDN博客', 'https://blog.csdn.net/u/article/1', 'Python 安装教程'],
  ['[1706.03762] Attention Is All You Need', 'https://arxiv.org/abs/1706.03762', 'Attention Is All You Need'],
  ['os — Miscellaneous operating system interfaces — Python 3.12 documentation', 'https://docs.python.org/3/library/os.html', 'os — Miscellaneous operating system interfaces'],
  ['Transformer (deep learning) - Wikipedia', 'https://en.wikipedia.org/wiki/Transformer', 'Transformer (deep learning)'],
  ['GPT-4 Technical Report', 'https://arxiv.org/abs/2303.08774', 'GPT-4 Technical Report'],
  ['Self-Attention - 自注意力机制详解', 'https://example.com/a', 'Self-Attention - 自注意力机制详解'],
  ['周报 - 飞书云文档', 'https://abc.feishu.cn/docx/1', '周报'],
  ['YouTube', 'https://www.youtube.com/', 'YouTube'],
  ['Deep Learning - ScienceDirect', 'https://www.sciencedirect.com/x', 'Deep Learning'],
];

let failed = 0;
for (const [title, url, want] of cases) {
  const got = cleanTitle(title, url);
  if (got === want) console.log('  ✓', title, '→', got);
  else { failed++; console.log('  ✗', title, '\n      得到:', got, '\n      期望:', want); }
}

try {
  assert.equal(isPdf('https://arxiv.org/pdf/1706.03762v7', ''), true);
  assert.equal(isPdf('https://example.com/files/paper.PDF?x=1', ''), true);
  assert.equal(isPdf('https://example.com/view', 'report.pdf'), true);
  assert.equal(isPdf('https://example.com/a.html', 'A'), false);
  assert.equal(pdfName('https://example.com/files/My%20Paper.pdf', ''), 'My Paper');
  assert.equal(pdfName('https://x.com/view', '1706.03762v7.pdf'), '1706.03762v7');
  assert.equal(arxivId('https://arxiv.org/abs/1706.03762v7'), '1706.03762');
  assert.equal(arxivId('https://arxiv.org/pdf/1706.03762v7.pdf'), '1706.03762');
  assert.equal(arxivId('https://arxiv.org/pdf/1706.03762'), '1706.03762');
  assert.equal(arxivId('https://example.com/abs/1'), null);
  assert.equal(urlKey('https://a.com/x/?utm_source=t&id=2#sec'), 'https://a.com/x?id=2');
  assert.equal(urlKey('https://a.com/x/'), urlKey('https://a.com/x#top'));
  console.log('  ✓ PDF 识别、arXiv 编号、网址归一');
} catch (e) {
  failed++;
  console.log('  ✗ PDF / 网址:', e.message);
}

console.log(failed ? `\n${failed} 个失败` : '\n全部通过');
process.exitCode = failed ? 1 : 0;
