// Czech no-break spaces after one-letter prepositions and conjunctions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeset } from '../lib/util.mjs';

const NB = ' ';
test('joins one-letter words to the next word in text', () => {
  assert.equal(typeset('<h1>Použité a repasované v Praze</h1>'), `<h1>Použité a${NB}repasované v${NB}Praze</h1>`);
  assert.equal(typeset('<p>a v domě</p>'), `<p>a${NB}v${NB}domě</p>`);
  assert.equal(typeset('<p>(s kartou)</p>'), `<p>(s${NB}kartou)</p>`);
});
test('leaves tags, attributes, scripts and form text alone', () => {
  const src = '<a title="a b" href="?a b">x</a><script>var s = "a b"</script><textarea>v klidu</textarea><title>a b</title>';
  assert.equal(typeset(src), src);
  assert.equal(typeset('<p>dva</p>'), '<p>dva</p>');
});
