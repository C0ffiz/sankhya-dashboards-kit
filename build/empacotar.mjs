// npm run build -- <dashboard>
// 1) vite build  2) index.html → index.jsp  3) copia SankhyaJX  4) checagens de segurança  5) .zip
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { build } from 'vite';
import { zipSync } from 'fflate';
import { lerEnv } from '../proxy/env.mjs';
import { configVite, injetarNoHead, lerParametrosMock, metasParametros, resolverDashboard, PASTA_DASHBOARDS, PASTA_SAIDA, RAIZ } from './vite-config.mjs';

const DIRETIVA_JSP =
  '<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="false"%>';
const TAGLIB_SNK = '<%@ taglib prefix="snk" uri="/WEB-INF/tld/sankhyaUtil.tld"%>';

const pasta = resolverDashboard(process.argv[2]);
const nome = basename(pasta);
const saida = resolve(PASTA_SAIDA, nome);
const arquivoZip = resolve(PASTA_SAIDA, `${nome}.zip`);

const falhar = (msg) => {
  rmSync(arquivoZip, { force: true });
  console.error(`\n[build] FALHOU: ${msg}`);
  process.exit(1);
};

// 1) Build estático (caminhos relativos ./assets/...)
mkdirSync(PASTA_SAIDA, { recursive: true });
await build(configVite(pasta, { dev: false, outDir: saida }));

// 2) index.html → index.jsp
const arqHtml = resolve(saida, 'index.html');
let html = readFileSync(arqHtml, 'utf-8');

// SankhyaJX: só a versão fixada, conferida pelo SHA-256 registrado em shared/JX_VERSAO.md
const arqJx = resolve(PASTA_DASHBOARDS, 'shared', 'jx.min.js');
const hashEsperado = readFileSync(resolve(PASTA_DASHBOARDS, 'shared', 'JX_VERSAO.md'), 'utf-8').match(/SHA-256\s+`([0-9a-f]{64})`/i)?.[1];
const hashAtual = createHash('sha256').update(readFileSync(arqJx)).digest('hex');
if (!hashEsperado || hashEsperado.toLowerCase() !== hashAtual) {
  falhar(`dashboards/shared/jx.min.js não confere com o SHA-256 de JX_VERSAO.md (atual: ${hashAtual}).`);
}
copyFileSync(arqJx, resolve(saida, 'assets', 'jx.min.js'));

const params = lerParametrosMock(pasta);
const cabecalho = [
  '<snk:load/>',
  metasParametros(params, { el: true }),
  '<script src="./assets/jx.min.js"></script>', // script clássico: JX disponível antes do módulo (deferido)
].filter(Boolean).join('\n    ');
html = injetarNoHead(html, cabecalho);

// O JSP só pode conter EL nos placeholders de parâmetros; qualquer outro ${ ou #{ seria interpretado pelo WildFly.
const permitidos = new Set(Object.keys(params).map((p) => '${' + p + '}'));
const elEncontrados = [...html.matchAll(/[$#]\{[^}]*\}?/g)].map((m) => m[0]).filter((e) => !permitidos.has(e));
if (elEncontrados.length) falhar(`expressões EL inesperadas no index.jsp: ${elEncontrados.join(', ')} — mova esse conteúdo para um .js/.css.`);
if (/<%(?!@)/.test(html)) falhar('scriptlet JSP (<% ... %>) inesperado no HTML.');

writeFileSync(resolve(saida, 'index.jsp'), `${DIRETIVA_JSP}\n${TAGLIB_SNK}\n${html}`, 'utf-8');
rmSync(arqHtml);

// 3) Arquivos do pacote
const listar = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = resolve(dir, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
const arquivos = listar(saida);

// 4) Varredura de segredos: valores reais do .env + marcadores do proxy/autenticação
const segredos = Object.entries(lerEnv(resolve(RAIZ, '.env')))
  .filter(([chave, valor]) => valor.length >= 8 && !/BASE_URL/i.test(chave))
  .map(([chave, valor]) => ({ rotulo: `valor de ${chave}`, texto: valor }));
const marcadores = [/client_secret/i, /client_id/i, /x-token/i, /SANKHYA_[A-Z_]+/, /Bearer\s/i, /\/api\/sql/, /\/authenticate\b/, /gateway\/v1/];

for (const arq of arquivos) {
  const conteudo = readFileSync(arq, 'latin1');
  const rel = relative(saida, arq);
  for (const s of segredos) if (conteudo.includes(s.texto)) falhar(`${s.rotulo} encontrado em ${rel}`);
  for (const re of marcadores) if (re.test(conteudo)) falhar(`marcador proibido ${re} encontrado em ${rel}`);
}

// 5) Zip com index.jsp na raiz
const entradas = Object.fromEntries(arquivos.map((a) => [relative(saida, a).replace(/\\/g, '/'), readFileSync(a)]));
writeFileSync(arquivoZip, zipSync(entradas, { level: 9 }));

console.log(`\n[build] OK — ${relative(RAIZ, arquivoZip)} (${(statSync(arquivoZip).size / 1024).toFixed(1)} KB)`);
for (const [caminho, buf] of Object.entries(entradas)) console.log(`   ${caminho.padEnd(40)} ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`   parâmetros EL: ${Object.keys(params).join(', ') || '(nenhum)'}`);
console.log('   varredura de segredos: limpa');
