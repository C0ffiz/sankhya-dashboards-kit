/**
 * Camada de dados híbrida — ÚNICO ponto de acesso a dados dos dashboards.
 *
 * - Desenvolvimento (`npm run dev`): POST /api/sql → proxy local do kit (proxy/) → API do Sankhya (credenciais do .env).
 * - Produção (painel.jsp no ERP): SankhyaJX (JX.post) → /mge/service.sbr, usando a sessão do usuário logado.
 *
 * - Consultas no servidor (`consultarServidor`): o SQL fica fixo no pacote (dados.jsp, <snk:query>) e funciona
 *   para usuários SEM permissão no DBExplorer. No dev, o mesmo dados.jsp roda no proxy local (/api/dados).
 *
 * Importe nos dashboards como:  import { consultarSQL } from 'sankhya-kit/dados.js';
 *
 * `import.meta.env.DEV` é resolvido no build: o ramo do proxy é eliminado do pacote final.
 * Os dois caminhos recebem a MESMA resposta crua do DbExplorerSP.executeQuery e passam por `normalizar`.
 */

const SERVICO = 'DbExplorerSP.executeQuery';

/**
 * Executa um SELECT e devolve um array de objetos: [{ CODEMP: 1, NOMEFANTASIA: '...' }, ...]
 * Lança Error com a mensagem do Sankhya se a consulta falhar.
 * Limite do serviço: 5.000 linhas por chamada.
 *
 * @param {string} sql
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function consultarSQL(sql) {
  const texto = String(sql).replace(/\s+/g, ' ').trim();
  const resposta = import.meta.env.DEV ? await viaProxyLocal(texto) : await viaSankhyaJX(texto);
  return normalizar(resposta, texto);
}

async function viaProxyLocal(sql) {
  let r;
  try {
    r = await fetch('/api/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
  } catch {
    throw new Error('Proxy local inacessível. Rode `npm run dev -- <dashboard>` na raiz do projeto.');
  }
  return r.json().catch(() => ({ status: '0', statusMessage: `Proxy respondeu HTTP ${r.status} sem JSON.` }));
}

async function viaSankhyaJX(sql) {
  if (typeof JX === 'undefined') {
    throw new Error('SankhyaJX não carregado (assets/jx.min.js ausente no pacote).');
  }
  // JX.consultar engole erros (devolve []), então usamos JX.post no mesmo endpoint e checamos o status.
  const url = `${window.location.origin}/mge/service.sbr?serviceName=${SERVICO}&outputType=json`;
  const resposta = await JX.post(url, { serviceName: SERVICO, requestBody: { sql } });
  return resposta ?? { status: '0', statusMessage: 'Sem resposta do servidor Sankhya (sessão expirada?).' };
}

function normalizar(resposta, sql) {
  const dados = resposta?.data ?? resposta;
  if (String(dados?.status) !== '1') {
    const msg = String(dados?.statusMessage || 'Erro desconhecido na consulta.')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const erro = new Error(msg);
    erro.sql = sql;
    throw erro;
  }
  const corpo = dados.responseBody ?? {};
  const nomes = (corpo.fieldsMetadata ?? []).map((c) => c.name);
  return (corpo.rows ?? []).map((linha) => Object.fromEntries(nomes.map((n, i) => [n, linha[i]])));
}

/** Limite de linhas por chamada do DbExplorerSP.executeQuery. */
export const LIMITE_LINHAS = 5000;

