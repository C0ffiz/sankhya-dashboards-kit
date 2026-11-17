// Consultas no servidor: o SQL do dashboard roda no ERP por <snk:query>, sem DbExplorer.
//
// Por quê: a consulta pelo navegador (JX.post → DbExplorerSP) exige que o usuário logado tenha permissão
// no DBExplorer. <snk:query> roda no servidor, ao montar a página, e funciona para quem abre o componente.
//
// Como: o dashboard declara as consultas num módulo (campo "consultasServidor" do dashboard.json):
//
//   export default {
//     itens: {
//       sql: `SELECT ... FROM TGFCAB CAB WHERE CAB.DTNEG >= :DTINI /*SE CODEMP*/ AND CAB.CODEMP IN (:CODEMP) /*FIM*/`,
//       parametros: { DTINI: 'data', CODEMP: 'lista' },   // data | numero | lista
//       paginar: 'NUNOTA, SEQUENCIA',                       // opcional: páginas de 5.000 linhas, nessa ordem
//     },
//   };
//
// O build gera `dados.jsp` com uma <snk:query> por consulta. No navegador, `consultarServidor('itens', {...})`
// (runtime/dados.js) chama html5component.mge?entryPoint=dados.jsp&q=itens&DTINI=20261001&CODEMP=1&CODEMP=2.
//
// Segurança — o SQL fica FIXO no pacote; do navegador só vêm o nome da consulta e os valores, e todo valor é
// convertido a número pelo próprio JSP (EL `${v + 0}`): texto não numérico dá erro e a consulta não roda.
// Datas vão como AAAAMMDD (número) → TO_DATE('20261001', 'YYYYMMDD'). Nenhum texto do navegador entra no SQL.
// Isso não depende de como o <snk:query> do ERP liga parâmetros (bind ou texto) e usa só JSTL core.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ErroUsuario } from './projeto.mjs';

/** Nome do JSP gerado, na raiz do pacote. */
export const ARQUIVO_DADOS = 'dados.jsp';
/** Linhas por página das consultas com `paginar` (mesmo limite do DbExplorer, usado no dev). */
export const TAMANHO_PAGINA = 5000;

const TIPOS = ['data', 'numero', 'lista'];
const RESERVADOS = new Set(['Q', 'PAGINA', 'ENTRYPOINT', 'NUGDG', 'GADGETID', 'USERID']);
const NOME_CONSULTA = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const NOME_PARAMETRO = /^[A-Z][A-Z0-9_]{0,40}$/;
const ORDEM = /^[A-Za-z0-9_.,\s]+$/;

/** Troca :NOME fora de textos entre aspas. `fn(nome)` devolve o trecho JSP. */
function trocarParametros(sql, fn) {
  return sql.replace(/('(?:[^']|'')*')|(?<![:\w]):([A-Za-z_]\w*)/g, (m, aspas, nome) => (aspas ? aspas : fn(nome)));
}

