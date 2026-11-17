# Debug e logs

Guia para quando um dashboard **não abre no ERP**, **abre em branco** ou **não traz dados**. Siga na ordem: cada etapa elimina uma classe de causas.

| Sintoma | Comece por |
|---|---|
| "Internal Server Error" ao abrir o componente | [Etapa 2](#2-no-erp-o-devtools) e depois [Etapa 3](#3-pacote-de-diagnóstico) |
| Abre em branco ou sem estilo | [Etapa 2](#2-no-erp-o-devtools): procure 404 nos arquivos |
| Abre, mas aparece erro de consulta | [Etapa 3](#3-pacote-de-diagnóstico): testes T4 e T5 |
| Funciona para você e não para outro usuário | [Etapa 3](#3-pacote-de-diagnóstico) aberto **com o usuário que falha** |
| Funciona no `npm run dev` e não no ERP | [Etapa 1](#1-antes-de-subir-emular-e-verificar) |

## 1. Antes de subir: emular e verificar

```bash
npm run build -- vendas        # já verifica o pacote; se algo estiver errado, não gera o .zip
npm run emular -- vendas       # serve o .zip como o ERP serve, com dados reais
```

O emulador imita o servidor do ERP: página em `/mge/html5component.mge?entryPoint=...`, arquivos em `${BASE_FOLDER}`, **erro 500 para `index.jsp`** e **404 para caminho relativo**. O terminal lista cada pedido que falhou.

Limites: ele não executa `<snk:query>`/JSTL nem tem `openApp`. Isso só a base de testes mostra.

Para um `.zip` que não foi gerado pelo kit (outra stack, outra pessoa, versão antiga):

```bash
npm run verificar -- caminho/painel.zip
npm run verificar -- caminho/painel.zip --consertar    # refaz as entradas de pasta → painel-corrigido.zip
```

## 2. No ERP: o devtools

Abra o componente com o devtools do navegador aberto (F12), aba **Rede** (Network).

1. Procure a requisição **`html5component.mge?entryPoint=...`**:
   - **500**: o servidor não conseguiu montar a página. A resposta costuma ser só "Internal Server Error", sem detalhe. Vá para a [Etapa 3](#3-pacote-de-diagnóstico).
   - **200**: a página foi montada. O problema está nos arquivos ou nos dados (itens abaixo).
2. Procure **404** nos `.js`/`.css`: arquivo referenciado por caminho relativo ou faltando no `.zip`. Use `${BASE_FOLDER}`.
3. Procure **`service.sbr?serviceName=DbExplorerSP.executeQuery`** (stacks vite/html): na resposta, `status: "1"` é sucesso; senão, `statusMessage` traz o erro do banco ou de permissão.
4. Aba **Console**: erros de JavaScript. Os dashboards do kit também mostram o erro de consulta na tela.

Anote o endereço completo da página. Ele mostra `entryPoint`, `nuGdg` (número do componente) e `userID`, úteis para a issue.

## 3. Pacote de diagnóstico

É um `.zip` com páginas de teste em camadas. A primeira que falha mostra onde está o problema.

```bash
npm run diagnostico -- vendas      # testes + o dashboard "vendas" dentro do mesmo pacote
npm run diagnostico                # só os testes
```

### Passo a passo

1. Use a **base de testes** (sem autorização de customização a cada envio).
2. Crie (ou abra) um componente HTML5 de teste e **anexe** `dist-sankhya/vendas-diagnostico.zip`.
3. No XML, `entryPoint="diagnostico.jsp"`:

   ```xml
   <gadget>
     <level id="lvl_principal" description="Principal">
       <container orientacao="V" tamanhoRelativo="100">
         <html5component id="html5_principal" entryPoint="diagnostico.jsp"/>
       </container>
     </level>
   </gadget>
   ```

4. Abra o componente. A página chama cada teste e mostra uma tabela, as conclusões e um **relatório para copiar**.
5. **Se o problema é de um usuário específico**, abra o componente logado como esse usuário.
6. Cole o relatório na issue (Etapa 6).

**Se a própria `diagnostico.jsp` não abrir:** troque o `entryPoint` à mão, um de cada vez, na ordem da tabela abaixo, e anote qual foi o primeiro a falhar. Cada página termina com uma linha `RESULTADO ...` para copiar.

### Os testes

| Página | O que testa | Se falhar |
|---|---|---|
| `t1.jsp` | JSP mínimo, só HTML | O servidor não executa nem o básico: upload, formato do `.zip` ou ambiente. Teste com o `.zip` de um componente que funciona. |
| `t2.jsp` | + taglib da Sankhya e `<snk:load/>` | Problema com a taglib neste servidor. |
| `t3.jsp` | + `${BASE_FOLDER}`, `${CODUSU_LOG}`, arquivos do pacote por `${BASE_FOLDER}` e por caminho relativo, SankhyaJX, `openApp` | Se `js_base=falhou`: o `.zip` não publica as pastas (falta entrada de pasta). `js_relativo=falhou` é **esperado**. |
| `t4.jsp` | Consulta pelo navegador (`JX.post` → `DbExplorerSP`) com a sessão do usuário | O usuário não pode consultar pelo navegador: dashboards vite/html não trazem dados para ele. |
| `t5.jsp` | Consulta no servidor (`<snk:query>`) | Veja a mensagem: SQL ou permissão no servidor. |
| `painel.jsp` (ou a sua entrada) | O dashboard completo | Se t1–t3 passam e só ele falha, o problema está no conteúdo do dashboard: veja os erros conhecidos. |

Combinações comuns:

- **t1–t5 OK, dashboard 500** → o nome da entrada ou o JSP do dashboard. Rode `npm run verificar` no `.zip` do dashboard.
- **T4 falha e T5 funciona** → permissão do usuário para consultar pelo navegador. Use a stack `jsp` ou ajuste a permissão.
- **t1 falha** → nada a ver com o dashboard. Confira o upload e o ambiente.

## 4. Log do servidor

Na base de testes, como SUP: **Configurações > Avançado > Administração do Servidor**, arquivo **`server.log`**.

1. Anote a hora exata em que abriu o componente.
2. No log, vá até esse horário e procure por `html5component`, `JasperException`, `Exception`, o nome da sua entrada (`painel.jsp`) ou `ORA-` (erro do banco).
3. Copie o bloco do erro (a primeira linha `ERROR` e as `Caused by:`).

Ruído conhecido, que **não** tem relação com o dashboard:

| Mensagem | O que é |
|---|---|
| `ORA-00001: restrição exclusiva (...PK_TSIACM) violada` / `Acesso Menu já existe no banco de dados` em `WorkspaceHelper.contabilizarAbertura` | O ERP gravando o histórico de acesso à tela em duplicidade. Inofensivo. |

Atenção: o erro 500 do `html5component.mge` **pode não aparecer no log**. No caso real que originou este guia, o log só tinha o ruído acima. Por isso o pacote de diagnóstico é o caminho mais confiável.

## 5. Logs no desenvolvimento

- **Terminal do `npm run dev` / `emular`**: cada consulta com tempo, status e linhas (`[proxy] 812 ms status=1 linhas=11 SELECT ...`) e cada pedido que falhou (`[emular] 404 GET ...`).
- **Console do navegador**: o erro de consulta vem com o SQL em `erro.sql` (`console.error(e, e.sql)`).
- **Erro do Oracle** (`ORA-00942`, `ORA-00904`...): o SQL chegou ao banco. Corrija a consulta, ou o nome de tabela/campo nesta versão do ERP. O dicionário (`TDDCAM`, `TDDTAB`) pode listar campos que não existem fisicamente: confira com `USER_TAB_COLUMNS`.

## 6. Abrir uma issue

Use o modelo **"Problema no ERP"** do repositório e inclua:

- o **relatório do diagnóstico**, ou a primeira página `tN.jsp` que falhou;
- o endereço da requisição `html5component.mge` e o **status** (Etapa 2);
- o trecho do `server.log`, se houver (Etapa 4);
- a saída de `npm run verificar -- <arquivo.zip>`;
- versão do kit (`package.json`), stack e se é produção ou base de testes.

## Erros conhecidos

| Sintoma | Causa | Solução | Desde |
|---|---|---|---|
| 500 "Internal Server Error" ao abrir; t1–t3 passam | Entrada chamada **`index.jsp`** (o mesmo nome da página principal do ERP) | Use outro nome (`painel.jsp`) no `.zip` e no `entryPoint`. O kit recusa `index.jsp`. | kit 2.0 |
| 500 ao abrir; o `.zip` tem pastas | Zip **sem a entrada de pasta** (`assets/`) antes dos arquivos | `npm run verificar -- x.zip --consertar`. O build do kit já gera no formato certo. | kit 2.0 |
| Página abre sem estilo/JS; 404 em `/mge/assets/...` | **Caminho relativo** (`./assets/x.js`): a página é servida em `/mge/html5component.mge`, então `./` aponta para `/mge/` | `${BASE_FOLDER}assets/x.js`. O build troca sozinho (vite/html) e recusa em JSP. | kit 2.0 |
| `window.JX` é `undefined`, mas o dashboard funciona | O SankhyaJX é `class JX` global, que não vira propriedade de `window` | Normal. Use `JX`/`typeof JX`. | — |
| Dashboard abre, mas a consulta falha só para alguns usuários | Esses usuários não podem usar `DbExplorerSP.executeQuery` pelo navegador | Confirme com T4/T5 logado como o usuário. Use a stack `jsp` ou ajuste a permissão (não libere o DBExplorer para todos: ele permite consultar qualquer tabela). | — |
| Página JSP inteira dá 500 depois de mudar um SQL | `<snk:query>` com erro, sem `<c:catch>` | Envolva cada consulta em `<c:catch var="erro">` e mostre `${erro.message}`. | — |
| Alteração no componente fica "pendente" em produção | Produção exige aprovação do SUP (Autorização de Customizações) | Teste na base de testes; leve para produção só a versão final. | — |
| `${algo}` some do JS/CSS inline do JSP | O servidor interpreta `${...}` em todo o `.jsp` | JS/CSS em arquivos (`${BASE_FOLDER}...`), ou JS sem `${`. | — |

## O caso que originou este guia

Um dashboard da stack vite, empacotado com `index.jsp` e `./assets/`, respondia "Internal Server Error" em produção. O `server.log` não mostrava o erro, e a resposta da requisição era só "Internal Server Error". Na base de testes, um pacote com páginas em camadas (o atual `diagnostico`) foi aberto trocando o `entryPoint` uma a uma:

```
t1: abriu    t2: abriu    t3: abriu (BASE_FOLDER=html5component/168_.../, relativo não carregou)
painel.jsp: abriu        index.jsp: 500     ← mesmo conteúdo, só o nome mudava
```

Três correções saíram daí e hoje são verificadas automaticamente pelo kit: não usar `index.jsp`, incluir a entrada de pasta no `.zip` e referenciar arquivos por `${BASE_FOLDER}`.
