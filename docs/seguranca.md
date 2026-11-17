# Segurança

- **Credenciais só no `.env`**, lidas só pelo proxy de desenvolvimento (`proxy/`) e pela varredura do build. O código dos dashboards nunca lê o `.env` nem usa `import.meta.env.VITE_*` para segredos.
- **O proxy** escuta só em `127.0.0.1`, aceita uma única instrução `SELECT`/`WITH`, bloqueia comandos de escrita/DDL e recusa requisições com `Host` diferente de localhost (proteção contra DNS rebinding). O emulador usa as mesmas regras. Não afrouxe nada disso.
- **Varredura do pacote:** o build (e o `verificar`) recusa o `.zip` se algum arquivo contiver um valor do seu `.env` ou marcadores como `client_secret`, `client_id`, `x-token`, `SANKHYA_*`, `Bearer`, `/api/sql`, `/authenticate`, `gateway/v1`. Se acusar, corrija a origem; não desligue a varredura.
- **Somente leitura:** não use `JX.salvar`, `JX.deletar` ou `JX.acionarBotao` nos dashboards, a não ser que você realmente queira gravar no ERP. Abrir uma tela com `openApp` (`sankhya-kit/erp.js`) é permitido: só abre a tela.
- **Permissão no ERP:** se um usuário não consegue consultar pelo navegador, prefira a stack `jsp` (SQL fixo no servidor) a liberar o DBExplorer, que permite consultar qualquer tabela.
- **SankhyaJX** é de terceiros ([wansleynery/SankhyaJX](https://github.com/wansleynery/SankhyaJX)). Fica fixado por commit e conferido pelo SHA-256 de `runtime/JX_VERSAO.md` a cada build. Para atualizar: baixe de um commit específico (nunca `@main`), revise o diff e atualize commit e hash.
- **Nada de CDN** nos dashboards do kit: tudo vai no `.zip`. O `verificar` avisa quando um JSP carrega arquivos da internet.
- **Dados da empresa** não entram neste repositório (ele é público). Dashboards com regras de negócio ficam no repositório privado do projeto que usa o kit ([Usar como dependência](usar-como-dependencia.md)).