/** Valida as definições e devolve-as normalizadas. Lança ErroUsuario com a lista de problemas. */
export function validarDefinicoes(defs, origem = 'consultas do servidor') {
  const erros = [];
  if (!defs || typeof defs !== 'object' || Array.isArray(defs)) throw new ErroUsuario(`${origem}: exporte um objeto { nome: { sql, parametros?, paginar? } } como default.`);
  const saida = {};
  for (const [nome, d] of Object.entries(defs)) {
    const onde = `${origem} › ${nome}`;
    if (!NOME_CONSULTA.test(nome)) erros.push(`${onde}: nome inválido (letras, números e _; começa com letra).`);
    const sql = typeof d === 'string' ? d : d?.sql;
    if (typeof sql !== 'string' || !sql.trim()) {
      erros.push(`${onde}: falta o sql.`);
      continue;
    }
    const parametros = (typeof d === 'object' && d.parametros) || {};
    const paginar = typeof d === 'object' ? d.paginar : undefined;
    const semComentarios = sql.replace(/\/\*(?!\s*(?:SE\s+\w+|FIM)\s*\*\/)[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim();
    if (!/^(SELECT|WITH)\b/i.test(semComentarios)) erros.push(`${onde}: só SELECT/WITH.`);
    if (/;/.test(semComentarios.replace(/'(?:[^']|'')*'/g, "''"))) erros.push(`${onde}: uma instrução só (sem ';').`);
    // o SQL vira corpo de JSP: nada que o servidor interprete
    if (/\$\{|#\{|<%|<\/?[a-z]+:/i.test(sql)) erros.push(`${onde}: o SQL não pode ter \${, #{, <% nem tags JSP.`);
    for (const [p, tipo] of Object.entries(parametros)) {
      if (!NOME_PARAMETRO.test(p) || RESERVADOS.has(p)) erros.push(`${onde}: parâmetro "${p}" inválido (MAIÚSCULAS, números e _; reservados: ${[...RESERVADOS].join(', ')}).`);
      if (!TIPOS.includes(tipo)) erros.push(`${onde}: tipo "${tipo}" de ${p} inválido (use ${TIPOS.join(', ')}).`);
    }
    trocarParametros(sql, (p) => {
      if (!parametros[p]) erros.push(`${onde}: :${p} usado no SQL mas não declarado em parametros.`);
      return '';
    });
    for (const [, p] of sql.matchAll(/\/\*\s*SE\s+(\w+)\s*\*\//g)) if (!parametros[p]) erros.push(`${onde}: /*SE ${p}*/ com parâmetro não declarado.`);
    const abre = (sql.match(/\/\*\s*SE\s+\w+\s*\*\//g) ?? []).length;
    const fecha = (sql.match(/\/\*\s*FIM\s*\*\//g) ?? []).length;
    if (abre !== fecha) erros.push(`${onde}: /*SE X*/ e /*FIM*/ não batem (${abre} × ${fecha}).`);
    if (paginar != null && (typeof paginar !== 'string' || !ORDEM.test(paginar))) erros.push(`${onde}: "paginar" deve listar colunas do SELECT, ex.: 'NUNOTA, SEQUENCIA'.`);
    saida[nome] = { sql: sql.trim(), parametros, paginar: paginar || null };
  }
  if (!Object.keys(saida).length && !erros.length) erros.push(`${origem}: nenhuma consulta declarada.`);
  if (erros.length) throw new ErroUsuario(`consultas do servidor com problema:\n  - ${erros.join('\n  - ')}`);
  return saida;
}

/** Trecho JSP que escreve o valor de um parâmetro como número (texto não numérico → erro de EL). */
function trechoParametro(nome, tipo) {
  if (tipo === 'data') return `TO_DATE('\${param.${nome} + 0}', 'YYYYMMDD')`;
  if (tipo === 'numero') return `\${param.${nome} + 0}`;
  return (
    `<c:choose><c:when test="\${empty paramValues.${nome}}">NULL</c:when><c:otherwise>` +
    `<c:forEach items="\${paramValues.${nome}}" var="v_" varStatus="s_">\${s_.first ? '' : ','}\${v_ + 0}</c:forEach>` +
    '</c:otherwise></c:choose>'
  );
}

function sqlJsp({ sql, parametros, paginar }) {
  let corpo = trocarParametros(sql, (p) => trechoParametro(p, parametros[p]));
  corpo = corpo
    .replace(/\/\*\s*SE\s+(\w+)\s*\*\//g, (m, p) => `<c:if test="\${not empty paramValues.${p}}">`)
    .replace(/\/\*\s*FIM\s*\*\//g, '</c:if>');
  if (!paginar) return corpo;
  return (
    `SELECT * FROM (SELECT T_.*, ROW_NUMBER() OVER (ORDER BY ${paginar.replace(/\s+/g, ' ')}) AS RN_PAG_ FROM (\n${corpo}\n) T_) ` +
    `WHERE RN_PAG_ BETWEEN \${(param.pagina + 0) * ${TAMANHO_PAGINA} + 1} AND \${(param.pagina + 0) * ${TAMANHO_PAGINA} + ${TAMANHO_PAGINA}}`
  );
}

/**
 * Gera o dados.jsp. Saída (lida por runtime/dados.js):
 *   <zd><zq n="nome" pag="5000"><zh><zc>COL</zc>…</zh><zr><v>valor</v><n></n>…</zr>…</zq> | <zq n="nome"><ze>erro</ze></zq></zd>
 */
export function gerarJspDados(defs) {
  const blocos = Object.entries(defs).map(([nome, d]) =>
    [
      `<c:if test="\${q_ == '${nome}'}"><zq n="${nome}"${d.paginar ? ` pag="${TAMANHO_PAGINA}"` : ''}><c:catch var="e_"><snk:query var="r_">`,
      sqlJsp(d),
      '</snk:query>',
      '<zh><c:forEach items="${r_.columnNames}" var="c_"><zc><c:out value="${c_}"/></zc></c:forEach></zh>',
      '<c:forEach items="${r_.rowsByIndex}" var="l_"><zr><c:forEach items="${l_}" var="v_"><c:choose><c:when test="${v_ == null}"><n></n></c:when><c:otherwise><v><c:out value="${v_}"/></v></c:otherwise></c:choose></c:forEach></zr></c:forEach>',
      '</c:catch><c:if test="${not empty e_}"><ze><c:out value="${e_.message}"/></ze></c:if></zq></c:if>',
    ].join(''),
  );
  return [
    '<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false" %>',
    '<%@ taglib uri="http://java.sun.com/jstl/core_rt" prefix="c" %>',
    '<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld" %>',
    '<%-- Gerado pelo sankhya-dashboards-kit a partir das consultas do dashboard. Não edite: rode o build. --%>',
    '<snk:load/>',
    `<zd><c:forEach items="\${paramValues.q}" var="q_">${blocos.join('')}</c:forEach></zd>`,
    '',
  ].join('\n');
}

/** Caminho do módulo de consultas declarado no dashboard.json (ou null). */
export function arquivoConsultas(pastaDashboard, manifesto) {
  if (!manifesto.consultasServidor) return null;
  const arq = resolve(pastaDashboard, manifesto.consultasServidor);
  if (!existsSync(arq)) throw new ErroUsuario(`"consultasServidor": ${manifesto.consultasServidor} não existe na pasta do dashboard.`);
  return arq;
}

/** Importa o módulo (sempre a versão atual do disco, para o dev) e devolve o JSP gerado. */
export async function jspDadosDoDashboard(pastaDashboard, manifesto) {
  const arq = arquivoConsultas(pastaDashboard, manifesto);
  if (!arq) return null;
  const url = `${pathToFileURL(arq).href}?v=${statSync(arq).mtimeMs}`;
  const mod = await import(url);
  return gerarJspDados(validarDefinicoes(mod.default, manifesto.consultasServidor));
}
