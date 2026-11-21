import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
test('index.html references src/main.js', () => assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /src\/main\.js/));
