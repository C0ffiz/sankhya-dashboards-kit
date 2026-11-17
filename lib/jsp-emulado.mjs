// Emulação de páginas JSP do Construtor de Componentes de BI, sem servidor Java.
// Usado por `npm run emular`. Executa o subconjunto que os dashboards usam de fato:
//
//   diretivas <%@ page %> / <%@ taglib %>, comentários <%-- --%>, EL ${...} (lib/el.mjs)
//   <snk:load/>, <snk:query var="x">SQL</snk:query>  → SQL de verdade no ERP, pelo executor do proxy
//   JSTL core: c:out c:set c:remove c:if c:choose c:when c:otherwise c:forEach c:forTokens c:catch c:url
//   Java: só o idioma  <% if (request.getAttribute("X") != null) { out.print("..."); } %>  (e == null)
//
// O que difere do ERP de verdade (docs/debug-e-logs.md):
//   - o SQL roda com as permissões do aplicativo da API (.env), não do usuário logado no ERP;
//   - cada consulta passa pelo DbExplorerSP: só SELECT/WITH e no máximo 5.000 linhas;
//   - datas e números chegam como o DbExplorerSP devolve (no ERP são objetos Java, com outro texto);
//   - outros trechos Java (<% %>) e tags fora dessa lista dão erro claro em vez de executar.
import { ErroEl, escaparXml, interpolar, propriedade, texto, vazio } from './el.mjs';

export class ErroJsp extends Error {}
/** Recurso que o emulador não sabe executar: nunca é capturado por <c:catch>, para não parecer erro de consulta. */
export class ErroNaoSuportado extends Error {}

const PREFIXOS = ['c', 'snk', 'emu'];
const TAG = new RegExp(`<(/?)(${PREFIXOS.join('|')}):([A-Za-z]+)`, 'g');

/** Trechos Java suportados → tag interna <emu:seAtributo>. Qualquer outro trecho Java: erro. */
function converterScriptlets(fonte) {
  return fonte.replace(/<%(?![@=-])([\s\S]*?)%>/g, (trecho, java) => {
    const m = java.match(/^\s*if\s*\(\s*request\.getAttribute\(\s*"([^"]+)"\s*\)\s*(!=|==)\s*null\s*\)\s*\{\s*out\.print\(\s*"((?:[^"\\]|\\.)*)"\s*\)\s*;\s*\}\s*$/);
    if (!m) throw new ErroNaoSuportado(`trecho Java não suportado pelo emulador: ${trecho.slice(0, 120)}. Teste esta página na base de testes do ERP.`);
    const conteudo = m[3].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] ?? c);
    return `<emu:seAtributo nome="${m[1]}" existe="${m[2] === '!=' ? 'sim' : 'nao'}">${conteudo}</emu:seAtributo>`;
  });
}

/** Lê os atributos de uma tag a partir de `i` (respeitando aspas). Devolve { atributos, fim, autoFechada }. */
function lerAtributos(fonte, i) {
  const atributos = {};
  for (;;) {
    while (/\s/.test(fonte[i])) i++;
    if (fonte.startsWith('/>', i)) return { atributos, fim: i + 2, autoFechada: true };
    if (fonte[i] === '>') return { atributos, fim: i + 1, autoFechada: false };
    const m = fonte.slice(i).match(/^([A-Za-z_][\w-]*)\s*=\s*/);
    if (!m) throw new ErroJsp(`tag malformada perto de: ${fonte.slice(i, i + 60)}`);
    i += m[0].length;
    const aspas = fonte[i];
    if (aspas !== '"' && aspas !== "'") throw new ErroJsp(`valor de atributo sem aspas perto de: ${fonte.slice(i - 20, i + 40)}`);
    const fimValor = fonte.indexOf(aspas, i + 1);
    if (fimValor < 0) throw new ErroJsp(`atributo sem fechamento perto de: ${fonte.slice(i, i + 60)}`);
    atributos[m[1]] = fonte.slice(i + 1, fimValor);
    i = fimValor + 1;
  }
}

