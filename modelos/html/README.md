# Dashboard com outra stack (stack "html")

Use quando o dashboard é feito com outra ferramenta (React, Vue, Svelte, Angular, um gerador próprio...)
que produz uma pasta com `index.html` + arquivos.

1. Coloque o projeto da sua stack nesta pasta (ou ajuste os comandos para onde ele estiver).
2. Ajuste o `dashboard.json`:
   - `build`: comando que gera a pasta final (rodado nesta pasta);
   - `pasta`: onde fica o `index.html` gerado (ex.: `dist`, `build`);
   - `dev`: comando do servidor de desenvolvimento da sua stack (opcional).
3. Configure sua stack para gerar caminhos **relativos** (ex.: Vite `base: './'`, CRA `"homepage": "."`):
   o kit troca `./x` por `${BASE_FOLDER}x` ao converter o `index.html` em `painel.jsp`.
4. Não coloque JS ou CSS inline no `index.html` (o servidor interpretaria `${...}`): tudo em arquivos.
5. `npm run build -- <nome>` gera o `.zip` verificado.

Dados reais no desenvolvimento: o `npm run dev -- <nome>` sobe o proxy do kit em `http://127.0.0.1:8787`
junto com o comando `dev` da sua stack. Encaminhe `/api` do seu servidor de dev para esse endereço e use
`POST /api/sql` com `{ "sql": "SELECT ..." }`. No ERP, consulte com o SankhyaJX (`runtime/jx.min.js` do kit,
incluído no pacote como `assets/jx.min.js`) — veja `runtime/dados.js` como referência.

Detalhes: `docs/stacks.md` do kit.
