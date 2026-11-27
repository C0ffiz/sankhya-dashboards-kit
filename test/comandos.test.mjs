import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as projeto from '../lib/projeto.mjs';

// Regressão da 2.5.0: emular chamava portaLivre() sem importar (ReferenceError só ao rodar o comando).
// Todo nome exportado por lib/projeto.mjs que um comando usa tem de estar importado nele.
test('comandos importam de projeto.mjs tudo o que usam', () => {
  const pasta = resolve(import.meta.dirname, '../lib/comandos');
  const nomes = Object.keys(projeto);
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.mjs'))) {
    const codigo = readFileSync(resolve(pasta, arquivo), 'utf-8');
    const importados = new Set(
      [...codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/projeto\.mjs'/g)].flatMap((m) => m[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop())),
    );
    for (const nome of nomes) {
      const usado = new RegExp(`(?<![\\w.])${nome}\\b`).test(codigo.replace(/import\s*\{[^}]*\}\s*from\s*'[^']*';/g, ''));
      if (usado) assert.ok(importados.has(nome), `${arquivo} usa ${nome} sem importar de projeto.mjs`);
    }
  }
});
