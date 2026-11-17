// npm run dev -- <dashboard>
// Sobe o proxy local (credenciais do .env, só em 127.0.0.1) + Vite com preview ao vivo.
import { createServer } from 'vite';
import { iniciarProxy } from '../proxy/servidor-dev.mjs';
import { configVite, resolverDashboard, PORTA_PROXY } from './vite-config.mjs';

const pasta = resolverDashboard(process.argv[2]);

let proxy;
try {
  proxy = await iniciarProxy({ porta: PORTA_PROXY });
} catch (e) {
  console.error(`\n[dev] ${e.message}`);
  console.error(`[dev] Verifique o arquivo .env (veja .env.example) e se a porta ${PORTA_PROXY} está livre.`);
  process.exit(1);
}

const servidor = await createServer(configVite(pasta, { dev: true }));
await servidor.listen();
servidor.printUrls();

const encerrar = async () => {
  proxy.close();
  await servidor.close();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
