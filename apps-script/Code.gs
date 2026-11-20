/**
 * Financeiro Emanuel & Laysa — Google Apps Script bridge.
 * The script runs as the signed-in user. Keep the spreadsheet shared only
 * with the two explicitly authorized Google accounts.
 *
 * Required Script Properties:
 * SPREADSHEET_ID, ALLOWED_EMAILS, APP_ORIGIN
 * Optional gates (both default to disabled):
 * SCHEMA_MIGRATION_APPROVED=true, WRITE_ENABLED=true
 */
const APP = Object.freeze({
  NAME: 'Financeiro Emanuel & Laysa',
  CHANNEL: 'financeiro-emanuel-laysa',
  SHEETS: {
    summary: 'Resumo',
    transactions: 'Movimentações',
    payables: 'Contas a pagar',
    fixedExpenses: 'Despesas fixas',
    history: 'Histórico',
    weekly: 'Planejamento semanal',
    goals: 'Metas'
  },
  HEADERS: {
    transactions: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor (R$)', 'Forma de pagamento', 'Observações', 'ID'],
    payables: ['Vencimento', 'Conta', 'Valor (R$)', 'Categoria', 'Status', 'Data do pagamento', 'Observações', 'ID'],
    fixedExpenses: ['Despesa fixa', 'Categoria', 'Valor previsto (R$)', 'Dia do vencimento', 'Observações', 'ID'],
    history: ['Data/hora', 'Usuário', 'Ação', 'Aba', 'ID', 'Valores anteriores', 'Valores novos', 'requestId'],
    weekly: ['ID', 'Data', 'Descrição', 'Categoria', 'Valor previsto', 'Status', 'Observações'],
    goals: ['ID', 'Meta', 'Valor alvo', 'Valor acumulado', 'Prazo', 'Observações']
  }
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const context = authorize_(p);
    if (p.action === 'authorize') return authorizationPage_(context.email);
    if (p.action !== 'sync') throw codedError_('Ação não permitida.', 'ACTION_DENIED');
    return bridge_(p, { ok: true, data: readWorkbook_(context.spreadsheet, context.email) });
  } catch (err) {
    if (p.action === 'authorize') return authorizationErrorPage_(safeMessage_(err));
    return bridge_(p, { ok: false, code: err.code || 'ACCESS_DENIED', error: safeMessage_(err) });
  }
}

function doPost(e) {
  // Escrita deliberadamente bloqueada até validar autenticação e escopos.
  const p = (e && e.parameter) || {};
  return bridge_(p, { ok: false, code: 'WRITE_NOT_AVAILABLE',
    error: 'Gravações bloqueadas nesta implantação. Conclua autenticação, migração aprovada e testes de permissão.' });
}

function authorize_(p) {
  const props = PropertiesService.getScriptProperties();
  const expectedOrigin = String(props.getProperty('APP_ORIGIN') || '').trim();
  const requestedOrigin = String(p.origin || '').trim();
  if (!expectedOrigin || requestedOrigin !== expectedOrigin) {
    throw codedError_('Origem do painel não autorizada.', 'ORIGIN_DENIED');
  }

  const allowed = String(props.getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || allowed.indexOf(email) === -1) {
    throw codedError_('Conta Google não autorizada. Verifique a conta conectada e a lista de acesso.', 'USER_DENIED');
  }

  const spreadsheetId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!spreadsheetId || (p.spreadsheetId && p.spreadsheetId !== spreadsheetId)) {
    throw codedError_('ID da planilha não configurado ou divergente.', 'CONFIG_ERROR');
  }
  return { email: email, spreadsheet: SpreadsheetApp.openById(spreadsheetId) };
}

