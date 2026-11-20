# Integração com Google Sheets — configuração

## Estado desta etapa
- Integração de leitura preparada para a estrutura informada.
- A planilha não foi alterada.
- Nenhum conteúdo financeiro foi copiado para o repositório.
- Escritas estão intencionalmente bloqueadas até aprovação das mudanças de esquema descritas abaixo.
- O Apps Script executa como o usuário que acessa o Web App; a própria permissão da planilha continua valendo.

## Por que Apps Script executando como o usuário
O projeto não usa uma chave de serviço nem senha compartilhada. Cada pessoa entra com a própria conta Google e autoriza o script. O script valida o e-mail numa lista permitida e abre a planilha com a identidade do usuário. A planilha deve permanecer compartilhada somente com os usuários autorizados.

## 1. Preparar o projeto Apps Script
1. Entre no Google com a conta proprietária da planilha.
2. Acesse https://script.google.com/ e crie um projeto independente.
3. Copie `apps-script/Code.gs` para o editor.
4. Em Configurações do projeto, habilite a exibição do arquivo de manifesto.
5. Substitua o manifesto pelo conteúdo de `apps-script/appsscript.json`.
6. Em **Configurações do projeto → Propriedades do script**, crie:
   - `SPREADSHEET_ID`: ID da planilha informado pelo proprietário.
   - `ALLOWED_EMAILS`: e-mails Google autorizados, separados por vírgula.
   - `APP_ORIGIN`: origem exata do painel, sem caminho. Ex.: `https://SEU_USUARIO.github.io`.
7. Salve o projeto.

## 2. Implantar como Web App
1. Clique em **Implantar → Nova implantação → Aplicativo da web**.
2. **Executar como:** usuário que acessa o aplicativo da web.
3. **Quem tem acesso:** contas Google (ou somente usuários da organização, se todos estiverem no mesmo Google Workspace).
4. Implante e copie a URL terminada em `/exec`.
5. Cada usuário permitido deve abrir a URL de autorização com a própria conta Google e aceitar as permissões solicitadas.
6. Não selecione "Executar como eu" para este modelo de segurança.

> Se o domínio Google Workspace bloquear Web Apps externos ou a política não disponibilizar a opção de contas Google, será necessário ajustar a política do administrador ou adotar outra arquitetura autenticada.

## 3. Configurar o painel
1. Publique o painel apenas depois de validar a autenticação e as permissões.
2. Abra o painel e clique em **Conectar Google**.
3. Na primeira utilização, informe a URL terminada em `/exec` do Apps Script e o ID da planilha. A origem do site é preenchida automaticamente.
4. Esses três valores de configuração (URL, ID e origem) são armazenados localmente no navegador. Eles não são tokens nem senhas; nenhum token OAuth é salvo pelo painel. Também é possível usar `config.example.js` como modelo local, copiando para `config.js`, que está no `.gitignore`.
5. O painel chama o Apps Script por um iframe de retorno com nonce; a origem é validada pelo script.
6. A primeira autorização abre uma página Google para consentimento. Depois, retorne ao painel e clique em **Sincronizar**.

## 4. Estrutura atual lida (somente leitura)
- `Resumo!A2:B17`
- `Movimentações!A:G`
- `Contas a pagar!A:G`
- `Despesas fixas!A:E`

A leitura considera a linha 1 como cabeçalho nas três abas de registros e começa na linha 2. Datas são serializadas como `yyyy-MM-dd`. A aba Resumo é lida como valores calculados.

## 5. Alterações propostas antes de habilitar gravação
**Nenhuma destas alterações foi feita. Precisamos da sua aprovação.**

| Aba | Alteração proposta | Motivo |
|---|---|---|
| Movimentações | Coluna H: `ID` | Identificador estável e deduplicação |
| Contas a pagar | Coluna H: `ID` | Atualização segura sem depender do número da linha |
| Despesas fixas | Coluna F: `ID` | Atualização segura das despesas recorrentes |
| Nova aba `Histórico` | Data/hora, usuário, ação, aba, ID, valores anteriores e novos | Auditoria de alterações |

O script de escrita deverá usar `LockService`, validar IDs sob bloqueio e registrar cada alteração no Histórico. Movimentações financeiras devem ser tratadas como livro-razão: não apagar registros históricos; correções devem gerar estorno/lançamento de ajuste. A exclusão de contas/despesas poderá ser lógica ou auditada.

**Sem IDs, duas transações legítimas iguais podem ser confundidas com duplicidade; sem bloqueio, dois usuários podem gravar simultaneamente.** Por isso, gravação está bloqueada por padrão nesta versão.

## 6. Itens que ainda precisam de definição
- Confirmar os e-mails Google exatos autorizados (não enviar senhas).
- Aprovar ou ajustar as colunas de ID e a aba Histórico.
- Confirmar se a linha 1 contém os cabeçalhos.
- Definir onde serão armazenadas metas e planejamento semanal: hoje não existem abas correspondentes na estrutura informada.
- Definir a regra para despesas variáveis: a proposta é derivá-las das movimentações do tipo Saída; despesas fixas vêm da aba própria.
- Testar leitura e permissões com as duas contas antes de habilitar qualquer gravação.

## Segurança e publicação
Não publique o painel com dados reais até testar a restrição de acesso com uma conta autorizada e outra não autorizada. O repositório público contém apenas código e placeholders. A URL do Web App e o ID da planilha não são senhas, mas devem ser tratados com cuidado operacional.
