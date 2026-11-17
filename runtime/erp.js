/**
 * Abre uma tela nativa do Sankhya já posicionada num registro, a partir de um dashboard.
 *
 * Usa window.openApp(resourceID, { CHAVE: valor }), que o ERP oferece aos componentes HTML5.
 * Só abre a tela: nada é gravado. Fora do ERP (npm run dev), openApp não existe e a função
 * devolve { ok: false, motivo } para o dashboard mostrar um aviso.
 *
 *   import { abrirTela, TELAS } from 'sankhya-kit/erp.js';
 *   const r = abrirTela(TELAS.CENTRAL_NOTAS, { NUNOTA: 123 });
 *   if (!r.ok) mostrarAviso(r.motivo);
 */

/**
 * resourceIDs de telas comuns, como aparecem no log de acesso às telas (TSIACM.RESOURCEID).
 * Para outra tela, descubra o resourceID com:
 *   SELECT DISTINCT RESOURCEID, DESCRMENU FROM TSIACM WHERE UPPER(DESCRMENU) LIKE '%NOME DA TELA%'
 */
export const TELAS = {
  CENTRAL_NOTAS: { resource: 'br.com.sankhya.com.mov.CentralNotas', chave: 'NUNOTA', nome: 'Central de Notas' },
  PARCEIROS: { resource: 'br.com.sankhya.core.cad.parceiros', chave: 'CODPARC', nome: 'Parceiros' },
  PRODUTOS: { resource: 'br.com.sankhya.core.cad.produtos', chave: 'CODPROD', nome: 'Produtos' },
  SERVICOS: { resource: 'br.com.sankhya.core.cad.servicos', chave: 'CODPROD', nome: 'Serviço' },
  MOVIMENTACAO_FINANCEIRA: { resource: 'br.com.sankhya.fin.cad.movimentacaoFinanceira', chave: 'NUFIN', nome: 'Movimentação Financeira' },
};

/** A função openApp do ERP, se existir (na própria janela ou na de cima, quando o componente roda em iframe). */
export function funcaoOpenApp() {
  if (typeof window.openApp === 'function') return window.openApp;
  try {
    if (window.parent !== window && typeof window.parent.openApp === 'function') return window.parent.openApp.bind(window.parent);
  } catch {
    /* janela de outra origem: sem acesso */
  }
  return null;
}

/**
 * @param {{ resource: string, chave?: string, nome?: string } | string} tela  item de TELAS ou um resourceID
 * @param {Record<string, string|number>} chaves  ex.: { NUNOTA: 123 }
 * @returns {{ ok: boolean, motivo?: string }}
 */
export function abrirTela(tela, chaves) {
  const resource = typeof tela === 'string' ? tela : tela?.resource;
  const nome = (typeof tela === 'object' && tela?.nome) || resource;
  if (!resource) return { ok: false, motivo: 'Tela não informada.' };
  const openApp = funcaoOpenApp();
  if (!openApp) return { ok: false, motivo: `Abrir "${nome}" só funciona com o dashboard rodando dentro do Sankhya.` };
  try {
    openApp(resource, chaves);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: `Não foi possível abrir "${nome}": ${e.message}` };
  }
}
