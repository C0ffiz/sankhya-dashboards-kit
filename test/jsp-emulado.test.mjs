// Testes do emulador de JSP (lib/el.mjs + lib/jsp-emulado.mjs). Rodar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliar, interpolar } from '../lib/el.mjs';
import { ErroJsp, ErroNaoSuportado, ligarParametros, renderizarJsp } from '../lib/jsp-emulado.mjs';

/** Executor falso: devolve o formato do DbExplorerSP e guarda os SQL recebidos. */
function executorFalso(tabelas = {}) {
  const recebidos = [];
  const executarSql = async (sql) => {
    recebidos.push(sql);
    const chave = Object.keys(tabelas).find((k) => sql.includes(k));
    if (!chave) return { status: '0', statusMessage: 'ORA-00942: a tabela ou view não existe' };
    const linhas = tabelas[chave];
    const nomes = Object.keys(linhas[0] ?? { X: 1 });
    return { status: '1', responseBody: { fieldsMetadata: nomes.map((name) => ({ name })), rows: linhas.map((l) => nomes.map((n) => l[n])) } };
  };
  return { executarSql, recebidos };
}
const html = (s) => s.replace(/\s+/g, ' ').trim();

test('EL: operadores, empty, ternário, propriedades e palavras', () => {
  const escopo = (n) => ({ a: 2, b: '3', lista: [{ X: 'um' }], vazio: '', obj: { message: 'falhou' }, nulo: null })[n] ?? null;
  assert.equal(avaliar('a + b * 2', escopo), 8);
  assert.equal(avaliar('a == 2 and not empty lista', escopo), true);
  assert.equal(avaliar('empty vazio && empty nulo && empty inexistente', escopo), true);
  assert.equal(avaliar("lista[0].X eq 'um'", escopo), true);
  assert.equal(avaliar('lista[0].x', escopo), 'um'); // linhas do JSTL não diferenciam maiúsculas
  assert.equal(avaliar('not empty obj ? obj.message : "ok"', escopo), 'falhou');
  assert.equal(avaliar('a gt 1 && b le 3', escopo), true);
  assert.equal(avaliar('nulo.qualquer.coisa', escopo), null);
  assert.equal(avaliar("fn:length(lista) + fn:length('abc')", escopo), 4);
  assert.equal(interpolar('valor ${a} e \\${a}', escopo), 'valor 2 e ${a}');
});

test('snk:query + c:forEach + c:out com dados', async () => {
  const { executarSql, recebidos } = executorFalso({ TSIEMP: [{ CODEMP: 1, NOMEFANTASIA: 'A & B' }, { CODEMP: 2, NOMEFANTASIA: 'C' }] });
  const fonte = `<%@ page isELIgnored="false"%><%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%><%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c"%>
<snk:load/><snk:query var="emp">SELECT CODEMP, NOMEFANTASIA FROM TSIEMP</snk:query>
<ul><c:forEach items="\${emp.rows}" var="l" varStatus="s"><li>\${s.count}:<c:out value="\${l.NOMEFANTASIA}"/></li></c:forEach></ul> total=\${emp.rowCount}`;
  const saida = await renderizarJsp(fonte, { executarSql });
  assert.equal(html(saida), '<ul><li>1:A &amp; B</li><li>2:C</li></ul> total=2');
  assert.match(recebidos[0], /FROM TSIEMP/);
});

test('c:catch guarda o erro da consulta; c:choose mostra a mensagem', async () => {
  const { executarSql } = executorFalso({});
  const fonte = `<%@ taglib prefix="snk" uri="x"%><%@ taglib prefix="c" uri="y"%>
<c:catch var="erro">antes<snk:query var="q">SELECT * FROM NAO_EXISTE</snk:query>depois</c:catch>
<c:choose><c:when test="\${not empty erro}">ERRO: <c:out value="\${erro.message}"/></c:when><c:otherwise>ok</c:otherwise></c:choose>`;
  assert.equal(html(await renderizarJsp(fonte, { executarSql })), 'antes ERRO: ORA-00942: a tabela ou view não existe');
});

test('erro de consulta sem c:catch derruba a página (500 no ERP)', async () => {
  const { executarSql } = executorFalso({});
  await assert.rejects(renderizarJsp('<%@ taglib prefix="snk" uri="x"%><snk:query var="q">SELECT 1 FROM NAO_EXISTE</snk:query>', { executarSql }), ErroJsp);
});

test('trecho Java request.getAttribute e parâmetros :X / :X.INI / lista', async () => {
  const { executarSql, recebidos } = executorFalso({ TGFCAB: [{ N: 1 }] });
  const fonte = `<%@ taglib prefix="snk" uri="x"%><snk:query var="q">SELECT COUNT(*) N FROM TGFCAB CAB WHERE CAB.DTNEG >= CAST(:PERIODO.INI AS DATE) AND CAB.TIPMOV = 'C' AND TO_CHAR(SYSDATE,'HH24:MI') IS NOT NULL
<% if (request.getAttribute("P_CODEMP_LIST") != null) { out.print(" AND CAB.CODEMP IN (:P_CODEMP_LIST) "); } %>
<% if (request.getAttribute("P_CODPARC") != null) { out.print(" AND CAB.CODPARC = :P_CODPARC "); } %>
AND CAB.OBS <> :TEXTO</snk:query>\${q.rows[0].N}`;
  const atributos = { PERIODO: { INI: '01/10/2026', FIN: '31/10/2026' }, P_CODEMP_LIST: '1,2', TEXTO: "O'Brien" };
  assert.equal((await renderizarJsp(fonte, { executarSql, atributos })).trim(), '1');
  const sql = recebidos[0];
  assert.match(sql, /CAST\(TO_DATE\('01\/10\/2026', 'DD\/MM\/YYYY'\) AS DATE\)/);
  assert.match(sql, /CAB\.CODEMP IN \(1, 2\)/);
  assert.doesNotMatch(sql, /CODPARC/); // atributo ausente: trecho não entra
  assert.match(sql, /'O''Brien'/);
  assert.match(sql, /'HH24:MI'/); // texto entre aspas não é parâmetro
});

test('ligarParametros: ausente vira NULL; ::cast e textos ficam intactos', () => {
  assert.equal(ligarParametros("SELECT :X, ':Y', A::B FROM DUAL", {}), "SELECT NULL, ':Y', A::B FROM DUAL");
});

test('c:forTokens, c:set, c:if e isELIgnored', async () => {
  const fonte = `<%@ taglib prefix="c" uri="y"%><c:set var="t" value="X"/><c:forTokens items="A,B" delims="," var="k"><c:if test="\${k != 'B'}">\${k}\${t}</c:if></c:forTokens>`;
  assert.equal(await renderizarJsp(fonte, {}), 'AX');
  assert.equal(await renderizarJsp('<%@ page isELIgnored="true"%>JS: `${x}`', {}), 'JS: `${x}`');
});

test('recurso não suportado não é engolido por c:catch', async () => {
  await assert.rejects(renderizarJsp('<%@ taglib prefix="c" uri="y"%><c:catch var="e"><c:import url="x"/></c:catch>', {}), ErroNaoSuportado);
  await assert.rejects(renderizarJsp('<% System.out.println("x"); %>', {}), ErroNaoSuportado);
});
