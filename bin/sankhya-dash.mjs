#!/usr/bin/env node
// CLI do sankhya-dashboards-kit. Rode na raiz do projeto (a pasta com package.json, .env e dashboards/).
//   npx sankhya-dash <comando> [nome] [--opções]    ou, pelos scripts do package.json:  npm run <comando> -- [nome]
import { spawnSync } from 'node:child_process';
import { ErroUsuario } from '../lib/projeto.mjs';

// Redes com proxy corporativo: o fetch do Node só usa HTTPS_PROXY com NODE_USE_ENV_PROXY=1 (Node >= 22.21).
// Para os comandos que falam com a API do Sankhya, reinicia o processo com a variável ligada.
const PRECISA_REDE = ['dev', 'proxy', 'emular'];
if (PRECISA_REDE.includes(process.argv[2]) && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const AJUDA = `
sankhya-dash — dashboards HTML5 para o Construtor de Componentes de BI do Sankhya

Uso (na raiz do projeto):  npm run <comando> -- [nome] [--opções]

  novo <nome> [--stack vite|jsp|html]   cria dashboards/<nome>/ a partir de um modelo (padrão: vite)
  dev <nome>                            preview com dados reais (proxy local + .env)
  build <nome>                          gera dist-sankhya/<nome>.zip, verificado, pronto para o ERP
  diagnostico [nome]                    gera um .zip de testes para descobrir por que um componente não abre
  verificar <arquivo.zip|nome>          confere um .zip (inclusive de outra stack) [--consertar] [--entrada x.jsp]
  emular <arquivo.zip|nome>             serve o .zip como o ERP serve, com dados reais, para testar antes de subir
  proxy [--porta 8787]                  sobe só o proxy local (stacks com servidor de dev próprio)

Documentação: README.md e docs/ do sankhya-dashboards-kit.
`;

function lerArgs(argv) {
  const posicionais = [];
  const opcoes = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [chave, valor] = a.slice(2).split('=');
      if (valor !== undefined) opcoes[chave] = valor;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opcoes[chave] = argv[++i];
      else opcoes[chave] = true;
    } else posicionais.push(a);
  }
  return { posicionais, opcoes };
}

const COMANDOS = {
  novo: () => import('../lib/comandos/novo.mjs').then((m) => m.comandoNovo),
  dev: () => import('../lib/comandos/dev.mjs').then((m) => m.comandoDev),
  build: () => import('../lib/comandos/build.mjs').then((m) => m.comandoBuild),
  diagnostico: () => import('../lib/comandos/diagnostico.mjs').then((m) => m.comandoDiagnostico),
  verificar: () => import('../lib/comandos/verificar.mjs').then((m) => m.comandoVerificar),
  emular: () => import('../lib/comandos/emular.mjs').then((m) => m.comandoEmular),
  proxy: () => import('../lib/comandos/proxy.mjs').then((m) => m.comandoProxy),
};

const [comando, ...resto] = process.argv.slice(2);
if (!comando || comando === 'ajuda' || comando === '--help' || comando === '-h' || !COMANDOS[comando]) {
  if (comando && !COMANDOS[comando] && !['ajuda', '--help', '-h'].includes(comando)) console.error(`Comando desconhecido: ${comando}`);
  console.log(AJUDA);
  process.exit(comando && !['ajuda', '--help', '-h'].includes(comando) ? 1 : 0);
}

const { posicionais, opcoes } = lerArgs(resto);
try {
  const executar = await COMANDOS[comando]();
  await executar(posicionais, opcoes);
} catch (e) {
  if (e instanceof ErroUsuario) {
    console.error(`\n[${comando}] ${e.message}`);
    process.exit(1);
  }
  console.error(`\n[${comando}] erro inesperado: ${e.message}`);
  if (e.message?.includes('Credenciais') || e.message?.includes('porta')) console.error(`[${comando}] Verifique o .env (veja .env.example) e se a porta está livre.`);
  else console.error(e.stack);
  process.exit(1);
}
