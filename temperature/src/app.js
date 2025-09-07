import { buildDeck, handTotal, canMultiDrop, reshuffle, cryptoRandomId } from './rules.js';
import { saveState, loadState } from './storage.js';
import { toast } from './toast.js';
import { cpuTurn } from './cpu.js';

let STATE = null;
let SELECTION = []; // selected card ids for current player
let NET = { enabled: false, role: null, localId: null, send: null };

export function getState() { return STATE; }
export function getSelection() { return SELECTION; }
export function setSelection(arr) { SELECTION = arr; }
export function isHumanTurn() {
  if (!STATE) return false;
  const cur = STATE.players[STATE.current];
  if (!cur) return false;
  if (!NET.enabled) return !!cur.human;
  return cur.id === NET.localId; // only local-controlled player can act
}

export async function restoreOrInit() {
  const saved = await loadState();
  if (saved) {
    STATE = saved;
    scheduleCpuIfNeeded();
  } else {
    // No auto-start; stay on New Game tab
  }
}

export async function tryResume() {
  const saved = await loadState();
  if (saved) { STATE = saved; scheduleCpuIfNeeded(); return true; }
  return false;
}

export async function startNewGame(cfg) {
  const players = [];
  const total = cfg.playerCount;
  for (let i = 0; i < total; i++) {
    const human = i < cfg.humanCount;
    players.push({ id: cryptoRandomId(), name: `Player ${i+1}` + (human?'':' (CPU)'), human, hand: [], score: 0, eliminated: false, pendingShow: false });
  }
  const deck = buildDeck({ useJokers: !!cfg.jokers });
  const discard = [];
  // deal 7 each
  for (let r = 0; r < 7; r++) {
    for (const p of players) p.hand.push(deck.pop());
  }
  // start discard with 1 card
  discard.push(deck.pop());
  STATE = {
    mode: cfg.roomMode ? 'room' : 'one',
    targetScore: cfg.targetScore || 150,
    useJokers: !!cfg.jokers,
    players,
    deck,
    discard,
    current: 0,
    phase: 'turn-start',
    round: 1,
    winner: null,
    lastScores: null,
  };
  SELECTION = [];
  await persist();
  scheduleCpuIfNeeded();
}

// Host-only: start a network game with provided players and seed
export async function hostStartNetworkGame({ seed, players, options }) {
  const cfg = { roomMode: false, targetScore: options?.targetScore || 150, jokers: !!options?.jokers };
  const plist = players.map((p, i) => ({ id: p.id, name: p.name, human: true, hand: [], score: 0, eliminated: false, pendingShow: false }));
  const deck = buildDeck({ useJokers: !!cfg.jokers, seed });
  const discard = [];
  for (let r = 0; r < 7; r++) for (const p of plist) p.hand.push(deck.pop());
  discard.push(deck.pop());
  STATE = { mode: 'one', targetScore: cfg.targetScore, useJokers: !!cfg.jokers, players: plist, deck, discard, current: 0, phase: 'turn-start', round: 1, winner: null, lastScores: null };
  SELECTION = [];
  await persist();
  broadcastState();
}

// Client: attach to incoming INIT
export function clientAttachNetwork({ seed, options, players }) {
  NET.enabled = true; NET.role = 'client';
  const me = players.find(p => p.name && p.name.length && true); // local identification not known; allow input gated via host updates
  NET.localId = null; // clients do not act until server assigns (not implemented)
}

export function attachNet({ role, send }) {
  NET.enabled = true; NET.role = role; NET.send = send || (t,p)=>window.dispatchEvent(new CustomEvent('net-send',{detail:{t,p}}));
}

export function canShowNow() {
  if (!STATE) return false;
  return STATE.phase === 'turn-start';
}

