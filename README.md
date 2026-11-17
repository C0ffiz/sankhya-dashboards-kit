# Sankhya Dashboards Kit

Kit para criar **dashboards HTML5 para o Construtor de Componentes de BI do Sankhya**.

- **Desenvolvimento:** você vê o dashboard no navegador com **dados reais** do seu ERP, com atualização ao vivo. Um proxy local usa as credenciais da API do Sankhya que ficam no seu `.env`.
- **Publicação:** o build gera um `.zip` com `index.jsp`, que você importa no Construtor de Componentes de BI. Dentro do ERP, o dashboard usa a **sessão do usuário logado** (via SankhyaJX). Nenhuma credencial vai no pacote.

Stack: JavaScript + Vite + Tailwind CSS v4 + Apache ECharts. Tudo é empacotado localmente, nada vem de CDN.

---

## 1. Pré-requisitos

- **Node.js 20.19 ou mais recente** (recomendado: 22 LTS). Confira com `node -v`.
- Acesso à **API do Sankhya** (gateway) com as credenciais da seção 3.
- Usuário no ERP com acesso ao **Construtor de Componentes de BI**, para publicar.

Não é preciso Python nem qualquer outra instalação.

## 2. Instalação

```bash
git clone <url-deste-repositorio>
```

```bash
cd sankhya-dashboards-kit
```

```bash
npm install
```

## 3. Configurar o `.env`

O `.env` guarda as credenciais da API. Ele só é lido pelo proxy local, na sua máquina, e **nunca** deve ir para o GitHub (já está no `.gitignore`).

1. Copie o modelo:

   ```bash
   cp .env.example .env
   ```

   No Windows (PowerShell): `Copy-Item .env.example .env`

2. Abra o `.env` e preencha:

   | Variável | O que é |
   |---|---|
   | `SANKHYA_BASE_URL` | Endereço da API, sem barra no final. Normalmente `https://api.sankhya.com.br`. |
   | `SANKHYA_CLIENT_ID` | Client ID do aplicativo cadastrado no Portal do Desenvolvedor Sankhya. |
   | `SANKHYA_CLIENT_SECRET` | Client Secret desse mesmo aplicativo. |
   | `SANKHYA_X_TOKEN` | Token de integração (X-Token) gerado no ERP para esse aplicativo. |

   Exemplo:

   ```env
   SANKHYA_BASE_URL=https://api.sankhya.com.br
   SANKHYA_CLIENT_ID=abc123...
   SANKHYA_CLIENT_SECRET=xyz789...
   SANKHYA_X_TOKEN=1a2b3c...
   ```

   Se você não tem essas credenciais, peça ao administrador do Sankhya da sua empresa. A autenticação é OAuth2 `client_credentials` no endpoint `/authenticate`, com o X-Token no cabeçalho.

   Dica: crie as credenciais de um usuário/aplicativo com **acesso só de leitura** às tabelas que os dashboards vão consultar.

3. Teste a conexão com o dashboard de exemplo:

   ```bash
   npm run dev -- exemplo
   ```

   O navegador abre em `http://127.0.0.1:5173` com a lista de empresas (`TSIEMP`) do seu ERP. Se aparecer um erro, veja a seção 9.

## 4. Comandos

Sempre rode na raiz do projeto.

| Comando | O que faz |
|---|---|
| `npm run novo -- <nome>` | Cria `dashboards/<nome>/` a partir do exemplo. |
| `npm run dev -- <nome>` | Sobe o proxy local e o Vite, com preview ao vivo e dados reais. |
| `npm run build -- <nome>` | Gera `dist-sankhya/<nome>.zip` para importar no ERP. |
| `npm run proxy` | Sobe só o proxy (raramente necessário). |

Exemplo:

```bash
npm run novo -- vendas
```

```bash
npm run dev -- vendas
```

```bash
npm run build -- vendas
```

## 5. Estrutura

```
.env.example                 modelo das credenciais (copie para .env)
proxy/                       proxy local SÓ de desenvolvimento (Node, sem dependências)
  servidor-dev.mjs             POST /api/sql → DbExplorerSP.executeQuery na API do Sankhya
  sankhya-cliente.mjs          login OAuth2 + requisições
  env.mjs                      leitor do .env
build/
  vite-config.mjs              configuração comum do Vite
  dev.mjs                      npm run dev
  empacotar.mjs                npm run build → index.jsp + assets + .zip + varreduras
  novo.mjs                     npm run novo
dashboards/
  shared/                      código comum: NÃO apague
    dados.js                     consultarSQL, consultarPaginado, sqlTexto, sqlNumero, sqlData, sqlLista
    parametros.js                lerParametros()
    jx.min.js + JX_VERSAO.md     SankhyaJX fixado por versão e hash
  exemplo/                     dashboard mínimo de referência
    index.html  main.js  style.css  parametros.json
dist-sankhya/                saída do build (não versionada)
```

**Para trazer um dashboard pronto**, coloque a pasta dele dentro de `dashboards/` (ex.: `dashboards/compras/`), com pelo menos `index.html`. O nome da pasta deve ser em letras minúsculas, sem espaço. Os imports de dados devem apontar para `../shared/dados.js` e `../shared/parametros.js`.

## 6. Criando um dashboard

### Arquivos

- `index.html`: só HTML. Carrega o JS com `<script type="module" src="./main.js"></script>`. **Não coloque JS nem CSS inline** (veja a seção 7).
- `main.js`: a lógica. Importe o CSS com `import './style.css'`.
- `style.css`: começa com `@import "tailwindcss" source("./");` e `@source "../shared";`.
- `parametros.json`: parâmetros do ERP (opcional).

