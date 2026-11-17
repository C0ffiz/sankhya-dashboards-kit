// npm run novo -- <nome>
// Cria dashboards/<nome>/ a partir de dashboards/exemplo/.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PASTA_DASHBOARDS } from './vite-config.mjs';

const nome = process.argv[2];
if (!nome || !/^[a-z0-9][a-z0-9-]*$/.test(nome) || nome === 'shared') {
  console.error('Informe o nome em letras minúsculas, sem espaço (pode usar números e hífen).');
  console.error('Ex.: npm run novo -- vendas');
  process.exit(1);
}
const destino = resolve(PASTA_DASHBOARDS, nome);
if (existsSync(destino)) {
  console.error(`Já existe dashboards/${nome}/`);
  process.exit(1);
}
cpSync(resolve(PASTA_DASHBOARDS, 'exemplo'), destino, { recursive: true });
const html = resolve(destino, 'index.html');
writeFileSync(html, readFileSync(html, 'utf-8').replace(/<title>.*<\/title>/, `<title>${nome}</title>`));

console.log(`Criado dashboards/${nome}/ (cópia do exemplo).`);
console.log(`  npm run dev -- ${nome}`);
console.log(`  npm run build -- ${nome}`);
