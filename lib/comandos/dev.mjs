// npm run dev -- <nome>
//   vite  proxy local (credenciais do .env, só 127.0.0.1) + Vite com preview ao vivo e dados reais
//   html  proxy local + o comando "dev" do dashboard.json (o servidor da sua stack, apontando /api para o proxy)
//   jsp   sem preview local: o JSP só roda dentro do ERP (use a base de testes + npm run diagnostico)
import { spawn } from 'node:child_process';
import { iniciarProxy } from '../../proxy/servidor-dev.mjs';
import { jspDadosDoDashboard } from '../consultas-servidor.mjs';
import { PORTA_PROXY, ErroUsuario, lerManifesto, portaLivre, resolverDashboard } from '../projeto.mjs';

export async function comandoDev([nome]) {
  const pasta = resolverDashboard(nome, 'dev');
  const m = lerManifesto(pasta);
  if (m.stack === 'jsp') {
    throw new ErroUsuario(
      `"${nome}" é da stack jsp: o JSP (EL, <snk:query>) só roda dentro do ERP, não há preview local.\n` +
        `Publique na base de testes (npm run build -- ${nome}) e, se der erro, use: npm run diagnostico -- ${nome}`,
    );
  }
  if (m.stack === 'html' && !m.dev) {
    throw new ErroUsuario(`"${nome}" é da stack html: informe no dashboard.json o comando do servidor de desenvolvimento da sua stack, ex.: "dev": "npm run dev". Ele precisa encaminhar /api para http://127.0.0.1:${PORTA_PROXY}.`);
  }

  // PORTA_PROXY no ambiente = porta fixa pedida; senão, a primeira livre (outro painel pode estar aberto)
  const porta = process.env.PORTA_PROXY ? PORTA_PROXY : await portaLivre(PORTA_PROXY);
  process.env.PORTA_PROXY = String(porta);
  const proxy = await iniciarProxy({ porta, jspDados: m.consultasServidor ? () => jspDadosDoDashboard(pasta, m) : undefined });
  let filho;
  let vite;
  if (m.stack === 'vite') {
    const { createServer } = await import('vite');
    const { configVite } = await import('../vite-config.mjs');
    vite = await createServer(configVite(pasta, { dev: true }));
    await vite.listen();
    vite.printUrls();
  } else {
    console.log(`[dev] proxy em http://127.0.0.1:${porta} — iniciando: ${m.dev}`);
    filho = spawn(m.dev, { cwd: pasta, shell: true, stdio: 'inherit' });
    filho.on('exit', (codigo) => encerrar(codigo ?? 0));
  }

  async function encerrar(codigo = 0) {
    proxy.close();
    filho?.kill();
    await vite?.close();
    process.exit(codigo);
  }
  process.on('SIGINT', () => encerrar());
  process.on('SIGTERM', () => encerrar());
}
