# CLAUDE.md — sankhya-dashboards-kit

Dashboards HTML5 para o Construtor de Componentes de BI do Sankhya. Guia completo de uso: `README.md`.

- `npm run dev -- <nome>`: proxy local (`proxy/`, lê o `.env`) + Vite. `npm run build -- <nome>`: gera `dist-sankhya/<nome>.zip` com `index.jsp`.
- Dados só por `dashboards/shared/dados.js` (`consultarSQL`, `consultarPaginado`); valores de filtro sempre via `sqlTexto`/`sqlNumero`/`sqlData`/`sqlLista`. Limite de 5.000 linhas por chamada. Não use `JX.consultar` direto (devolve `[]` em erro).
- Parâmetros: declare em `dashboards/<nome>/parametros.json` (MAIÚSCULAS, valores = mock de dev) e leia com `lerParametros()`.
- Nunca JS/CSS inline no `index.html` (o `.jsp` interpreta `${}`).

Regras de segurança (obrigatórias):
1. Credenciais só no `.env`, lidas só por `proxy/` e pela varredura do build. `dashboards/` nunca lê o `.env` nem usa `import.meta.env.VITE_*` para segredos.
2. Não afrouxe o proxy: só `127.0.0.1`, uma instrução `SELECT`/`WITH`, sem DML/DDL, `Host` só localhost.
3. Não desligue nem contorne as varreduras de `build/empacotar.mjs`.
4. Dashboards são somente leitura: nada de `JX.salvar`, `JX.deletar`, `JX.acionarBotao` sem pedido explícito.
5. SankhyaJX só fixado por commit, com hash em `dashboards/shared/JX_VERSAO.md`.
6. ECharts: importe de `echarts/core` só o que usar.
