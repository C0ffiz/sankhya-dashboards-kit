# Criar um dashboard (stack vite)

A stack `vite` é a padrão: você desenvolve com preview ao vivo e dados reais do ERP, e o build gera o `.zip`. Para outras ferramentas ou SQL no servidor, veja [Stacks](stacks.md).

```bash
npm run novo -- vendas      # cria dashboards/vendas/
npm run dev -- vendas       # preview com dados reais
npm run build -- vendas     # dist-sankhya/vendas.zip
```

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Só HTML. Carrega o JS com `<script type="module" src="./main.js"></script>`. **Sem JS nem CSS inline** (veja abaixo). |
| `main.js` | A lógica. Importe o CSS com `import './style.css'`. |
| `style.css` | Começa com `@import "tailwindcss" source("./");` |
| `parametros.json` | Parâmetros do ERP (opcional). |
| `dashboard.json` | Stack e nome da entrada no ERP (`painel.jsp`). |

> **Por que nada inline no `index.html`:** ele vira `painel.jsp`, que o servidor processa, e trechos como `${...}` seriam interpretados como expressão. Em `assets/*.js` isso não acontece. O build recusa expressões inesperadas.

## Consultar dados

```js
import { consultarSQL, consultarPaginado, sqlNumero, sqlData, sqlTexto, sqlLista } from 'sankhya-kit/dados.js';

const linhas = await consultarSQL(`
  SELECT CODPARC, NOMEPARC
    FROM TGFPAR
   WHERE CODPARC = ${sqlNumero(10)}
`);
// → [{ CODPARC: 10, NOMEPARC: '...' }]
```

- `consultarSQL(sql)` devolve `[{ COLUNA: valor }]` e **lança `Error`** com a mensagem do Oracle/Sankhya se o SQL falhar.
- O serviço devolve no máximo **5.000 linhas por chamada**. Para mais, use `consultarPaginado(sql, 'COL1, COL2')`, informando colunas que identificam a linha. Se parar no teto (50.000 por padrão), o array vem com `.parcial === true`.
- **Sempre** insira valores de filtro com `sqlTexto`, `sqlNumero`, `sqlData` (`'DD/MM/AAAA'` ou `'AAAA-MM-DD'`) e `sqlLista` (números para `IN (...)`). Nunca concatene valor cru no SQL.
- Prefira `TO_CHAR(campo, 'DD/MM/YYYY')` no SELECT para datas.
- Só `SELECT` e `WITH`. Os dashboards são somente leitura.
- Não use `JX.consultar` direto: ele devolve `[]` quando o SQL falha, sem avisar.

`sankhya-kit/...` aponta para a pasta `runtime/` do kit. Funciona com o kit clonado e com o kit instalado como dependência.

**De onde vêm os dados:**

| Ambiente | Caminho |
|---|---|
| `npm run dev` | navegador → `/api/sql` → proxy local → API do Sankhya, com as credenciais do `.env` |
| No ERP | navegador → SankhyaJX (`JX.post`) → `/mge/service.sbr` (`DbExplorerSP.executeQuery`), com a sessão do usuário logado |

No ERP, quem consulta é o **usuário logado**. Se ele não tiver permissão para esse serviço, a consulta falha (o teste T4 do [diagnóstico](debug-e-logs.md) mostra isso). Para esses usuários, use a stack `jsp`.

## Parâmetros do ERP

Declare em `parametros.json`, com nomes em MAIÚSCULAS. Os valores são o **mock usado no dev**:

```json
{ "CODEMP": "1", "DTINI": "01/11/2026", "DTFIM": "30/11/2026" }
```

```js
import { lerParametros } from 'sankhya-kit/parametros.js';
const { CODEMP, DTINI } = lerParametros(); // vazio ou ausente → null
```

- No dev, a URL sobrescreve o mock: `http://127.0.0.1:5173/?CODEMP=2`.
- No ERP, o build gera `<meta ... content="${CODEMP}">` e o servidor preenche com o parâmetro de mesmo `id` declarado no XML do componente ([Publicar no ERP](publicar-no-erp.md#parâmetros)).
- Parâmetro não declarado no XML chega vazio, sem erro.

## Abrir uma tela do ERP a partir do dashboard

```js
import { abrirTela, TELAS } from 'sankhya-kit/erp.js';

const r = abrirTela(TELAS.CENTRAL_NOTAS, { NUNOTA: 123 });
if (!r.ok) mostrarAviso(r.motivo); // fora do ERP (npm run dev) a função avisa em vez de abrir
```

Usa `window.openApp`, que o ERP oferece aos componentes HTML5. Só abre a tela; nada é gravado. `TELAS` traz Central de Notas, Parceiros, Produtos, Serviço e Movimentação Financeira. Para outra tela, descubra o `resourceID` no log de acessos (`TSIACM.RESOURCEID`).

## Gráficos (ECharts)

Importe de `echarts/core` só o que usar, para manter o pacote pequeno:

```js
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
```

## Ambiente atual

`import.meta.env.DEV` é `true` no `npm run dev` e `false` no pacote do ERP.

## Antes de subir no ERP

```bash
npm run build -- vendas
npm run emular -- vendas     # abre o pacote como o ERP abriria, com dados reais
```

Depois: [Publicar no ERP](publicar-no-erp.md).
