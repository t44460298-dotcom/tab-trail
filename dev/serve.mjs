// 侧边栏预览服务器：在普通网页里打开 panel.html，并注入假的插件接口和示例数据
// 用法：node dev/serve.mjs，然后打开 http://localhost:5178/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/') {
    res.writeHead(302, { location: '/extension/panel/panel.html' });
    res.end();
    return;
  }
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  let body = fs.readFileSync(file);
  // 插件里的页面：在第一个脚本之前注入假的插件接口
  if (p.startsWith('/extension/') && p.endsWith('.html')) {
    body = body.toString().replace('<script ', '<script src="/dev/mock-api.js"></script>\n  <script ');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}).listen(5178, () => console.log('preview: http://localhost:5178/'));
