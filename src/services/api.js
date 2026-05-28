/**
 * API client cho Google Apps Script Web App.
 *
 * Tránh CORS preflight bằng cách:
 *  - Dùng POST với Content-Type: text/plain (đây là "simple request")
 *  - Toàn bộ payload nằm trong body JSON: { resource, action, payload }
 *  - Apps Script trả về { ok, data } hoặc { ok: false, error }
 */

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

if (!APPS_SCRIPT_URL) {
  console.warn(
    '[api] VITE_APPS_SCRIPT_URL chưa được set. ' +
      'Tạo file frontend/.env và set VITE_APPS_SCRIPT_URL=<url web app>'
  );
}

async function call(resource, action, payload = {}) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL chưa cấu hình. Xem frontend/.env.example');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // text/plain để bypass CORS preflight (Apps Script không hỗ trợ OPTIONS)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ resource, action, payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Apps Script error');
  return data.data;
}

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
