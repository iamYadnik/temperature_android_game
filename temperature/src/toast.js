export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => { t.hidden = true; }, 2200);
}