export async function performDropAndDraw(draw) {
  const p = STATE.players[STATE.current];
  if (!isHumanTurn()) {
    if (NET.enabled && NET.role === 'client' && NET.send) {
      const ids = new Set(SELECTION);
      const hand = p.hand.filter(c => ids.has(c.id));
      const label = hand[0]?.label;
      const count = hand.length;
      try { NET.send('INTENT', { kind: 'DROP_DRAW', data: { label, count, from: draw } }); toast('Sent move to host'); } catch {}
    }
    return;
  }
  const selection = p.hand.filter(c => SELECTION.includes(c.id));
  if (!selection.length || !canMultiDrop(selection)) {
    toast('Select cards of the same value to drop');
    return;
  }
  // Drop: move selected to discard (order as clicked -> use hand order)
  for (const c of selection) {
    const idx = p.hand.findIndex(h => h.id === c.id);
    if (idx >= 0) {
      STATE.discard.push(p.hand.splice(idx,1)[0]);
    }
  }
  // Draw
  if (draw === 'discard') {
    if (STATE.discard.length === 0) { toast('Discard empty'); return; }
    p.hand.push(STATE.discard.pop());
  } else {
    if (STATE.deck.length === 0) reshuffle(STATE.deck, STATE.discard);
    if (STATE.deck.length === 0) { toast('No cards to draw'); }
    else p.hand.push(STATE.deck.pop());
  }
  SELECTION = [];
  // Turn ends
  await advanceTurn();
  broadcastState();
}

export async function callShow() {
  if (!canShowNow()) { toast('Show only at start of turn'); return; }
  if (!isHumanTurn()) {
    if (NET.enabled && NET.role === 'client' && NET.send) {
      try { NET.send('INTENT', { kind: 'TRY_SHOW' }); toast('Sent show to host'); } catch {}
    }
    return;
  }
  const callerIdx = STATE.current;
  const totals = STATE.players.map(p => p.eliminated ? Infinity : handTotal(p.hand));
  const callerTotal = totals[callerIdx];
  const min = Math.min(...totals);
  const lows = totals.filter(t => t === min).length;
  const lastScores = [];
  // Apply scoring
  STATE.players.forEach((p, i) => {
    if (p.eliminated) { lastScores[i] = 0; return; }
    if (i === callerIdx) {
      if (callerTotal === min && lows === 1) {
        p.score -= 20; lastScores[i] = -20;
      } else if (callerTotal === min) {
        // tie for lowest
        lastScores[i] = 0;
      } else {
        p.score += 70; lastScores[i] = 70;
      }
    } else {
      p.score += totals[i]; lastScores[i] = totals[i];
    }
  });
  STATE.lastScores = lastScores;

  if (STATE.mode === 'one') {
    STATE.winner = winnerByLowestScore();
    STATE.phase = 'game-over';
    await persist();
    return;
  }
  // Room mode: eliminate players >= target; continue if >1 remain
  for (const p of STATE.players) {
    if (!p.eliminated && p.score >= STATE.targetScore) p.eliminated = true;
  }
  const active = STATE.players.filter(p => !p.eliminated);
  if (active.length <= 1) {
    STATE.winner = active[0]?.name || null; // last remaining wins
    STATE.phase = 'game-over';
    await persist();
    return;
  }
  STATE.phase = 'round-end';
  await persist();
  broadcastState();
}

export async function nextRound() {
  if (STATE.mode !== 'room') return;
  // Redeal only to active players
  const active = STATE.players.filter(p => !p.eliminated);
  for (const p of active) { p.hand = []; p.pendingShow = false; }
  const deck = buildDeck({ useJokers: !!STATE.useJokers });
  const discard = [];
  for (let r = 0; r < 7; r++) {
    for (const p of active) p.hand.push(deck.pop());
  }
  discard.push(deck.pop());
  STATE.deck = deck; STATE.discard = discard; STATE.round += 1; STATE.phase = 'turn-start';
  // Ensure current is an active player
  let ci = STATE.current;
  while (STATE.players[ci].eliminated) ci = (ci + 1) % STATE.players.length;
  STATE.current = ci;
  STATE.lastScores = null; STATE.winner = null;
  SELECTION = [];
  await persist();
  scheduleCpuIfNeeded();
}

