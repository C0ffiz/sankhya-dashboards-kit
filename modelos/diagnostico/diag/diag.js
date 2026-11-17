// Lógica dos testes T3 e T4 do pacote de diagnóstico. Atualiza #resultado com uma linha para copiar.
(function () {
  var teste = document.currentScript.getAttribute('data-teste');
  var resultado = document.getElementById('resultado');
  var marcar = function (id, ok, texto) {
    var li = document.getElementById(id);
    if (li) {
      li.textContent = texto;
      li.style.color = ok ? '#0a6b2f' : '#b3261e';
    }
  };
  var openApp = typeof window.openApp === 'function' ? (window.openApp.emulado ? 'function (emulado)' : 'function') : (function () {
    try { return window.parent !== window && typeof window.parent.openApp === 'function' ? 'function (janela de cima)' : 'ausente'; } catch (e) { return 'ausente'; }
  })();
  var jx = typeof JX !== 'undefined' ? 'carregado' : 'ausente';

  if (teste === 't3') {
    // a sonda por caminho relativo é criada aqui (e não no HTML) para a verificação do pacote não acusá-la
    var relativo = document.createElement('script');
    relativo.setAttribute('data-sonda', 'relativo');
    relativo.onload = relativo.onerror = function () { concluirT3(); };
    relativo.src = 'diag/sonda.js';
    document.body.appendChild(relativo);
    return;
  }

  function concluirT3() {
    var s = window.__sondas || {};
    marcar('li-base', !!s.base, 'JS pela pasta do pacote (BASE_FOLDER): ' + (s.base ? 'carregou' : 'NÃO carregou'));
    marcar('li-relativo', true, 'JS por caminho relativo: ' + (s.relativo ? 'carregou' : 'não carregou (esperado no ERP)'));
    marcar('li-jx', jx === 'carregado', 'SankhyaJX: ' + jx);
    marcar('li-openapp', openApp !== 'ausente', 'openApp (abrir telas do ERP): ' + openApp);
    resultado.textContent = 'RESULTADO T3 ' + (s.base ? 'OK' : 'ERRO') +
      ' | BASE_FOLDER=' + resultado.getAttribute('data-base-folder') +
      ' | usuario=' + (resultado.getAttribute('data-usuario') || '?') +
      ' | js_base=' + (s.base ? 'ok' : 'falhou') +
      ' | js_relativo=' + (s.relativo ? 'ok' : 'falhou') +
      ' | JX=' + jx + ' | openApp=' + openApp;
  }

  if (teste === 't4') {
    var usuario = resultado.getAttribute('data-usuario') || '?';
    if (typeof JX === 'undefined') {
      resultado.textContent = 'RESULTADO T4 ERRO | SankhyaJX não carregou | usuario=' + usuario;
      return;
    }
    var servico = 'DbExplorerSP.executeQuery';
    // caminho absoluto, sem location.origin: dentro do diagnostico.jsp o teste roda num iframe srcdoc, onde origin é "null"
    var url = '/mge/service.sbr?serviceName=' + servico + '&outputType=json';
    var inicio = Date.now();
    JX.post(url, { serviceName: servico, requestBody: { sql: 'SELECT COUNT(*) AS QTD FROM TSIEMP' } }).then(function (r) {
      var d = (r && r.data) || r || {};
      var ms = Date.now() - inicio;
      if (String(d.status) === '1') {
        var linhas = (d.responseBody && d.responseBody.rows) || [];
        resultado.textContent = 'RESULTADO T4 OK | consulta pelo navegador | empresas em TSIEMP=' + (linhas[0] ? linhas[0][0] : '?') + ' | ' + ms + ' ms | usuario=' + usuario;
      } else {
        var msg = String(d.statusMessage || 'sem resposta (sessão expirada?)').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        resultado.textContent = 'RESULTADO T4 ERRO | consulta pelo navegador | ' + msg + ' | usuario=' + usuario;
      }
    }, function (e) {
      resultado.textContent = 'RESULTADO T4 ERRO | consulta pelo navegador | ' + (e && e.message ? e.message : e) + ' | usuario=' + usuario;
    });
  }
})();
