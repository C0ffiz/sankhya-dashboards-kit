// npm run emular -- <arquivo.zip | nome> [--porta 5299] [--entrada painel.jsp] [--param NOME=valor ...]
//
// Serve um pacote do jeito que o ERP serve (/mge/html5component.mge?entryPoint=...), na sua máquina,
// com dados reais. Pega antes de subir no ERP os erros que só apareciam lá:
//   - index.jsp como entrada → 500 "Internal Server Error" (como o ERP);
//   - arquivo por caminho relativo → 404 (o ERP resolve ./x para /mge/x);
//   - pasta sem entrada própria no zip → aviso da verificação;
//   - JSP com <snk:query>/JSTL: executado por lib/jsp-emulado.mjs, com o SQL indo ao ERP pelo executor
//     do proxy (só leitura); erro sem <c:catch> → 500, como no ERP, mas com o motivo na tela;
//   - window.openApp emulado: registra a tela e a chave no terminal e avisa na página.
// Parâmetros do componente (atributos da requisição): --param X=valor, ?X=valor na URL ou parametros.json
// do dashboard. Período: --param PERIODO.INI=01/10/2026 --param PERIODO.FIN=31/10/2026.
// Diferenças em relação ao ERP: docs/debug-e-logs.md (seção "Emulador").
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { criarExecutor, mensagemDeFalha } from '../../proxy/servidor-dev.mjs';
import { PASTA_DASHBOARDS, PASTA_SAIDA, PROJETO, ErroUsuario, listarDashboards } from '../projeto.mjs';
import { verificarEntradas } from '../pacote.mjs';
import { ErroJsp, ErroNaoSuportado, renderizarJsp } from '../jsp-emulado.mjs';
import { escaparXml } from '../el.mjs';
import { TELAS } from '../../runtime/erp.js';

