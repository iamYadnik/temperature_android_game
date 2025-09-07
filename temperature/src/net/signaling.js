// Signaling helpers: encode/decode SDP offers/answers to compact base64url strings.

function b64urlEncode(bytes) {
  let str = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  const b64 = btoa(str).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  return b64;
}
function b64urlDecode(str) {
  const b64 = str.replace(/-/g,'+').replace(/_/g,'/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encode(obj) {
  const json = JSON.stringify(obj);
  // Try compression if available (CompressionStream)
  try {
    if ('CompressionStream' in window) {
      const cs = new CompressionStream('gzip');
      const compressed = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
      return 'g' + b64urlEncode(new Uint8Array(compressed));
    }
  } catch {}
  return 'p' + b64urlEncode(json);
}

export async function decode(str) {
  const kind = str[0];
  const payload = str.slice(1);
  if (kind === 'g') {
    try {
      if ('DecompressionStream' in window) {
        const ds = new DecompressionStream('gzip');
        const bytes = b64urlDecode(payload);
        const decompressed = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
        return JSON.parse(decompressed);
      }
    } catch {}
    // fallthrough to try plain
  }
  if (kind === 'p') {
    const bytes = b64urlDecode(payload);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }
  throw new Error('Unknown signaling payload');
}

export function copyToClipboard(text) {
  return navigator.clipboard?.writeText(text);
}

