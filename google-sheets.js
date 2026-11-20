/* Google Sheets bridge. Tokens/credentials are never stored by this client.
 * Apps Script runs as the signed-in user; the spreadsheet remains private in Google Drive.
 */
(function (global) {
  'use strict';
  const CHANNEL = 'financeiro-emanuel-laysa';
  const CONFIG_KEY = 'financeiro-google-config-v1';
  function loadConfig() {
    if (global.FINANCEIRO_CONFIG) return global.FINANCEIRO_CONFIG;
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch (_) { return {}; }
  }
  let config = loadConfig();
  let pending = new Map();

  function configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(config.appsScriptUrl || '') &&
      /^[a-zA-Z0-9_-]{20,}$/.test(config.spreadsheetId || '') &&
      /^https:\/\/[^/]+$/.test(config.allowedAppOrigin || '');
  }

  function request(action, payload) {
    if (!configured()) return Promise.reject(new Error('CONFIG_MISSING'));
    return new Promise((resolve, reject) => {
      const nonce = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() :
        String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      const frame = document.createElement('iframe');
      const frameName = 'financeiro_gas_' + nonce.replace(/[^a-zA-Z0-9]/g, '');
      frame.name = frameName;
      frame.title = 'Conexão segura com Google Sheets';
      frame.hidden = true;
      const timeout = setTimeout(() => finish(new Error('TIMEOUT')), 30000);
      function finish(error, value) {
        clearTimeout(timeout);
        global.removeEventListener('message', onMessage);
        pending.delete(nonce);
        frame.remove();
        error ? reject(error) : resolve(value);
      }
      function onMessage(event) {
        if (event.source !== frame.contentWindow || !event.data ||
            event.data.channel !== CHANNEL || event.data.nonce !== nonce) return;
        const result = event.data.result;
        if (!result || result.ok !== true) {
          const err = new Error(result && result.error ? result.error : 'REQUEST_FAILED');
          err.code = result && result.code;
          finish(err);
        } else finish(null, result.data);
      }
      pending.set(nonce, { finish });
      global.addEventListener('message', onMessage);
      document.body.appendChild(frame);

      if (action === 'sync') {
        const url = new URL(config.appsScriptUrl);
        url.searchParams.set('action', action);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('origin', config.allowedAppOrigin);
        url.searchParams.set('spreadsheetId', config.spreadsheetId);
        frame.src = url.toString();
      } else {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = config.appsScriptUrl;
        form.target = frameName;
        form.hidden = true;
        const values = { action, nonce, origin: config.allowedAppOrigin,
          spreadsheetId: config.spreadsheetId, payload: JSON.stringify(payload || {}) };
        Object.entries(values).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = name; input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        form.remove();
      }
    });
  }

  global.FinanceiroSheets = Object.freeze({
    configure: function (next) {
      const candidate = { appsScriptUrl: String(next.appsScriptUrl || '').trim(),
        spreadsheetId: String(next.spreadsheetId || '').trim(),
        allowedAppOrigin: String(next.allowedAppOrigin || global.location.origin).trim() };
      const previous = config; config = candidate;
      if (!configured()) { config = previous; throw new Error('CONFIG_INVALID'); }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(candidate));
      return true;
    },
    isConfigured: configured,
    authorizeUrl: function () {
      if (!configured()) throw new Error('CONFIG_MISSING');
      const url = new URL(config.appsScriptUrl);
      url.searchParams.set('action', 'authorize');
      url.searchParams.set('origin', config.allowedAppOrigin);
      url.searchParams.set('spreadsheetId', config.spreadsheetId);
      return url.toString();
    },
    sync: function () { return request('sync'); },
    // Escritas ficam bloqueadas até a aprovação e preparação das colunas de ID e aba Histórico.
    save: function (payload) { return request('save', payload); }
  });
})(window);
