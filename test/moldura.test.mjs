import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injetarMetaMoldura, opcaoMoldura } from '../lib/comandos/build.mjs';

test('--sem-moldura: valores aceitos', () => {
  assert.equal(opcaoMoldura(undefined), null);
  assert.equal(opcaoMoldura(true), 'esconder');
  assert.equal(opcaoMoldura('tudo'), 'esconder-tudo');
  assert.throws(() => opcaoMoldura('outro'));
});

test('meta da moldura entra logo depois de <head>', () => {
  const r = injetarMetaMoldura('<html><head lang="x"><title>t</title></head></html>', 'esconder');
  assert.match(r, /<head lang="x">\s*<meta name="sankhya-kit-moldura" content="esconder"><title>/);
  assert.throws(() => injetarMetaMoldura('<html><body></body></html>', 'esconder'));
});
