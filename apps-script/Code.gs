/**
 * Automação de leads: planilha -> BotConversa.
 *
 * Configuração (Extensões > Propriedades do script, ou rode configurarPropriedades()):
 *   BOTCONVERSA_TOKEN          (obrigatório) chave "API-KEY" / Webhook Integration do BotConversa
 *   BOTCONVERSA_FLOW_ID        (opcional) ID numérico do fluxo a disparar após criar o contato
 *   BOTCONVERSA_CUSTOM_FIELD_IDS (opcional) JSON para sobrescrever os IDs padrão definidos em
 *                               CUSTOM_FIELD_IDS_PADRAO, caso algum campo seja recriado no BotConversa
 *                               e o ID mude, ex: {"REGIAO":"999999"}
 *
 * Campos customizados enviados ao BotConversa (contas já existentes na conta do cliente):
 *   Assunto            <- coluna Assunto
 *   Email              <- coluna E-mail
 *   REGIÃO             <- coluna Cidade/Estado
 *   Canal de Aquisição <- valor fixo "Site"
 *   RESUMO CONVERSA    <- texto montado a partir de Condomínio + Campo Texto
 */

var SHEET_NAME = 'Leads'; // ajuste se a aba tiver outro nome
var BOTCONVERSA_BASE_URL = 'https://backend.botconversa.com.br/api/v1/webhook';

var CUSTOM_FIELD_IDS_PADRAO = {
  ASSUNTO: 4084506,           // "Assunto"
  EMAIL: 4084536,             // "Email"
  REGIAO: 4952425,            // "REGIÃO"
  CANAL_AQUISICAO: 4957970,   // "Canal de Aquisição"
  RESUMO_CONVERSA: 4952418    // "RESUMO CONVERSA"
};

var COL = {
  DATA: 1,
  ASSUNTO: 2,
  NOME: 3,
  SOBRENOME: 4,
  TELEFONE: 5,
  EMAIL: 6,
  CIDADE_ESTADO: 7,
  CONDOMINIO: 8,
  CAMPO_TEXTO: 9,
  STATUS: 10
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BotConversa')
    .addItem('Processar leads pendentes agora', 'processarLeadsPendentes')
    .addItem('Ativar envio automático (trigger)', 'ativarTriggerAutomatico')
    .addItem('Configurar token/flow/campos', 'configurarPropriedades')
    .addToUi();
}

/** Roda uma vez para guardar as credenciais com segurança (não fica no código-fonte). */
function configurarPropriedades() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var tokenResp = ui.prompt('Token do BotConversa (API-KEY)', ui.ButtonSet.OK_CANCEL);
  if (tokenResp.getSelectedButton() !== ui.Button.OK) return;
  var token = tokenResp.getResponseText().trim();
  if (token) props.setProperty('BOTCONVERSA_TOKEN', token);

  var flowResp = ui.prompt('ID do fluxo a disparar (deixe em branco para não disparar fluxo)', ui.ButtonSet.OK_CANCEL);
  if (flowResp.getSelectedButton() === ui.Button.OK) {
    var flow = flowResp.getResponseText().trim();
    if (flow) {
      props.setProperty('BOTCONVERSA_FLOW_ID', flow);
    } else {
      props.deleteProperty('BOTCONVERSA_FLOW_ID');
    }
  }

  ui.alert('Configuração salva. Use o menu "BotConversa > Ativar envio automático (trigger)" para ligar o envio automático.');
}

/** Cria o trigger instalável que dispara o envio sempre que a planilha muda (nova linha, colar, etc). */
function ativarTriggerAutomatico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'processarLeadsPendentes' && t.getEventType() === ScriptApp.EventType.ON_CHANGE;
  });
  if (!jaExiste) {
    ScriptApp.newTrigger('processarLeadsPendentes').forSpreadsheet(ss).onChange().create();
  }
  garantirColunaStatus_();
  SpreadsheetApp.getUi().alert('Envio automático ativado.');
}

