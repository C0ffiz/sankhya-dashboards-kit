# Consultas no servidor (sem DBExplorer)

Dashboards das stacks `vite` e `html` consultam pelo navegador (`JX.post` → `DbExplorerSP.executeQuery`). Esse serviço usa a permissão do **usuário logado**: quem não tem acesso ao DBExplorer abre o dashboard, mas as consultas falham (no diagnóstico, T4 falha).

**Não libere o DBExplorer para todos:** ele permite consultar qualquer tabela. Declare as consultas do dashboard para rodarem **no servidor** (`<snk:query>`), como nos dashboards da stack `jsp`.

## Como funciona

1. O dashboard declara o SQL num módulo, com nome para cada consulta.
2. O `npm run build` gera `dados.jsp` no pacote, com uma `<snk:query>` por consulta.
3. No navegador, `consultarServidor('itens', { ... })` pede a consulta **pelo nome**. O SQL não sai do pacote.

```
painel.jsp ──fetch──▶ html5component.mge?entryPoint=dados.jsp&q=itens&DTINI=20261001&CODEMP=1&CODEMP=2
                       └─ <snk:query> no servidor (SQL fixo) ─▶ linhas
```

## 1. Declare as consultas

`dashboards/vendas/consultas-servidor.mjs`:

```js
export default {
  pedidos: {
    sql: `SELECT CAB.NUNOTA, CAB.CODPARC, CAB.VLRNOTA, TO_CHAR(CAB.DTNEG, 'YYYY-MM-DD') AS DTNEG
            FROM TGFCAB CAB
           WHERE CAB.TIPMOV = 'P' AND CAB.DTNEG >= :DTINI AND CAB.DTNEG < :DTFIM + 1
             /*SE CODEMP*/ AND CAB.CODEMP IN (:CODEMP) /*FIM*/`,
    parametros: { DTINI: 'data', DTFIM: 'data', CODEMP: 'lista' },
    paginar: 'NUNOTA',                 // opcional: páginas de 5.000 linhas, nessa ordem
  },
  parceiros: {
    sql: 'SELECT CODPARC, NOMEPARC FROM TGFPAR WHERE CODPARC IN (:CODIGOS)',
    parametros: { CODIGOS: 'lista' },
  },
  empresas: 'SELECT CODEMP, NOMEFANTASIA FROM TSIEMP', // sem parâmetros: só o texto
};
```

E no `dashboard.json`:

```json
{ "stack": "vite", "entrada": "painel.jsp", "consultasServidor": "consultas-servidor.mjs" }
```

| Tipo | No SQL | Valor no navegador |
|---|---|---|
| `data` | `:DTINI` → `TO_DATE('20261001', 'YYYYMMDD')` | `Date`, `'2026-10-01'` ou `'01/10/2026'` |
| `numero` | `:COD` → `123` | número |
| `lista` | `:CODEMP` → `1,2,3` (vazia → `NULL`) | array de números |

- `/*SE X*/ ... /*FIM*/`: o trecho só entra no SQL quando `X` foi enviado (ex.: filtro de empresa opcional).
- `:X` dentro de texto entre aspas (`'HH24:MI'`) não é parâmetro.
- O build recusa: SQL que não começa com `SELECT`/`WITH`, `;`, `${`, `<%`, tags JSP, parâmetro não declarado.

## 2. Chame no dashboard

```js
import { consultarServidor, consultarServidorLote } from 'sankhya-kit/dados.js';

const pedidos = await consultarServidor('pedidos', { DTINI: '2026-10-01', DTFIM: '2026-10-31', CODEMP: [1, 2] });
const { parceiros, empresas } = await consultarServidorLote(['parceiros', 'empresas'], { CODIGOS: [10, 20] });
// lote: cada uma falha isolada → { parceiros: { linhas, erro }, empresas: { linhas, erro } }
```

- Os valores chegam como **texto**, como no JSTL. Converta as colunas que for usar como número (`Number(l.VLRNOTA)`). Para datas, use `TO_CHAR` no SQL.
- Consultas com `paginar` são buscadas página a página (padrão: até 50.000 linhas; `{ maximo, aoProgresso }`).
- Listas grandes (ex.: códigos de cadastro) vão na URL: envie em blocos de até ~300 valores por chamada.

## Segurança

- O SQL fica fixo no pacote. Do navegador vêm só o nome da consulta e os valores.
- Todo valor passa pelo JSP como número (`${v + 0}` no EL). Texto não numérico (`1) OR (1=1`, `'`) dá erro e a consulta não roda. Isso vale qualquer que seja a forma como o `<snk:query>` liga os parâmetros.
- Quem abre o componente vê o que as consultas trazem, como em qualquer dashboard da stack `jsp`. Não declare consultas que tragam mais do que o dashboard precisa.

## Testar

- `npm run dev -- vendas`: o proxy local executa o mesmo `dados.jsp` (`/api/dados`).
- `npm run emular -- vendas`: o pacote como o ERP serve.
- No ERP: `npm run diagnostico -- vendas`, aberto **com o usuário sem DBExplorer**. O **T6** testa exatamente esse caminho e confere que um valor não numérico é recusado.

Diferenças entre o dev/emulador e o ERP: veja [debug e logs](debug-e-logs.md#1-antes-de-subir-emular-e-verificar). No dev, cada consulta sem `paginar` traz no máximo 5.000 linhas (limite da API). No ERP, o `<snk:query>` não tem esse limite.