function readWorkbook_(ss, email) {
  const summary = requiredSheet_(ss, APP.SHEETS.summary);
  const transactions = requiredSheet_(ss, APP.SHEETS.transactions);
  const payables = requiredSheet_(ss, APP.SHEETS.payables);
  const fixedExpenses = requiredSheet_(ss, APP.SHEETS.fixedExpenses);
  const weekly = ss.getSheetByName(APP.SHEETS.weekly);
  const goals = ss.getSheetByName(APP.SHEETS.goals);

  return {
    spreadsheetName: ss.getName(),
    syncedAt: new Date().toISOString(),
    email: email,
    summary: summary.getRange('A2:B17').getValues().map(function (row) {
      return row.map(serializeCell_);
    }),
    transactions: readRows_(transactions, 7, 8),
    payables: readRows_(payables, 7, 8),
    fixedExpenses: readRows_(fixedExpenses, 5, 6),
    weekly: weekly ? readOptionalRows_(weekly, 7) : [],
    goals: goals ? readOptionalRows_(goals, 6) : [],
    schemaStatus: inspectSchema_(ss),
    writeEnabled: false,
    writeBlockReason: 'Aguardando preparação e validação da estrutura de IDs e Histórico.'
  };
}

function inspectSchema_(ss) {
  const checks = [
    headerCheck_(requiredSheet_(ss, APP.SHEETS.transactions), APP.HEADERS.transactions),
    headerCheck_(requiredSheet_(ss, APP.SHEETS.payables), APP.HEADERS.payables),
    headerCheck_(requiredSheet_(ss, APP.SHEETS.fixedExpenses), APP.HEADERS.fixedExpenses),
    headerCheck_(ss.getSheetByName(APP.SHEETS.history), APP.HEADERS.history)
  ];
  const missing = checks.filter(function (x) { return !x.ok; }).map(function (x) { return x.sheet + ': ' + x.reason; });
  const weekly = ss.getSheetByName(APP.SHEETS.weekly);
  const goals = ss.getSheetByName(APP.SHEETS.goals);
  return {
    coreReady: missing.length === 0,
    coreIssues: missing,
    weeklyReady: !!weekly && headerCheck_(weekly, APP.HEADERS.weekly).ok,
    goalsReady: !!goals && headerCheck_(goals, APP.HEADERS.goals).ok
  };
}

function headerCheck_(sheet, expected) {
  if (!sheet) return { sheet: expected[0], ok: false, reason: 'aba ausente' };
  if (sheet.getMaxColumns() < expected.length) {
    return { sheet: sheet.getName(), ok: false, reason: 'colunas de ID ainda não adicionadas' };
  }
  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0]
    .map(function (x) { return String(x || '').trim(); });
  const ok = expected.every(function (x, i) { return actual[i] === x; });
  return { sheet: sheet.getName(), ok: ok, reason: ok ? '' : 'cabeçalhos ausentes ou diferentes' };
}

function requiredSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw codedError_('A aba "' + name + '" não foi encontrada.', 'SHEET_MISSING');
  return sheet;
}

function readRows_(sheet, dataColumns, idColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, dataColumns).getValues()
    .map(function (row, index) {
      const sheetRow = index + 2;
      const id = idColumn <= sheet.getMaxColumns()
        ? String(sheet.getRange(sheetRow, idColumn).getDisplayValue() || '').trim() : '';
      return { sheetRow: sheetRow, id: id, values: row.map(serializeCell_) };
    })
    .filter(function (record) {
      return record.values.some(function (value) { return value !== '' && value !== null; });
    });
}

function readOptionalRows_(sheet, columns) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, columns).getValues()
    .map(function (row, index) {
      return { sheetRow: index + 2, id: String(row[0] || ''), values: row.map(serializeCell_) };
    })
    .filter(function (record) {
      return record.values.some(function (value) { return value !== '' && value !== null; });
    });
}

function serializeCell_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value;
}

/**
 * READ-ONLY PREVIEW: lists the exact schema changes that would be made.
 * Run manually in the Apps Script editor. This function never writes.
 */
