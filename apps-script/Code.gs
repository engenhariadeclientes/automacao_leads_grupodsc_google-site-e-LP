/**
 * Automação de leads: planilha -> BotConversa.
 *
 * Configuração (Extensões > Propriedades do script, ou rode configurarPropriedades()):
 *   BOTCONVERSA_TOKEN        (obrigatório) chave "API-KEY" / Webhook Integration do BotConversa
 *   BOTCONVERSA_FLOW_ID      (opcional) ID numérico do fluxo a disparar após criar o contato
 *   BOTCONVERSA_CUSTOM_FIELDS (opcional) JSON mapeando coluna da planilha -> ID do custom field
 *                             no BotConversa, ex:
 *                             {"Campo Texto":"123","Assunto":"124","Cidade/Estado":"125","Condomínio":"126","E-mail":"127"}
 */

var SHEET_NAME = 'Leads'; // ajuste se a aba tiver outro nome
var BOTCONVERSA_BASE_URL = 'https://backend.botconversa.com.br/api/v1/webhook';

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

function enviarCustomFields_(token, subscriberId, linha) {
  var mapaJson = PropertiesService.getScriptProperties().getProperty('BOTCONVERSA_CUSTOM_FIELDS');
  if (!mapaJson) return;

  var mapa = JSON.parse(mapaJson);
  var valoresPorColuna = {
    'Assunto': linha[COL.ASSUNTO - 1],
    'E-mail': linha[COL.EMAIL - 1],
    'Cidade/Estado': linha[COL.CIDADE_ESTADO - 1],
    'Condomínio': linha[COL.CONDOMINIO - 1],
    'Campo Texto': linha[COL.CAMPO_TEXTO - 1]
  };

  Object.keys(mapa).forEach(function (nomeColuna) {
    var valor = valoresPorColuna[nomeColuna];
    if (valor === undefined || valor === '' || valor === null) return;
    var customFieldId = mapa[nomeColuna];
    chamarApi_('POST', '/subscriber/' + subscriberId + '/custom_fields/' + customFieldId + '/', token, {
      value: String(valor)
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
