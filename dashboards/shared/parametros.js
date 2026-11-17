/**
 * Camada híbrida de parâmetros/filtros do ERP (ex.: CODEMP, DTINI, DTFIM).
 *
 * A fonte é sempre a mesma: tags <meta name="snk-param" data-nome="X" content="valor"> no <head>.
 * - Produção: o build gera no index.jsp  <meta ... data-nome="CODEMP" content="${CODEMP}">
 *   e o WildFly (EL ativo) substitui pelo valor que o ERP injetou.
 * - Desenvolvimento: o Vite injeta as mesmas tags com os valores de `parametros.json` (mock)
 *   e a URL pode sobrescrever: http://127.0.0.1:5173/?CODEMP=2&DTINI=01/10/2026
 *
 * Valor vazio ou não substituído (literal "${...}") vira null.
 *
 * @returns {Record<string, string|null>}
 */
export function lerParametros() {
  const params = {};
  document.querySelectorAll('meta[name="snk-param"]').forEach((m) => {
    params[m.dataset.nome] = m.getAttribute('content');
  });

  if (import.meta.env.DEV) {
    new URLSearchParams(window.location.search).forEach((valor, chave) => {
      params[chave.toUpperCase()] = valor;
    });
  }

  for (const chave of Object.keys(params)) {
    const v = params[chave];
    if (v == null || v.trim() === '' || /^\$\{.*\}$/.test(v.trim())) params[chave] = null;
    else params[chave] = v.trim();
  }
  return params;
}