/**
 * Executa um SELECT que pode passar de 5.000 linhas, em páginas (ROW_NUMBER, ordem determinística).
 * `ordem` é a lista de colunas do próprio SELECT que identifica a linha (ex.: 'NUNOTA, SEQUENCIA').
 * Para em `maximo` linhas; nesse caso o array devolvido vem com `.parcial === true`.
 *
 * @param {string} sql
 * @param {string} ordem
 * @param {{ maximo?: number, aoProgresso?: (linhas: number) => void }} [opcoes]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function consultarPaginado(sql, ordem, { maximo = 50000, aoProgresso } = {}) {
  const base = String(sql).replace(/\s+/g, ' ').trim();
  const linhas = [];
  linhas.parcial = false;
  for (let inicio = 1; ; inicio += LIMITE_LINHAS) {
    const pagina = await consultarSQL(
      `SELECT * FROM (SELECT T.*, ROW_NUMBER() OVER (ORDER BY ${ordem}) AS RN FROM (${base}) T) ` +
        `WHERE RN BETWEEN ${inicio} AND ${inicio + LIMITE_LINHAS - 1}`,
    );
    for (const linha of pagina) {
      delete linha.RN;
      linhas.push(linha);
    }
    aoProgresso?.(linhas.length);
    if (pagina.length < LIMITE_LINHAS) break;
    if (linhas.length >= maximo) {
      linhas.parcial = true;
      break;
    }
  }
  return linhas;
}

/** Lista de números validados para um `IN (...)`: [1, 2, 3] → '1,2,3'. */
export function sqlLista(valores) {
  return valores.map(sqlNumero).join(',');
}

/* ---------- Helpers para montar SQL com valores de filtros (evita SQL quebrado/injeção) ---------- */

/** 'O''Brien' — texto entre aspas simples, com aspas escapadas. null → NULL */
export function sqlTexto(valor) {
  return valor == null || valor === '' ? 'NULL' : `'${String(valor).replace(/'/g, "''")}'`;
}

