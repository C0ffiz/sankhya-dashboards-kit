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

/* ---------- Moldura do dashboard no ERP ---------- */

/**
 * Classes da moldura em volta do componente, nas janelas de cima (mesma origem).
 * Vêm do SankhyaJX (`JX.removerFrame()` sem argumentos, commit em JX_VERSAO.md); confira após atualizar o ERP.
 */
export const MOLDURA = {
  filtros: '.VCompactBar', // painel lateral de filtros ("Esconder ao atualizar", "Atualizar", «)
  barraTopo: '.DashWindow-TopBar', // barra de ícones da janela do dashboard (editar, informações, maximizar)
  menuGrafico: '.chartConfigButton', // menu do componente ("Imprimir Gráfico")
  conteudo: '.DashWindow-Container',
  janela: '.dashWindow-size',
  raiz: '.raiz',
  layout: '.dashboard-container-layout',
  gadget: '.dyna-gadget',
};

const esconder = (el) => el.style.setProperty('display', 'none', 'important');
/** Nunca esconde um elemento que contém o próprio componente (o painel sumiria junto). */
const podeEsconder = (el, quadro) => el && !el.contains(quadro);
const fixar = (el, prop, valor) => el.style.setProperty(prop, valor, 'important');

/** Elementos `seletor` do menor ancestral de `el` que tem algum: só a moldura deste componente, não a de outras abas. */
function aoRedor(el, seletor) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const achados = p.querySelectorAll(seletor);
    if (achados.length) return [...achados];
  }
  return [];
}

/**
 * Esconde partes da moldura que o ERP desenha em volta do dashboard. Só mexe no visual, nesta sessão:
 * nada é gravado e não há consulta ao banco (funciona para qualquer usuário, com ou sem DBExplorer).
 * Diferente de `JX.removerFrame()`, procura só em volta do PRÓPRIO componente (outras abas abertas
 * não são afetadas) e pode manter o menu do gráfico ("Imprimir Gráfico").
 *
 * Fora do ERP (npm run dev, emulador) não há moldura e a função não faz nada.
 * O ERP desenha a moldura depois do componente: a função repete a cada `intervalo` ms, `tentativas` vezes.
 *
 *   import { esconderMoldura } from 'sankhya-kit/erp.js';
 *   esconderMoldura({ filtros: true, barraTopo: true, menuGrafico: false }); // mantém "Imprimir Gráfico"
 *
 * @param {{ filtros?: boolean, barraTopo?: boolean, menuGrafico?: boolean, tentativas?: number, intervalo?: number }} [opcoes]
 *   true = esconder. Padrão: esconde filtros e barra de ícones, mantém o menu do gráfico.
 * @returns {() => number}  aplica de novo na hora; devolve quantos elementos foram escondidos
 */
export function esconderMoldura({ filtros = true, barraTopo = true, menuGrafico = false, tentativas = 30, intervalo = 1000 } = {}) {
  const achados = {};
  const conta = (nome, qtd) => (achados[nome] = Math.max(achados[nome] ?? 0, qtd));
  const aplicar = () => {
    let n = 0;
    let janela = window;
    try {
      while (janela.parent && janela.parent !== janela && janela.frameElement) {
        const quadro = janela.frameElement; // o <iframe> deste componente, no documento de cima
        const alvos = (nome, lista) => (conta(nome, lista.length), lista.filter((el) => podeEsconder(el, quadro)));
        if (filtros) for (const el of alvos('filtros', aoRedor(quadro, MOLDURA.filtros))) (esconder(el), n++);
        if (menuGrafico) for (const el of alvos('menuGrafico', aoRedor(quadro, MOLDURA.menuGrafico))) (esconder(el), n++);
        if (barraTopo) {
          for (const el of alvos('barraTopo', aoRedor(quadro, MOLDURA.barraTopo).map((b) => b.parentElement))) (esconder(el), n++);
          // sem a barra, o conteúdo sobe e ocupa a janela toda
          for (const c of aoRedor(quadro, MOLDURA.conteudo)) {
            if (c.parentElement) fixar(c.parentElement, 'top', '0px');
            const j = c.closest(MOLDURA.janela);
            if (j) (fixar(j, 'width', '100%'), fixar(j, 'height', '100%'));
            for (const r of c.querySelectorAll(MOLDURA.raiz)) (fixar(r, 'width', '100%'), fixar(r, 'height', '100%'));
          }
        }
        if (filtros || barraTopo) {
          for (const l of aoRedor(quadro, MOLDURA.layout)) {
            for (let p = l.parentElement; p && !p.matches(MOLDURA.gadget); p = p.parentElement) fixar(p, 'padding', '0px');
          }
        }
        janela = janela.parent;
      }
    } catch {
      /* janela de outra origem: para aqui */
    }
    return n;
  };
  let vezes = 0;
  aplicar();
  const t = setInterval(() => {
    vezes += 1;
    aplicar();
    if (vezes >= tentativas) {
      clearInterval(t);
      // F12 → Console: mostra o que foi encontrado, para conferir os seletores de MOLDURA num ERP novo
      if (window.parent !== window) console.info('[sankhya-kit] esconderMoldura: elementos encontrados', achados);
    }
  }, intervalo);
  return aplicar;
}
