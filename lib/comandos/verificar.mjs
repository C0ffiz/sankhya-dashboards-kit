// npm run verificar -- <arquivo.zip | nome-do-dashboard> [--consertar]
//
// Confere um pacote antes de subir no ERP — inclusive .zip feito fora do kit (outra stack, outra pessoa).
// --consertar grava <arquivo>-corrigido.zip com as entradas de pasta no formato que o ERP aceita.
// O que exige decisão humana (renomear a entrada, trocar caminhos dentro do JSP) só é apontado.
import { existsSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PASTA_SAIDA, PROJETO, ErroUsuario, listarDashboards } from '../projeto.mjs';
import { montarZip, verificarArquivoZip } from '../pacote.mjs';

export async function comandoVerificar([alvo], { consertar, entrada }) {
  if (!alvo) throw new ErroUsuario('Informe o .zip ou o nome do dashboard. Ex.: npm run verificar -- dist-sankhya/vendas.zip');
  let arquivo = resolve(PROJETO, alvo);
  if (!existsSync(arquivo) && listarDashboards().includes(alvo)) arquivo = resolve(PASTA_SAIDA, `${alvo}.zip`);
  if (!existsSync(arquivo)) throw new ErroUsuario(`não encontrei ${alvo}${listarDashboards().includes(alvo) ? ' (rode antes: npm run build -- ' + alvo + ')' : ''}.`);

  const r = verificarArquivoZip(arquivo, { entrada });
  console.log(`\n${relative(PROJETO, arquivo) || arquivo}`);
  console.log(`  arquivos: ${r.arquivos.length} · .jsp na raiz (possíveis entryPoint): ${r.jspsNaRaiz.join(', ') || '(nenhum)'}`);
  for (const e of r.erros) console.log(`  ERRO   ${e}`);
  for (const a of r.avisos) console.log(`  aviso  ${a}`);
  if (!r.erros.length) console.log('  OK: formato aceito pelo ERP.');

  if (consertar && r.entradas) {
    const arquivos = Object.fromEntries(Object.entries(r.entradas).filter(([n]) => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(n)));
    const destino = arquivo.replace(/\.zip$/i, '') + '-corrigido.zip';
    writeFileSync(destino, montarZip(arquivos));
    const r2 = verificarArquivoZip(destino, { entrada });
    console.log(`\n  --consertar: gravado ${relative(PROJETO, destino)} (entradas de pasta e permissões refeitas).`);
    for (const e of r2.erros) console.log(`  ainda com ERRO  ${e}`);
    if (!r2.erros.length) console.log('  OK: o pacote corrigido está no formato aceito pelo ERP.');
    process.exitCode = r2.erros.length ? 1 : 0;
    return;
  }
  process.exitCode = r.erros.length ? 1 : 0;
}
