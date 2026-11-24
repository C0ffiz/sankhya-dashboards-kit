// Configuração do Vite (stack "vite"), usada pelo dev e pelo build. Um dashboard por vez.
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { KIT, PROJETO, lerParametrosMock } from './projeto.mjs';
import { injetarNoHead, metasParametros } from './jsp.mjs';

/** Em dev, injeta as <meta name="snk-param"> com os valores mock do parametros.json. */
function pluginParametrosDev(pastaDashboard) {
  return {
    name: 'sankhya-parametros-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return injetarNoHead(html, metasParametros(lerParametrosMock(pastaDashboard), { el: false }));
    },
  };
}

export function configVite(pastaDashboard, { dev, outDir } = {}) {
  return {
    configFile: false,
    root: pastaDashboard,
    base: './', // no build, empacotar troca ./assets/ por ${BASE_FOLDER}assets/
    publicDir: false,
    logLevel: 'info',
    // import { consultarSQL } from 'sankhya-kit/dados.js'  →  <kit>/runtime/dados.js
    resolve: { alias: [{ find: /^sankhya-kit\//, replacement: `${resolve(KIT, 'runtime')}/` }] },
    plugins: [tailwindcss(), dev && pluginParametrosDev(pastaDashboard)].filter(Boolean),
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      open: !process.env.SEM_NAVEGADOR,
      fs: { allow: [PROJETO, KIT] },
      // lê na hora: o `dev` escolhe uma porta livre e a publica em process.env.PORTA_PROXY
      proxy: { '/api': `http://127.0.0.1:${Number(process.env.PORTA_PROXY) || 8787}` },
    },
    build: {
      outDir,
      emptyOutDir: true,
      assetsDir: 'assets',
      target: 'es2020',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0, // nada embutido no HTML/JSP: tudo vira arquivo em assets/
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1500,
    },
  };
}
