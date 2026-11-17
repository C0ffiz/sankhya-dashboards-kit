<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>
<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>
<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c"%>
<%--
  Modelo da stack "jsp": o SQL roda NO SERVIDOR (<snk:query>) quando o ERP monta a página.
  O navegador recebe só o resultado — não precisa de permissão para consultar pelo navegador
  (SQL no servidor). Não há preview local: publique na base de testes.

  Regras (docs/stacks.md):
  - arquivos do pacote sempre por ${BASE_FOLDER}<arquivo>  (caminho relativo não carrega no ERP)
  - parâmetros do XML do componente: ${ID} no EL e :ID dentro do <snk:query>
  - nunca use index.jsp como nome da entrada
--%>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exemplo JSP — Empresas</title>
  <link rel="stylesheet" href="${BASE_FOLDER}estilo.css">
  <snk:load/>
</head>
<body>
  <main class="painel">
    <h1>Empresas</h1>
    <p class="sub">Exemplo da stack jsp — consulta no servidor (<code>&lt;snk:query&gt;</code>) em <code>TSIEMP</code></p>

    <c:catch var="erroEmpresas">
      <snk:query var="empresas">
        SELECT CODEMP, NOMEFANTASIA
          FROM TSIEMP
         ORDER BY CODEMP
      </snk:query>
    </c:catch>

    <c:choose>
      <c:when test="${not empty erroEmpresas}">
        <div class="erro">Erro na consulta: <c:out value="${erroEmpresas.message}"/></div>
      </c:when>
      <c:otherwise>
        <table>
          <thead><tr><th>CODEMP</th><th>NOMEFANTASIA</th></tr></thead>
          <tbody>
            <c:forEach items="${empresas.rows}" var="linha">
              <tr><td><c:out value="${linha.CODEMP}"/></td><td><c:out value="${linha.NOMEFANTASIA}"/></td></tr>
            </c:forEach>
          </tbody>
        </table>
      </c:otherwise>
    </c:choose>
  </main>
</body>
</html>
