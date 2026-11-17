// npm run diagnostico [-- <nome>]
//
// Gera um .zip de diagnóstico para descobrir, no ERP, por que um componente HTML5 não abre.
// Ele tem páginas de teste em camadas (t1 → t5) e, se você informar um dashboard, o próprio
// dashboard. Abrindo o componente com entryPoint="diagnostico.jsp", todos os testes rodam e saem
// num relatório para copiar. Passo a passo: docs/debug-e-logs.md
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { KIT, PASTA_SAIDA, PROJETO, ErroUsuario } from '../projeto.mjs';
import { montarZip } from '../pacote.mjs';
import { construir, xmlComponente } from './build.mjs';
import { gerarJspDados, validarDefinicoes } from '../consultas-servidor.mjs';

const TESTES = [
  { id: 't1', arquivo: 't1.jsp', titulo: 'JSP simples (só HTML)' },
  { id: 't2', arquivo: 't2.jsp', titulo: '+ taglib da Sankhya e <snk:load/>' },
  { id: 't3', arquivo: 't3.jsp', titulo: '+ expressões do ERP (${BASE_FOLDER}, usuário) e arquivos do pacote' },
  { id: 't4', arquivo: 't4.jsp', titulo: 'consulta SQL pelo navegador (JX.post → DbExplorerSP), com a sessão do usuário' },
  { id: 't5', arquivo: 't5.jsp', titulo: 'consulta SQL no servidor (<snk:query>)' },
  { id: 't6', arquivo: 't6.jsp', titulo: 'consultas no servidor chamadas pelo dashboard (dados.jsp, sem DBExplorer)' },
];

/** JSP de dados do T6: o mesmo gerador dos dashboards com "consultasServidor". */
const JSP_T6 = gerarJspDados(
  validarDefinicoes({
    t6: {
      sql: 'SELECT COUNT(*) AS QTD FROM TSIEMP WHERE CODEMP NOT IN (:EXCLUIR) AND SYSDATE >= :DESDE',
      parametros: { EXCLUIR: 'lista', DESDE: 'data' },
    },
  }, 'diagnóstico T6'),
);

function lerModelos() {
  const pasta = resolve(KIT, 'modelos', 'diagnostico');
  const arquivos = {};
  const visitar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const abs = resolve(dir, nome);
      if (statSync(abs).isDirectory()) visitar(abs);
      else arquivos[relative(pasta, abs).replace(/\\/g, '/')] = readFileSync(abs);
    }
  };
  visitar(pasta);
  // SankhyaJX para o T3/T4, conferido pelo hash como no build
  const jx = readFileSync(resolve(KIT, 'runtime', 'jx.min.js'));
  const esperado = readFileSync(resolve(KIT, 'runtime', 'JX_VERSAO.md'), 'utf-8').match(/SHA-256\s+`([0-9a-f]{64})`/i)?.[1]?.toLowerCase();
  if (createHash('sha256').update(jx).digest('hex') !== esperado) throw new ErroUsuario('runtime/jx.min.js não confere com o hash de runtime/JX_VERSAO.md.');
  arquivos['diag/jx.min.js'] = jx;
  arquivos['t6dados.jsp'] = Buffer.from(JSP_T6, 'utf-8');
  return arquivos;
}

export async function comandoDiagnostico([nome]) {
  const arquivos = lerModelos();
  const testes = [...TESTES];
  let entradaPainel = null;

  if (nome) {
    const r = await construir(nome, { silencioso: true });
    entradaPainel = r.manifesto.entrada;
    for (const [caminho, buf] of Object.entries(r.arquivos)) {
      if (arquivos[caminho]) throw new ErroUsuario(`o dashboard tem um arquivo com o mesmo nome de um arquivo do diagnóstico: ${caminho}. Renomeie no dashboard.`);
      arquivos[caminho] = buf;
    }
    testes.push({ id: 'painel', arquivo: entradaPainel, titulo: `o dashboard "${nome}" completo`, painel: true });
  }

  // a lista de testes vai como JSON dentro do diagnostico.jsp (página com EL desligado)
  const json = JSON.stringify(testes).replace(/</g, '\\u003c');
  arquivos['diagnostico.jsp'] = Buffer.from(arquivos['diagnostico.jsp'].toString('utf-8').replace('__TESTES__', json), 'utf-8');

  mkdirSync(PASTA_SAIDA, { recursive: true });
  const destino = resolve(PASTA_SAIDA, nome ? `${nome}-diagnostico.zip` : 'diagnostico.zip');
  writeFileSync(destino, montarZip(arquivos));

  console.log(`\n[diagnostico] gerado ${relative(PROJETO, destino)}`);
  console.log('\n  1. Use a BASE DE TESTES do ERP (lá você não precisa de autorização para cada alteração do componente).');
  console.log('  2. Crie (ou abra) um componente HTML5 no Construtor de Componentes de BI e anexe este .zip.');
  console.log('  3. No XML do componente, use entryPoint="diagnostico.jsp":\n');
  console.log(xmlComponente('diagnostico.jsp').replace(/^/gm, '       '));
  console.log('\n  4. Abra o componente: a página roda todos os testes e mostra um relatório para copiar.');
  console.log('     Se a própria página não abrir, troque o entryPoint manualmente, na ordem:');
  for (const t of testes) console.log(`       ${t.arquivo.padEnd(14)} ${t.titulo}`);
  console.log('\n  Como ler os resultados e onde achar os logs: docs/debug-e-logs.md');
}
