<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="true"%>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Diagnóstico do componente HTML5</title>
<style>
  body { font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 20px; color: #1d1d1b; background: #f7f7f5; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 4px 0 12px; color: #4a4a46; max-width: 90ch; }
  table { border-collapse: collapse; width: 100%; background: #fff; border: 1px solid #ddd; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { font-size: 12px; color: #666; }
  td.ok { color: #0a6b2f; font-weight: 600; white-space: nowrap; }
  td.erro { color: #b3261e; font-weight: 600; white-space: nowrap; }
  td.espera { color: #8a6d00; white-space: nowrap; }
  code, textarea { font: 12px ui-monospace, Consolas, monospace; }
  textarea { width: 100%; height: 190px; margin-top: 8px; box-sizing: border-box; }
  button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
  .conclusoes li { margin: 4px 0; }
  .caixa { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 12px 14px; margin-top: 14px; }
  iframe { display: none; }
</style>
</head>
<body>
<h1>Diagnóstico do componente HTML5</h1>
<p>Esta página chama cada teste do pacote pelo mesmo endereço que o ERP usa (<code>html5component.mge?entryPoint=...</code>)
e mostra o resultado. Se esta página não abrir, troque o <code>entryPoint</code> do XML manualmente para <code>t1.jsp</code>,
<code>t2.jsp</code>... (passo a passo no <code>docs/debug-e-logs.md</code> do kit).</p>

<table>
  <thead><tr><th>Teste</th><th>O que testa</th><th>Situação</th><th>Detalhe</th></tr></thead>
  <tbody id="linhas"></tbody>
</table>

<div class="caixa">
  <b>O que os resultados indicam</b>
  <ul class="conclusoes" id="conclusoes"><li>Rodando os testes…</li></ul>
</div>

<div class="caixa">
  <b>Relatório para copiar</b> (cole numa issue ou mande para quem vai investigar)
  <button type="button" id="copiar">Copiar</button>
  <textarea id="relatorio" readonly></textarea>
</div>

<script type="application/json" id="testes">__TESTES__</script>
<script>
(function () {
  var testes = JSON.parse(document.getElementById('testes').textContent);
  var linhas = document.getElementById('linhas');
  var resultados = {};

  function urlDe(arquivo) {
    var u = new URL(window.location.href);
    u.searchParams.set('entryPoint', arquivo);
    return u.toString();
  }

  function linha(t) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><code></code></td><td></td><td class="espera">aguardando</td><td></td>';
    tr.children[0].firstChild.textContent = t.arquivo;
    tr.children[1].textContent = t.titulo;
    linhas.appendChild(tr);
    return tr;
  }

  function buscar(url) {
    return fetch(url, { method: 'POST', credentials: 'same-origin' }).then(function (r) {
      if (r.status === 405) return fetch(url, { credentials: 'same-origin' });
      return r;
    }).then(function (r) {
      return r.text().then(function (texto) { return { status: r.status, texto: texto }; });
    });
  }

  // Abre o HTML num iframe invisível (mesma origem e mesmo endereço-base da página real),
  // espera os scripts preencherem #resultado e devolve o texto.
  function executar(html) {
    return new Promise(function (ok) {
      var iframe = document.createElement('iframe');
      iframe.srcdoc = html;
      var fim = Date.now() + 15000;
      iframe.onload = function () {
        (function esperar() {
          var doc = iframe.contentDocument;
          var el = doc && doc.getElementById('resultado');
          var texto = el ? el.textContent.trim() : '';
          if ((el && texto.indexOf('aguardando') < 0) || Date.now() > fim) {
            ok(el ? texto : '');
          } else {
            setTimeout(esperar, 200);
          }
        })();
      };
      document.body.appendChild(iframe);
    });
  }

  function rodar(i) {
    if (i >= testes.length) return concluir();
    var t = testes[i];
    var tr = linha(t);
    var marcar = function (ok, situacao, detalhe) {
      tr.children[2].className = ok ? 'ok' : 'erro';
      tr.children[2].textContent = situacao;
      tr.children[3].textContent = detalhe;
      resultados[t.id] = { ok: ok, situacao: situacao, detalhe: detalhe, arquivo: t.arquivo };
    };
    buscar(urlDe(t.arquivo)).then(function (r) {
      if (r.status !== 200) {
        marcar(false, 'ERRO HTTP ' + r.status, (r.texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '(sem texto)').slice(0, 300));
        return;
      }
      return executar(r.texto).then(function (texto) {
        if (!texto) return marcar(true, 'abriu (HTTP 200)', t.painel ? 'a página do dashboard carregou; confira abrindo o componente com este entryPoint' : 'sem linha de resultado');
        var m = texto.match(/^RESULTADO (?:T\d+ )?(\S+)/);
        var estado = m ? m[1] : 'ERRO';
        marcar(estado === 'OK', estado === 'NAO_TESTADO' ? 'não testado' : estado, texto.replace(/^RESULTADO (?:T\d+ )?\S+ \| ?/, ''));
        if (estado === 'NAO_TESTADO') { tr.children[2].className = 'espera'; resultados[t.id].pulado = true; }
      });
    }).catch(function (e) {
      marcar(false, 'ERRO', 'falha ao chamar o teste: ' + e.message);
    }).then(function () { rodar(i + 1); });
  }

  function concluir() {
    var r = resultados;
    var c = [];
    var ok = function (id) { return r[id] && r[id].ok; };
    if (r.t1 && !ok('t1')) c.push('T1 falhou: o servidor não executa nem um JSP simples deste pacote. Suspeite do upload, do formato do .zip ou do ambiente (teste o .zip de um componente que funciona).');
    if (ok('t1') && r.t2 && !ok('t2')) c.push('T2 falhou: problema com a taglib da Sankhya (snk:load) neste servidor.');
    if (r.t3 && !ok('t3')) c.push('T3: os arquivos do pacote não carregaram pela pasta BASE_FOLDER. Confira se o .zip tem as entradas de pasta (npm run verificar -- arquivo.zip).');
    if (ok('t3') && /js_relativo=falhou/.test(r.t3.detalhe)) c.push('Caminho relativo (./assets) não funciona neste ERP, como esperado: os arquivos precisam ser referenciados por ${BASE_FOLDER}.');
    if (r.t5 && r.t5.pulado) c.push('T5 não foi testado (o emulador local não executa snk:query): rode o diagnóstico no ERP para esse teste.');
    if (r.t4 && !ok('t4') && ok('t5')) c.push('T4 falhou e T5 funcionou: este usuário não pode consultar pelo navegador (DbExplorerSP). Para ele, use dashboards da stack jsp (consulta no servidor com snk:query).');
    if (ok('t4')) c.push('T4 OK: este usuário consegue consultar pelo navegador; dashboards das stacks vite/html funcionam para ele.');
    if (r.t5 && !ok('t5') && !r.t5.pulado) c.push('T5 falhou: a consulta no servidor (snk:query) não funcionou neste servidor; veja o detalhe.');
    testes.filter(function (t) { return t.painel; }).forEach(function (t) {
      var x = r[t.id];
      if (x && !x.ok && ok('t1') && ok('t2')) c.push('O dashboard (' + t.arquivo + ') falhou, mas os testes básicos funcionaram: o problema está no conteúdo do dashboard. Veja docs/debug-e-logs.md (erros conhecidos).');
      if (x && x.ok) c.push('O dashboard (' + t.arquivo + ') abriu. Use entryPoint="' + t.arquivo + '" no XML.');
    });
    if (!c.length) c.push('Nenhum problema encontrado nos testes.');
    var ul = document.getElementById('conclusoes');
    ul.innerHTML = '';
    c.forEach(function (texto) { var li = document.createElement('li'); li.textContent = texto; ul.appendChild(li); });

    var u = new URL(window.location.href);
    u.searchParams.delete('userID');
    var rel = ['Diagnóstico do componente HTML5 — ' + new Date().toLocaleString('pt-BR'),
      'Endereço: ' + u.pathname + u.search, 'Navegador: ' + navigator.userAgent, ''];
    testes.forEach(function (t) {
      var x = r[t.id] || {};
      rel.push(t.arquivo + ': ' + (x.situacao || '?') + (x.detalhe ? ' | ' + x.detalhe : ''));
    });
    rel.push('', 'Conclusões:');
    c.forEach(function (texto) { rel.push('- ' + texto); });
    document.getElementById('relatorio').value = rel.join('\n');
  }

  document.getElementById('copiar').onclick = function () {
    var t = document.getElementById('relatorio');
    t.select();
    try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); }
  };

  rodar(0);
})();
</script>
</body>
</html>
