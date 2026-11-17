<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><snk:load/><title>T4 - consulta pelo navegador</title></head>
<body style="font:14px system-ui,sans-serif;padding:16px">
<h2>T4: consulta SQL pelo navegador (sessão do usuário logado)</h2>
<p>Mesmo caminho dos dashboards das stacks vite/html: <code>JX.post</code> → <code>DbExplorerSP.executeQuery</code>.
Se falhar por permissão, o usuário logado não pode usar esse serviço: use a stack jsp (consulta no servidor, ver T5).</p>
<pre id="resultado" data-usuario="${CODUSU_LOG}">RESULTADO T4 aguardando a consulta…</pre>
<script src="${BASE_FOLDER}diag/jx.min.js"></script>
<script src="${BASE_FOLDER}diag/diag.js" data-teste="t4"></script>
</body>
</html>
