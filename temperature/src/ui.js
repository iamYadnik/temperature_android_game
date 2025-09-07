import { handTotal, canMultiDrop } from './rules.js';
import { saveConfig, loadConfig, estimateUsage, clearAll } from './storage.js';
import { getState, startNewGame, tryResume, getSelection, setSelection, canShowNow, performDropAndDraw, callShow, nextRound, isHumanTurn, getScoreboard } from './app.js';
import { toast } from './toast.js';

const el = (id) => document.getElementById(id);

export function initUI({ showPanel }) {
  // New Game form
  el('new-game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const mode = form.mode.value; // one | room
    const players = clamp(parseInt(form.players.value || '2', 10), 2, 6);
    const humans = clamp(parseInt(form.humans.value || '1', 10), 1, players);
    const target = parseInt(form.target.value || '150', 10);
    const jokers = !!form.jokers.checked;
    const config = { roomMode: mode === 'room', playerCount: players, humanCount: humans, targetScore: target, jokers };
    await saveConfig(config);
    await startNewGame(config);
    showPanel('panel-table');
    renderAll();
  });
  el('resume-game').addEventListener('click', async () => {
    const ok = await tryResume();
    if (ok) {
      showPanel('panel-table');
      renderAll();
    } else {
      toast('No saved game found');
    }
  });

  // Controls
  el('btn-drop-deck').addEventListener('click', async () => {
    await performDropAndDraw('deck');
    renderAll();
  });
  el('btn-drop-discard').addEventListener('click', async () => {
    await performDropAndDraw('discard');
    renderAll();
  });
  el('btn-show').addEventListener('click', async () => {
    if (!canShowNow()) return toast('Show only at start of your turn');
    await callShow();
    renderAll();
  });
  el('btn-next-round').addEventListener('click', async () => {
    await nextRound();
    renderAll();
  });
  el('btn-new-from-score').addEventListener('click', async () => {
    // back to new tab
    document.getElementById('tab-new').click();
  });

  // Storage panel
  el('btn-clear-save').addEventListener('click', async () => {
    await clearAll();
    toast('Save and config cleared');
    renderStorage();
  });
  el('btn-reset-all').addEventListener('click', async () => {
    await clearAll();
    location.reload();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const state = getState();
    if (!state) return;
    const hand = state.players[state.current]?.hand || [];
    const focusables = Array.from(document.querySelectorAll('#hand .card-btn'));
    const idx = focusables.indexOf(document.activeElement);
    if (e.key === 'ArrowRight' && focusables.length) {
      e.preventDefault();
      const ni = Math.min(idx + 1, focusables.length - 1);
      (focusables[ni] || focusables[0]).focus();
    } else if (e.key === 'ArrowLeft' && focusables.length) {
      e.preventDefault();
      const ni = Math.max(idx - 1, 0);
      (focusables[ni] || focusables[0]).focus();
    } else if (e.key === ' ' && focusables.length && idx >= 0) {
      e.preventDefault();
      focusables[idx].click();
    } else if ((e.key === 'd' || e.key === 'D')) {
      if (isHumanTurn()) el('btn-drop-deck').click();
    } else if ((e.key === 'f' || e.key === 'F')) {
      if (isHumanTurn()) el('btn-drop-discard').click();
    } else if ((e.key === 's' || e.key === 'S')) {
      if (isHumanTurn()) el('btn-show').click();
    }
  });

  // Preload config values
  loadConfig().then(cfg => {
    if (!cfg) return;
    const form = el('new-game-form');
    form.mode.value = cfg.roomMode ? 'room' : 'one';
    form.players.value = cfg.playerCount || 2;
    form.humans.value = cfg.humanCount || 1;
    form.target.value = cfg.targetScore || 150;
    form.jokers.checked = !!cfg.jokers;
  });

  renderStorage();
}

export function renderAll() {
  const state = getState();
  if (!state) return;
  renderTable(state);
  renderScore(state);
  renderStorage();
  if (state.phase === 'round-end' || state.phase === 'game-over') {
    document.getElementById('tab-score').click();
  }
}

