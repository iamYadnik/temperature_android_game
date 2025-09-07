import { handTotal } from './rules.js';

// Choose the set of identical-rank cards with highest card value,
// tie-breaker: largest set size.
export function cpuChooseDrop(hand) {
  const groups = new Map();
  for (const c of hand) {
    const k = c.label; if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  let best = null;
  for (const [label, cards] of groups) {
    const value = cards[0].value; // same label -> same value
    const score = value * 100 + cards.length; // weight value more
    if (!best || score > best.score) best = { label, cards, score };
  }
  return best ? best.cards : [];
}

export function cpuTurn(state) {
  const p = state.players[state.current];
  const drop = cpuChooseDrop(p.hand);
  // Simple policy: always draw from deck afterwards
  return { drop, draw: 'deck', planShowNext: handTotal(p.hand) < 15 };
}

