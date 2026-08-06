# Automação de Leads: Planilha -> BotConversa

Envia automaticamente para o BotConversa (WhatsApp) cada novo lead lançado na
planilha do Google Sheets (Google Site / LP), criando/atualizando o contato,
preenchendo campos customizados e, opcionalmente, disparando um fluxo.

## Colunas esperadas na planilha

`Data | Assunto | Nome | Sobrenome | Telefone | E-mail | Cidade/Estado | Condomínio | Campo Texto | Status`

A coluna **Status** é criada/gerenciada automaticamente pelo script — é ela
que evita reenviar o mesmo lead (linha só é reprocessada se Status estiver
vazio).

O **Telefone** deve estar no formato `(DD)número`, ex: `(11) 98765-4321` ou
`(11)987654321`. O script remove a máscara e adiciona o código do país (55)
automaticamente.

## Instalação (Google Apps Script)

1. Na planilha, abra **Extensões > Apps Script**.
2. Copie o conteúdo de `apps-script/Code.gs` para o arquivo `Code.gs` do
   projeto (substitua o conteúdo padrão).
3. Copie o conteúdo de `apps-script/appsscript.json` para o manifesto do
   projeto (ative "Mostrar arquivo de manifesto" em Configurações do projeto,
   se necessário).
4. Se a aba da planilha não se chamar `Leads`, ajuste a constante
   `SHEET_NAME` no topo do `Code.gs`.
5. Salve e recarregue a planilha (F5). Um novo menu **BotConversa** vai
   aparecer na barra de menus.
6. Menu **BotConversa > Configurar token/flow/campos**:
   - Cole o token do BotConversa (API-KEY / Webhook Integration).
   - Informe o ID do fluxo a disparar após criar o contato (opcional —
     deixe em branco se quiser apenas criar/atualizar o contato sem
     disparar fluxo).
   - O token fica salvo nas **Propriedades do Script** (não vai para o
     código-fonte nem é versionado no repositório).
7. Menu **BotConversa > Ativar envio automático (trigger)**: cria o gatilho
   que roda o script sempre que a planilha é alterada (nova linha, colar,
   importação, etc).
8. (Opcional) Menu **BotConversa > Processar leads pendentes agora**:
   dispara manualmente o envio de todas as linhas sem Status.

### Campos customizados enviados ao BotConversa

O script já envia automaticamente os seguintes custom fields (IDs já
cadastrados na conta do cliente, definidos em `CUSTOM_FIELD_IDS_PADRAO` no
topo do `Code.gs`):

| Campo no BotConversa | Origem |
| --- | --- |
| Assunto | coluna Assunto |
| Email | coluna E-mail |
| REGIÃO | coluna Cidade/Estado |
| Canal de Aquisição | valor fixo `"Site"` |
| RESUMO CONVERSA | texto montado: `Contato recebido por site, condomínio <Condomínio>, assunto informado: <Campo Texto>` |

Se algum desses campos for recriado no BotConversa e o ID mudar, não é
preciso editar o código: basta adicionar a propriedade de script
`BOTCONVERSA_CUSTOM_FIELD_IDS` (Extensões > Propriedades do projeto >
Propriedades do script) com um JSON só com os campos que mudaram, ex:

```json
{ "REGIAO": "999999" }
```

Chaves aceitas: `ASSUNTO`, `EMAIL`, `REGIAO`, `CANAL_AQUISICAO`, `RESUMO_CONVERSA`.

## Segurança

O token do BotConversa nunca é gravado no código-fonte — ele é lido de
`PropertiesService.getScriptProperties()`, configurado via o menu
**BotConversa > Configurar token/flow/campos** diretamente na planilha.
