<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><snk:load/><title>T3 - EL e arquivos do pacote</title></head>
<body style="font:14px system-ui,sans-serif;padding:16px">
<h2>T3: expressões do ERP e arquivos do pacote</h2>
<ul>
  <li>BASE_FOLDER (pasta do pacote no servidor) = [<code>${BASE_FOLDER}</code>]</li>
  <li>Usuário logado (CODUSU_LOG) = [<code>${CODUSU_LOG}</code>]</li>
  <li>Parâmetro não declarado no XML = [<code>${PARAMETRO_QUE_NAO_EXISTE}</code>] (deve ficar vazio)</li>
  <li id="li-base">JS por ${BASE_FOLDER}diag/ … aguardando</li>
  <li id="li-relativo">JS por caminho relativo diag/ … aguardando</li>
  <li id="li-jx">SankhyaJX … aguardando</li>
  <li id="li-openapp">openApp (abrir telas do ERP) … aguardando</li>
</ul>
<pre id="resultado" data-base-folder="${BASE_FOLDER}" data-usuario="${CODUSU_LOG}">RESULTADO T3 aguardando o JavaScript…</pre>
<script src="${BASE_FOLDER}diag/jx.min.js"></script>
<script src="${BASE_FOLDER}diag/sonda.js" data-sonda="base"></script>
<script src="${BASE_FOLDER}diag/diag.js" data-teste="t3"></script>
</body>
</html>
