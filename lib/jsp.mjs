// Regras do JSP que o ERP executa. Tudo aqui foi validado num ERP real (ver docs/debug-e-logs.md).
//
// - A página é servida em /mge/html5component.mge?entryPoint=<entrada>&nuGdg=..., então caminhos
//   relativos (./assets/x.js) apontam para /mge/ e NÃO carregam.
// - ${BASE_FOLDER} = pasta onde o ERP publica o .zip, relativa a /mge/ e já terminada em "/"
//   (ex.: html5component/168_20261117103735/). Arquivos do pacote: ${BASE_FOLDER}assets/x.js
// - Cada <parameter id="X"> do XML do componente vira atributo da requisição: ${X} no EL.

export const DIRETIVA_JSP =
  '<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>';
export const TAGLIB_SNK = '<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>';
export const BASE = '${BASE_FOLDER}';

const escaparAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** <meta name="snk-param"> — em dev com o valor mock, no build com ${NOME} (EL do JSP). */
export function metasParametros(params, { el }) {
  return Object.entries(params)
    .map(([nome, valor]) => `<meta name="snk-param" data-nome="${nome}" content="${el ? '${' + nome + '}' : escaparAttr(valor)}">`)
    .join('\n    ');
}

/** Insere um trecho no <head>, logo após o <meta charset> (ou na abertura do <head>). */
export function injetarNoHead(html, trecho) {
  const charset = /<meta\s+charset=[^>]*>/i;
  if (charset.test(html)) return html.replace(charset, (m) => `${m}\n    ${trecho}`);
  return html.replace(/<head>/i, `<head>\n    ${trecho}`);
}

const NAO_RELATIVO = /^(\$\{|#|https?:|\/\/|\/|data:|javascript:|mailto:|tel:|about:|blob:)/i;

/** Atributos src/href cujo valor é um caminho relativo (não carrega no ERP). */
export function caminhosRelativos(texto) {
  const achados = [];
  for (const m of texto.matchAll(/\s(?:src|href)\s*=\s*["']([^"']*)["']/gi)) {
    const v = m[1].trim();
    if (v && !NAO_RELATIVO.test(v)) achados.push(v);
  }
  return achados;
}

/**
 * Stacks "vite" e "html": transforma o index.html gerado no JSP de entrada.
 * @returns {{ jsp: string, erros: string[] }}
 */
export function htmlParaJsp(html, { params = {}, jx = true } = {}) {
  const erros = [];
  const cabecalho = ['<snk:load/>', metasParametros(params, { el: true }), jx && `<script src="${BASE}assets/jx.min.js"></script>`]
    .filter(Boolean)
    .join('\n    ');
  let saida = injetarNoHead(html, cabecalho);
  // ./assets/x  e  assets/x  →  ${BASE_FOLDER}assets/x   (absolutos, âncoras e EL ficam como estão)
  saida = saida.replace(/(\s(?:src|href)\s*=\s*["'])([^"']*)(["'])/gi, (m, antes, valor, depois) =>
    !valor.trim() || NAO_RELATIVO.test(valor.trim()) ? m : `${antes}${BASE}${valor.trim().replace(/^\.\//, '')}${depois}`,
  );

  const restantes = caminhosRelativos(saida);
  if (restantes.length) erros.push(`caminhos relativos restantes (não carregam no ERP): ${restantes.join(', ')}`);

  // O JSP só pode ter EL nos parâmetros declarados e em ${BASE_FOLDER}: qualquer outro ${ ou #{ seria
  // interpretado pelo servidor. JS/CSS ficam em assets/, que o servidor não interpreta.
  const permitidos = new Set([...Object.keys(params).map((p) => '${' + p + '}'), BASE]);
  const el = [...saida.matchAll(/[$#]\{[^}]*\}?/g)].map((m) => m[0]).filter((e) => !permitidos.has(e));
  if (el.length) erros.push(`expressões EL inesperadas: ${[...new Set(el)].join(', ')} — mova esse conteúdo para um .js/.css.`);
  if (/<%(?!@)/.test(saida)) erros.push('scriptlet JSP (<% ... %>) inesperado no HTML.');

  return { jsp: `${DIRETIVA_JSP}\n${TAGLIB_SNK}\n${saida}`, erros };
}

/**
 * Stack "jsp": confere um JSP escrito à mão ou gerado por outra ferramenta. EL, <snk:query> e
 * scriptlets são permitidos (é o servidor que os executa); caminhos relativos não.
 * @returns {{ erros: string[], avisos: string[] }}
 */
export function verificarJsp(texto, nome) {
  const erros = [];
  const avisos = [];
  const relativos = caminhosRelativos(texto);
  if (relativos.length) erros.push(`${nome}: caminhos relativos não carregam no ERP: ${relativos.join(', ')}. Use ${BASE}<arquivo>.`);
  if (!/^\s*<%@\s*page\b/.test(texto)) avisos.push(`${nome}: não começa com a diretiva <%@ page ... %> (charset e EL podem ficar no padrão do servidor).`);
  if (/<snk:/.test(texto) && !/taglib[^>]*sankhyaUtil\.tld/.test(texto)) erros.push(`${nome}: usa <snk:...> sem declarar a taglib: ${TAGLIB_SNK}`);
  // só o que a página CARREGA (script, css, imagem, iframe), não links <a href>
  const externos = [...texto.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\s(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/gi)].map((m) => m[1]);
  if (externos.length) avisos.push(`${nome}: carrega arquivos da internet (${externos.length}): ${externos.slice(0, 3).join(', ')}${externos.length > 3 ? '…' : ''}. Pode falhar em redes que bloqueiam CDN.`);
  return { erros, avisos };
}
