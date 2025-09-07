// IndexedDB: config + save state

const DB_NAME = 'temperature-db';
const DB_VERSION = 1;
let dbp;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      if (!db.objectStoreNames.contains('save')) db.createObjectStore('save');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).put(value, key);
  });
}

async function idbClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).clear();
  });
}

export async function loadConfig() {
  return (await idbGet('config', 'config')) || null;
}

export async function saveConfig(cfg) {
  await idbSet('config', 'config', cfg);
}

export async function loadState() {
  return (await idbGet('save', 'state')) || null;
}

export async function saveState(state) {
  try {
    await idbSet('save', 'state', state);
  } catch (err) {
    console.warn('saveState failed (possibly quota)', err);
  }
}

export async function clearAll() {
  await idbClear('save');
  await idbClear('config');
}

export async function estimateUsage() {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