### Consultando dados

```js
import { consultarSQL, consultarPaginado, sqlNumero, sqlData, sqlTexto, sqlLista } from '../shared/dados.js';

const linhas = await consultarSQL(`
  SELECT CODPARC, NOMEPARC
    FROM TGFPAR
   WHERE CODPARC = ${sqlNumero(10)}
`);
// → [{ CODPARC: 10, NOMEPARC: '...' }]
```

- `consultarSQL(sql)` devolve `[{ COLUNA: valor }]` e **lança `Error`** com a mensagem do Oracle/Sankhya se o SQL falhar.
- O serviço devolve no máximo **5.000 linhas por chamada**. Para mais, use `consultarPaginado(sql, 'COL1, COL2')`, informando colunas que identificam a linha. Se parar no teto (50.000 por padrão), o array vem com `.parcial === true`.
- **Sempre** insira valores de filtro com `sqlTexto`, `sqlNumero`, `sqlData` (`'DD/MM/AAAA'` ou `'AAAA-MM-DD'`) e `sqlLista` (lista de números para `IN (...)`). Nunca concatene valor cru no SQL.
- Para datas, prefira `TO_CHAR(campo, 'DD/MM/YYYY')` no SELECT.
- Só `SELECT` e `WITH` são aceitos. Os dashboards são somente leitura.

### Parâmetros do ERP

Declare em `parametros.json`, com nomes em MAIÚSCULAS. Os valores são o **mock usado no dev**:

```json
{ "CODEMP": "1", "DTINI": "01/11/2026", "DTFIM": "30/11/2026" }
```

Leia no `main.js`:

```js
import { lerParametros } from '../shared/parametros.js';
const { CODEMP, DTINI } = lerParametros(); // valor vazio ou ausente → null
```

- No dev, a URL sobrescreve o mock: `http://127.0.0.1:5173/?CODEMP=2&DTINI=01/10/2026`.
- No ERP, o build gera `<meta ... content="${CODEMP}">` no `index.jsp`, e o servidor preenche com o valor do parâmetro.
- Confira dentro do ERP o nome exato do parâmetro e o formato das datas que o Construtor de BI entrega.

### Gráficos (ECharts)

Importe de `echarts/core` só o que usar, para manter o pacote pequeno:

```js
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
```

### Ambiente atual

`import.meta.env.DEV` é `true` no `npm run dev` e `false` no pacote do ERP.

## 7. Publicando no ERP

```bash
npm run build -- <nome>
```

O build:

1. gera os arquivos com caminhos relativos (`./assets/...`);
2. transforma o `index.html` em `index.jsp`, com `<snk:load/>`, os parâmetros e o SankhyaJX;
3. **falha** se o `index.jsp` tiver qualquer `${...}`/`#{...}` além dos parâmetros declarados, ou algum `<% %>`;
4. **falha** se o `jx.min.js` não conferir com o hash de `JX_VERSAO.md`;
5. **falha** se algum arquivo do pacote contiver valores do seu `.env` ou marcadores de autenticação/proxy;
6. gera `dist-sankhya/<nome>.zip`, com `index.jsp` na raiz.

No Sankhya, abra o **Construtor de Componentes de BI**, crie um componente do tipo HTML5, importe o `.zip` e use `index.jsp` como arquivo de entrada.

> Por que não pode ter JS/CSS inline no HTML: o `.jsp` é processado pelo servidor e trechos como `${...}` seriam interpretados como expressão. Em `assets/*.js` isso não acontece.

## 8. Segurança

- As credenciais ficam **só** no `.env` e só são lidas pelo proxy (`proxy/`) e pela varredura do build. O código em `dashboards/` nunca lê o `.env` e não deve usar `import.meta.env.VITE_*` para segredos.
- O proxy escuta só em `127.0.0.1`, aceita uma única instrução `SELECT`/`WITH`, bloqueia comandos de escrita/DDL e rejeita requisições com `Host` diferente de localhost.
- Não desligue as varreduras do build. Se ele acusar um segredo, corrija a origem.
- O SankhyaJX é de terceiros ([wansleynery/SankhyaJX](https://github.com/wansleynery/SankhyaJX)). Para atualizar, baixe o arquivo de um commit específico (nunca `@main`), revise e atualize commit e hash em `dashboards/shared/JX_VERSAO.md`.
- Não use `JX.salvar`, `JX.deletar` ou `JX.acionarBotao` nos dashboards, a não ser que você realmente queira gravar no ERP.

## 9. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `Credenciais ausentes no .env: ...` | O `.env` não existe na raiz ou tem variável vazia. Refaça a seção 3. |
| `SANKHYA_BASE_URL precisa começar com https://` | URL sem `https://`. |
| `Falha na autenticação (HTTP 401/403)` | Client ID, Client Secret ou X-Token errados ou sem permissão. |
| `Falha ao contatar o Sankhya: fetch failed` | Sem internet, URL errada ou proxy/firewall corporativo bloqueando. |
| `Não foi possível usar a porta 8787` | Outro processo usa a porta. Feche-o ou rode com outra porta: `PORTA_PROXY=8788 npm run dev -- <nome>`. |
| `Informe o dashboard. Disponíveis: ...` | Nome errado ou pasta sem `index.html`. |
| Erro do Oracle (ex.: `ORA-00942`) | O SQL chegou ao ERP. Corrija a consulta ou a permissão do usuário da API. |
| No ERP, a consulta não traz nada | O usuário logado não tem acesso à tabela, ou a sessão expirou. |
| `expressões EL inesperadas no index.jsp` | Há `${...}` no `index.html`. Mova o conteúdo para o `.js`. |
