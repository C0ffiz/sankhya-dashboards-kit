import './style.css';
import { consultarSQL } from '../shared/dados.js';
import { lerParametros } from '../shared/parametros.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ambiente = $('ambiente');
if (import.meta.env.DEV) {
  ambiente.textContent = 'DEV · proxy local';
  ambiente.className += ' bg-amber-100 text-amber-800';
} else {
  ambiente.textContent = 'ERP · SankhyaJX';
  ambiente.className += ' bg-emerald-100 text-emerald-800';
}

const params = lerParametros();
$('parametros').innerHTML = Object.entries(params)
  .map(([k, v]) => `<span class="rounded bg-white px-2 py-1 ring-1 ring-slate-200"><b>${esc(k)}</b> = ${esc(v ?? '—')}</span>`)
  .join('');

async function carregar() {
  $('status').textContent = 'Carregando…';
  $('erro').classList.add('hidden');
  const inicio = performance.now();
  try {
    const linhas = await consultarSQL('SELECT CODEMP, NOMEFANTASIA FROM TSIEMP ORDER BY CODEMP');
    $('linhas').innerHTML = linhas
      .map((l) => `<tr class="hover:bg-slate-50"><td class="px-4 py-2 tabular-nums">${esc(l.CODEMP)}</td><td class="px-4 py-2">${esc(l.NOMEFANTASIA)}</td></tr>`)
      .join('');
    $('status').textContent = `${linhas.length} empresa(s) · ${Math.round(performance.now() - inicio)} ms`;
  } catch (e) {
    $('linhas').innerHTML = '';
    $('status').textContent = 'Erro';
    $('erro').textContent = e.message;
    $('erro').classList.remove('hidden');
    console.error(e, e.sql);
  }
}

$('recarregar').addEventListener('click', carregar);
carregar();
