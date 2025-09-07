// Minimal WebRTC wrapper for a single peer connection.

let pc = null;
let dc = null;
let role = null; // 'host' | 'client'
let listeners = new Set();
let seq = 1;

const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];

export async function createPeer(opts) {
  role = opts.role;
  pc = new RTCPeerConnection({ iceServers });
  setupPC();
  if (role === 'host') {
    dc = pc.createDataChannel('temperature', { ordered: true });
    setupDC(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = await waitForGathering();
    return { type: 'offer', sdp };
  } else {
    // client: remote offer should be set before calling
    if (!opts.remote) throw new Error('client requires remote offer');
    await pc.setRemoteDescription(opts.remote);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const sdp = await waitForGathering();
    return { type: 'answer', sdp };
  }
}

export async function setRemote(desc) {
  if (!pc) throw new Error('pc not ready');
  await pc.setRemoteDescription(desc);
}

export function onMessage(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function send(type, payload) {
  if (!dc || dc.readyState !== 'open') throw new Error('channel not open');
  const msg = { t: type, p: payload, seq: seq++ };
  dc.send(JSON.stringify(msg));
}

export function close() {
  if (dc) { try { dc.close(); } catch {} dc = null; }
  if (pc) { try { pc.close(); } catch {} pc = null; }
  listeners.clear();
  role = null; seq = 1;
}

export function getRole() { return role; }

function setupPC() {
  pc.ondatachannel = (ev) => {
    dc = ev.channel; setupDC(dc);
  };
}

function setupDC(ch) {
  ch.onopen = () => {
    // no-op
  };
  ch.onmessage = (ev) => {
    try {
      const obj = JSON.parse(ev.data);
      listeners.forEach((cb) => cb(obj));
    } catch (e) { console.warn('bad message', e); }
  };
  ch.onclose = () => {};
}

function waitForGathering() {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve(pc.localDescription.sdp);
    } else {
      function check() {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve(pc.localDescription.sdp);
        }
      }
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(check, 1200);
    }
  });
}