const PASTA_PUBLICADA = 'html5component/emulador_1/'; // mesmo formato do ${BASE_FOLDER} do ERP
const TIPOS = { js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', json: 'application/json', woff: 'font/woff', woff2: 'font/woff2' };
const PARAMETROS_DO_ERP = new Set(['entryPoint', 'nuGdg', 'gadGetID', 'userID']);
const NOMES_TELAS = Object.fromEntries(Object.values(TELAS).map((t) => [t.resource, t.nome]));

/** Script injetado nas páginas servidas: window.openApp emulado (avisa na página e no terminal). */
const SCRIPT_OPENAPP = `<script>(function () {
  var nomes = ${JSON.stringify(NOMES_TELAS)};
  function aviso(t) {
    var el = document.createElement('div');
    el.textContent = t;
    el.setAttribute('style', 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#1d1d1b;color:#fff;font:13px system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }
  window.openApp = function (resource, params) {
    fetch('/__emulador/openApp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: resource, params: params }) }).catch(function () {});
    aviso('openApp (emulado): abriria "' + (nomes[resource] || resource) + '" com ' + JSON.stringify(params || {}));
  };
  window.openApp.emulado = true;
})();</script>`;

function injetarOpenApp(html) {
  const m = html.match(/<head[^>]*>/i);
  return m ? html.replace(m[0], `${m[0]}\n${SCRIPT_OPENAPP}`) : `${SCRIPT_OPENAPP}\n${html}`;
}

/** Atributos da requisição: --param, parametros.json do dashboard e a URL. "A.B=x" vira { A: { B: x } } (período). */
function montarAtributos(listas) {
  const atributos = {};
  for (const [chave, valor] of listas) {
    if (valor == null) continue;
    atributos[chave] = valor;
    const [base, sub] = chave.split('.');
    if (sub) atributos[base] = { ...(typeof atributos[base] === 'object' && atributos[base] ? atributos[base] : {}), [sub]: valor };
  }
  return atributos;
}

const paginaDeErro = (titulo, detalhe, dica) => `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro no emulador</title></head>
<body style="font:14px system-ui,sans-serif;padding:20px;max-width:900px">
<h2 style="margin:0 0 8px">${escaparXml(titulo)}</h2>
<p style="background:#fdeceb;border:1px solid #f3c1bd;color:#8c1d18;border-radius:8px;padding:10px 12px;white-space:pre-wrap">${escaparXml(detalhe)}</p>
<p style="color:#555">${escaparXml(dica)}</p>
<pre id="resultado">RESULTADO ERRO | ${escaparXml(detalhe)}</pre></body></html>`;

export async function comandoEmular([alvo], { porta = 5299, entrada, param }) {
  if (!alvo) throw new ErroUsuario('Informe o .zip ou o nome do dashboard. Ex.: npm run emular -- vendas');
  let arquivo = resolve(PROJETO, alvo);
  const ehDashboard = !existsSync(arquivo) && listarDashboards().includes(alvo);
  if (ehDashboard) arquivo = resolve(PASTA_SAIDA, `${alvo}.zip`);
  if (!existsSync(arquivo)) throw new ErroUsuario(`não encontrei ${alvo}. Gere antes: npm run build -- ${alvo}`);

  const zip = unzipSync(readFileSync(arquivo));
  const v = verificarEntradas(zip, { entrada });
  for (const e of v.erros) console.log(`[emular] ERRO na verificação: ${e}`);
  const inicial = entrada ?? (v.jspsNaRaiz.includes('diagnostico.jsp') ? 'diagnostico.jsp' : v.jspsNaRaiz.find((j) => j.toLowerCase() !== 'index.jsp') ?? v.jspsNaRaiz[0]);

  // parâmetros: parametros.json (mock do dashboard) < --param < URL
  const doJson = ehDashboard && existsSync(resolve(PASTA_DASHBOARDS, alvo, 'parametros.json')) ? Object.entries(JSON.parse(readFileSync(resolve(PASTA_DASHBOARDS, alvo, 'parametros.json'), 'utf-8'))) : [];
  const daLinha = (Array.isArray(param) ? param : param ? [param] : []).map((p) => {
    const i = String(p).indexOf('=');
    if (i < 1) throw new ErroUsuario(`--param precisa ser NOME=valor (recebido: ${p})`);
    return [p.slice(0, i), p.slice(i + 1)];
  });

  const executar = criarExecutor(); // mesmas regras do proxy: só leitura, credenciais do .env
  const executarSql = async (sql) => {
    try {
      return await executar(sql);
    } catch (e) {
      return { status: '0', statusMessage: e.status || e.cause ? mensagemDeFalha(e) : e.message };
    }
  };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const log = (status, extra = '') => console.log(`[emular] ${status} ${req.method} ${url.pathname}${url.search}${extra}`);
    const enviar = (status, tipo, corpo) => {
      res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
      res.end(corpo);
    };

    if (url.pathname === '/__emulador/openApp' && req.method === 'POST') {
      let corpo = '';
      for await (const c of req) corpo += c;
      try {
        const { resource, params } = JSON.parse(corpo || '{}');
        console.log(`[emular] openApp: ${NOMES_TELAS[resource] ?? resource} ${JSON.stringify(params ?? {})}  (${resource})`);
      } catch {
        /* corpo inválido: ignora */
      }
      return enviar(204, 'text/plain', '');
    }

    if (url.pathname === '/mge/html5component.mge') {
      const nome = url.searchParams.get('entryPoint') || '';
      if (nome.toLowerCase() === 'index.jsp' || !zip[nome]) {
        log(500, nome.toLowerCase() === 'index.jsp' ? '  (index.jsp: o ERP responde 500)' : '  (entrada não existe no .zip)');
        return enviar(500, 'text/plain; charset=utf-8', 'Internal Server Error');
      }
      const daUrl = [...url.searchParams].filter(([k]) => !PARAMETROS_DO_ERP.has(k));
      const atributos = {
        ...montarAtributos([...doJson, ...daLinha, ...daUrl]),
        BASE_FOLDER: PASTA_PUBLICADA,
        CODUSU_LOG: url.searchParams.get('userID') ?? '0',
        __param: Object.fromEntries(daUrl),
      };
      try {
        const html = await renderizarJsp(Buffer.from(zip[nome]).toString('utf-8'), {
          atributos,
          executarSql,
          aoConsultar: (c) => console.log(`[emular]   snk:query ${c.var}: ${c.ok ? `${c.linhas} linhas` : `ERRO ${c.erro}`} · ${c.ms} ms`),
        });
        log(200);
        return enviar(200, 'text/html; charset=utf-8', injetarOpenApp(html));
      } catch (e) {
        if (e instanceof ErroNaoSuportado) {
          log(500, `  (não suportado pelo emulador: ${e.message})`);
          return enviar(500, 'text/html; charset=utf-8', paginaDeErro(`${nome}: recurso que o emulador não executa`, e.message, 'Isso não quer dizer que a página tem erro: teste esta página na base de testes do ERP.'));
        }
        if (e instanceof ErroJsp) {
          log(500, `  (${e.message})`);
          return enviar(500, 'text/html; charset=utf-8', paginaDeErro(`${nome}: "Internal Server Error" no ERP`, e.message, 'No ERP, este erro derrubaria a página com "Internal Server Error". Se for uma consulta, envolva o <snk:query> em <c:catch var="erro"> e mostre ${erro.message}.'));
        }
        throw e;
      }
    }

    if (url.pathname === '/mge/service.sbr') {
      // mesmo serviço que o SankhyaJX chama no ERP (consulta pelo navegador), respondido com dados reais
      let corpo = '';
      for await (const c of req) corpo += c;
      let resposta;
      try {
        resposta = await executarSql(JSON.parse(corpo || '{}').requestBody?.sql ?? '');
      } catch {
        resposta = { status: '0', statusMessage: 'JSON inválido.' };
      }
      return enviar(200, 'application/json; charset=utf-8', JSON.stringify(resposta));
    }

    const prefixo = `/mge/${PASTA_PUBLICADA}`;
    if (url.pathname.startsWith(prefixo)) {
      const nome = decodeURIComponent(url.pathname.slice(prefixo.length)).replace(/^\/+/, '');
      if (zip[nome] && !nome.endsWith('/')) return enviar(200, TIPOS[nome.split('.').pop().toLowerCase()] ?? 'application/octet-stream', Buffer.from(zip[nome]));
    }
    log(404);
    enviar(404, 'text/plain; charset=utf-8', 'Não encontrado (no ERP, caminhos relativos também dão 404: use ${BASE_FOLDER}).');
  });
  await new Promise((ok, falha) => {
    servidor.once('error', (e) => falha(new ErroUsuario(`Não foi possível usar a porta ${porta}: ${e.message}`)));
    servidor.listen(Number(porta), '127.0.0.1', ok);
  });
  const endereco = `http://127.0.0.1:${porta}/mge/html5component.mge?entryPoint=${inicial}&nuGdg=1&gadGetID=html5_emulador&userID=0`;
  console.log(`\n[emular] ${arquivo}`);
  console.log(`[emular] abra: ${endereco}`);
  console.log(`[emular] entradas disponíveis: ${v.jspsNaRaiz.join(', ')} (troque entryPoint= na URL; parâmetros: &NOME=valor)`);
  const parametros = [...doJson, ...daLinha].map(([k, val]) => `${k}=${val}`);
  if (parametros.length) console.log(`[emular] parâmetros: ${parametros.join(' · ')}`);
  console.log('[emular] <snk:query> e JSTL executados com dados reais; openApp emulado. Diferenças do ERP: docs/debug-e-logs.md\n');
  const encerrar = () => {
    servidor.close();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}
