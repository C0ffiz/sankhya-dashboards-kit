# Stacks

Cada dashboard diz a sua stack no `dashboard.json`. Empacotamento, verificação, diagnóstico e emulador são os mesmos para todas.

| | `vite` (padrão) | `html` | `jsp` |
|---|---|---|---|
| Para quê | Dashboards novos: JS + Tailwind + ECharts | Dashboard feito com outra ferramenta (React, Vue, Svelte, gerador próprio) | Quando o SQL precisa rodar no servidor, ou o painel já é um JSP |
| Onde roda o SQL | Navegador, com a sessão do usuário (`DbExplorerSP`) | Navegador (como no vite) ou como a sua stack fizer | **Servidor** (`<snk:query>`): o navegador recebe só o resultado |
| Permissão do usuário logado | Precisa poder consultar pelo navegador (teste T4) | Igual ao vite | Não depende disso |
| Preview com dados reais | Sim (`npm run dev`) | Sim, com o servidor de dev da sua stack + proxy do kit | Não: só no ERP (base de testes) |
| Entrada no ERP | `painel.jsp`, gerado do `index.html` | `painel.jsp`, gerado do `index.html` da sua build | O seu `.jsp` |
| Criar | `npm run novo -- x` | `npm run novo -- x --stack html` | `npm run novo -- x --stack jsp` |

**Qual usar?** Comece pela `vite`. Use `jsp` se o diagnóstico mostrar que os usuários não conseguem consultar pelo navegador (T4 falha e T5 funciona), ou se você já tem um painel em JSP. Use `html` para trazer um front-end que já existe.

## `dashboard.json`

```json
{
  "stack": "vite",
  "entrada": "painel.jsp",
  "build": "npm run build",
  "dev": "npm run dev",
  "pasta": "dist",
  "ignorar": ["fontes", "build_preview.py"],
  "jx": true
}
```

| Campo | Stacks | Padrão | O que é |
|---|---|---|---|
| `stack` | todas | `vite` | `vite`, `html` ou `jsp`. Sem `dashboard.json`, uma pasta com `index.html` é `vite`. |
| `entrada` | todas | `painel.jsp` | Nome do arquivo de entrada no `.zip`: é o `entryPoint` do XML do componente. **Nunca `index.jsp`** (o ERP responde "Internal Server Error"). |
| `build` | html, jsp | — | Comando que gera os arquivos antes de empacotar, rodado na pasta do dashboard. |
| `dev` | html | — | Comando do servidor de desenvolvimento da sua stack, rodado junto com o proxy do kit. |
| `pasta` | html, jsp | `dist` (html), `.` (jsp) | Pasta, relativa ao dashboard, com os arquivos a empacotar. |
| `ignorar` | html, jsp | — | Arquivos/pastas que ficam fora do `.zip`. Já ficam fora sempre: `dashboard.json`, `parametros.json`, `README.md`, `node_modules`, ocultos. |
| `jx` | vite, html | `true` | Incluir o SankhyaJX no pacote (`assets/jx.min.js`). |

## Stack `vite`

Guia completo em [Criar um dashboard](criar-dashboard.md). O build converte `index.html` em `painel.jsp`:

- acrescenta a diretiva JSP, a taglib da Sankhya, `<snk:load/>`, os parâmetros e o SankhyaJX;
- troca `./assets/x` por `${BASE_FOLDER}assets/x` (caminho relativo não carrega no ERP);
- recusa qualquer `${...}`/`#{...}` além dos parâmetros e de `${BASE_FOLDER}`, e qualquer `<% %>`.

## Stack `html`

Para um front-end feito com outra ferramenta:

1. Configure a ferramenta para gerar **caminhos relativos** (Vite: `base: './'`; Create React App: `"homepage": "."`; Angular: `--base-href ./`). O kit troca `./x` por `${BASE_FOLDER}x`.
2. Nada de JS/CSS inline no `index.html` gerado.
3. Preencha `build`, `pasta` e, se quiser preview com dados reais, `dev`.
4. Dados no dev: o `npm run dev -- x` sobe o proxy do kit em `http://127.0.0.1:8787` junto com o seu servidor. Encaminhe `/api` para ele e envie `POST /api/sql` com `{ "sql": "SELECT ..." }`. No ERP, consulte com o SankhyaJX (incluído como `assets/jx.min.js`). `runtime/dados.js` mostra como tratar a resposta.

## Stack `jsp`

Você escreve (ou gera) o JSP, e o servidor do ERP o executa. Exemplo completo em `modelos/jsp/painel.jsp`:

```jsp
<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c"%>
...
<link rel="stylesheet" href="${BASE_FOLDER}estilo.css">
<snk:load/>
...
<c:catch var="erro">
  <snk:query var="empresas">SELECT CODEMP, NOMEFANTASIA FROM TSIEMP</snk:query>
</c:catch>
<c:forEach items="${empresas.rows}" var="linha"> ${linha.NOMEFANTASIA} </c:forEach>
```

- **Arquivos do pacote** sempre por `${BASE_FOLDER}<arquivo>` (já termina em `/`).
- **Parâmetros do XML do componente:** `${ID}` no EL e `:ID` dentro do `<snk:query>`. Período (`datePeriod`): `:ID.INI` e `:ID.FIN`.
- **Erros de SQL:** envolva cada `<snk:query>` em `<c:catch var="...">` e mostre `${erro.message}`. Sem isso, um SQL errado derruba a página inteira com "Internal Server Error".
- JS e CSS inline são possíveis, mas qualquer `${` no meio deles será interpretado pelo servidor. Prefira arquivos, ou escreva o JS sem `${` (concatenação em vez de template literal).
- Painel gerado por um script próprio (por exemplo, um gerador em Python que monta um único `.jsp` com o SQL dentro): coloque o comando em `build` e a pasta de saída em `pasta`:

  ```json
  { "stack": "jsp", "entrada": "dashboard.jsp", "build": "python build_preview.py", "pasta": "saida" }
  ```

  Se o gerador já produz o `.zip`, confira com `npm run verificar -- caminho/painel.zip`.

O `npm run build` verifica o JSP (caminhos relativos, taglib declarada, entrada) e avisa sobre arquivos carregados da internet. O `npm run emular` executa o JSP com dados reais (`<snk:query>`, JSTL e parâmetros por `--param`; veja [debug e logs](debug-e-logs.md#1-antes-de-subir-emular-e-verificar)). Permissões e o JSP completo só a base de testes confirma.
