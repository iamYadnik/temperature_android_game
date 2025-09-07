import * as signaling from './net/signaling.js';
import * as lobby from './net/lobby.js';
import { toast } from './toast.js';
import { attachNet, hostStartNetworkGame, clientAttachNetwork, getState } from './app.js';

let showPanelRef;

export function initMultiplayer({ showPanel }) {
  showPanelRef = showPanel;
  const root = document.getElementById('mp-root');
  renderMenu(root);

  lobby.subscribe((s) => {
    if (!document.getElementById('mp-root')) return;
    const current = document.getElementById('mp-root');
    if (s.role && s.players && (s.players.length > 0)) {
      renderRoom(current, s);
    }
  });

  // Wiring network → app
  window.addEventListener('net-init', (ev) => {
    const { seed, options, players } = ev.detail;
    clientAttachNetwork({ seed, options, players });
    showPanelRef('panel-table');
  });
  window.addEventListener('net-state', (ev) => {
    // For clients: replace snapshot
    const { snapshot } = ev.detail;
    if (!snapshot) return;
    // Shallow replacing is fine for this MVP
    window.__TEMP_setState?.(snapshot);
  });
  window.addEventListener('net-intent', (ev) => {
    // Host: forward to app
    const { intent } = ev.detail;
    window.__TEMP_handleIntent?.(intent);
  });
}

function renderMenu(root) {
  root.innerHTML = '';
  const card = document.createElement('div'); card.className = 'mp-card';
  const title = document.createElement('h2'); title.textContent = 'Multiplayer (Local)'; card.appendChild(title);
  const row = document.createElement('div'); row.className = 'mp-menu';
  const btnCreate = document.createElement('button'); btnCreate.textContent = 'Create Room'; btnCreate.onclick = () => renderCreate(root);
  const btnJoin = document.createElement('button'); btnJoin.textContent = 'Join Room'; btnJoin.onclick = () => renderJoin(root);
  row.appendChild(btnCreate); row.appendChild(btnJoin);
  card.appendChild(row);
  root.appendChild(card);
}

function renderCreate(root) {
  root.innerHTML = '';
  const card = document.createElement('div'); card.className = 'mp-card';
  const title = document.createElement('h3'); title.textContent = 'Create Room (Host)'; card.appendChild(title);

  const nameInput = inputLabeled('Your name', 'Host');
  card.appendChild(nameInput.wrap);

  const offerArea = textareaLabeled('Offer (share this)');
  const answerArea = textareaLabeled('Paste Answer');
  const actions = document.createElement('div'); actions.className = 'mp-actions';
  const btnMake = document.createElement('button'); btnMake.textContent = 'Create Offer';
  btnMake.onclick = async () => {
    try {
      const blob = await lobby.createRoom({ name: nameInput.input.value || 'Host' });
      offerArea.ta.value = blob;
      toast('Offer created — share with client');
    } catch (e) { toast('Failed to create room'); }
  };
  const btnCopy = document.createElement('button'); btnCopy.textContent = 'Copy Offer'; btnCopy.onclick = () => signaling.copyToClipboard(offerArea.ta.value);
  const btnAccept = document.createElement('button'); btnAccept.textContent = 'Confirm Answer';
  btnAccept.onclick = async () => {
    try { await lobby.acceptAnswerBlob(answerArea.ta.value.trim()); toast('Connected'); renderRoom(root, lobby.get()); }
    catch (e) { toast('Invalid answer'); }
  };
  actions.append(btnMake, btnCopy, btnAccept);
  card.appendChild(offerArea.wrap);
  card.appendChild(answerArea.wrap);
  card.appendChild(actions);
  const back = document.createElement('button'); back.textContent = 'Back'; back.onclick = () => renderMenu(root);
  card.appendChild(back);

  root.appendChild(card);
}

