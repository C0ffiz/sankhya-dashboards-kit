// Leitor mínimo do arquivo .env (sem dependências). Usado SÓ pelo proxy de desenvolvimento e pela
// varredura de segredos do build. O código em dashboards/ nunca importa este arquivo.
import { existsSync, readFileSync } from 'node:fs';

/** Lê um .env e devolve { CHAVE: 'valor' }. Aceita comentários (#), aspas e `export CHAVE=...`. */
export function lerEnv(arquivo) {
  const env = {};
  if (!existsSync(arquivo)) return env;
  for (const linha of readFileSync(arquivo, 'utf-8').split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let valor = m[2];
    if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
    else valor = valor.replace(/\s+#.*$/, '');
    env[m[1]] = valor;
  }
  return env;
}
