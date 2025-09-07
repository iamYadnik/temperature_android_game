#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, '..', 'temperature', 'icons');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function be32(n){ const b=Buffer.alloc(4); b.writeUInt32BE(n); return b; }
function crc32(buf){ let c=~0; for (let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++){ c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);} } return ~c>>>0; }
function chunk(type, data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const name=Buffer.from(type,'ascii'); const crc=crc32(Buffer.concat([name,data])); const crcBuf=Buffer.alloc(4); crcBuf.writeUInt32BE(crc>>>0); return Buffer.concat([len,name,data,crcBuf]); }
function writePng(file, w, h, rgba){ const sig=Buffer.from([137,80,78,71,13,10,26,10]); const ihdr=Buffer.concat([be32(w),be32(h),Buffer.from([8,6,0,0,0])]); const row=Buffer.alloc(w*4); for(let i=0;i<w;i++){ row[i*4]=rgba[0]; row[i*4+1]=rgba[1]; row[i*4+2]=rgba[2]; row[i*4+3]=rgba[3]; } const raw=[]; for(let y=0;y<h;y++){ raw.push(Buffer.from([0])); raw.push(row);} const compressed=zlib.deflateSync(Buffer.concat(raw)); const out=Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))]); fs.writeFileSync(file,out); }

writePng(path.join(dir,'icon-192.png'),192,192,[34,197,94,255]);
writePng(path.join(dir,'icon-512.png'),512,512,[34,197,94,255]);
writePng(path.join(dir,'maskable-512.png'),512,512,[34,211,238,255]);
console.log('Generated placeholder icons in', dir);

