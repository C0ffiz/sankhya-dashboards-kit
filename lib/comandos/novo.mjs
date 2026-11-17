// npm run novo -- <nome> [--stack vite|jsp|html]
// Cria dashboards/<nome>/ a partir de modelos/<stack>/ do kit.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KIT, PASTA_DASHBOARDS, STACKS, ErroUsuario } from '../projeto.mjs';

export async function comandoNovo([nome], { stack = 'vite' }) {
  if (!nome || !/^[a-z0-9][a-z0-9-]*$/.test(nome) || nome === 'shared') {
    throw new ErroUsuario('Informe o nome em letras minúsculas, sem espaço (pode usar números e hífen). Ex.: npm run novo -- vendas');
  }
  if (!STACKS.includes(stack)) throw new ErroUsuario(`stack "${stack}" desconhecida. Use: ${STACKS.join(', ')}.`);
  const destino = resolve(PASTA_DASHBOARDS, nome);
  if (existsSync(destino)) throw new ErroUsuario(`Já existe dashboards/${nome}/`);
  mkdirSync(PASTA_DASHBOARDS, { recursive: true });
  cpSync(resolve(KIT, 'modelos', stack), destino, { recursive: true });
  for (const arq of ['index.html', 'painel.jsp']) {
    const p = resolve(destino, arq);
    if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf-8').replace(/<title>[^<]*<\/title>/, `<title>${nome}</title>`));
  }
  console.log(`Criado dashboards/${nome}/ (stack ${stack}).`);
  if (stack === 'vite') console.log(`  npm run dev -- ${nome}`);
  if (stack === 'html') console.log(`  Edite dashboards/${nome}/dashboard.json com os comandos da sua stack (veja docs/stacks.md).`);
  console.log(`  npm run build -- ${nome}`);
}
