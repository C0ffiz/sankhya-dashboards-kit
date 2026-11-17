// Avaliador da Expression Language (EL) do JSP — o subconjunto usado em dashboards do Sankhya.
// Usado pelo emulador (lib/jsp-emulado.mjs). Não usa eval: tokeniza, monta a árvore e interpreta.
//
// Suporta: literais (números, 'texto', "texto", true/false/null), variáveis, a.b, a[expr],
// empty, not/!, and/&&, or/||, == != < > <= >= (e eq ne lt gt le ge), + - * / % (div mod),
// ternário ?: , parênteses e funções fn:length, fn:escapeXml, fn:toUpperCase, fn:toLowerCase,
// fn:trim, fn:contains, fn:startsWith, fn:endsWith, fn:substring, fn:replace, fn:join, fn:split.

export class ErroEl extends Error {}

const PALAVRAS = new Set(['and', 'or', 'not', 'empty', 'eq', 'ne', 'lt', 'gt', 'le', 'ge', 'div', 'mod', 'true', 'false', 'null']);

function tokenizar(texto) {
  const tokens = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(texto[i + 1] ?? ''))) {
      const m = texto.slice(i).match(/^\d*\.?\d+(?:[eE][+-]?\d+)?/);
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < texto.length && texto[j] !== c) {
        if (texto[j] === '\\' && j + 1 < texto.length) j++;
        s += texto[j++];
      }
      if (j >= texto.length) throw new ErroEl(`texto sem fechamento na expressão: ${texto}`);
      tokens.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = texto.slice(i).match(/^[A-Za-z_$][\w$]*(?::[A-Za-z_$][\w$]*)?/);
      const id = m[0];
      if (id.includes(':')) tokens.push({ t: 'fn', v: id });
      else if (PALAVRAS.has(id)) tokens.push({ t: 'op', v: id });
      else tokens.push({ t: 'id', v: id });
      i += id.length;
      continue;
    }
    const dois = texto.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(dois)) {
      tokens.push({ t: 'op', v: dois });
      i += 2;
      continue;
    }
    if ('<>!+-*/%?:()[].,'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new ErroEl(`caractere inesperado "${c}" na expressão: ${texto}`);
  }
  return tokens;
}

const SINONIMOS = { and: '&&', or: '||', not: '!', eq: '==', ne: '!=', lt: '<', gt: '>', le: '<=', ge: '>=', div: '/', mod: '%' };

/** Analisa a expressão (sem ${ }) e devolve a árvore. */
export function analisar(texto) {
  const tokens = tokenizar(texto).map((t) => (t.t === 'op' && SINONIMOS[t.v] ? { ...t, v: SINONIMOS[t.v] } : t));
  let p = 0;
  const olhar = () => tokens[p];
  const eh = (v) => olhar()?.t === 'op' && olhar().v === v;
  const consumir = (v) => {
    if (!eh(v)) throw new ErroEl(`esperado "${v}" na expressão: ${texto}`);
    p++;
  };

  const ternario = () => {
    const cond = ou();
    if (eh('?')) {
      p++;
      const sim = ternario();
      consumir(':');
      return { k: 'ternario', cond, sim, nao: ternario() };
    }
    return cond;
  };
  const binario = (proximo, ops) => () => {
    let esq = proximo();
    while (olhar()?.t === 'op' && ops.includes(olhar().v)) {
      const op = tokens[p++].v;
      esq = { k: 'bin', op, esq, dir: proximo() };
    }
    return esq;
  };
  const unario = () => {
    if (eh('!')) return (p++, { k: 'nao', v: unario() });
    if (eh('-')) return (p++, { k: 'neg', v: unario() });
    if (eh('empty')) return (p++, { k: 'vazio', v: unario() });
    return posfixo();
  };
  const multiplicativo = binario(unario, ['*', '/', '%']);
  const aditivo = binario(multiplicativo, ['+', '-']);
  const relacional = binario(aditivo, ['<', '>', '<=', '>=']);
  const igualdade = binario(relacional, ['==', '!=']);
  const e = binario(igualdade, ['&&']);
  const ou = binario(e, ['||']);

  function primario() {
    const t = tokens[p++];
    if (!t) throw new ErroEl(`expressão incompleta: ${texto}`);
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'op' && t.v === 'true') return { k: 'lit', v: true };
    if (t.t === 'op' && t.v === 'false') return { k: 'lit', v: false };
    if (t.t === 'op' && t.v === 'null') return { k: 'lit', v: null };
    if (t.t === 'id') return { k: 'var', v: t.v };
    if (t.t === 'fn') {
      consumir('(');
      const args = [];
      if (!eh(')')) {
        args.push(ternario());
        while (eh(',')) {
          p++;
          args.push(ternario());
        }
      }
      consumir(')');
      return { k: 'fn', nome: t.v, args };
    }
    if (t.t === 'op' && t.v === '(') {
      const x = ternario();
      consumir(')');
      return x;
    }
    throw new ErroEl(`token inesperado "${t.v}" na expressão: ${texto}`);
  }
  function posfixo() {
    let x = primario();
    for (;;) {
      if (eh('.')) {
        p++;
        const t = tokens[p++];
        if (!t || (t.t !== 'id' && t.t !== 'op')) throw new ErroEl(`propriedade inválida na expressão: ${texto}`);
        x = { k: 'prop', base: x, nome: { k: 'lit', v: t.v } };
      } else if (eh('[')) {
        p++;
        const nome = ternario();
        consumir(']');
        x = { k: 'prop', base: x, nome };
      } else return x;
    }
  }

  const arvore = ternario();
  if (p < tokens.length) throw new ErroEl(`sobrou "${tokens[p].v}" na expressão: ${texto}`);
  return arvore;
}

