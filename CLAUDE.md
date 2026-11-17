# CLAUDE.md — sankhya-dashboards-kit

Kit (público) para criar, empacotar, emular e depurar dashboards HTML5 do Construtor de Componentes de BI do Sankhya. Usado sozinho (clonado) ou como dependência de outros projetos: ver `docs/usar-como-dependencia.md`. Guia de uso: `README.md` e `docs/`.

## Mapa

- `bin/sankhya-dash.mjs`: CLI (`novo`, `dev`, `build`, `emular`, `verificar`, `diagnostico`, `proxy`). Os scripts npm só chamam ela.
- `lib/projeto.mjs`: `KIT` (raiz do kit) × `PROJETO` (cwd, onde estão `.env`, `dashboards/`, `dist-sankhya/`), manifesto `dashboard.json`.
- `lib/jsp.mjs`: regras do JSP executado pelo ERP (html→jsp, `${BASE_FOLDER}`, EL permitido, caminhos relativos).
- `lib/pacote.mjs`: monta o `.zip` (entradas de pasta + permissões Unix) e `verificarEntradas` (usado pelo build, `verificar` e `emular`).
- `lib/comandos/*.mjs`: um arquivo por comando. `emular.mjs` imita o `html5component.mge`.
- `lib/el.mjs` e `lib/jsp-emulado.mjs`: avaliador de `${...}` (sem `eval`) e intérprete do subconjunto de JSP usado no emulador (`snk:query`, JSTL `c:`, trecho `request.getAttribute`). Testes: `test/` (`npm test`).
- `lib/consultas-servidor.mjs`: gera `dados.jsp` (SQL fixo em `<snk:query>`, valores só numéricos) a partir do `consultasServidor` do dashboard; `runtime/dados.js` → `consultarServidor`. Usado pelo build, pelo dev (`/api/dados`) e pelo T6 do diagnóstico.
- `proxy/`: proxy de desenvolvimento (Node, sem dependências); `criarExecutor()` é usado pelo proxy e pelo emulador.
- `runtime/`: código que roda no navegador, importado como `sankhya-kit/<arquivo>.js` (alias no Vite).
- `modelos/`: modelos de dashboard (`vite`, `jsp`, `html`) e as páginas do diagnóstico (`modelos/diagnostico/`).

## Regras validadas no ERP (não regredir)

1. Entrada nunca `index.jsp` (o ERP responde 500). Padrão: `painel.jsp`.
2. Zip com entrada própria para cada pasta, antes dos arquivos (sem isso: 500).
3. Arquivos por `${BASE_FOLDER}<arquivo>`: relativo a `/mge/`, já termina em `/`. Caminho relativo `./` não carrega.
4. SankhyaJX é `class JX` global: `typeof JX`, nunca `window.JX`.
5. No ERP, a consulta pelo navegador (`DbExplorerSP`) usa a permissão do usuário logado; `<snk:query>` (stack jsp e `consultasServidor`) roda no servidor.

Ao descobrir um comportamento novo do ERP: registre em `docs/debug-e-logs.md` (erros conhecidos), cubra com verificação em `lib/pacote.mjs`/`lib/jsp.mjs` quando possível e anote no `CHANGELOG.md`.

## Regras de segurança (obrigatórias)

1. Credenciais só no `.env` do projeto, lidas só por `proxy/` e pela varredura de `lib/pacote.mjs`. Nada em `runtime/`, `modelos/` ou dashboards lê o `.env` ou usa `import.meta.env.VITE_*` para segredos.
2. Não afrouxe o proxy nem o emulador: só `127.0.0.1`, uma instrução `SELECT`/`WITH`, sem DML/DDL, `Host` só localhost.
3. Não desligue nem contorne as verificações e a varredura de segredos do pacote.
4. `dados.jsp`: o navegador nunca envia SQL, só o nome da consulta e valores convertidos a número no JSP. Não aceite texto livre nem SQL vindo do navegador.
5. Dashboards somente leitura: nada de `JX.salvar`, `JX.deletar`, `JX.acionarBotao` sem pedido explícito. `openApp` (só abre tela) é permitido.
6. SankhyaJX só fixado por commit, com hash em `runtime/JX_VERSAO.md` (conferido no build e no diagnóstico).
7. ECharts: importe de `echarts/core` só o que usar.
8. Repositório público: nenhum dado, nome ou endereço de empresa em código, docs, exemplos ou issues.

## Antes de publicar uma mudança

`npm test`. Em uma pasta de teste: `npm run novo -- x` (e `--stack jsp`), `npm run build -- x`, `npm run emular -- x`, `npm run diagnostico -- x`, `npm run verificar -- dist-sankhya/x.zip`. Atualize `CHANGELOG.md` e `version` no `package.json` (semver).
