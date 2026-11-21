import test from 'node:test';
import assert from 'node:assert/strict';
import { render, section, blurb, generateDocs } from '../../src/kits/docs-kit/index.js';

test('template engine', () => {
  assert.equal(render('{{a}}-{{#each l}}[{{.}}]{{/each}}{{#if z}}Z{{/if}}', { a: 1, l: [1, 2] }), '1-[1][2]');
  assert.equal(render('{{x}}|{{{x}}}', { x: '<b>' }, { html: true }), '&lt;b&gt;|<b>');
  assert.equal(render('{{#each r}}{{n}},{{/each}}', { r: [{ n: 'a' }, { n: 'b' }] }), 'a,b,');
});
test('report section extraction', () => {
  const md = '# R\n\n## What I built\nFirst para here.\n\nSecond.\n\n## Verification evidence\nok';
  assert.equal(section(md, 'what i built'), 'First para here.\n\nSecond.');
  assert.equal(blurb('a\n\nb'), 'a');
});
test('generateDocs produces all four files with screenshots and reports', () => {
  const d = generateDocs({ title: 'Demo <Game>', tagline: 'tag', description: 'desc', play_url: 'https://x/y', controls: [{ key: 'Space', action: 'Jump' }],
    features: ['one'], screenshots: [{ file: 's.png', caption: 'S' }], reports: [{ name: 'art', markdown: '## What I built\nPixels.' }], credits: ['me'] });
  assert.deepEqual(Object.keys(d), ['README.md', 'docs/HOW-TO-PLAY.md', 'docs/HOW-IT-WAS-MADE.md', 'docs/index.html']);
  assert.match(d['README.md'], /!\[S\]\(docs\/screenshots\/s\.png\)/);
  assert.match(d['docs/HOW-TO-PLAY.md'], /\| Space \| Jump \|/);
  assert.match(d['docs/HOW-IT-WAS-MADE.md'], /### art\n\nPixels\./);
  assert.match(d['docs/index.html'], /Demo &lt;Game&gt;/); assert.match(d['docs/index.html'], /src="screenshots\/s\.png"/);
  assert.doesNotMatch(d['README.md'], /{{/);
  assert.throws(() => generateDocs({}), /title/);
});
