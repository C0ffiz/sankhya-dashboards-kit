// Testes das consultas no servidor (lib/consultas-servidor.mjs), executando o dados.jsp gerado no emulador de JSP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarJspDados, validarDefinicoes } from '../lib/consultas-servidor.mjs';
import { renderizarJsp } from '../lib/jsp-emulado.mjs';

const DEFS = validarDefinicoes({
  itens: {
    sql: `SELECT CAB.NUNOTA, CAB.OBS, TO_CHAR(CAB.DTNEG, 'HH24:MI') H FROM TGFCAB CAB
          WHERE CAB.DTNEG >= :DTINI AND CAB.DTNEG < :DTFIM + 1 /*SE CODEMP*/ AND CAB.CODEMP IN (:CODEMP) /*FIM*/`,
    parametros: { DTINI: 'data', DTFIM: 'data', CODEMP: 'lista' },
    paginar: 'NUNOTA',
  },
  emp: { sql: 'SELECT CODEMP FROM TSIEMP WHERE CODEMP = :COD', parametros: { COD: 'numero' } },
  nat: 'SELECT CODNAT FROM TGFNAT',
});

/** Executa o dados.jsp com os parâmetros de uma URL e um executor falso. */
async function chamar(busca, linhas = [{ NUNOTA: 1, OBS: 'a < b & "c"', H: null }]) {
  const recebidos = [];
  const executarSql = async (sql) => {
    recebidos.push(sql);
    const nomes = Object.keys(linhas[0]);
    return { status: '1', responseBody: { fieldsMetadata: nomes.map((name) => ({ name })), rows: linhas.map((l) => nomes.map((n) => l[n])) } };
  };
  const pares = [...new URLSearchParams(busca)];
  const atributos = {
    __param: Object.fromEntries([...pares].reverse()),
    __paramValues: pares.reduce((acc, [k, v]) => ((acc[k] ??= []).push(v), acc), {}),
  };
  const saida = await renderizarJsp(gerarJspDados(DEFS), { atributos, executarSql });
  return { saida: saida.replace(/\s+/g, ' '), recebidos };
}

test('datas viram TO_DATE(AAAAMMDD), lista vira IN, paginação envolve o SQL', async () => {
  const { saida, recebidos } = await chamar('q=itens&DTINI=20261001&DTFIM=20261031&CODEMP=1&CODEMP=2&pagina=1');
  const sql = recebidos[0].replace(/\s+/g, ' ');
  assert.match(sql, /CAB\.DTNEG >= TO_DATE\('20261001', 'YYYYMMDD'\)/);
  assert.match(sql, /CAB\.CODEMP IN \(1,2\)/);
  assert.match(sql, /'HH24:MI'/);
  assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY NUNOTA\)/);
  assert.match(sql, /BETWEEN 5001 AND 10000/);
  assert.match(saida, /<zq n="itens" pag="5000"><zh><zc>NUNOTA<\/zc><zc>OBS<\/zc><zc>H<\/zc><\/zh><zr><v>1<\/v><v>a &lt; b &amp; &#034;c&#034;<\/v><n><\/n><\/zr><\/zq>/);
});

test('sem CODEMP o trecho /*SE*/ sai; várias consultas numa chamada', async () => {
  const { saida, recebidos } = await chamar('q=itens&q=nat&DTINI=20261001&DTFIM=20261031', [{ X: 1 }]);
  assert.doesNotMatch(recebidos[0], /CODEMP/);
  assert.match(recebidos[1], /FROM TGFNAT/);
  assert.match(saida, /<zq n="itens" pag="5000">.*<zq n="nat">/);
});

test('valor não numérico não chega ao SQL (tentativa de injeção)', async () => {
  for (const busca of ["q=emp&COD=1 OR 1=1", "q=emp&COD=1'--", 'q=itens&DTINI=20261001&DTFIM=20261031&CODEMP=1)%20OR%20(1=1', 'q=itens&DTINI=x&DTFIM=1']) {
    const { saida, recebidos } = await chamar(busca);
    assert.equal(recebidos.length, 0, busca);
    assert.match(saida, /<ze>.*não é número/, busca);
  }
});

test('consulta desconhecida não executa nada', async () => {
  const { saida, recebidos } = await chamar('q=TGFPAR');
  assert.equal(recebidos.length, 0);
  assert.match(saida.trim(), /^<zd>\s*<\/zd>$/);
});

test('definições inválidas são recusadas no build', () => {
  const ruins = [
    { a: 'DELETE FROM TGFCAB' },
    { a: 'SELECT 1 FROM DUAL; DROP TABLE X' },
    { a: { sql: 'SELECT ${x} FROM DUAL' } },
    { a: { sql: 'SELECT :X FROM DUAL' } },
    { a: { sql: 'SELECT :X FROM DUAL', parametros: { X: 'texto' } } },
    { a: { sql: 'SELECT 1 FROM DUAL', paginar: 'A); DROP' } },
    { a: { sql: 'SELECT 1 FROM DUAL /*SE X*/', parametros: { X: 'numero' } } },
  ];
  for (const d of ruins) assert.throws(() => validarDefinicoes(d), /consultas do servidor/, JSON.stringify(d));
});
