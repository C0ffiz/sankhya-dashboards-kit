// Montagem e verificação do .zip que o Construtor de Componentes de BI recebe. Independe da stack.
//
// Formato que o ERP aceita (o mesmo dos componentes HTML5 da própria Sankhya):
//   - o .jsp de entrada na RAIZ do zip, com nome diferente de index.jsp;
//   - uma entrada própria para cada pasta ("assets/") antes dos arquivos dela — sem isso o ERP
//     responde "Internal Server Error" ao abrir o componente;
//   - permissões Unix nas entradas.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { lerEnv } from '../proxy/env.mjs';
import { ARQUIVO_ENV, ENTRADAS_PROIBIDAS } from './projeto.mjs';
import { caminhosRelativos, verificarJsp } from './jsp.mjs';

const IGNORAR_SEMPRE = ['dashboard.json', 'parametros.json', 'README.md', 'node_modules', '.git', '.DS_Store', 'Thumbs.db', '__MACOSX', '.env'];
const ATRIBUTOS_PASTA = { level: 0, os: 3, attrs: ((0o40755 << 16) | 0x10) >>> 0 };
const ATRIBUTOS_ARQUIVO = { os: 3, attrs: (0o100644 << 16) >>> 0 };
const TAMANHO_ALERTA = 10 * 1024 * 1024;

/** Lista os arquivos de uma pasta → { 'assets/x.js': Buffer }, sem os ignorados. */
export function lerPasta(pasta, ignorar = []) {
  const fora = new Set([...IGNORAR_SEMPRE, ...ignorar]);
  const arquivos = {};
  const visitar = (dir) => {
    for (const nome of readdirSync(dir)) {
      if (fora.has(nome) || nome.startsWith('.')) continue;
      const abs = resolve(dir, nome);
      const rel = relative(pasta, abs).replace(/\\/g, '/');
      if (fora.has(rel)) continue;
      if (statSync(abs).isDirectory()) visitar(abs);
      else arquivos[rel] = readFileSync(abs);
    }
  };
  visitar(pasta);
  return arquivos;
}

/** Monta o zip: entradas de pasta antes dos arquivos, permissões Unix. @param {Record<string, Uint8Array>} arquivos */
export function montarZip(arquivos) {
  const nomes = Object.keys(arquivos).sort((a, b) => a.localeCompare(b));
  const pastas = new Set();
  for (const n of nomes) {
    const partes = n.split('/');
    for (let i = 1; i < partes.length; i++) pastas.add(`${partes.slice(0, i).join('/')}/`);
  }
  const conteudo = {};
  for (const p of [...pastas].sort()) conteudo[p] = [new Uint8Array(0), ATRIBUTOS_PASTA];
  for (const n of nomes) conteudo[n] = [arquivos[n], ATRIBUTOS_ARQUIVO];
  return zipSync(conteudo, { level: 9 });
}

/** Valores reais do .env do projeto + marcadores de autenticação/proxy que nunca podem ir para o ERP. */
function regrasSegredo() {
  const segredos = Object.entries(lerEnv(ARQUIVO_ENV))
    .filter(([chave, valor]) => valor.length >= 8 && !/BASE_URL/i.test(chave))
    .map(([chave, valor]) => ({ rotulo: `valor de ${chave} do .env`, teste: (t) => t.includes(valor) }));
  const marcadores = [/client_secret/i, /client_id/i, /x-token/i, /SANKHYA_[A-Z_]+/, /Bearer\s/i, /\/api\/sql/, /\/authenticate\b/, /gateway\/v1/];
  return [...segredos, ...marcadores.map((re) => ({ rotulo: `marcador proibido ${re}`, teste: (t) => re.test(t) }))];
}

/**
 * Verifica um pacote. Serve para o que o kit gera e para .zip de qualquer outra origem.
 * @param {Record<string, Uint8Array>} entradas  conteúdo do zip, na ordem (pastas terminam em "/")
 * @param {{ entrada?: string, origem?: string }} opcoes  entrada esperada (opcional)
 * @returns {{ erros: string[], avisos: string[], jspsNaRaiz: string[], arquivos: string[] }}
 */
