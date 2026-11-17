// Proxy local de DESENVOLVIMENTO para os dashboards.
//
// Recebe SQL do navegador (via Vite, em /api/sql), executa no Sankhya com as credenciais do .env
// (DbExplorerSP.executeQuery) e devolve a resposta crua do Sankhya — o mesmo formato que o ERP
// devolve ao SankhyaJX em produção, para que runtime/dados.js trate os dois igual.
//
// NUNCA faz parte do build: só roda na sua máquina, escuta apenas em 127.0.0.1 e aceita só SELECT/WITH.
// Normalmente é iniciado pelo `npm run dev`. Para rodar sozinho: npm run proxy
// Lê o .env da pasta onde o comando roda (a raiz do projeto).
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { lerEnv } from './env.mjs';
import { SankhyaCliente } from './sankhya-cliente.mjs';
import { ARQUIVO_ENV } from '../lib/projeto.mjs';

const SERVICO = 'DbExplorerSP.executeQuery';
const ENDPOINT_SQL = `/gateway/v1/mge/service.sbr?serviceName=${SERVICO}&outputType=json`;
const HOSTS_PERMITIDOS = new Set(['127.0.0.1', 'localhost']);
const TAMANHO_MAXIMO = 1_000_000; // 1 MB de SQL é mais que suficiente
const PALAVRAS_PROIBIDAS =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE|BEGIN|CALL|COMMIT)\b/i;

/** Devolve o SQL limpo ou lança Error se não for uma única consulta de leitura. */
export function validarSql(sql) {
  const semComentarios = String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const limpo = semComentarios.trim().replace(/;\s*$/, '').trim();
  if (!limpo) throw new Error('SQL vazio.');
  if (!/^(SELECT|WITH)\b/i.test(limpo)) throw new Error('Somente SELECT/WITH é permitido no proxy de desenvolvimento.');
  const semTextos = limpo.replace(/'[^']*'/g, "''");
  if (semTextos.includes(';')) throw new Error("Envie uma única instrução (sem ';').");
  if (PALAVRAS_PROIBIDAS.test(semTextos)) throw new Error('SQL contém comando de escrita/DDL — bloqueado no proxy.');
  return limpo;
}

/** Bloqueia DNS rebinding: só aceita requisições endereçadas a localhost. */
function hostLocal(req) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return HOSTS_PERMITIDOS.has(host);
}

function responder(res, codigo, corpo) {
  const dados = Buffer.from(JSON.stringify(corpo), 'utf-8');
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': dados.length,
    'Cache-Control': 'no-store',
  });
  res.end(dados);
}

// Mesmo formato de erro do Sankhya (status != "1"), tratado igual em dados.js
const erro = (res, codigo, mensagem) => responder(res, codigo, { status: '0', statusMessage: mensagem });

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    const partes = [];
    let total = 0;
    req.on('data', (p) => {
      total += p.length;
      if (total > TAMANHO_MAXIMO) {
        falha(new Error('SQL grande demais.'));
        req.destroy();
      } else partes.push(p);
    });
    req.on('end', () => ok(Buffer.concat(partes).toString('utf-8')));
    req.on('error', falha);
  });
}

/**
 * Executor de consultas: valida o SQL (só leitura) e chama o DbExplorerSP.executeQuery com as credenciais do .env.
 * Devolve a resposta crua do Sankhya. Usado pelo proxy e pelo emulador (npm run emular).
 * @returns {(sql: string) => Promise<object>}
 */
export function criarExecutor() {
  const cliente = new SankhyaCliente(lerEnv(ARQUIVO_ENV)); // valida o .env já na criação
  return async (sqlBruto) => {
    const sql = validarSql(sqlBruto);
    const inicio = performance.now();
    const resposta = await cliente.post(ENDPOINT_SQL, { serviceName: SERVICO, requestBody: { sql } });
    const ms = Math.round(performance.now() - inicio);
    const linhas = resposta?.responseBody?.rows?.length ?? 0;
    console.log(`[proxy] ${String(ms).padStart(6)} ms  status=${resposta?.status}  linhas=${linhas}  ${sql.replace(/\s+/g, " ").slice(0, 90)}`);
    return resposta;
  };
}

/** Converte falhas de rede/HTTP numa mensagem para o usuário. */
export function mensagemDeFalha(e) {
  const causa = e.cause?.code || e.cause?.message;
  return e.status ? e.message : `Falha ao contatar o Sankhya: ${e.message}${causa ? ` (${causa})` : ''}`;
}

/**
 * Sobe o proxy em 127.0.0.1:<porta>. Lê as credenciais do .env da raiz do projeto (pasta do comando).
 * @returns {Promise<import('node:http').Server>}
 */
export async function iniciarProxy({ porta = 8787 } = {}) {
  const executar = criarExecutor();

  const servidor = createServer(async (req, res) => {
    if (!hostLocal(req)) return erro(res, 403, 'Host não permitido.');
    if (req.method === 'GET' && req.url === '/api/saude') return responder(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/api/sql') return erro(res, 404, 'Rota inexistente.');
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return erro(res, 415, 'Envie Content-Type: application/json.');
    }

    let sql;
    try {
      const pedido = JSON.parse((await lerCorpo(req)) || '{}');
      sql = validarSql(pedido.sql ?? '');
    } catch (e) {
      return erro(res, 400, e instanceof SyntaxError ? 'JSON inválido.' : e.message);
    }

    try {
      responder(res, 200, await executar(sql));
    } catch (e) {
      const msg = mensagemDeFalha(e);
      console.error(`[proxy] erro: ${msg}`);
      erro(res, 502, msg);
    }
  });

  await new Promise((ok, falha) => {
    servidor.once('error', (e) => falha(new Error(`Não foi possível usar a porta ${porta}: ${e.message}`)));
    servidor.listen(porta, '127.0.0.1', ok);
  });
  console.log(`[proxy] ouvindo em http://127.0.0.1:${porta}  (POST /api/sql, somente leitura)`);
  return servidor;
}

// Execução direta: node proxy/servidor-dev.mjs [--porta 8787]
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const i = process.argv.indexOf('--porta');
  const porta = i > 0 ? Number(process.argv[i + 1]) : 8787;
  iniciarProxy({ porta }).catch((e) => {
    console.error(`[proxy] ${e.message}`);
    process.exit(1);
  });
}
