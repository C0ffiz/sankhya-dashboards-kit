/**
 * Camada de dados híbrida — ÚNICO ponto de acesso a dados dos dashboards.
 *
 * - Desenvolvimento (`npm run dev`): POST /api/sql → proxy Python local → API do Sankhya (credenciais do .env).
 * - Produção (index.jsp no ERP): SankhyaJX (JX.post) → /mge/service.sbr, usando a sessão do usuário logado.
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