/** Monta a árvore: { tipo: 'texto', v } | { tipo: 'tag', prefixo, nome, atributos, filhos }. */
function analisar(fonte) {
  const raiz = { tipo: 'tag', nome: '#raiz', filhos: [] };
  const pilha = [raiz];
  let ultimo = 0;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(fonte))) {
    const atual = pilha[pilha.length - 1];
    if (m.index > ultimo) atual.filhos.push({ tipo: 'texto', v: fonte.slice(ultimo, m.index) });
    const [, fechamento, prefixo, nome] = m;
    if (fechamento) {
      const fim = fonte.indexOf('>', TAG.lastIndex);
      if (atual.prefixo !== prefixo || atual.nome !== nome) throw new ErroJsp(`</${prefixo}:${nome}> sem a abertura correspondente (aberta: <${atual.prefixo}:${atual.nome}>).`);
      pilha.pop();
      ultimo = TAG.lastIndex = fim + 1;
      continue;
    }
    const { atributos, fim, autoFechada } = lerAtributos(fonte, TAG.lastIndex);
    const no = { tipo: 'tag', prefixo, nome, atributos, filhos: [] };
    atual.filhos.push(no);
    if (!autoFechada) pilha.push(no);
    ultimo = TAG.lastIndex = fim;
  }
  if (pilha.length > 1) {
    const aberta = pilha[pilha.length - 1];
    throw new ErroJsp(`<${aberta.prefixo}:${aberta.nome}> sem fechamento.`);
  }
  if (ultimo < fonte.length) raiz.filhos.push({ tipo: 'texto', v: fonte.slice(ultimo) });
  return raiz;
}

/** Valor de :NOME (ou :NOME.SUB) do SQL, vindo dos atributos da requisição. */
function valorParametro(nome, atributos) {
  if (Object.prototype.hasOwnProperty.call(atributos, nome)) return atributos[nome];
  const [base, sub] = nome.split('.');
  return sub ? propriedade(atributos[base], sub) : (atributos[base] ?? null);
}

/** Literal SQL para um valor de parâmetro (o <snk:query> do ERP faz bind; aqui vira literal seguro). */
function literalSql(v) {
  if (v == null || v === '') return 'NULL';
  if (Array.isArray(v)) return v.length ? v.map(literalSql).join(', ') : 'NULL';
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `TO_DATE('${s}', 'DD/MM/YYYY')`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `TO_DATE('${s}', 'YYYY-MM-DD')`;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)+$/.test(s)) return s.split(/\s*,\s*/).join(', '); // lista (multiList)
  return `'${s.replace(/'/g, "''")}'`;
}

/** Troca :NOME por literais, fora de textos entre aspas. */
export function ligarParametros(sql, atributos) {
  return sql.replace(/('(?:[^']|'')*')|(?<![:\w]):([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)/g, (m, aspas, nome) =>
    aspas ? aspas : literalSql(valorParametro(nome, atributos)),
  );
}

/** Resultado no formato do JSTL (javax.servlet.jsp.jstl.sql.Result), que é o que ${x.rows} usa no ERP. */
function resultado(resposta) {
  const nomes = (resposta.responseBody?.fieldsMetadata ?? []).map((c) => c.name);
  const porIndice = resposta.responseBody?.rows ?? [];
  const rows = porIndice.map((linha) => Object.fromEntries(nomes.map((n, i) => [n, linha[i] ?? null])));
  return { rows, rowsByIndex: porIndice, columnNames: nomes, rowCount: rows.length, limitedByMaxRows: rows.length >= 5000 };
}

/**
 * Renderiza uma página JSP.
 * @param {string} fonte
 * @param {{ atributos: Record<string, any>, executarSql: (sql: string) => Promise<object>, aoConsultar?: (info: object) => void }} contexto
 * @returns {Promise<string>}
 */
