# Automação de Leads: Planilha -> BotConversa

Envia automaticamente para o BotConversa (WhatsApp) cada novo lead, criando
ou atualizando o contato, preenchendo campos customizados e, opcionalmente,
disparando um fluxo. Existem dois projetos Apps Script independentes neste
repositório, cada um instalado numa planilha diferente:

- **`apps-script/`** — leads do Google Site / LP, lançados direto na
  planilha (manualmente ou por integração externa que escreve a linha).
- **`apps-script-duplique-sc/`** — leads do site Duplique Santa Catarina,
  recebidos por **e-mail** e importados automaticamente para a planilha.

Ambos compartilham a mesma estrutura de colunas e a mesma lógica de envio ao
BotConversa — a diferença é só como a linha chega na planilha. Cada
planilha tem seu próprio projeto Apps Script (Extensões > Apps Script) e
suas próprias Propriedades do Script, então o token do BotConversa precisa
ser configurado em cada uma separadamente.

## Colunas esperadas na planilha

`Data | Assunto | Nome | Sobrenome | Telefone | E-mail | Cidade/Estado | Condomínio | Campo Texto | Status`

A coluna **Status** é criada/gerenciada automaticamente pelo script — é ela
que evita reenviar o mesmo lead (linha só é reprocessada se Status estiver
vazio).

O **Telefone** deve estar no formato `(DD)número`, ex: `(11) 98765-4321` ou
`(11)987654321`. O script remove a máscara e adiciona o código do país (55)
automaticamente.

## Instalação (Google Apps Script)

Repita esses passos em cada planilha, usando o `Code.gs`/`appsscript.json`
da pasta correspondente (`apps-script/` para o site/LP, `apps-script-duplique-sc/`
para o Duplique SC):

1. Na planilha, abra **Extensões > Apps Script**.
2. Copie o conteúdo do `Code.gs` da pasta correspondente para o arquivo
   `Code.gs` do projeto (substitua o conteúdo padrão).
3. Copie o conteúdo do `appsscript.json` da mesma pasta para o manifesto do
   projeto (ative "Mostrar arquivo de manifesto" em Configurações do
   projeto, se necessário).
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
   importação, etc). Use isso no projeto `apps-script/` (leads lançados
   direto na planilha).
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

## Leads recebidos por e-mail (apps-script-duplique-sc/)

Os leads do site Duplique Santa Catarina chegam por e-mail, com corpo no
formato:

```
Nome: ...
Email: ...
Telefone: ...
Condominio: ...
Unidade: ...
Aceite Termos: ...
Mensagem: ...
```

Mapeamento pra planilha: `Nome` → Nome, `Email` → E-mail, `Telefone` →
Telefone, `Condominio` → Condomínio, `Unidade` → Cidade/Estado, `Mensagem`
→ Campo Texto. O **Assunto** do e-mail vira a coluna Assunto.

O filtro usado para identificar esses e-mails é pelo **assunto**, não pelo
remetente: o script busca e-mails cujo assunto contenha os termos
`"Lead Site Duplique"` e `"Automação"` (configurável em
`EMAIL_DUPLIQUE_ASSUNTO_TERMOS`, no topo do `Code.gs`).

Isso só funciona se a planilha e a caixa de e-mail onde esses leads chegam
pertencerem à **mesma conta Google** que roda o Apps Script, já que ele lê
o Gmail dessa conta.

Ative pelo menu **BotConversa > Ativar leitura automática de e-mails
(Duplique SC)** — verifica a caixa de entrada a cada 5 minutos, lança cada
e-mail novo como uma linha na aba Leads (reaproveitando toda a lógica de
envio ao BotConversa) e marca o e-mail com o marcador
`BotConversa/Processado` pra nunca reprocessar o mesmo lead. Também dá pra
rodar uma vez manualmente pelo menu **BotConversa > Processar e-mails do
Duplique SC agora**.

## Segurança

O token do BotConversa nunca é gravado no código-fonte — ele é lido de
`PropertiesService.getScriptProperties()`, configurado via o menu
**BotConversa > Configurar token/flow/campos** diretamente na planilha.
