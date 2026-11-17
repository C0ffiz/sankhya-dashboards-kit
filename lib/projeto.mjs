// Onde estão as coisas: o kit (este pacote) e o projeto que o usa (a pasta onde o comando roda).
// O mesmo código serve ao kit sozinho (git clone do kit) e a um projeto que o instala como dependência.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Raiz do kit (onde estão lib/, runtime/, modelos/, proxy/). */
export const KIT = resolve(import.meta.dirname, '..');
/** Raiz do projeto: a pasta onde o comando foi executado (a que tem package.json e .env). */
export const PROJETO = process.cwd();
export const PASTA_DASHBOARDS = resolve(PROJETO, 'dashboards');
export const PASTA_SAIDA = resolve(PROJETO, 'dist-sankhya');
export const ARQUIVO_ENV = resolve(PROJETO, '.env');
export const PORTA_PROXY = Number(process.env.PORTA_PROXY) || 8787;

export const STACKS = ['vite', 'html', 'jsp'];
/** Nome do arquivo de entrada no .zip. index.jsp NÃO funciona: o ERP responde "Internal Server Error". */
export const ENTRADA_PADRAO = 'painel.jsp';
export const ENTRADAS_PROIBIDAS = ['index.jsp'];

export class ErroUsuario extends Error {}

export function listarDashboards() {
  if (!existsSync(PASTA_DASHBOARDS)) return [];
  return readdirSync(PASTA_DASHBOARDS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared')
    .filter((d) => {
      const p = resolve(PASTA_DASHBOARDS, d.name);
      return existsSync(resolve(p, 'dashboard.json')) || existsSync(resolve(p, 'index.html'));
    })
    .map((d) => d.name)
    .sort();
}

export function resolverDashboard(nome, comando = 'dev') {
  const disponiveis = listarDashboards();
  if (!nome || !disponiveis.includes(nome)) {
    throw new ErroUsuario(
      `${nome ? `Dashboard "${nome}" não encontrado.` : 'Informe o dashboard.'} Disponíveis: ${disponiveis.join(', ') || '(nenhum — crie com: npm run novo -- <nome>)'}\n` +
        `Ex.: npm run ${comando} -- ${disponiveis[0] ?? '<nome>'}`,
    );
  }
  return resolve(PASTA_DASHBOARDS, nome);
}

/**
 * Lê dashboards/<nome>/dashboard.json, preenchendo os padrões. Sem o arquivo, um dashboard com
 * index.html é tratado como stack "vite" (compatível com dashboards antigos).
 *
 * Campos:
 *   stack     "vite" | "html" | "jsp"
 *   entrada   nome do arquivo de entrada no .zip (entryPoint do XML). Padrão: painel.jsp
 *   build     html/jsp: comando que gera os arquivos antes de empacotar (rodado na pasta do dashboard)
 *   dev       html: comando do servidor de desenvolvimento da sua stack (rodado junto com o proxy)
 *   pasta     html/jsp: pasta, relativa ao dashboard, com os arquivos a empacotar. Padrão: "dist" (html) ou "." (jsp)
 *   ignorar   jsp/html: nomes de arquivos/pastas a deixar fora do .zip (além dos padrões)
 *   jx        vite/html: incluir o SankhyaJX no pacote. Padrão: true
 *   consultasServidor  módulo com as consultas que rodam no servidor (gera dados.jsp; docs/consultas-no-servidor.md)
 */
export function lerManifesto(pastaDashboard) {
  const arq = resolve(pastaDashboard, 'dashboard.json');
  let m = {};
  if (existsSync(arq)) {
    try {
      m = JSON.parse(readFileSync(arq, 'utf-8'));
    } catch (e) {
      throw new ErroUsuario(`dashboard.json inválido em ${arq}: ${e.message}`);
    }
  }
  const stack = m.stack ?? 'vite';
  if (!STACKS.includes(stack)) throw new ErroUsuario(`stack "${stack}" desconhecida em dashboard.json. Use: ${STACKS.join(', ')}.`);
  const entrada = m.entrada ?? ENTRADA_PADRAO;
  validarEntrada(entrada);
  if (entrada === 'dados.jsp' && m.consultasServidor) throw new ErroUsuario('dados.jsp é o nome do arquivo gerado para as consultas no servidor: use outra entrada (ex.: painel.jsp).');
  return {
    stack,
    entrada,
    build: m.build ?? null,
    dev: m.dev ?? null,
    pasta: m.pasta ?? (stack === 'jsp' ? '.' : stack === 'html' ? 'dist' : null),
    ignorar: m.ignorar ?? [],
    jx: m.jx ?? true,
    consultasServidor: m.consultasServidor ?? null,
  };
}

export function validarEntrada(entrada) {
  if (!/^[A-Za-z0-9_-]+\.jsp$/.test(entrada)) {
    throw new ErroUsuario(`entrada "${entrada}" inválida: use um nome simples terminado em .jsp, na raiz do .zip (ex.: painel.jsp).`);
  }
  if (ENTRADAS_PROIBIDAS.includes(entrada.toLowerCase())) {
    throw new ErroUsuario(`entrada "${entrada}" não funciona no ERP ("Internal Server Error"). Use outro nome, ex.: painel.jsp. Veja docs/debug-e-logs.md.`);
  }
}

/** Lê dashboards/<nome>/parametros.json → { CODEMP: "1", ... } (valores = mock de dev). */
export function lerParametrosMock(pastaDashboard) {
  const arq = resolve(pastaDashboard, 'parametros.json');
  if (!existsSync(arq)) return {};
  const json = JSON.parse(readFileSync(arq, 'utf-8'));
  for (const nome of Object.keys(json)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(nome)) throw new ErroUsuario(`Nome de parâmetro inválido em parametros.json: "${nome}" (use MAIÚSCULAS, ex.: CODEMP)`);
  }
  return json;
}
