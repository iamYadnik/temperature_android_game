import { buildDeck, handTotal, canMultiDrop, reshuffle, cryptoRandomId } from './rules.js';
import { saveState, loadState } from './storage.js';
import { toast } from './toast.js';
import { cpuTurn } from './cpu.js';

let STATE = null;
let SELECTION = []; // selected card ids for current player

export function getState() { return STATE; }
export function getSelection() { return SELECTION; }
export function setSelection(arr) { SELECTION = arr; }
export function isHumanTurn() { return !!STATE?.players[STATE.current]?.human; }

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

export function canShowNow() {
  if (!STATE) return false;
  return STATE.phase === 'turn-start';
}

export async function performDropAndDraw(draw) {
  const p = STATE.players[STATE.current];
  if (!p.human) return; // human-only control
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
}

export async function callShow() {
  if (!canShowNow()) { toast('Show only at start of turn'); return; }
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
