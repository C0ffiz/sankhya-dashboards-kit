# Publicar no ERP

## Base de testes primeiro

Em produção, cada alteração de componente pode exigir aprovação do usuário SUP na tela **Autorização de Customizações**. Na **base de testes** (normalmente `<empresa>-teste.sankhyacloud.com.br`), quem é SUP publica e testa quantas vezes precisar.

Fluxo recomendado: **base de testes → `npm run diagnostico` se algo falhar → produção**.

## Passo a passo

1. Gere o pacote:

   ```bash
   npm run build -- vendas
   npm run emular -- vendas     # opcional: abre o pacote como o ERP abriria
   ```

2. No Sankhya: **Configurações > Avançado > Construtor de Componentes de BI**.
3. Crie um componente (ou abra o existente) e **anexe** `dist-sankhya/vendas.zip`.
4. No XML do componente, aponte o `entryPoint` para a entrada do pacote (o build mostra o XML pronto):

   ```xml
   <gadget>
     <level id="lvl_principal" description="Principal">
       <container orientacao="V" tamanhoRelativo="100">
         <html5component id="html5_principal" entryPoint="painel.jsp"/>
       </container>
     </level>
   </gadget>
   ```

   - `entryPoint` = campo `entrada` do `dashboard.json` (padrão `painel.jsp`). **Nunca `index.jsp`**.
   - `id` do `level` e do `html5component` podem ser quaisquer; o ERP gera os seus quando o componente é criado pela tela.

5. Salve e abra a pré-visualização. Para usar no dia a dia, coloque o componente num **dashboard**, publique no menu e libere para os grupos de usuários em **Controle de Acessos**.

## Atualizar uma versão

Gere o `.zip` de novo e anexe por cima do anterior. O ERP publica cada envio numa pasta nova (`${BASE_FOLDER}` muda, por exemplo `html5component/168_20261117103735/`), então o navegador não fica preso à versão antiga.

## Parâmetros

Para o ERP pedir valores (empresa, período...) antes de abrir o componente, declare `<prompt-parameters>` no XML:

```xml
<gadget>
  <prompt-parameters>
    <parameter id="CODEMP" description="Empresa" metadata="integer" required="false" keep-last="true" keep-date="false" order="0"/>
    <parameter id="PERIODO" description="Período" metadata="datePeriod" required="true" keep-last="false" keep-date="true" order="1"/>
  </prompt-parameters>
  <level id="lvl_principal" description="Principal"> ... </level>
</gadget>
```

Como chegam ao JSP: cada `<parameter id="X">` vira **atributo da requisição** com esse `id`.

| Onde | Como ler |
|---|---|
| EL no JSP (stacks vite/html, via `parametros.json`) | `${X}` → a meta `snk-param` → `lerParametros().X` |
| `<snk:query>` (stack jsp) | `:X`; período: `:X.INI` e `:X.FIN` |
| Parâmetro não declarado | chega vazio, sem erro |

Outros tipos de `metadata` vistos em componentes reais: `entity:Parceiro@CODPARC` (busca de cadastro) e `multiList:Integer` com `<expression type="SQL">` (lista de opções a partir de um SELECT). O formato com que uma data sai no EL (`${X}`) ainda não foi verificado: confira com o T3 do diagnóstico ou imprimindo o valor.

## O que o ERP oferece ao componente

Verificado num ERP real com o pacote de diagnóstico:

| Recurso | Valor / uso |
|---|---|
| Endereço da página | `/mge/html5component.mge?entryPoint=<entrada>&nuGdg=<nº do componente>&gadGetID=<id>&userID=<usuário>` |
| `${BASE_FOLDER}` | Pasta do pacote, **relativa a `/mge/` e terminada em `/`**. Arquivos: `${BASE_FOLDER}assets/x.js` |
| `${CODUSU_LOG}` | Código do usuário logado |
| `<snk:load/>` | Carrega os recursos da Sankhya na página |
| `<snk:query>` + JSTL (`c:catch`, `c:forEach`, `c:choose`) | Consulta no servidor |
| `window.openApp(resourceID, { CHAVE: valor })` | Abre uma tela nativa no registro (`sankhya-kit/erp.js`) |
| SankhyaJX | Declara-se como `class JX` global: use `JX`, nunca `window.JX` (que é `undefined`) |

Algo deu errado? [Debug e logs](debug-e-logs.md).
