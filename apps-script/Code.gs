/**
 * Financeiro Emanuel & Laysa — Google Apps Script bridge
 *
 * Deploy as: Execute as "User accessing the web app".
 * Access: Google accounts only. Restrict the sheet itself to the same users.
 * Script Properties required: SPREADSHEET_ID, ALLOWED_EMAILS, APP_ORIGIN.
 */
const APP = Object.freeze({
  NAME: 'Financeiro Emanuel & Laysa',
  CHANNEL: 'financeiro-emanuel-laysa',
  SHEETS: {
    summary: 'Resumo',
    transactions: 'Movimentações',
    payables: 'Contas a pagar',
    fixedExpenses: 'Despesas fixas'
  }
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const context = authorize_(p);
    if (p.action === 'authorize') {
      return bridge_(p, { ok: true, data: { authorized: true, email: context.email,
        message: 'Autorização concluída. Volte ao painel e sincronize.' } });
    }
    if (p.action !== 'sync') throw new Error('Ação não permitida.');
    return bridge_(p, { ok: true, data: readWorkbook_(context.spreadsheet) });
  } catch (err) {
    return bridge_(p, { ok: false, code: err.code || 'ACCESS_DENIED',
      error: safeMessage_(err) });
  }
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  try {
    authorize_(p);
    // No write endpoint until the owner approves ID columns and an audit tab.
    throw Object.assign(new Error(
      'Atualizações estão bloqueadas. É necessária a aprovação das colunas de ID e da aba Histórico antes de habilitar gravações.'
    ), { code: 'SCHEMA_CHANGE_REQUIRED' });
  } catch (err) {
    return bridge_(p, { ok: false, code: err.code || 'ACCESS_DENIED',
      error: safeMessage_(err) });
  }
}

function authorize_(p) {
  const props = PropertiesService.getScriptProperties();
  const expectedOrigin = String(props.getProperty('APP_ORIGIN') || '').trim();
  const origin = String(p.origin || '').trim();
  if (!expectedOrigin || origin !== expectedOrigin) {
    throw Object.assign(new Error('Origem do painel não autorizada.'), { code: 'ORIGIN_DENIED' });
  }
  const allowed = String(props.getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) {
    throw Object.assign(new Error('Conta Google não autorizada. Verifique a conta conectada e a lista de acesso.'), { code: 'USER_DENIED' });
  }
  const spreadsheetId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!spreadsheetId || (p.spreadsheetId && p.spreadsheetId !== spreadsheetId)) {
    throw Object.assign(new Error('ID da planilha não configurado.'), { code: 'CONFIG_ERROR' });
  }
  return { email: email, spreadsheet: SpreadsheetApp.openById(spreadsheetId) };
}

function readWorkbook_(ss) {
  const summary = requiredSheet_(ss, APP.SHEETS.summary);
  const transactions = requiredSheet_(ss, APP.SHEETS.transactions);
  const payables = requiredSheet_(ss, APP.SHEETS.payables);
  const fixedExpenses = requiredSheet_(ss, APP.SHEETS.fixedExpenses);
  return {
    spreadsheetName: ss.getName(),
    syncedAt: new Date().toISOString(),
    email: Session.getActiveUser().getEmail(),
    summary: summary.getRange('A2:B17').getValues().map(row => row.map(serializeCell_)),
    transactions: readRows_(transactions, 7),
    payables: readRows_(payables, 7),
    fixedExpenses: readRows_(fixedExpenses, 5),
    writeEnabled: false,
    writeBlockReason: 'Aguardando aprovação da estrutura de IDs e Histórico.'
  };
}

function requiredSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw Object.assign(new Error('A aba "' + name + '" não foi encontrada.'), { code: 'SHEET_MISSING' });
  return sheet;
}

function readRows_(sheet, columns) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, columns).getValues()
    .map((row, index) => ({ sheetRow: index + 2, values: row.map(serializeCell_) }))
    .filter(record => record.values.some(value => value !== '' && value !== null));
}

function serializeCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

function bridge_(p, result) {
  const nonce = JSON.stringify(String(p.nonce || '')).replace(/</g, '\\u003c');
  const origin = JSON.stringify(String(p.origin || '')).replace(/</g, '\\u003c');
  const body = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    'window.parent.postMessage({channel:' + JSON.stringify(APP.CHANNEL) +
    ',nonce:' + nonce + ',result:' + body + '},' + origin + ');' +
    '</script><p>Retorno enviado ao painel. Você pode fechar esta janela.</p></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(APP.NAME);
}

function safeMessage_(err) {
  return String(err && err.message ? err.message : 'Falha de autorização ou leitura.')
    .slice(0, 240);
}
