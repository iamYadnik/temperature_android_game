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

export function buildDeck({ useJokers = false } = {}) {
  const deck = [];
  // 4 suits x each rank (suits are ignored)
  for (let s = 0; s < 4; s++) {
    for (const r of RANKS) {
      deck.push({ id: cryptoRandomId(), label: r.label, value: r.value });
    }
  }
  if (useJokers) {
    // Two jokers
    deck.push({ id: cryptoRandomId(), label: 'Joker', value: 0 });
    deck.push({ id: cryptoRandomId(), label: 'Joker', value: 0 });
  }
  shuffle(deck);
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