async function advanceTurn() {
  // Move to next non-eliminated player
  let i = STATE.current;
  do { i = (i + 1) % STATE.players.length; } while (STATE.players[i].eliminated);
  STATE.current = i; STATE.phase = 'turn-start';
  await persist();
  scheduleCpuIfNeeded();
}

function winnerByLowestScore() {
  let best = { name: null, score: Infinity };
  for (const p of STATE.players) {
    if (p.score < best.score) best = { name: p.name, score: p.score };
  }
  return best.name;
}

async function persist() {
  await saveState(STATE);
  // trigger UI refresh if needed
}

function broadcastState() {
  if (!NET.enabled || NET.role !== 'host' || !NET.send) return;
  try { NET.send('STATE', { snapshot: STATE }); } catch {}
}

// Host: handle client intents (minimal support)
window.__TEMP_handleIntent = async function(intent){
  if (!NET.enabled || NET.role !== 'host') return;
  const p = STATE.players[STATE.current];
  if (!p) return;
  if (intent?.kind === 'DROP_DRAW') {
    const { label, count, from } = intent.data || {};
    // pick first N cards with that label
    const toDrop = [];
    for (const c of p.hand) if (c.label === label && toDrop.length < count) toDrop.push(c);
    if (!toDrop.length || !canMultiDrop(toDrop)) return;
    for (const c of toDrop) {
      const idx = p.hand.findIndex(h => h.id === c.id); if (idx>=0) STATE.discard.push(p.hand.splice(idx,1)[0]);
    }
    if (from === 'discard') {
      if (STATE.discard.length > 0) p.hand.push(STATE.discard.pop());
    } else {
      if (STATE.deck.length === 0) reshuffle(STATE.deck, STATE.discard);
      if (STATE.deck.length > 0) p.hand.push(STATE.deck.pop());
    }
    await advanceTurn();
    broadcastState();
  } else if (intent?.kind === 'TRY_SHOW') {
    if (!canShowNow()) return;
    await callShow();
    broadcastState();
  }
};

// Allow replacing state on clients from network
window.__TEMP_setState = function(s){ STATE = s; };

function scheduleCpuIfNeeded() {
  const p = STATE.players[STATE.current];
  if (!p.human && STATE.phase === 'turn-start') {
    setTimeout(async () => {
      // Optional show attempt if pending and allowed
      if (p.pendingShow && canShowNow()) {
        p.pendingShow = false; await callShow(); renderAll(); return;
      }
      const { drop, draw, planShowNext } = cpuTurn(STATE);
      // Apply drop (must be same-rank already by policy)
      for (const c of drop) {
        const idx = p.hand.findIndex(h => h.id === c.id);
        if (idx >= 0) STATE.discard.push(p.hand.splice(idx,1)[0]);
      }
      // Draw from deck
      if (draw === 'discard') {
        if (STATE.discard.length > 0) p.hand.push(STATE.discard.pop());
      } else {
        if (STATE.deck.length === 0) reshuffle(STATE.deck, STATE.discard);
        if (STATE.deck.length > 0) p.hand.push(STATE.deck.pop());
      }
      if (planShowNext) p.pendingShow = true;
      await advanceTurn();
      renderAll();
    }, 450 + Math.floor(Math.random()*300));
  }
}

// Scoreboard rendering helper (kept in app; UI picks it up)
export function getScoreboard() {
  const sb = STATE.players.map((p, i) => ({ name: p.name, score: p.score, last: STATE.lastScores?.[i] ?? null }));
  return { round: STATE.round, mode: STATE.mode, target: STATE.targetScore, winner: STATE.winner, lastScores: sb };
}
