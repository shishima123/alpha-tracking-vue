/**
 * API client cho Google Apps Script Web App.
 *
 * Tránh CORS preflight bằng cách:
 *  - Dùng POST với Content-Type: text/plain (đây là "simple request")
 *  - Toàn bộ payload nằm trong body JSON: { resource, action, payload, secret }
 *  - Apps Script trả về { ok, data } hoặc { ok: false, error }
 *
 * Auth: passphrase lưu trong localStorage, kèm vào mọi request dưới key `secret`.
 * Server (Code.gs) so sánh với Script Property APP_SECRET.
 */

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const SECRET_STORAGE_KEY = 'alphaTracking.secret';

if (!APPS_SCRIPT_URL) {
  console.warn(
    '[api] VITE_APPS_SCRIPT_URL chưa được set. ' +
      'Tạo file .env và set VITE_APPS_SCRIPT_URL=<url web app>'
  );
}

export function getStoredSecret() {
  try { return localStorage.getItem(SECRET_STORAGE_KEY) || ''; } catch (_) { return ''; }
}

export function setStoredSecret(s) {
  localStorage.setItem(SECRET_STORAGE_KEY, s);
}

export function clearStoredSecret() {
  localStorage.removeItem(SECRET_STORAGE_KEY);
}

async function rawCall(resource, action, payload, secret) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL chưa cấu hình. Xem .env.example');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // text/plain để bypass CORS preflight (Apps Script không hỗ trợ OPTIONS)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ resource, action, payload, secret }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function call(resource, action, payload = {}) {
  const data = await rawCall(resource, action, payload, getStoredSecret());
  if (!data.ok) {
    if (data.error === 'unauthorized') {
      clearStoredSecret();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('alpha:auth-required'));
      }
    }
    throw new Error(data.error || 'Apps Script error');
  }
  return data.data;
}

export const authApi = {
  /** Trả về true nếu passphrase đúng, false nếu sai. Throw cho lỗi khác. */
  verify: async (secret) => {
    const data = await rawCall('health', 'health', {}, secret);
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

export default { call };