function previewSchemaMigration() {
  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!id) throw new Error('Configure SPREADSHEET_ID primeiro.');
  const ss = SpreadsheetApp.openById(id);
  const plans = [
    { name: APP.SHEETS.transactions, idColumn: 8, headers: APP.HEADERS.transactions },
    { name: APP.SHEETS.payables, idColumn: 8, headers: APP.HEADERS.payables },
    { name: APP.SHEETS.fixedExpenses, idColumn: 6, headers: APP.HEADERS.fixedExpenses }
  ];
  const result = plans.map(function (plan) {
    const sheet = requiredSheet_(ss, plan.name);
    const width = Math.min(sheet.getMaxColumns(), plan.idColumn);
    const actual = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
    const existingIdCount = sheet.getMaxColumns() < plan.idColumn || sheet.getLastRow() < 2 ? 0 :
      sheet.getRange(2, plan.idColumn, sheet.getLastRow() - 1, 1)
        .getDisplayValues().filter(function (r) { return String(r[0] || '').trim() !== ''; }).length;
    const blankIds = Math.max(0, sheet.getLastRow() - 1) - existingIdCount;
    return { sheet: plan.name, currentLastColumn: sheet.getMaxColumns(),
      currentHeader: actual, proposedHeader: plan.headers,
      existingRecords: Math.max(0, sheet.getLastRow() - 1), blankIds: blankIds };
  });
  [APP.SHEETS.history, APP.SHEETS.weekly, APP.SHEETS.goals].forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    result.push({ sheet: name, exists: !!sheet,
      action: sheet ? 'validate existing headers' : 'create new tab with approved headers' });
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * EXPLICIT, MANUAL MIGRATION ONLY.
 * Does not run on page load, sync, deploy, or authorization.
 * Requires the owner to set SCHEMA_MIGRATION_APPROVED=true in Script Properties
 * and manually run this function after reviewing previewSchemaMigration().
 */
