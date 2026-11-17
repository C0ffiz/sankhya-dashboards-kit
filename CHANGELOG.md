# Changelog

Versionamento semântico. Projetos que usam o kit como dependência: veja [docs/usar-como-dependencia.md](docs/usar-como-dependencia.md).

## 2.1.0 — 2026-11-17

### Novo: o emulador executa o lado do servidor

- **`npm run emular`** executa o JSP com dados reais: `<snk:query>`, JSTL `c:` (`out`, `set`, `remove`, `if`, `choose`, `forEach`, `forTokens`, `catch`, `url`), expressões `${...}` e o trecho `<% if (request.getAttribute("X") != null) { out.print("..."); } %>`. Erro de consulta fora de `<c:catch>` dá 500, como no ERP. Recurso não suportado para com uma mensagem clara (nunca é ignorado).
- Parâmetros do componente por `--param NOME=valor` (repetível; `PERIODO.INI=...` para período), pela URL ou por `parametros.json` no dashboard. `${CODUSU_LOG}` e `${BASE_FOLDER}` preenchidos.
- **`openApp` simulado:** mostra um aviso na página e registra a tela e a chave no terminal. No diagnóstico, T3 mostra `openApp=function (emulado)` e T5 passa a rodar de verdade.
- Testes automáticos (`npm test`) do avaliador de expressões e do intérprete de JSP.
- Diferenças em relação ao ERP documentadas em [debug e logs](docs/debug-e-logs.md#1-antes-de-subir-emular-e-verificar).

## 2.0.0 — 2026-11-17

Primeira versão validada dentro de um ERP real. **Exige ajustes** em dashboards da versão 1 (seção "Migrar da 1.x").

### Corrigido: componente não abria no ERP ("Internal Server Error")

- A entrada padrão passa a ser **`painel.jsp`**. `index.jsp` não funciona como `entryPoint` (é o nome da página principal do ERP), e o kit agora o recusa.
- O `.zip` tem **uma entrada para cada pasta** (`assets/`) antes dos arquivos, com permissões Unix, no mesmo formato dos componentes da própria Sankhya. Sem isso, o ERP respondia 500.
- Arquivos referenciados por **`${BASE_FOLDER}assets/...`**. O caminho relativo `./assets/...` não carrega no ERP, porque a página é servida em `/mge/html5component.mge`.

### Novo

- **Stacks:** `vite` (padrão), `html` (qualquer ferramenta de front-end) e `jsp` (SQL no servidor com `<snk:query>`), escolhidas no `dashboard.json` de cada dashboard.
- **`npm run diagnostico`:** pacote de testes em camadas (t1–t5 + o dashboard) com a página `diagnostico.jsp`, que roda todos e gera um relatório para copiar.
- **`npm run emular`:** serve um `.zip` como o ERP serve, na sua máquina, com dados reais (500 para `index.jsp`, 404 para caminho relativo).
- **`npm run verificar`:** confere qualquer `.zip` (inclusive de fora do kit); `--consertar` refaz as entradas de pasta.
- **`sankhya-kit/erp.js`:** `abrirTela(TELAS.CENTRAL_NOTAS, { NUNOTA })` abre uma tela nativa no registro (`window.openApp`).
- O kit pode ser usado **como dependência** de outro projeto: CLI `sankhya-dash`, imports `sankhya-kit/...`.
- Uso automático do proxy corporativo (`HTTPS_PROXY`) pelo Node nos comandos que acessam a API.
- Documentação em `docs/`, incluindo o guia de [debug e logs](docs/debug-e-logs.md), e o modelo de issue "Problema no ERP".

### Migrar da 1.x

1. `dashboards/shared/` passou para `runtime/` no kit. Nos dashboards, troque os imports:
   `'../shared/dados.js'` → `'sankhya-kit/dados.js'` (o mesmo para `parametros.js`).
2. No `style.css`, remova a linha `@source "../shared";`.
3. Gere o `.zip` de novo e, **no XML do componente, troque `entryPoint="index.jsp"` por `entryPoint="painel.jsp"`**.
4. `build/` deu lugar a `bin/` + `lib/`. Os comandos `npm run dev|build|novo|proxy` continuam com os mesmos nomes.

## 1.0.0

Versão inicial: stack vite, proxy local em Node, build para `index.jsp` + `.zip`.
