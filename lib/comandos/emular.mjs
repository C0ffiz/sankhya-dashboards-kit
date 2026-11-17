// npm run emular -- <arquivo.zip | nome> [--porta 5299] [--entrada painel.jsp]
//
// Serve um pacote do jeito que o ERP serve (/mge/html5component.mge?entryPoint=...), na sua máquina,
// com dados reais pelo proxy local. Pega antes de subir no ERP os erros que só apareciam lá:
//   - index.jsp como entrada → 500 "Internal Server Error" (como o ERP);
//   - arquivo por caminho relativo → 404 (o ERP resolve ./x para /mge/x);
//   - pasta sem entrada própria no zip → aviso da verificação.
// Limites: não executa <snk:query>/JSTL (só no ERP) e não tem openApp. Detalhes: docs/debug-e-logs.md
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { criarExecutor, mensagemDeFalha } from '../../proxy/servidor-dev.mjs';
import { PASTA_SAIDA, PROJETO, ErroUsuario, listarDashboards } from '../projeto.mjs';
import { verificarEntradas } from '../pacote.mjs';

const PASTA_PUBLICADA = 'html5component/emulador_1/'; // mesmo formato do ${BASE_FOLDER} do ERP
const TIPOS = { js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', json: 'application/json', woff2: 'font/woff2' };

/** "Executa" um JSP do jeito possível sem servidor Java: diretivas e comentários saem, o EL conhecido é preenchido. */
function renderizar(texto) {
  const elLigado = !/isELIgnored\s*=\s*"true"/i.test(texto);
  const usaTaglib = /<%@\s*taglib/i.test(texto);
  if (usaTaglib && /<(snk:query|c:)/.test(texto)) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="font:14px system-ui,sans-serif;padding:16px">
<h2>Página com consulta no servidor (&lt;snk:query&gt;/JSTL)</h2>
<p>O emulador não executa código do servidor. Teste esta página na base de testes do ERP.</p>
<pre id="resultado">RESULTADO NAO_TESTADO | o emulador não executa snk:query/JSTL; teste no ERP</pre></body></html>`;
  }
  if (/<%(?![@-])/.test(texto)) {
    return '<!doctype html><html><body><pre id="resultado">RESULTADO NAO_TESTADO | a página tem código Java (scriptlet); teste no ERP</pre></body></html>';
  }
  let t = texto.replace(/<%--[\s\S]*?--%>/g, '').replace(/<%@[\s\S]*?%>\s*/g, '').replace(/<snk:load\s*\/>/g, '');
  if (elLigado) t = t.replace(/\$\{BASE_FOLDER\}/g, PASTA_PUBLICADA).replace(/\$\{CODUSU_LOG\}/g, '0').replace(/\$\{[^}]*\}/g, '');
  return t;
}

export async function comandoEmular([alvo], { porta = 5299, entrada }) {
  if (!alvo) throw new ErroUsuario('Informe o .zip ou o nome do dashboard. Ex.: npm run emular -- vendas');
  let arquivo = resolve(PROJETO, alvo);
  if (!existsSync(arquivo) && listarDashboards().includes(alvo)) arquivo = resolve(PASTA_SAIDA, `${alvo}.zip`);
  if (!existsSync(arquivo)) throw new ErroUsuario(`não encontrei ${alvo}. Gere antes: npm run build -- ${alvo}`);

  const zip = unzipSync(readFileSync(arquivo));
  const v = verificarEntradas(zip, { entrada });
  for (const e of v.erros) console.log(`[emular] ERRO na verificação: ${e}`);
  const inicial = entrada ?? (v.jspsNaRaiz.includes('diagnostico.jsp') ? 'diagnostico.jsp' : v.jspsNaRaiz.find((j) => j.toLowerCase() !== 'index.jsp') ?? v.jspsNaRaiz[0]);

  const executar = criarExecutor(); // mesmas regras do proxy: só leitura, credenciais do .env
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const log = (status) => console.log(`[emular] ${status} ${req.method} ${url.pathname}${url.search}`);
    if (url.pathname === '/mge/html5component.mge') {
      const nome = url.searchParams.get('entryPoint') || '';
      if (nome.toLowerCase() === 'index.jsp' || !zip[nome]) {
        log(500);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }
      log(200);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderizar(Buffer.from(zip[nome]).toString('utf-8')));
    }
    if (url.pathname === '/mge/service.sbr') {
      // mesmo serviço que o SankhyaJX chama no ERP, respondido com dados reais (só leitura)
      let corpo = '';
      for await (const c of req) corpo += c;
      let resposta;
      try {
        resposta = await executar(JSON.parse(corpo || '{}').requestBody?.sql ?? '');
      } catch (e) {
        resposta = { status: '0', statusMessage: e instanceof SyntaxError ? 'JSON inválido.' : mensagemDeFalha(e) };
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(resposta));
    }
    const prefixo = `/mge/${PASTA_PUBLICADA}`;
    if (url.pathname.startsWith(prefixo)) {
      const nome = decodeURIComponent(url.pathname.slice(prefixo.length)).replace(/^\/+/, '');
      if (zip[nome] && !nome.endsWith('/')) {
        res.writeHead(200, { 'Content-Type': TIPOS[nome.split('.').pop().toLowerCase()] ?? 'application/octet-stream' });
        return res.end(Buffer.from(zip[nome]));
      }
    }
    log(404);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Não encontrado (no ERP, caminhos relativos também dão 404: use ${BASE_FOLDER}).');
  });
  await new Promise((ok, falha) => {
    servidor.once('error', (e) => falha(new ErroUsuario(`Não foi possível usar a porta ${porta}: ${e.message}`)));
    servidor.listen(Number(porta), '127.0.0.1', ok);
  });
  const endereco = `http://127.0.0.1:${porta}/mge/html5component.mge?entryPoint=${inicial}&nuGdg=1&gadGetID=html5_emulador&userID=0`;
  console.log(`\n[emular] ${arquivo}`);
  console.log(`[emular] abra: ${endereco}`);
  console.log(`[emular] entradas disponíveis: ${v.jspsNaRaiz.join(', ')} (troque entryPoint= na URL)`);
  console.log('[emular] limites: sem <snk:query>/JSTL e sem openApp — esses só no ERP.\n');
  const encerrar = () => {
    servidor.close();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}
