<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="true"%>
<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>T6 - consultas no servidor pelo dashboard</title></head>
<body style="font:14px system-ui,sans-serif;padding:16px">
<h2>T6: consultas no servidor chamadas pelo dashboard (dados.jsp)</h2>
<p>Mesmo caminho dos dashboards com <code>consultasServidor</code>: a página pede uma consulta pelo nome a um JSP do pacote,
que roda o SQL fixo com <code>&lt;snk:query&gt;</code>. Não usa o DBExplorer. Também confere que um valor não numérico é recusado.</p>
<pre id="resultado">RESULTADO T6 aguardando a consulta…</pre>
<script>
(function () {
  var saida = document.getElementById('resultado');
  function url(extra) {
    var atual = new URL(document.baseURI || window.location.href);
    var u = new URL(/html5component\.mge$/.test(atual.pathname) ? atual.href : window.location.origin + '/mge/html5component.mge');
    Array.from(u.searchParams.keys()).forEach(function (k) { if (['entryPoint', 'nuGdg', 'gadGetID', 'userID'].indexOf(k) < 0) u.searchParams.delete(k); });
    u.searchParams.set('entryPoint', 't6dados.jsp');
    return u.toString() + '&q=t6&' + extra;
  }
  function pedir(extra) {
    return fetch(url(extra), { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.text().then(function (t) {
        var doc = new DOMParser().parseFromString(t, 'text/html');
        var q = doc.querySelector('zq');
        if (!q) throw new Error('HTTP ' + r.status + ' sem resposta de dados: ' + (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 150));
        var e = q.querySelector('ze');
        var v = q.querySelector('zr > v');
        return { erro: e ? e.textContent.trim() : null, valor: v ? v.textContent : null };
      });
    });
  }
  var inicio = Date.now();
  pedir('DESDE=20000101&EXCLUIR=-1&EXCLUIR=-2').then(function (ok) {
    if (ok.erro) throw new Error(ok.erro);
    var ms = Date.now() - inicio;
    return pedir('DESDE=20000101&EXCLUIR=' + encodeURIComponent('1) OR (1=1')).then(function (inj) {
      if (!inj.erro) {
        saida.textContent = 'RESULTADO T6 ERRO | consultas no servidor | valor não numérico NÃO foi recusado: não publique dashboards com consultasServidor e abra uma issue no kit';
        return;
      }
      saida.textContent = 'RESULTADO T6 OK | consultas no servidor (dados.jsp) | empresas em TSIEMP=' + ok.valor + ' | ' + ms + ' ms | valor não numérico recusado';
    });
  }).catch(function (e) {
    saida.textContent = 'RESULTADO T6 ERRO | consultas no servidor | ' + (e && e.message ? e.message : e);
  });
})();
</script>
</body>
</html>
