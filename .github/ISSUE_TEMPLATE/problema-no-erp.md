---
name: Problema no ERP
about: O componente não abre, abre em branco ou não traz dados dentro do Sankhya
title: "[ERP] "
labels: erp, bug
---

<!-- Passo a passo para coletar estas informações: docs/debug-e-logs.md
     NÃO cole credenciais, o conteúdo do .env nem dados da empresa: este repositório é público. -->

## O que acontece

<!-- Ex.: "Internal Server Error" ao abrir; abre sem estilo; erro de consulta para alguns usuários. -->

## Ambiente

- Versão do kit (`version` no package.json):
- Stack do dashboard (vite / html / jsp):
- Base de testes ou produção:
- O problema acontece com qualquer usuário ou só com alguns?

## Relatório do diagnóstico

<!-- npm run diagnostico -- <nome>  →  anexe o .zip no componente, entryPoint="diagnostico.jsp",
     abra e clique em "Copiar". Se a página não abrir, diga qual foi o primeiro tN.jsp a falhar. -->

```
cole aqui
```

## Requisição no devtools

<!-- Aba Rede (Network): a requisição html5component.mge?entryPoint=... -->

- Status:
- Resposta (se tiver mais que "Internal Server Error"):
- Arquivos com 404 (se houver):

## Verificação do pacote

```
saída de: npm run verificar -- <arquivo.zip>
```

## Log do servidor (opcional)

<!-- Administração do Servidor → server.log, no horário em que abriu o componente. Remova nomes e dados da empresa. -->

```
cole aqui
```