function renderTable(state) {
  el('deck-count').textContent = String(state.deck.length);
  el('discard-count').textContent = String(state.discard.length);
  const top = state.discard[state.discard.length - 1];
  el('discard-top').textContent = top ? top.label : '—';
  el('turn-banner').textContent = `Current: ${state.players[state.current].name}`;

  // Players summary
  const playersEl = el('players');
  playersEl.innerHTML = '';
  for (const p of state.players) {
    const d = document.createElement('div');
    d.className = 'player';
    d.innerHTML = `
      <div class="name">${p.name} ${p.eliminated ? '❌' : ''} ${p.human ? '' : '🤖'}</div>
      <div class="meta">Score: ${p.score} · Hand total: ${p.eliminated ? '-' : handTotal(p.hand)}</div>
    `;
    playersEl.appendChild(d);
  }

  // Hand (current human player's hand only)
  const handEl = el('hand');
  handEl.innerHTML = '';
  const current = state.players[state.current];
  if (current.human && !current.eliminated) {
    const sel = new Set(getSelection());
    current.hand.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card-btn' + (sel.has(c.id) ? ' selected' : '');
      b.textContent = c.label;
      b.setAttribute('aria-pressed', sel.has(c.id) ? 'true' : 'false');
      b.addEventListener('click', () => toggleCard(c));
      handEl.appendChild(b);
    });
  } else {
    const info = document.createElement('div');
    info.textContent = current.human ? 'Eliminated' : 'CPU thinking…';
    handEl.appendChild(info);
  }

  // Controls enablement
  const selection = getSelectedCards(state);
  const legal = selection.length > 0 && canMultiDrop(selection);
  el('btn-drop-deck').disabled = !(isHumanTurn() && legal);
  el('btn-drop-discard').disabled = !(isHumanTurn() && legal && state.discard.length > 0);
  el('btn-show').disabled = !(isHumanTurn() && canShowNow());
}

function getSelectedCards(state) {
  const ids = new Set(getSelection());
  const hand = state.players[state.current].hand;
  return hand.filter(c => ids.has(c.id));
}

function toggleCard(card) {
  const state = getState();
  if (!isHumanTurn()) return;
  const ids = new Set(getSelection());
  // Enforce same-rank selection
  if (ids.size > 0 && !ids.has(card.id)) {
    const current = state.players[state.current];
    const selectedCards = current.hand.filter(c => ids.has(c.id));
    const sameLabel = selectedCards.every(c => c.label === card.label);
    if (!sameLabel) {
      return toast('You can only select cards of the same value');
    }
  }
  if (ids.has(card.id)) ids.delete(card.id); else ids.add(card.id);
  setSelection(Array.from(ids));
  renderAll();
}

async function renderStorage() {
  const est = await estimateUsage();
  const elInfo = el('storage-info');
  if (!est) { elInfo.textContent = 'Storage usage: n/a'; return; }
  const mb = (n) => (n / (1024*1024)).toFixed(2) + ' MB';
  elInfo.textContent = `Storage usage: ${mb(est.usage||0)} / ${mb(est.quota||0)}`;
}

// Update prompt integration
export function showUpdatePrompt(onClick) {
  const bar = el('update-toast');
  const btn = el('update-action');
  btn.onclick = onClick;
  bar.hidden = false;
}
export function hideUpdatePrompt() {
  el('update-toast').hidden = true;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function renderScore(state) {
  const box = document.getElementById('scoreboard');
  if (!box) return;
  const sb = getScoreboard();
  box.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = state.phase === 'game-over' ? 'Game Over' : 'Scores';
  box.appendChild(title);
  for (const row of sb.lastScores) {
    const d = document.createElement('div');
    d.textContent = `${row.name} — ${row.score}` + (row.last !== null ? ` (${row.last >= 0 ? '+' : ''}${row.last})` : '');
    box.appendChild(d);
  }
  const btnNext = document.getElementById('btn-next-round');
  if (state.mode === 'room' && state.phase === 'round-end') {
    btnNext.hidden = false;
  } else {
    btnNext.hidden = true;
  }
}