export async function renderizarJsp(fonte, { atributos = {}, executarSql, aoConsultar } = {}) {
  let src = fonte.replace(/<%--[\s\S]*?--%>/g, '');
  const elIgnorado = /<%@\s*page\b[^%]*isELIgnored\s*=\s*"true"/i.test(src);
  src = src.replace(/<%@[\s\S]*?%>[ \t]*\r?\n?/g, '');
  if (/<%=/.test(src)) throw new ErroNaoSuportado('expressão Java <%= %> não suportada pelo emulador. Use EL: ${...}.');
  src = converterScriptlets(src);
  const raiz = analisar(src);

  const variaveis = new Map(); // escopo de página (c:set, var de forEach, catch, query)
  const escopo = (nome) => {
    if (variaveis.has(nome)) return variaveis.get(nome);
    if (nome === 'requestScope') return atributos;
    if (nome === 'param') return atributos.__param ?? {};
    return Object.prototype.hasOwnProperty.call(atributos, nome) ? atributos[nome] : null;
  };
  const el = (t, unico = false) => (elIgnorado ? t : interpolar(t, escopo, { valorUnico: unico }));
  const valorAtributo = (no, nome) => (no.atributos[nome] == null ? undefined : el(no.atributos[nome], true));
  const comVariavel = async (nome, valor, fn) => {
    const antes = variaveis.has(nome) ? variaveis.get(nome) : undefined;
    const tinha = variaveis.has(nome);
    variaveis.set(nome, valor);
    try {
      return await fn();
    } finally {
      if (tinha) variaveis.set(nome, antes);
      else variaveis.delete(nome);
    }
  };

  async function filhos(no, saida) {
    for (const f of no.filhos) await render(f, saida);
  }
  async function textoDosFilhos(no) {
    const saida = [];
    await filhos(no, saida);
    return saida.join('');
  }

  async function render(no, saida) {
    if (no.tipo === 'texto') {
      saida.push(el(no.v));
      return;
    }
    const id = `${no.prefixo}:${no.nome}`;
    switch (id) {
      case 'snk:load':
        return;
      case 'snk:query': {
        const nomeVar = no.atributos.var;
        if (!nomeVar) throw new ErroJsp('<snk:query> sem o atributo var.');
        const sql = ligarParametros(await textoDosFilhos(no), atributos).trim();
        const inicio = Date.now();
        const resposta = await executarSql(sql);
        const ok = String(resposta?.status) === '1';
        aoConsultar?.({ var: nomeVar, sql, ok, ms: Date.now() - inicio, linhas: resposta?.responseBody?.rows?.length ?? 0, erro: ok ? null : resposta?.statusMessage });
        if (!ok) {
          const msg = String(resposta?.statusMessage || 'erro na consulta').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          throw new ErroJsp(msg);
        }
        variaveis.set(nomeVar, resultado(resposta));
        return;
      }
      case 'emu:seAtributo': {
        const existe = atributos[no.atributos.nome] != null;
        if (existe === (no.atributos.existe === 'sim')) await filhos(no, saida);
        return;
      }
      case 'c:out': {
        let v = valorAtributo(no, 'value');
        if (v == null || v === '') v = no.atributos.default != null ? valorAtributo(no, 'default') : no.filhos.length ? await textoDosFilhos(no) : v;
        const escapar = no.atributos.escapeXml == null || String(valorAtributo(no, 'escapeXml')) !== 'false';
        saida.push(escapar ? escaparXml(texto(v)) : texto(v));
        return;
      }
      case 'c:set': {
        if (no.atributos.target) throw new ErroNaoSuportado('<c:set target=...> não suportado pelo emulador.');
        const v = no.atributos.value != null ? valorAtributo(no, 'value') : await textoDosFilhos(no);
        variaveis.set(no.atributos.var, v);
        return;
      }
      case 'c:remove':
        variaveis.delete(no.atributos.var);
        return;
      case 'c:if': {
        const ok = Boolean(valorAtributo(no, 'test')) && String(valorAtributo(no, 'test')) !== 'false';
        if (no.atributos.var) variaveis.set(no.atributos.var, ok);
        if (ok) await filhos(no, saida);
        return;
      }
      case 'c:choose': {
        for (const f of no.filhos) {
          if (f.tipo === 'texto') continue;
          if (f.nome === 'when') {
            const t = valorAtributo(f, 'test');
            if (t && String(t) !== 'false') return filhos(f, saida);
          } else if (f.nome === 'otherwise') return filhos(f, saida);
        }
        return;
      }
      case 'c:forEach':
      case 'c:forTokens': {
        let itens;
        if (id === 'c:forTokens') {
          const delims = String(valorAtributo(no, 'delims') ?? ',');
          itens = texto(valorAtributo(no, 'items')).split(new RegExp(`[${delims.replace(/[\]\\^-]/g, '\\$&')}]`)).filter((t) => t !== '');
        } else if (no.atributos.items != null) {
          const v = valorAtributo(no, 'items');
          itens = v == null ? [] : Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : typeof v === 'object' ? Object.entries(v).map(([key, value]) => ({ key, value })) : [v];
        } else {
          const ini = Number(valorAtributo(no, 'begin') ?? 0);
          const fim = Number(valorAtributo(no, 'end') ?? ini);
          itens = Array.from({ length: Math.max(fim - ini + 1, 0) }, (_, i) => ini + i);
        }
        const passo = Number(valorAtributo(no, 'step') ?? 1) || 1;
        const ini = no.atributos.items != null || id === 'c:forTokens' ? Number(valorAtributo(no, 'begin') ?? 0) : 0;
        const fim = no.atributos.items != null || id === 'c:forTokens' ? Math.min(Number(valorAtributo(no, 'end') ?? itens.length - 1), itens.length - 1) : itens.length - 1;
        const indices = [];
        for (let i = ini; i <= fim; i += passo) indices.push(i);
        for (let n = 0; n < indices.length; n++) {
          const i = indices[n];
          const status = { index: i, count: n + 1, first: n === 0, last: n === indices.length - 1, current: itens[i] };
          const executar = () => filhos(no, saida);
          const comStatus = no.atributos.varStatus ? () => comVariavel(no.atributos.varStatus, status, executar) : executar;
          await (no.atributos.var ? comVariavel(no.atributos.var, itens[i], comStatus) : comStatus());
        }
        return;
      }
      case 'c:catch': {
        const parcial = [];
        try {
          await filhos(no, parcial);
          if (no.atributos.var) variaveis.delete(no.atributos.var);
        } catch (e) {
          if (!(e instanceof ErroJsp || e instanceof ErroEl)) throw e;
          if (no.atributos.var) variaveis.set(no.atributos.var, { message: e.message, toString: () => e.message });
        }
        saida.push(parcial.join(''));
        return;
      }
      case 'c:url':
        saida.push(texto(valorAtributo(no, 'value')));
        return;
      case 'c:when':
      case 'c:otherwise':
        throw new ErroJsp(`<${id}> fora de <c:choose>.`);
      default:
        throw new ErroNaoSuportado(`<${id}> não é suportado pelo emulador. Teste esta página na base de testes do ERP.`);
    }
  }

  const saida = [];
  try {
    await filhos(raiz, saida);
  } catch (e) {
    if (e instanceof ErroEl) throw new ErroJsp(`expressão EL inválida: ${e.message}`);
    throw e;
  }
  return saida.join('');
}

/** A página usa recursos de servidor (taglib, scriptlet)? Se não, basta trocar o EL conhecido. */
export const usaServidor = (fonte) => /<%@\s*taglib|<%(?![@-])/.test(fonte);

export { vazio };
