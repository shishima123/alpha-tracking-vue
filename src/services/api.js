/**
 * API client cho Google Apps Script Web App.
 *
 * Tránh CORS preflight bằng cách:
 *  - Dùng POST với Content-Type: text/plain (đây là "simple request")
 *  - Apps Script không hỗ trợ OPTIONS, application/json sẽ trigger preflight
 *
 * Auth: HMAC-SHA256 signing với non-extractable CryptoKey.
 *  - Khi login, passphrase được import thành CryptoKey (extractable: false)
 *  - Lưu CryptoKey vào IndexedDB — passphrase RAW không lưu ở đâu cả.
 *  - Mỗi request body = { data, timestamp, nonce, signature }
 *    + data      = JSON({resource, action, payload})
 *    + signature = base64(HMAC-SHA256(key, data + '|' + timestamp + '|' + nonce))
 *  - Server (Code.gs) tính lại signature từ APP_SECRET, check timestamp lệch ≤60s.
 *
 * Attacker mở DevTools chỉ thấy CryptoKey object opaque trong IndexedDB,
 * không thể export ra raw value. Vẫn dùng được trong session JS đó để sign,
 * nhưng không trộm được passphrase để dùng nơi khác.
 */

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const DB_NAME = 'alphaTracking';
const STORE = 'auth';
const KEY_ID = 'hmacKey';

if (!APPS_SCRIPT_URL) {
  console.warn(
    '[api] VITE_APPS_SCRIPT_URL chưa được set. ' +
      'Tạo file .env và set VITE_APPS_SCRIPT_URL=<url web app>'
  );
}

const encoder = new TextEncoder();
let cachedKey = null;

// =========================================================================
// IndexedDB
// =========================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// =========================================================================
// Key management
// =========================================================================
async function importPassphraseKey(passphrase) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'HMAC', hash: 'SHA-256' },
    false, // extractable = false → không thể subtle.exportKey()
    ['sign']
  );
}

export async function persistPassphrase(passphrase) {
  const key = await importPassphraseKey(passphrase);
  await idbSet(KEY_ID, key);
  cachedKey = key;
}

async function loadStoredKey() {
  if (cachedKey) return cachedKey;
  try {
    const k = await idbGet(KEY_ID);
    if (k) cachedKey = k;
  } catch (_) { /* DB error → treat as no key */ }
  return cachedKey;
}

export async function hasStoredKey() {
  return !!(await loadStoredKey());
}

export async function clearStoredKey() {
  cachedKey = null;
  try { await idbDelete(KEY_ID); } catch (_) { /* ignore */ }
}

// =========================================================================
// Signing
// =========================================================================
function makeNonce() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function signWithKey(key, message) {
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(sigBuf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function buildSignedBody(key, resource, action, payload) {
  const data = JSON.stringify({ resource, action, payload });
  const timestamp = Date.now();
  const nonce = makeNonce();
  const signature = await signWithKey(key, data + '|' + timestamp + '|' + nonce);
  return { data, timestamp, nonce, signature };
}

async function postSigned(key, resource, action, payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL chưa cấu hình. Xem .env.example');
  }
  const body = await buildSignedBody(key, resource, action, payload);
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// =========================================================================
// Public API
// =========================================================================
async function call(resource, action, payload = {}) {
  const key = await loadStoredKey();
  if (!key) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('alpha:auth-required'));
    }
    throw new Error('unauthorized');
  }
  const data = await postSigned(key, resource, action, payload);
  if (!data.ok) {
    if (data.error === 'unauthorized') {
      await clearStoredKey();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('alpha:auth-required'));
      }
    }
    throw new Error(data.error || 'Apps Script error');
  }
  return data.data;
}

export const authApi = {
  /** Verify passphrase mà KHÔNG persist. Trả true/false, throw cho lỗi khác. */
  verify: async (passphrase) => {
    const tempKey = await importPassphraseKey(passphrase);
    const data = await postSigned(tempKey, 'health', 'health', {});
    if (data.ok) return true;
    if (data.error === 'unauthorized') return false;
    throw new Error(data.error || 'Unknown error');
  },
};

export const accountsApi = {
  list: () => call('accounts', 'list'),
  create: (data) => call('accounts', 'create', data),
  update: (id, data) => call('accounts', 'update', { id, ...data }),
  remove: (id) => call('accounts', 'delete', { id }),
};

export const feesApi = {
  list: (params = {}) => call('fees', 'list', params),
  create: (data) => call('fees', 'create', data),
  bulk: (entries) => call('fees', 'bulk', { entries }),
  update: (id, data) => call('fees', 'update', { id, ...data }),
  remove: (id) => call('fees', 'delete', { id }),
};

export const alphaApi = {
  list: () => call('alpha', 'list'),
  create: (data) => call('alpha', 'create', data),
  update: (id, data) => call('alpha', 'update', { id, ...data }),
  remove: (id) => call('alpha', 'delete', { id }),
};

export const summaryApi = {
  get: (params = {}) => call('summary', 'get', params),
};

export const pointsApi = {
  get: (requiredPoints = 15) => call('points', 'get', { requiredPoints }),
  fromVolume: (volume) => call('points', 'fromVolume', { volume }),
};

export const bootstrapApi = {
  get: (params = {}) => call('bootstrap', 'get', params),
};

export default { call };
