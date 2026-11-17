// Configuração do Vite compartilhada por dev.mjs e empacotar.mjs (um dashboard por vez).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

export const RAIZ = resolve(import.meta.dirname, '..');
export const PASTA_DASHBOARDS = resolve(RAIZ, 'dashboards');
export const PASTA_SAIDA = resolve(RAIZ, 'dist-sankhya');
export const PORTA_PROXY = Number(process.env.PORTA_PROXY) || 8787;

export function listarDashboards() {
  return readdirSync(PASTA_DASHBOARDS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'shared' && existsSync(resolve(PASTA_DASHBOARDS, d.name, 'index.html')))
    .map((d) => d.name);
}

export function resolverDashboard(nome) {
  const disponiveis = listarDashboards();
  if (!nome || !disponiveis.includes(nome)) {
    console.error(`Informe o dashboard. Disponíveis: ${disponiveis.join(', ') || '(nenhum)'}`);
    console.error('Ex.: npm run dev -- exemplo   |   npm run build -- exemplo');
    process.exit(1);
  }
  return resolve(PASTA_DASHBOARDS, nome);
}

/** Lê dashboards/<nome>/parametros.json → { CODEMP: "1", ... } (valores = mock de dev). */
export function lerParametrosMock(pastaDashboard) {
  const arq = resolve(pastaDashboard, 'parametros.json');
  if (!existsSync(arq)) return {};
  const json = JSON.parse(readFileSync(arq, 'utf-8'));
  for (const nome of Object.keys(json)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(nome)) throw new Error(`Nome de parâmetro inválido em parametros.json: "${nome}" (use MAIÚSCULAS, ex.: CODEMP)`);
  }
  return json;
}

const escaparAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Gera as <meta name="snk-param"> — em dev com o valor mock, no build com ${NOME} (EL do JSP). */
export function metasParametros(params, { el }) {
  return Object.entries(params)
    .map(([nome, valor]) => `<meta name="snk-param" data-nome="${nome}" content="${el ? '${' + nome + '}' : escaparAttr(valor)}">`)
    .join('\n    ');
}

/** Insere um trecho no <head>, logo após o <meta charset> (ou na abertura do <head>). */
export function injetarNoHead(html, trecho) {
  const charset = /<meta\s+charset=[^>]*>/i;
  if (charset.test(html)) return html.replace(charset, (m) => `${m}\n    ${trecho}`);
  return html.replace(/<head>/i, `<head>\n    ${trecho}`);
}

function pluginParametrosDev(pastaDashboard) {
  return {
    name: 'sankhya-parametros-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      const metas = metasParametros(lerParametrosMock(pastaDashboard), { el: false });
      return injetarNoHead(html, metas);
    },
  };
}

export function configVite(pastaDashboard, { dev, outDir } = {}) {
  return {
    configFile: false,
    root: pastaDashboard,
    base: './',
    publicDir: false,
    logLevel: 'info',
    plugins: [tailwindcss(), dev && pluginParametrosDev(pastaDashboard)].filter(Boolean),
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      open: true,
      fs: { allow: [PASTA_DASHBOARDS] },
      proxy: { '/api': `http://127.0.0.1:${PORTA_PROXY}` },
    },
    build: {
      outDir,
      emptyOutDir: true,
      assetsDir: 'assets',
      target: 'es2020',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0, // nada embutido no HTML/JSP: tudo vira arquivo em assets/
      reportCompressedSize: false,
    },
  };
}
