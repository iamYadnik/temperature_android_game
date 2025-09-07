// Pure helpers for Temperature rules

export const RANKS = [
  { label: 'A', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: 'J', value: 0 },
  { label: 'Q', value: 12 },
  { label: 'K', value: 15 }
];
export const SUITS = ['clubs','diamonds','hearts','spades'];

export function buildDeck({ useJokers = false, seed = null } = {}) {
  const deck = [];
  // 4 suits x each rank (suits are ignored)
  for (let s = 0; s < 4; s++) {
    for (const r of RANKS) {
      deck.push({ id: cryptoRandomId(), label: r.label, value: r.value, suit: SUITS[s] });
    }
  }
  if (useJokers) {
    // Two jokers
    deck.push({ id: cryptoRandomId(), label: 'Joker', value: 0, suit: 'red' });
    deck.push({ id: cryptoRandomId(), label: 'Joker', value: 0, suit: 'black' });
  }
  if (seed != null) shuffle(deck, createPRNG(String(seed)));
  else shuffle(deck);
  return deck;
}

export function shuffle(arr, rand=Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function handTotal(hand) {
  return hand.reduce((sum, c) => sum + c.value, 0);
}

export function isSameRank(cards) {
  if (!cards || cards.length === 0) return false;
  const first = cards[0].label;
  return cards.every((c) => c.label === first);
}

export function canMultiDrop(selection) {
  return isSameRank(selection);
}

export function reshuffle(deck, discard) {
  // Keep the top of discard; shuffle the rest into deck when deck is empty
  if (deck.length > 0) return;
  if (discard.length <= 1) return; // nothing to reshuffle
  const keepTop = discard.pop();
  const toShuffle = discard.splice(0, discard.length); // rest
  shuffle(toShuffle);
  deck.push(...toShuffle);
  discard.push(keepTop);
}

export function cryptoRandomId() {
  // Not security-critical; just a reasonably unique id
  const a = Math.random().toString(36).slice(2);
  const b = Math.random().toString(36).slice(2);
  return a + b;
}

export function createPRNG(seedStr) {
  // xorshift32 seeded by hash of string
  let h = 2166136261 >>> 0;
  for (let i=0;i<seedStr.length;i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let x = h || 0x9e3779b9;
  return function() {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return (x & 0xffffffff) / 0x100000000;
  };
}