function applyApprovedSchemaMigration() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_MIGRATION_APPROVED') !== 'true') {
    throw new Error('Migração bloqueada. Revise o preview e defina SCHEMA_MIGRATION_APPROVED=true somente após autorizar expressamente.');
  }
  const id = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!id) throw new Error('Configure SPREADSHEET_ID primeiro.');
  const ss = SpreadsheetApp.openById(id);
  const plans = [
    { name: APP.SHEETS.transactions, idColumn: 8, headers: APP.HEADERS.transactions },
    { name: APP.SHEETS.payables, idColumn: 8, headers: APP.HEADERS.payables },
    { name: APP.SHEETS.fixedExpenses, idColumn: 6, headers: APP.HEADERS.fixedExpenses }
  ];
  const extraPlans = [
    { name: APP.SHEETS.history, headers: APP.HEADERS.history },
    { name: APP.SHEETS.weekly, headers: APP.HEADERS.weekly },
    { name: APP.SHEETS.goals, headers: APP.HEADERS.goals }
  ];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Preflight every existing header before the first spreadsheet mutation.
    plans.forEach(function (plan) {
      const sheet = requiredSheet_(ss, plan.name);
      const existing = sheet.getRange(1, 1, 1, plan.idColumn - 1).getDisplayValues()[0];
      plan.headers.slice(0, plan.idColumn - 1).forEach(function (header, index) {
        if (String(existing[index] || '').trim() !== header) {
          throw new Error('Cabeçalho divergente em ' + plan.name + ', coluna ' + (index + 1) + '. Nenhuma alteração foi feita.');
        }
      });
      if (sheet.getMaxColumns() >= plan.idColumn) {
        const currentIdHeader = String(sheet.getRange(1, plan.idColumn).getDisplayValue() || '').trim();
        if (currentIdHeader && currentIdHeader !== 'ID') {
          throw new Error('A coluna destinada ao ID já contém outro cabeçalho em ' + plan.name + '. Nenhuma alteração foi feita.');
        }
        const lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          const currentIds = sheet.getRange(2, plan.idColumn, lastRow - 1, 1).getDisplayValues()
            .map(function (row) { return String(row[0] || '').trim(); }).filter(Boolean);
          const unique = Object.create(null);
          currentIds.forEach(function (value) {
            if (unique[value]) throw new Error('IDs duplicados em ' + plan.name + '. Nenhuma alteração foi feita.');
            unique[value] = true;
          });
        }
      }
    });
    extraPlans.forEach(function (plan) {
      const existing = ss.getSheetByName(plan.name);
      if (existing && existing.getLastRow() > 0) {
        const width = Math.min(existing.getMaxColumns(), plan.headers.length);
        const actual = existing.getRange(1, 1, 1, width).getDisplayValues()[0];
        const matches = plan.headers.slice(0, width).every(function (h, i) { return String(actual[i] || '').trim() === h; });
        if (!matches || width !== plan.headers.length) {
          throw new Error('A aba ' + plan.name + ' já existe com cabeçalhos diferentes. Nenhuma alteração foi feita.');
        }
      }
    });
    plans.forEach(function (plan) {
      const sheet = requiredSheet_(ss, plan.name);
      if (sheet.getMaxColumns() < plan.idColumn) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), plan.idColumn - sheet.getMaxColumns());
      }
      const existingHeader = sheet.getRange(1, 1, 1, plan.idColumn).getDisplayValues()[0];
      const expectedPrefix = plan.headers.slice(0, plan.idColumn - 1);
      expectedPrefix.forEach(function (value, index) {
        if (String(existingHeader[index] || '').trim() !== value) {
          throw new Error('Cabeçalho divergente em ' + plan.name + ', coluna ' + (index + 1) + '. Nenhuma migração segura foi aplicada.');
        }
      });
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const idRange = sheet.getRange(2, plan.idColumn, lastRow - 1, 1);
        const ids = idRange.getValues();
        const records = sheet.getRange(2, 1, lastRow - 1, plan.idColumn - 1).getValues();
        const seen = Object.create(null);
        ids.forEach(function (row, index) {
          const idValue = String(row[0] || '').trim();
          if (idValue && seen[idValue]) throw new Error('ID duplicado encontrado em ' + plan.name + '. Migração interrompida.');
          if (idValue) seen[idValue] = true;
          if (!idValue && records[index].some(function (v) { return v !== '' && v !== null; })) {
            ids[index][0] = Utilities.getUuid();
          }
        });
        idRange.setValues(ids);
      }
      sheet.getRange(1, plan.idColumn).setValue('ID');
    });

    extraPlans.forEach(function (plan) {
      let sheet = ss.getSheetByName(plan.name);
      if (!sheet) sheet = ss.insertSheet(plan.name);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, plan.headers.length).setValues([plan.headers]);
      } else {
        const actual = sheet.getRange(1, 1, 1, plan.headers.length).getDisplayValues()[0];
        if (!plan.headers.every(function (h, i) { return String(actual[i] || '').trim() === h; })) {
          throw new Error('A aba ' + plan.name + ' já existe com cabeçalhos diferentes. Revise manualmente; não foi sobrescrita.');
        }
      }
    });
    return { ok: true, message: 'Estrutura preparada. WRITE_ENABLED continua desativado.', schema: inspectSchema_(ss) };
  } finally {
    lock.releaseLock();
  }
}

