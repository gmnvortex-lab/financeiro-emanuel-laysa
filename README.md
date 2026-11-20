# Financeiro Emanuel & Laysa

Aplicação responsiva para organização financeira doméstica, com identidade preta, vermelha e branca.

## Funcionalidades
- Dashboard calculado a partir dos lançamentos existentes.
- Contas a pagar: cadastro, edição, exclusão e status.
- Despesas fixas e variáveis.
- Movimentações de entrada e saída.
- Planejamento semanal.
- Metas com cálculo de progresso.
- Relatórios e exportação CSV.
- Busca e filtros por texto, situação/tipo e mês.
- Layout para celular e computador.

## Executar
Abra `index.html` em um navegador moderno. Não há dependências de build.

## Armazenamento atual
Os registros são gravados no `localStorage` do navegador. Não sincroniza dispositivos e não é criptografado. Limpar os dados do navegador pode apagá-los. Os indicadores começam zerados; nenhum lançamento de demonstração foi inserido. Não usar como base financeira definitiva até a integração segura.

## Integração com Google Sheets
GitHub Pages publica arquivos estáticos. Nunca inclua no repositório público senha, token OAuth, chave privada, segredo de API, conteúdo da planilha ou exportações financeiras.

Arquitetura recomendada:
1. Camada intermediária autenticada (por exemplo, Google Apps Script Web App) com validação de identidade e permissões.
2. Autorização e acesso à planilha realizados no servidor, nunca com segredo no JavaScript público.
3. Compartilhar a planilha apenas com a identidade de execução necessária.
4. Validar entradas no servidor e restringir os usuários autorizados.
5. Configurar endpoint público sem expor tokens nem dados pessoais.

Antes de conectar, precisamos conhecer apenas a estrutura das abas/colunas, definir autenticação e confirmar quem poderá acessar. Não envie senhas ou tokens no chat.

## GitHub Pages
Após os testes: Settings → Pages → Deploy from a branch → selecionar `desenvolvimento` e `/(root)` para homologação. A publicação ainda não foi ativada. Depois dos testes, decidir o merge para `main`/branch de produção.

## Testes pendentes
Testar CRUD e filtros em cada módulo, persistência após atualizar, cálculos, exportação CSV e responsividade em dispositivos reais. A autenticação e integração com a planilha ainda não foram implementadas.
## Google Sheets
A integração está preparada para leitura autenticada via Google Apps Script. A gravação permanece desativada até a aprovação das colunas de ID e da aba de auditoria. Consulte [INTEGRACAO-GOOGLE-SHEETS.md](INTEGRACAO-GOOGLE-SHEETS.md) para configurar o Apps Script, as contas autorizadas e o painel.

 
## Atualização do dashboard
Sincronização automática somente leitura ao abrir, a cada 30 segundos e ao retornar à aba. Escrita bloqueada até validação da identidade Google, escopos e migração. Para exibir a foto original, adicione-a sem alterações em assets/foto-perfil-emanuel-laysa.png.