/** Número validado. Lança erro se não for numérico. null → NULL */
export function sqlNumero(valor) {
  if (valor == null || valor === '') return 'NULL';
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido: ${valor}`);
  return String(n);
}

/** Data 'DD/MM/AAAA' ou 'AAAA-MM-DD' → TO_DATE('DD/MM/AAAA','DD/MM/YYYY'). null → NULL */
export function sqlData(valor) {
  if (valor == null || valor === '') return 'NULL';
  const s = String(valor).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) {
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) m = [null, iso[3], iso[2], iso[1]];
  }
  if (!m) throw new Error(`Data inválida: ${valor}`);
  return `TO_DATE('${m[1]}/${m[2]}/${m[3]}','DD/MM/YYYY')`;
}

/* ---------- Consultas no servidor (<snk:query>, sem DbExplorer) ---------- */
//
// Para dashboards que declaram "consultasServidor" no dashboard.json: o build gera dados.jsp com o SQL fixo
// e cada chamada aqui pede uma consulta pelo NOME, com valores numéricos. Funciona para usuários sem
// permissão no DBExplorer. Detalhes: docs/consultas-no-servidor.md do kit.

/** Entrada gerada pelo build (lib/consultas-servidor.mjs). */
const ENTRADA_DADOS = 'dados.jsp';
const PARAMETROS_DO_ERP = ['entryPoint', 'nuGdg', 'gadGetID', 'userID'];

/** Data (Date, 'AAAA-MM-DD' ou 'DD/MM/AAAA') → 20261001. Número/texto numérico passa direto. */
function valorServidor(v) {
  if (v instanceof Date) return `${v.getFullYear()}${String(v.getMonth() + 1).padStart(2, '0')}${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Valor não numérico para consulta no servidor: ${v}`);
  return s;
}

function urlDados(nomes, parametros, pagina) {
  const busca = new URLSearchParams();
  for (const n of nomes) busca.append('q', n);
  for (const [chave, valor] of Object.entries(parametros ?? {})) {
    if (valor == null || valor === '') continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) if (v != null && v !== '') busca.append(chave, valorServidor(v));
  }
  if (pagina) busca.set('pagina', String(pagina));
  if (import.meta.env.DEV) return `/api/dados?${busca}`;
  // Mesmo componente da página atual (nuGdg, gadGetID, userID), outra entrada.
  // document.baseURI também funciona dentro do iframe do diagnóstico (srcdoc herda o endereço da página).
  const atual = new URL(document.baseURI || window.location.href);
  const u = new URL(atual.pathname.endsWith('html5component.mge') ? atual.href : `${window.location.origin}/mge/html5component.mge`);
  for (const k of [...u.searchParams.keys()]) if (!PARAMETROS_DO_ERP.includes(k)) u.searchParams.delete(k);
  u.searchParams.set('entryPoint', ENTRADA_DADOS);
  for (const [k, v] of busca) u.searchParams.append(k, v);
  return u.toString();
}

/** Lê a resposta do dados.jsp: { nome: { linhas, erro, paginada } }. */
function lerResposta(texto, status) {
  const doc = new DOMParser().parseFromString(texto, 'text/html');
  const raiz = doc.querySelector('zd');
  if (!raiz) {
    const resumo = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(
      status !== 200
        ? `dados.jsp respondeu HTTP ${status}${resumo ? `: ${resumo}` : ''}. O pacote tem o dados.jsp? (npm run build)`
        : `Resposta inesperada do dados.jsp (sessão expirada?)${resumo ? `: ${resumo}` : ''}`,
    );
  }
  const saida = {};
  for (const q of raiz.querySelectorAll('zq')) {
    const nome = q.getAttribute('n');
    const erro = q.querySelector('ze');
    if (erro) {
      saida[nome] = { linhas: [], erro: erro.textContent.replace(/\s+/g, ' ').trim() || 'erro na consulta' };
      continue;
    }
    const colunas = [...q.querySelectorAll('zh > zc')].map((c) => c.textContent);
    const ignorar = colunas.indexOf('RN_PAG_');
    const linhas = [];
    for (const r of q.querySelectorAll('zr')) {
      const linha = {};
      const celulas = r.children;
      for (let i = 0; i < colunas.length; i++) {
        if (i === ignorar) continue;
        const c = celulas[i];
        linha[colunas[i]] = !c || c.localName === 'n' ? null : c.textContent;
      }
      linhas.push(linha);
    }
    saida[nome] = { linhas, erro: null, paginada: q.hasAttribute('pag'), tamanhoPagina: Number(q.getAttribute('pag')) || 0 };
  }
  return saida;
}

async function pedirDados(nomes, parametros, pagina) {
  const url = urlDados(nomes, parametros, pagina);
  let r;
  try {
    r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch (e) {
    throw new Error(import.meta.env.DEV ? 'Proxy local inacessível. Rode `npm run dev -- <dashboard>` na raiz do projeto.' : `Falha ao chamar o dados.jsp: ${e.message}`);
  }
  const resposta = lerResposta(await r.text(), r.status);
  for (const n of nomes) if (!resposta[n]) resposta[n] = { linhas: [], erro: `consulta "${n}" não existe no dados.jsp (declare em consultasServidor e gere o pacote de novo)` };
  return resposta;
}

/**
 * Executa no servidor uma consulta declarada no módulo "consultasServidor" do dashboard.
 * Valores: números, listas de números e datas (Date, 'AAAA-MM-DD' ou 'DD/MM/AAAA'). Os valores vêm como TEXTO
 * (como no JSTL); converta as colunas numéricas que for usar como número.
 * Consultas com `paginar` são buscadas página a página até `maximo` (array com `.parcial = true` se parar antes).
 *
 * @param {string} nome
 * @param {Record<string, any>} [parametros]
 * @param {{ maximo?: number, aoProgresso?: (linhas: number) => void }} [opcoes]
 * @returns {Promise<Array<Record<string, string|null>>>}
 */
export async function consultarServidor(nome, parametros = {}, { maximo = 50000, aoProgresso } = {}) {
  const linhas = [];
  linhas.parcial = false;
  for (let pagina = 0; ; pagina++) {
    const r = (await pedirDados([nome], parametros, pagina))[nome];
    if (r.erro) {
      const e = new Error(r.erro);
      e.consulta = nome;
      throw e;
    }
    linhas.push(...r.linhas);
    aoProgresso?.(linhas.length);
    if (!r.paginada || r.linhas.length < r.tamanhoPagina) break;
    if (linhas.length >= maximo) {
      linhas.parcial = true;
      break;
    }
  }
  return linhas;
}

/**
 * Várias consultas pequenas numa só ida ao servidor (sem paginação), com os mesmos parâmetros.
 * Cada uma falha isolada: { nome: { linhas, erro } }.
 * @param {string[]} nomes
 * @param {Record<string, any>} [parametros]
 */
export async function consultarServidorLote(nomes, parametros = {}) {
  const r = await pedirDados(nomes, parametros, 0);
  return Object.fromEntries(nomes.map((n) => [n, { linhas: r[n].linhas, erro: r[n].erro }]));
}
