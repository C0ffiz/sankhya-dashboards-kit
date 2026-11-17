# SankhyaJX empacotado localmente

- Origem: https://github.com/wansleynery/SankhyaJX (biblioteca open-source de terceiros, não é nativa do ERP)
- Commit: `be10c58661ac35c6644c33ff0b66e6ac21ba99e8` (2026-08-26)
- Arquivo: `jx.min.js` — SHA-256 `231DF32479104A56B0561D365B918D72109051E48D3806186189B8FC267BA739`

O build copia este arquivo para `assets/jx.min.js` dentro do `.zip`; nada é baixado da internet em produção.

O SankhyaJX se declara como `class JX` global: use `JX` (ou `typeof JX`), nunca `window.JX`, que é `undefined`.

Observação: `JX.consultar` devolve `[]` quando o SQL falha (não lança erro). Por isso
`dados.js` usa `JX.post` no mesmo endpoint (`DbExplorerSP.executeQuery`) e verifica o `status`.

Para atualizar: baixe o `jx.min.js` de um commit específico (nunca `@main`), leia o diff,
substitua o arquivo e atualize commit e hash acima.