function renderJoin(root) {
  root.innerHTML = '';
  const card = document.createElement('div'); card.className = 'mp-card';
  const title = document.createElement('h3'); title.textContent = 'Join Room (Client)'; card.appendChild(title);
  const nameInput = inputLabeled('Your name', 'Player');
  const offerArea = textareaLabeled('Paste Offer from Host');
  const answerArea = textareaLabeled('Answer (send to Host)');
  const actions = document.createElement('div'); actions.className = 'mp-actions';
  const btnJoin = document.createElement('button'); btnJoin.textContent = 'Join';
  btnJoin.onclick = async () => {
    try {
      const blob = await lobby.joinRoom({ name: nameInput.input.value || 'Player', offerBlob: offerArea.ta.value.trim() });
      answerArea.ta.value = blob;
      toast('Answer generated — deliver to host');
    } catch (e) { toast('Invalid offer'); }
  };
  const btnCopy = document.createElement('button'); btnCopy.textContent = 'Copy Answer'; btnCopy.onclick = () => signaling.copyToClipboard(answerArea.ta.value);
  actions.append(btnJoin, btnCopy);
  card.appendChild(nameInput.wrap);
  card.appendChild(offerArea.wrap);
  card.appendChild(answerArea.wrap);
  card.appendChild(actions);
  const back = document.createElement('button'); back.textContent = 'Back'; back.onclick = () => renderMenu(root);
  card.appendChild(back);
  root.appendChild(card);
}

function renderRoom(root, s) {
  root.innerHTML = '';
  const card = document.createElement('div'); card.className = 'mp-card';
  const title = document.createElement('h3'); title.textContent = `Room ${s.roomId || ''}`; card.appendChild(title);
  const list = document.createElement('div'); list.className = 'mp-list';
  for (const p of s.players) {
    const row = document.createElement('div'); row.className = 'mp-row';
    row.textContent = `${p.isHost ? '(Host) ' : ''}${p.name}`;
    list.appendChild(row);
  }
  card.appendChild(list);
  const actions = document.createElement('div'); actions.className = 'mp-actions';
  if (s.role === 'host') {
    const btnStart = document.createElement('button'); btnStart.textContent = 'Start Game'; btnStart.disabled = (s.players.length < 2);
    btnStart.onclick = () => {
      const options = { roomMode: false, targetScore: 150, jokers: false };
      // Attach network for host
      attachNet({ role: 'host' });
      hostStartNetworkGame({ seed: s.seed, players: s.players.map(p=>({id:p.id,name:p.name})), options });
      lobby.startGame(options);
      showPanelRef('panel-table');
    };
    actions.appendChild(btnStart);
  }
  const btnExit = document.createElement('button'); btnExit.textContent = 'Exit Room'; btnExit.onclick = () => { lobby.exitRoom(); renderMenu(root); };
  actions.appendChild(btnExit);
  card.appendChild(actions);
  // Scores area (placeholder)
  const score = document.createElement('div'); score.className = 'mp-list';
  score.innerHTML = '<h4>Scores</h4>';
  for (const r of s.scores) {
    const d = document.createElement('div'); d.textContent = `Round ${r.round}: ${r.row.join(', ')}`; score.appendChild(d);
  }
  card.appendChild(score);
  root.appendChild(card);
}

function inputLabeled(label, value='') {
  const wrap = document.createElement('label'); wrap.style.display = 'grid'; wrap.style.gap = '0.25rem';
  const span = document.createElement('span'); span.textContent = label; wrap.appendChild(span);
  const input = document.createElement('input'); input.type = 'text'; input.value = value; input.className = 'mp-mono'; wrap.appendChild(input);
  return { wrap, input };
}
function textareaLabeled(label) {
  const wrap = document.createElement('label'); wrap.style.display = 'grid'; wrap.style.gap = '0.25rem';
  const span = document.createElement('span'); span.textContent = label; wrap.appendChild(span);
  const ta = document.createElement('textarea'); ta.className = 'mp-textarea mp-mono'; wrap.appendChild(ta);
  return { wrap, ta };
}