function saveRecord_(ss, email, payload) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_MIGRATION_APPROVED') !== 'true') {
    throw codedError_('A migração do esquema ainda não foi autorizada pelo proprietário.', 'SCHEMA_APPROVAL_REQUIRED');
  }
  if (props.getProperty('WRITE_ENABLED') !== 'true') {
    throw codedError_('Gravações ainda estão desativadas pelo administrador.', 'WRITE_DISABLED');
  }
  const schema = inspectSchema_(ss);
  if (!schema.coreReady) throw codedError_('A estrutura de IDs e Histórico ainda não está pronta.', 'SCHEMA_NOT_READY');

  const requestId = String(payload.requestId || '').trim();
  const entity = String(payload.entity || '');
  const operation = String(payload.operation || '');
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) throw codedError_('Identificador da requisição inválido.', 'INVALID_REQUEST');
  if (['transactions', 'payables', 'fixedExpenses'].indexOf(entity) === -1 &&
      !((entity === 'weekly' && schema.weeklyReady) || (entity === 'goals' && schema.goalsReady))) {
    throw codedError_('Módulo não habilitado para gravação.', 'ENTITY_DENIED');
  }
  if (['create', 'update'].indexOf(operation) === -1) throw codedError_('Operação inválida.', 'INVALID_OPERATION');
  if (entity === 'transactions' && operation !== 'create') {
    throw codedError_('Movimentações são append-only; correções devem ser lançamentos de ajuste.', 'LEDGER_APPEND_ONLY');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const history = requiredSheet_(ss, APP.SHEETS.history);
    const previous = findRequest_(history, requestId);
    if (previous) return { ok: true, duplicate: true, id: previous.id, message: 'Requisição já processada.' };

    const target = requiredSheet_(ss, sheetName_(entity));
    const spec = recordSpec_(entity);
    const id = String(payload.id || Utilities.getUuid());
    const idColumn = spec.idColumn;
    const existingRow = findIdRow_(target, idColumn, id);
    let action = operation;
    let before = null;
    let after = normalizeRecord_(entity, payload.record || {});
    if (operation === 'create' && existingRow) {
      throw codedError_('Este ID já existe. A gravação foi interrompida.', 'DUPLICATE_ID');
    }
    if (operation === 'update') {
      if (!existingRow) throw codedError_('Registro não encontrado para atualização.', 'NOT_FOUND');
      before = target.getRange(existingRow, 1, 1, spec.dataColumns).getValues()[0].map(serializeCell_);
      if (entity === 'transactions') throw codedError_('Movimentações não podem ser editadas.', 'LEDGER_APPEND_ONLY');
      target.getRange(existingRow, 1, 1, spec.dataColumns).setValues([after]);
    } else {
      const newRow = after.slice();
      while (newRow.length < spec.dataColumns) newRow.push('');
      newRow[idColumn - 1] = id;
      target.appendRow(newRow);
    }

    appendHistory_(history, email, action, target.getName(), id, before, after, requestId);
    return { ok: true, duplicate: false, id: id, message: 'Registro salvo e auditado.' };
  } finally {
    lock.releaseLock();
  }
}

function normalizeRecord_(entity, r) {
  function num(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw codedError_('Valor inválido: ' + name, 'INVALID_VALUE');
    return n;
  }
  function date(value) {
    if (!value) return '';
    const s = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw codedError_('Data inválida.', 'INVALID_DATE');
    return new Date(s + 'T12:00:00');
  }
  if (entity === 'transactions') {
    if (!r.description || !r.direction || !r.date) throw codedError_('Preencha descrição, tipo e data.', 'INVALID_RECORD');
    if (['Entrada', 'Saída'].indexOf(r.direction) === -1) throw codedError_('Tipo de movimentação inválido.', 'INVALID_RECORD');
    return [date(r.date), String(r.direction), String(r.category || ''), String(r.description),
      num(r.amount, 'valor'), String(r.account || ''), String(r.notes || ''), ''];
  }
  if (entity === 'payables') {
    if (!r.description || !r.dueDate) throw codedError_('Preencha conta e vencimento.', 'INVALID_RECORD');
    return [date(r.dueDate), String(r.description), num(r.amount, 'valor'), String(r.category || ''),
      String(r.status || 'Pendente'), date(r.paymentDate), String(r.notes || ''), ''];
  }
  if (entity === 'fixedExpenses') {
    if (!r.description) throw codedError_('Informe a despesa fixa.', 'INVALID_RECORD');
    const day = Number(r.dueDay || 0);
    if (!Number.isInteger(day) || day < 0 || day > 31) throw codedError_('Dia de vencimento inválido.', 'INVALID_RECORD');
    return [String(r.description), String(r.category || ''), num(r.amount, 'valor'), day, String(r.notes || ''), ''];
  }
  if (entity === 'weekly') {
    if (!r.description || !r.date) throw codedError_('Preencha descrição e data.', 'INVALID_RECORD');
    return [String(r.id || ''), date(r.date), String(r.description), String(r.category || ''),
      num(r.amount, 'valor'), String(r.status || 'Planejado'), String(r.notes || '')];
  }
  if (entity === 'goals') {
    if (!r.description || num(r.target, 'meta') <= 0) throw codedError_('Informe uma meta e um valor alvo maior que zero.', 'INVALID_RECORD');
    const saved = num(r.saved || 0, 'acumulado');
    if (saved > Number(r.target)) throw codedError_('O acumulado não pode superar o valor alvo.', 'INVALID_RECORD');
    return [String(r.id || ''), String(r.description), num(r.target, 'meta'), saved, date(r.dueDate), String(r.notes || '')];
  }
  throw codedError_('Tipo de registro inválido.', 'ENTITY_DENIED');
}

