#!/usr/bin/env node
// Simple static server (no deps), generates placeholder icons on first run.
const http = require('http');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'temperature');
const port = process.env.PORT || 8080;

function ensureIcons() {
  const iconsDir = path.join(dir, 'icons');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  const haveAll = ['icon-192.png','icon-512.png','maskable-512.png'].every(f => fs.existsSync(path.join(iconsDir, f)));
  if (haveAll) return;
  // create solid color PNGs
  writePng(path.join(iconsDir, 'icon-192.png'), 192, 192, [34, 197, 94, 255]); // green
  writePng(path.join(iconsDir, 'icon-512.png'), 512, 512, [34, 197, 94, 255]);
  writePng(path.join(iconsDir, 'maskable-512.png'), 512, 512, [34, 211, 238, 255]); // cyan
}

function writePng(file, w, h, rgba=[0,0,0,255]) {
  // Minimal PNG encoder (solid color)
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const name = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([name,data]));
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc>>>0);
    return Buffer.concat([len, name, data, crcBuf]);
  }
  function be32(n) { const b=Buffer.alloc(4); b.writeUInt32BE(n); return b; }
  function crc32(buf){
    // small CRC32 (poly 0xEDB88320)
    let c = ~0; for (let i=0;i<buf.length;i++){ c ^= buf[i]; for (let k=0;k<8;k++){ c = (c & 1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); } } return ~c >>> 0;
  }
  const ihdr = Buffer.concat([
    be32(w), be32(h), Buffer.from([8, 6, 0, 0, 0]) // 8-bit RGBA
  ]);
  const row = Buffer.alloc(w*4); for (let i=0;i<w;i++){ row[i*4+0]=rgba[0]; row[i*4+1]=rgba[1]; row[i*4+2]=rgba[2]; row[i*4+3]=rgba[3]; }
  const raw = [];
  for (let y=0;y<h;y++){ raw.push(Buffer.from([0])); raw.push(row); } // filter 0 per row
  const compressed = zlib.deflateSync(Buffer.concat(raw));
  const out = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, out);
}

ensureIcons();

const MOUNT = '/temperature';
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  // Support mounting at /temperature/
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  else if (urlPath === MOUNT || urlPath === MOUNT + '/') urlPath = '/index.html';
  else if (urlPath.startsWith(MOUNT + '/')) urlPath = urlPath.slice(MOUNT.length);
  // Normalize and prevent path traversal
  const safeRel = path.posix.normalize(urlPath).replace(/^\/+/, '').replace(/^\.\.(?:\/.+)?$/, '');
  const filePath = path.join(dir, safeRel);
  if (!filePath.startsWith(dir)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.setHeader('content-type', contentType(filePath));
    // Avoid caching during development
    if (/\.(?:js|css|webmanifest)$/.test(filePath)) {
      res.setHeader('cache-control', 'no-cache');
    }
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Serving at http://localhost:${port}${MOUNT}/ (scope: ${dir})`);
});

function contentType(fp) {
  if (fp.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fp.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fp.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (fp.endsWith('.webmanifest') || fp.endsWith('.json')) return 'application/manifest+json; charset=utf-8';
  if (fp.endsWith('.png')) return 'image/png';
  if (fp.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
  return 'application/octet-stream';
}
