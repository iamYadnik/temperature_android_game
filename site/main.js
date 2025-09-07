let deferredPrompt = null;

const installBtn = document.getElementById('install');
const openBtn = document.getElementById('open');
const howto = document.getElementById('howto');
const toast = document.getElementById('toast');

openBtn.addEventListener('click', () => {
  location.href = '../temperature/index.html';
});

const inStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

if (inStandalone) installBtn.hidden = true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!inStandalone && !isIOS) {
    installBtn.hidden = false;
    howto.hidden = true;
  }
});

if (!inStandalone && isIOS) {
  howto.hidden = false;
  installBtn.hidden = true;
}

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
  if (outcome === 'accepted') showToast('Installed!');
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  showToast('Installed!');
});

function showToast(msg){
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>toast.hidden=true, 2500);
}