function recordSpec_(entity) {
  const specs = {
    transactions: { dataColumns: 7, idColumn: 8 },
    payables: { dataColumns: 7, idColumn: 8 },
    fixedExpenses: { dataColumns: 5, idColumn: 6 },
    weekly: { dataColumns: 7, idColumn: 1 },
    goals: { dataColumns: 6, idColumn: 1 }
  };
  return specs[entity];
}

function sheetName_(entity) {
  return {
    transactions: APP.SHEETS.transactions,
    payables: APP.SHEETS.payables,
    fixedExpenses: APP.SHEETS.fixedExpenses,
    weekly: APP.SHEETS.weekly,
    goals: APP.SHEETS.goals
  }[entity];
}

function findIdRow_(sheet, column, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const found = sheet.getRange(2, column, lastRow - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}

function findRequest_(history, requestId) {
  const lastRow = history.getLastRow();
  if (lastRow < 2) return null;
  const found = history.getRange(2, 8, lastRow - 1, 1)
    .createTextFinder(requestId).matchEntireCell(true).findNext();
  if (!found) return null;
  return { id: String(history.getRange(found.getRow(), 5).getDisplayValue() || '') };
}

function appendHistory_(history, email, action, sheet, id, before, after, requestId) {
  history.appendRow([new Date(), email, action, sheet, id,
    before === null ? '' : JSON.stringify(before), JSON.stringify(after), requestId]);
}

function authorizationPage_(email) {
  const safeEmail = escapeHtml_(email);
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font:16px Arial,sans-serif;padding:32px;max-width:640px;margin:auto">' +
    '<h2>Google autorizado</h2><p>Conta validada: <strong>' + safeEmail + '</strong></p>' +
    '<p>Volte ao painel Financeiro Emanuel &amp; Laysa e clique em <strong>Sincronizar</strong>.</p>' +
    '<p>Nenhum dado foi alterado.</p></body></html>'
  ).setTitle(APP.NAME);
}

function authorizationErrorPage_(message) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta charset="utf-8"></head><body style="font:16px Arial;padding:32px">' +
    '<h2>Não foi possível autorizar</h2><p>' + escapeHtml_(message) + '</p></body></html>'
  ).setTitle(APP.NAME);
}

function bridge_(p, result) {
  const nonce = JSON.stringify(String(p.nonce || '')).replace(/</g, '\\u003c');
  const origin = JSON.stringify(String(p.origin || '')).replace(/</g, '\\u003c');
  const body = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    'window.parent.postMessage({channel:' + JSON.stringify(APP.CHANNEL) +
    ',nonce:' + nonce + ',result:' + body + '},' + origin + ');' +
    '</script><p>Retorno enviado ao painel.</p></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(APP.NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function codedError_(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function safeMessage_(err) {
  return String(err && err.message ? err.message : 'Falha de autorização ou leitura.').slice(0, 240);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