export function verificarEntradas(entradas, { entrada } = {}) {
  const erros = [];
  const avisos = [];
  const nomes = Object.keys(entradas);
  const arquivos = nomes.filter((n) => !n.endsWith('/'));
  const vistas = new Set();
  const semPasta = new Set();
  for (const n of nomes) {
    if (n.endsWith('/')) {
      vistas.add(n);
      continue;
    }
    const partes = n.split('/');
    for (let i = 1; i < partes.length; i++) {
      const p = `${partes.slice(0, i).join('/')}/`;
      if (!vistas.has(p)) semPasta.add(p);
    }
  }
  if (semPasta.size) erros.push(`falta a entrada de pasta (ou ela vem depois dos arquivos) para: ${[...semPasta].join(', ')}. Sem isso o ERP responde "Internal Server Error". Corrija com: npm run verificar -- <arquivo.zip> --consertar`);

  const jspsNaRaiz = arquivos.filter((n) => !n.includes('/') && n.toLowerCase().endsWith('.jsp'));
  if (!jspsNaRaiz.length) {
    const jspsEmPasta = arquivos.filter((n) => n.toLowerCase().endsWith('.jsp'));
    erros.push(jspsEmPasta.length ? `nenhum .jsp na raiz do zip (encontrado só dentro de pasta: ${jspsEmPasta.join(', ')}). Compacte o conteúdo da pasta, não a pasta.` : 'nenhum .jsp no pacote: o ERP precisa de um .jsp de entrada na raiz.');
  }
  for (const j of jspsNaRaiz) {
    if (ENTRADAS_PROIBIDAS.includes(j.toLowerCase())) {
      (jspsNaRaiz.length === 1 || j === entrada ? erros : avisos).push(`"${j}" não funciona como entryPoint no ERP ("Internal Server Error"). Renomeie (ex.: painel.jsp) e ajuste o XML do componente.`);
    }
  }
  if (entrada && !jspsNaRaiz.includes(entrada)) erros.push(`a entrada "${entrada}" não está na raiz do zip.`);

  for (const n of arquivos) {
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(n)) avisos.push(`arquivo de sistema no pacote: ${n}`);
  }

  const regras = regrasSegredo();
  for (const n of arquivos) {
    const texto = Buffer.from(entradas[n]).toString('latin1');
    for (const r of regras) if (r.teste(texto)) erros.push(`${r.rotulo} encontrado em ${n}`);
    if (/\.jsp$/i.test(n)) {
      const v = verificarJsp(Buffer.from(entradas[n]).toString('utf-8'), n);
      erros.push(...v.erros);
      avisos.push(...v.avisos);
    } else if (/\.html?$/i.test(n)) {
      const rel = caminhosRelativos(Buffer.from(entradas[n]).toString('utf-8'));
      if (rel.length) avisos.push(`${n}: caminhos relativos (${rel.join(', ')}) só funcionam se este HTML não for a página servida pelo ERP.`);
    }
  }

  const total = arquivos.reduce((s, n) => s + entradas[n].length, 0);
  if (total > TAMANHO_ALERTA) avisos.push(`pacote grande (${(total / 1024 / 1024).toFixed(1)} MB descompactado): o ERP pode demorar para abrir.`);
  return { erros: [...new Set(erros)], avisos: [...new Set(avisos)], jspsNaRaiz, arquivos };
}

/** Lê um .zip do disco e verifica. */
export function verificarArquivoZip(caminho, opcoes) {
  if (!existsSync(caminho)) throw new Error(`arquivo não encontrado: ${caminho}`);
  let entradas;
  try {
    entradas = unzipSync(readFileSync(caminho));
  } catch (e) {
    return { erros: [`não é um .zip válido: ${e.message}`], avisos: [], jspsNaRaiz: [], arquivos: [] };
  }
  return { ...verificarEntradas(entradas, opcoes), entradas };
}