function garantirColunaStatus_() {
  var sheet = getSheet_();
  var header = sheet.getRange(1, COL.STATUS).getValue();
  if (header !== 'Status') {
    sheet.getRange(1, COL.STATUS).setValue('Status');
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

/** Varre a planilha e envia ao BotConversa toda linha que ainda não tem Status preenchido. */
function processarLeadsPendentes() {
  garantirColunaStatus_();
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var numCols = COL.STATUS;
  var dados = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  for (var i = 0; i < dados.length; i++) {
    var linha = dados[i];
    var status = linha[COL.STATUS - 1];
    var telefone = linha[COL.TELEFONE - 1];
    var rowIndex = i + 2;

    if (status) continue; // já processada
    if (!telefone) continue; // linha sem telefone, ignora

    try {
      enviarLeadParaBotConversa_(linha);
      sheet.getRange(rowIndex, COL.STATUS).setValue('Enviado em ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
    } catch (err) {
      sheet.getRange(rowIndex, COL.STATUS).setValue('Erro: ' + err.message);
    }
  }
}

function enviarLeadParaBotConversa_(linha) {
  var token = PropertiesService.getScriptProperties().getProperty('BOTCONVERSA_TOKEN');
  if (!token) throw new Error('BOTCONVERSA_TOKEN não configurado. Use o menu BotConversa > Configurar token/flow/campos.');

  var telefone = normalizarTelefone_(linha[COL.TELEFONE - 1]);
  var nome = String(linha[COL.NOME - 1] || '').trim();
  var sobrenome = String(linha[COL.SOBRENOME - 1] || '').trim();

  var subscriber = chamarApi_('POST', '/subscriber/', token, {
    phone: telefone,
    first_name: nome,
    last_name: sobrenome,
    has_opt_in_whatsapp: true
  });

  var subscriberId = subscriber && (subscriber.id || subscriber.subscriber_id);
  if (!subscriberId) throw new Error('Resposta do BotConversa sem ID do subscriber: ' + JSON.stringify(subscriber));

  enviarCustomFields_(token, subscriberId, linha);

  var flowId = PropertiesService.getScriptProperties().getProperty('BOTCONVERSA_FLOW_ID');
  if (flowId) {
    chamarApi_('POST', '/subscriber/' + subscriberId + '/send_flow/', token, { flow: Number(flowId) });
  }
}

function obterCustomFieldIds_() {
  var overrideJson = PropertiesService.getScriptProperties().getProperty('BOTCONVERSA_CUSTOM_FIELD_IDS');
  if (!overrideJson) return CUSTOM_FIELD_IDS_PADRAO;

  var override = JSON.parse(overrideJson);
  var mesclado = {};
  Object.keys(CUSTOM_FIELD_IDS_PADRAO).forEach(function (chave) { mesclado[chave] = CUSTOM_FIELD_IDS_PADRAO[chave]; });
  Object.keys(override).forEach(function (chave) { mesclado[chave] = override[chave]; });
  return mesclado;
}

function construirResumoConversa_(linha) {
  var condominio = String(linha[COL.CONDOMINIO - 1] || '').trim() || 'não informado';
  var campoTexto = String(linha[COL.CAMPO_TEXTO - 1] || '').trim() || 'não informado';
  return 'Contato recebido por site, condomínio ' + condominio + ', assunto informado: ' + campoTexto;
}

function enviarCustomFields_(token, subscriberId, linha) {
  var ids = obterCustomFieldIds_();

  var envios = [
    { id: ids.ASSUNTO, valor: linha[COL.ASSUNTO - 1] },
    { id: ids.EMAIL, valor: linha[COL.EMAIL - 1] },
    { id: ids.REGIAO, valor: linha[COL.CIDADE_ESTADO - 1] },
    { id: ids.CANAL_AQUISICAO, valor: 'Site' },
    { id: ids.RESUMO_CONVERSA, valor: construirResumoConversa_(linha) }
  ];

  envios.forEach(function (item) {
    if (!item.id) return;
    if (item.valor === undefined || item.valor === null || item.valor === '') return;
    chamarApi_('POST', '/subscriber/' + subscriberId + '/custom_fields/' + item.id + '/', token, {
      value: String(item.valor)
    });
  });
}

function chamarApi_(metodo, caminho, token, corpo) {
  var response = UrlFetchApp.fetch(BOTCONVERSA_BASE_URL + caminho, {
    method: metodo,
    contentType: 'application/json',
    headers: { 'API-KEY': token },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });

  var codigo = response.getResponseCode();
  var texto = response.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error('BotConversa ' + metodo + ' ' + caminho + ' -> HTTP ' + codigo + ': ' + texto);
  }

  return texto ? JSON.parse(texto) : {};
}

/**
 * Converte telefone no formato "(DD)+número" (com ou sem espaços/traço) para
 * o padrão E.164 sem "+" exigido pelo BotConversa: 55DDNÚMERO.
 * Ex.: "(11) 98765-4321" -> "5511987654321"
 */
function normalizarTelefone_(valorBruto) {
  var apenasDigitos = String(valorBruto || '').replace(/\D/g, '');

  if (!apenasDigitos) {
    throw new Error('Telefone vazio ou inválido: "' + valorBruto + '"');
  }

  // remove um zero inicial de DDD (ex: (011) 98765-4321), se houver
  if (apenasDigitos.length === 11 && apenasDigitos[0] === '0') {
    apenasDigitos = apenasDigitos.substring(1);
  }

  var comCodigoPais;
  if (apenasDigitos.length === 10 || apenasDigitos.length === 11) {
    // DDD + número (fixo: 10 dígitos, celular: 11 dígitos)
    comCodigoPais = '55' + apenasDigitos;
  } else if ((apenasDigitos.length === 12 || apenasDigitos.length === 13) && apenasDigitos.indexOf('55') === 0) {
    // já veio com código do país
    comCodigoPais = apenasDigitos;
  } else {
    throw new Error('Telefone em formato inesperado: "' + valorBruto + '" (' + apenasDigitos.length + ' dígitos)');
  }

  return comCodigoPais;
}
