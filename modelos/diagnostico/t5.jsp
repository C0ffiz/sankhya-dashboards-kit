<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c"%>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><snk:load/><title>T5 - consulta no servidor</title></head>
<body style="font:14px system-ui,sans-serif;padding:16px">
<h2>T5: consulta SQL no servidor (&lt;snk:query&gt;)</h2>
<p>O SQL roda no servidor ao montar a página; o navegador só recebe o resultado (é como o PAINEL FISCAL funciona).</p>
<c:catch var="erroConsulta">
  <snk:query var="consulta">SELECT COUNT(*) AS QTD FROM TSIEMP</snk:query>
</c:catch>
<pre id="resultado"><c:choose><c:when test="${not empty erroConsulta}">RESULTADO T5 ERRO | consulta no servidor (snk:query) | <c:out value="${erroConsulta.message}"/></c:when><c:otherwise>RESULTADO T5 OK | consulta no servidor (snk:query) | empresas em TSIEMP=${consulta.rows[0].QTD} | usuario=${CODUSU_LOG}</c:otherwise></c:choose></pre>
</body>
</html>