/** Propriedade como no EL: base nula → null; mapas sem diferenciar maiúsculas (como as linhas do JSTL). */
export function propriedade(base, nome) {
  if (base == null) return null;
  if (Array.isArray(base)) {
    if (nome === 'length') return base.length;
    const i = Number(nome);
    return Number.isInteger(i) ? (base[i] ?? null) : null;
  }
  if (typeof base === 'object') {
    if (Object.prototype.hasOwnProperty.call(base, nome)) return base[nome];
    const alvo = String(nome).toLowerCase();
    for (const k of Object.keys(base)) if (k.toLowerCase() === alvo) return base[k];
    return null;
  }
  if (typeof base === 'string' && nome === 'length') return base.length;
  return null;
}

export const vazio = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const booleano = (v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v));
const numero = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(typeof v === 'string' ? v.trim() : v);
  if (Number.isNaN(n)) throw new ErroEl(`não é número: "${v}"`);
  return n;
};
const ehNumerico = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

function comparar(a, b) {
  if (a == null || b == null) return a == null && b == null ? 0 : NaN;
  if (typeof a === 'number' || typeof b === 'number') return ehNumerico(a) && ehNumerico(b) ? numero(a) - numero(b) : NaN;
  if (typeof a === 'boolean' || typeof b === 'boolean') return booleano(a) === booleano(b) ? 0 : NaN;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

const escaparXml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#034;', "'": '&#039;' })[c]);
export const texto = (v) => (v == null ? '' : typeof v === 'object' && !Array.isArray(v) && typeof v.toString === 'function' && v.toString !== Object.prototype.toString ? v.toString() : String(v));

const FUNCOES = {
  'fn:length': (x) => (x == null ? 0 : Array.isArray(x) || typeof x === 'string' ? x.length : Object.keys(x).length),
  'fn:escapeXml': (s) => escaparXml(s),
  'fn:toUpperCase': (s) => texto(s).toUpperCase(),
  'fn:toLowerCase': (s) => texto(s).toLowerCase(),
  'fn:trim': (s) => texto(s).trim(),
  'fn:contains': (s, t) => texto(s).includes(texto(t)),
  'fn:startsWith': (s, t) => texto(s).startsWith(texto(t)),
  'fn:endsWith': (s, t) => texto(s).endsWith(texto(t)),
  'fn:substring': (s, a, b) => texto(s).substring(numero(a), b == null || numero(b) < 0 ? undefined : numero(b)),
  'fn:replace': (s, a, b) => texto(s).split(texto(a)).join(texto(b)),
  'fn:join': (l, sep) => (Array.isArray(l) ? l.map(texto).join(texto(sep)) : ''),
  'fn:split': (s, sep) => texto(s).split(new RegExp(`[${texto(sep).replace(/[\]\\^-]/g, '\\$&')}]`)).filter(Boolean),
};

/** Avalia a árvore no escopo dado (função nome → valor). */
export function avaliarArvore(n, escopo) {
  switch (n.k) {
    case 'lit':
      return n.v;
    case 'var':
      return escopo(n.v);
    case 'prop':
      return propriedade(avaliarArvore(n.base, escopo), avaliarArvore(n.nome, escopo));
    case 'nao':
      return !booleano(avaliarArvore(n.v, escopo));
    case 'neg':
      return -numero(avaliarArvore(n.v, escopo));
    case 'vazio':
      return vazio(avaliarArvore(n.v, escopo));
    case 'ternario':
      return booleano(avaliarArvore(n.cond, escopo)) ? avaliarArvore(n.sim, escopo) : avaliarArvore(n.nao, escopo);
    case 'fn': {
      const f = FUNCOES[n.nome];
      if (!f) throw new ErroEl(`função ${n.nome} não suportada pelo emulador`);
      return f(...n.args.map((a) => avaliarArvore(a, escopo)));
    }
    case 'bin': {
      if (n.op === '&&') return booleano(avaliarArvore(n.esq, escopo)) && booleano(avaliarArvore(n.dir, escopo));
      if (n.op === '||') return booleano(avaliarArvore(n.esq, escopo)) || booleano(avaliarArvore(n.dir, escopo));
      const a = avaliarArvore(n.esq, escopo);
      const b = avaliarArvore(n.dir, escopo);
      switch (n.op) {
        case '==':
          return comparar(a, b) === 0;
        case '!=':
          return comparar(a, b) !== 0;
        case '<':
          return comparar(a, b) < 0;
        case '>':
          return comparar(a, b) > 0;
        case '<=':
          return comparar(a, b) <= 0;
        case '>=':
          return comparar(a, b) >= 0;
        case '+':
          return numero(a) + numero(b);
        case '-':
          return numero(a) - numero(b);
        case '*':
          return numero(a) * numero(b);
        case '/':
          return numero(a) / numero(b);
        case '%':
          return numero(a) % numero(b);
      }
    }
  }
  throw new ErroEl(`nó desconhecido: ${n.k}`);
}

const cache = new Map();
/** Avalia "expr" (o conteúdo de ${...}). */
export function avaliar(expr, escopo) {
  if (!cache.has(expr)) cache.set(expr, analisar(expr));
  return avaliarArvore(cache.get(expr), escopo);
}

/**
 * Interpola ${...} num texto. Um atributo que é só "${x}" devolve o valor (lista, objeto...);
 * qualquer outra coisa vira texto. \${ escapa.
 */
export function interpolar(textoFonte, escopo, { valorUnico = false } = {}) {
  const partes = [];
  let i = 0;
  let ultimo = 0;
  while ((i = textoFonte.indexOf('${', i)) >= 0) {
    if (textoFonte[i - 1] === '\\') {
      partes.push(textoFonte.slice(ultimo, i - 1), '${');
      i += 2;
      ultimo = i;
      continue;
    }
    // fim da expressão: a próxima } fora de aspas
    let j = i + 2;
    let aspas = null;
    for (; j < textoFonte.length; j++) {
      const c = textoFonte[j];
      if (aspas) {
        if (c === '\\') j++;
        else if (c === aspas) aspas = null;
      } else if (c === "'" || c === '"') aspas = c;
      else if (c === '}') break;
    }
    if (j >= textoFonte.length) throw new ErroEl(`expressão sem fechamento: ${textoFonte.slice(i, i + 60)}`);
    const valor = avaliar(textoFonte.slice(i + 2, j), escopo);
    if (valorUnico && i === 0 && j === textoFonte.length - 1) return valor;
    partes.push(textoFonte.slice(ultimo, i), texto(valor));
    i = j + 1;
    ultimo = i;
  }
  partes.push(textoFonte.slice(ultimo));
  return partes.join('');
}

export { escaparXml };
