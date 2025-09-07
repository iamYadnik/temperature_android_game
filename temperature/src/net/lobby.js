// Minimal lobby state and protocol glue
import * as rtc from './rtc.js';
import { encode, decode } from './signaling.js';

const state = {
  role: null,
  roomId: null,
  seed: null,
  players: [], // {id,name,isHost}
  scores: []   // { round, row:[...] }
};

let onUpdate = () => {};
let onStartGame = null; // callback to app to init network game

function uid() { return Math.random().toString(36).slice(2); }

export function subscribe(cb) { onUpdate = cb; cb(get()); return () => { onUpdate = () => {}; }; }
export function setStartHandler(cb) { onStartGame = cb; }
export function get() { return JSON.parse(JSON.stringify(state)); }

function pushUpdate() { onUpdate(get()); }

export async function createRoom({ name }) {
  state.role = 'host';
  state.roomId = String(Math.floor(100000 + Math.random()*900000));
  state.seed = String(Math.floor(Math.random()*1e9));
  state.players = [{ id: 'host', name: name || 'Host', isHost: true }];
  const offer = await rtc.createPeer({ role: 'host' });
  const blob = await encode({ sdp: offer.sdp, type: offer.type, roomId: state.roomId, seed: state.seed });
  pushUpdate();
  rtc.onMessage(handleMsgHost);
  return blob;
}

export async function acceptAnswerBlob(answerBlob) {
  const obj = await decode(answerBlob);
  if (obj.type !== 'answer' || !obj.sdp) throw new Error('Invalid answer');
  await rtc.setRemote({ type: 'answer', sdp: obj.sdp });
  return true;
}

export async function joinRoom({ name, offerBlob }) {
  const obj = await decode(offerBlob);
  if (obj.type !== 'offer' || !obj.sdp) throw new Error('Invalid offer');
  state.role = 'client';
  state.roomId = obj.roomId || '000000';
  state.seed = obj.seed || '0';
  const answer = await rtc.createPeer({ role: 'client', remote: { type: 'offer', sdp: obj.sdp } });
  rtc.onMessage(handleMsgClient);
  // Send JOIN when channel opens (poll until open)
  setTimeout(() => {
    try { rtc.send('JOIN', { name: name || 'Player', roomId: state.roomId }); } catch {}
  }, 200);
  const ansBlob = await encode({ type: 'answer', sdp: answer.sdp });
  pushUpdate();
  return ansBlob;
}

export function exitRoom() {
  try { rtc.send('LEAVE', {}); } catch {}
  rtc.close();
  state.role = null; state.roomId = null; state.players = []; state.scores = []; state.seed = null;
  pushUpdate();
}

export function startGame(options) {
  if (state.role !== 'host') return;
  if (!onStartGame) return;
  const players = state.players.map(p => ({ id: p.id, name: p.name }));
  onStartGame({ seed: state.seed, options, players });
  // Broadcast INIT
  rtc.send('INIT', { seed: state.seed, options, players });
}

// Host side handler
function handleMsgHost(msg) {
  const { t, p } = msg || {};
  if (t === 'JOIN') {
    const id = uid();
    state.players.push({ id, name: p?.name || 'Player', isHost: false });
    pushUpdate();
    rtc.send('ROOM_PLAYERS', { list: state.players });
  } else if (t === 'LEAVE') {
    // single-peer minimal; reset
    exitRoom();
  } else if (t === 'INTENT') {
    // Forward to app via custom event
    window.dispatchEvent(new CustomEvent('net-intent', { detail: { from: 'client', intent: p } }));
  }
}

// Client side handler
function handleMsgClient(msg) {
  const { t, p } = msg || {};
  if (t === 'ROOM_PLAYERS') {
    state.players = p.list || state.players;
    pushUpdate();
  } else if (t === 'INIT') {
    // Signal app to init network game locally
    window.dispatchEvent(new CustomEvent('net-init', { detail: p }));
  } else if (t === 'STATE') {
    window.dispatchEvent(new CustomEvent('net-state', { detail: p }));
  } else if (t === 'ROOM_CLOSE') {
    exitRoom();
  }
}

export function sendToPeers(type, payload) {
  try { rtc.send(type, payload); } catch (e) { /* ignore */ }
}

