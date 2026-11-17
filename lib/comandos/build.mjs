// npm run build -- <nome>   →   dist-sankhya/<nome>.zip
//
//   vite  vite build → index.html vira <entrada>.jsp (ver lib/jsp.mjs) → SankhyaJX → zip
//   html  roda "build" do dashboard.json → a pasta gerada (com index.html) vira <entrada>.jsp → zip
//   jsp   roda "build" do dashboard.json (se houver) → empacota a pasta como está → zip
//
// Em todas: o zip só é gravado se passar em verificarEntradas (formato, entrada, caminhos, segredos).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { KIT, PASTA_SAIDA, PROJETO, ErroUsuario, lerManifesto, lerParametrosMock, resolverDashboard } from '../projeto.mjs';
import { htmlParaJsp } from '../jsp.mjs';
import { lerPasta, montarZip, verificarEntradas } from '../pacote.mjs';
import { ARQUIVO_DADOS, jspDadosDoDashboard } from '../consultas-servidor.mjs';

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** Copia o SankhyaJX para <pasta>/assets/, conferindo o SHA-256 registrado em runtime/JX_VERSAO.md. */
function copiarJX(pastaSaida) {
  const arq = resolve(KIT, 'runtime', 'jx.min.js');
  const esperado = readFileSync(resolve(KIT, 'runtime', 'JX_VERSAO.md'), 'utf-8').match(/SHA-256\s+`([0-9a-f]{64})`/i)?.[1]?.toLowerCase();
  const atual = createHash('sha256').update(readFileSync(arq)).digest('hex');
  if (esperado !== atual) throw new ErroUsuario(`runtime/jx.min.js não confere com o SHA-256 de runtime/JX_VERSAO.md (atual: ${atual}).`);
  mkdirSync(resolve(pastaSaida, 'assets'), { recursive: true });
  cpSync(arq, resolve(pastaSaida, 'assets', 'jx.min.js'));
}

function rodar(comando, cwd, rotulo) {
  console.log(`[build] ${rotulo}: ${comando}`);
  const r = spawnSync(comando, { cwd, shell: true, stdio: 'inherit' });
  if (r.status !== 0) throw new ErroUsuario(`o comando "${comando}" terminou com erro (código ${r.status ?? r.signal}).`);
}

/** index.html (já gerado em `saida`) → <entrada>.jsp no mesmo lugar. */
function converterHtml(saida, pastaDashboard, m) {
  const arqHtml = resolve(saida, 'index.html');
  if (!existsSync(arqHtml)) throw new ErroUsuario(`não há index.html em ${relative(PROJETO, saida)} para virar ${m.entrada}.`);
  if (m.jx) copiarJX(saida);
  const { jsp, erros } = htmlParaJsp(readFileSync(arqHtml, 'utf-8'), { params: lerParametrosMock(pastaDashboard), jx: m.jx });
  if (erros.length) throw new ErroUsuario(`${m.entrada}: ${erros.join(' | ')}`);
  writeFileSync(resolve(saida, m.entrada), jsp, 'utf-8');
  rmSync(arqHtml);
}

/**
 * Gera o pacote de um dashboard.
 * @returns {Promise<{ nome: string, manifesto: object, saida: string, zip: string, arquivos: Record<string, Uint8Array>, avisos: string[] }>}
 */
export async function construir(nome, { silencioso = false } = {}) {
  const pasta = resolverDashboard(nome, 'build');
  const m = lerManifesto(pasta);
  const saida = resolve(PASTA_SAIDA, basename(pasta));
  const arquivoZip = resolve(PASTA_SAIDA, `${basename(pasta)}.zip`);
  rmSync(arquivoZip, { force: true });
  mkdirSync(PASTA_SAIDA, { recursive: true });

  if (m.stack === 'vite') {
    const { build } = await import('vite');
    const { configVite } = await import('../vite-config.mjs');
    await build({ ...configVite(pasta, { dev: false, outDir: saida }), logLevel: silencioso ? 'warn' : 'info' });
    converterHtml(saida, pasta, m);
  } else {
    if (m.build) rodar(m.build, pasta, `stack ${m.stack}`);
    const origem = resolve(pasta, m.pasta);
    if (!existsSync(origem)) throw new ErroUsuario(`pasta "${m.pasta}" (campo "pasta" do dashboard.json) não existe em dashboards/${nome}/.`);
    rmSync(saida, { recursive: true, force: true });
    mkdirSync(saida, { recursive: true });
    for (const [rel, buf] of Object.entries(lerPasta(origem, m.ignorar))) {
      mkdirSync(resolve(saida, rel, '..'), { recursive: true });
      writeFileSync(resolve(saida, rel), buf);
    }
    if (m.stack === 'html') converterHtml(saida, pasta, m);
  }

  // consultas no servidor: dados.jsp gerado a partir do módulo do dashboard (SQL fixo, valores só numéricos)
  const jspDados = await jspDadosDoDashboard(pasta, m);
  if (jspDados) {
    if (existsSync(resolve(saida, ARQUIVO_DADOS))) throw new ErroUsuario(`o dashboard já tem um ${ARQUIVO_DADOS}; esse nome é reservado para as consultas no servidor.`);
    writeFileSync(resolve(saida, ARQUIVO_DADOS), jspDados, 'utf-8');
  }

  const arquivos = lerPasta(saida);
  const zip = montarZip(arquivos);
  const { erros, avisos } = verificarEntradas(unzipSync(zip), { entrada: m.entrada });
  if (erros.length) throw new ErroUsuario(`pacote reprovado:\n  - ${erros.join('\n  - ')}`);
  writeFileSync(arquivoZip, zip);

  if (!silencioso) {
    console.log(`\n[build] OK — ${relative(PROJETO, arquivoZip)} (${kb(zip.length)}) · stack ${m.stack}`);
    for (const [caminho, buf] of Object.entries(arquivos)) console.log(`   ${caminho.padEnd(42)} ${kb(buf.length)}`);
    for (const a of avisos) console.log(`   aviso: ${a}`);
    console.log('   verificação do pacote: OK (formato, entrada, caminhos, segredos)');
    console.log(`\n   No Construtor de Componentes de BI: anexe o .zip e use entryPoint="${m.entrada}" no XML:`);
    console.log(xmlComponente(m.entrada).replace(/^/gm, '     '));
  }
  return { nome, manifesto: m, saida, zip: arquivoZip, arquivos, avisos };
}

export function xmlComponente(entrada) {
  return [
    '<gadget>',
    '  <level id="lvl_principal" description="Principal">',
    '    <container orientacao="V" tamanhoRelativo="100">',
    `      <html5component id="html5_principal" entryPoint="${entrada}"/>`,
    '    </container>',
    '  </level>',
    '</gadget>',
  ].join('\n');
}

export async function comandoBuild([nome]) {
  await construir(nome);
}
