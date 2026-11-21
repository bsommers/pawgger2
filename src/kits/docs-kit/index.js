// docs-kit: tiny template engine + generators for README, HOW-TO-PLAY, HOW-IT-WAS-MADE and a GitHub Pages showcase.
// Pure (no fs): generateDocs(config) -> { 'README.md': text, ... }. cli.mjs does the file reading/writing.
//
// config = { title, tagline, description, repo?, play_url?, goal?, controls: [{ key, action }], features: [str],
//            tips: [str], screenshots: [{ file, caption }], reports: [{ name, markdown }], credits: [str], license? }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Mustache-lite: {{x}} (escaped when opts.html), {{{x}}} raw, {{#each list}}...{{/each}} with {{.}} / {{field}}, {{#if x}}...{{/if}}. */
export function render(tpl, data, opts = {}) {
  const get = (o, k) => (k === '.' ? o['.'] : k.split('.').reduce((a, p) => (a == null ? a : a[p]), o));
  const block = (src, ctx) => src
    .replace(/{{#each ([\w.]+)}}([\s\S]*?){{\/each}}/g, (_, k, body) => { const l = get(ctx, k); return Array.isArray(l) ? l.map((it) => block(body, typeof it === 'object' ? { ...ctx, ...it } : { ...ctx, '.': it })).join('') : ''; })
    .replace(/{{#if ([\w.]+)}}([\s\S]*?){{\/if}}/g, (_, k, body) => { const v = get(ctx, k); return v && !(Array.isArray(v) && !v.length) ? block(body, ctx) : ''; })
    .replace(/{{{([\w.]+)}}}/g, (_, k) => String(get(ctx, k) ?? ''))
    .replace(/{{([\w.]+)}}/g, (_, k) => { const v = get(ctx, k); return v == null ? '' : opts.html ? esc(v) : String(v); });
  return block(tpl, data);
}

/** Pull `## Heading` section text out of a markdown report (case-insensitive prefix match on the heading). */
export function section(md, heading) {
  const lines = md.split('\n'), want = heading.toLowerCase(); let on = false; const out = [];
  for (const l of lines) {
    const m = /^#{1,3}\s+\**(.*?)\**\s*$/.exec(l);
    if (m) { if (on) break; on = m[1].toLowerCase().replace(/\*/g, '').startsWith(want); continue; }
    if (on) out.push(l);
  }
  return out.join('\n').trim();
}
/** First paragraph of a text, truncated to n chars. */
export const blurb = (t, n = 280) => { const p = (t || '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim(); return p.length > n ? p.slice(0, n - 1) + '…' : p; };

export const TEMPLATES = {
  readme: `# {{title}}

> {{tagline}}

{{description}}
{{#if screenshots}}
{{#each screenshots}}![{{caption}}]({{file}})
{{/each}}{{/if}}
## Play

{{#if play_url}}Play it in your browser: {{play_url}}

{{/if}}Run locally: \`npm start\` and open http://localhost:4781. Full controls are in [docs/HOW-TO-PLAY.md](docs/HOW-TO-PLAY.md).
{{#if features}}
## Features

{{#each features}}- {{.}}
{{/each}}{{/if}}
## Develop

\`npm test\` runs the node test suite. [docs/HOW-IT-WAS-MADE.md](docs/HOW-IT-WAS-MADE.md) tells how the game was built.
{{#if license}}
## License

{{license}}
{{/if}}`,
  howToPlay: `# How to play {{title}}

{{#if goal}}**Goal:** {{goal}}

{{/if}}## Controls

| Input | Action |
| --- | --- |
{{#each controls}}| {{key}} | {{action}} |
{{/each}}{{#if tips}}
## Tips

{{#each tips}}- {{.}}
{{/each}}{{/if}}`,
  madeWith: `# How {{title}} was made

{{description}}

{{#if reports}}## The build, module by module

{{#each reports}}### {{name}}

{{summary}}

{{/each}}{{/if}}{{#if credits}}## Credits

{{#each credits}}- {{.}}
{{/each}}{{/if}}`,
  site: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{title}}</title><meta name="description" content="{{tagline}}">
<style>
:root{--bg:#10160f;--fg:#f4ecd8;--accent:#f08a2c;--card:#1b2a1b}
@media (prefers-color-scheme: light){:root{--bg:#f6f0e0;--fg:#1d2a1b;--card:#fff}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:56rem;margin:0 auto;padding:0 16px 4rem}
header{padding:3rem 0 1rem}h1{font-size:clamp(2rem,6vw,3.5rem);margin:0;color:var(--accent)}
.tag{font-size:1.2rem;opacity:.85}.btn{display:inline-block;background:var(--accent);color:#1a1420;padding:.6rem 1.2rem;border-radius:.5rem;font-weight:700;text-decoration:none;margin:.5rem .5rem 0 0}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}
figure{margin:0;background:var(--card);border-radius:.5rem;overflow:hidden}figure img{width:100%;display:block;image-rendering:pixelated}figcaption{padding:.5rem .75rem;font-size:.9rem}
table{border-collapse:collapse}td,th{border-bottom:1px solid #8884;padding:.3rem .8rem;text-align:left}
.card{background:var(--card);border-radius:.5rem;padding:.75rem 1rem;margin:.75rem 0}
</style></head><body><main>
<header><h1>{{title}}</h1><p class="tag">{{tagline}}</p>
{{#if play_url}}<a class="btn" href="{{play_url}}">Play now</a>{{/if}}{{#if repo}}<a class="btn" href="{{repo}}">Source</a>{{/if}}</header>
<p>{{description}}</p>
{{#if screenshots}}<h2>Screenshots</h2><div class="shots">{{#each screenshots}}<figure><img src="{{file}}" alt="{{caption}}" loading="lazy"><figcaption>{{caption}}</figcaption></figure>{{/each}}</div>{{/if}}
{{#if features}}<h2>Features</h2><ul>{{#each features}}<li>{{.}}</li>{{/each}}</ul>{{/if}}
<h2>Controls</h2><table>{{#each controls}}<tr><th>{{key}}</th><td>{{action}}</td></tr>{{/each}}</table>
{{#if reports}}<h2>How it was made</h2>{{#each reports}}<div class="card"><strong>{{name}}</strong><br>{{summary}}</div>{{/each}}{{/if}}
{{#if credits}}<h2>Credits</h2><ul>{{#each credits}}<li>{{.}}</li>{{/each}}</ul>{{/if}}
</main></body></html>
`,
};

/** Generate the doc set. Returns { path: text }. Report summaries come from each report's "What I built" section. */
export function generateDocs(config) {
  const c = { controls: [], features: [], tips: [], screenshots: [], reports: [], credits: [], ...config };
  if (!c.title) throw new Error('docs-kit: config.title is required');
  c.reports = c.reports.map((r) => ({ name: r.name, summary: blurb(section(r.markdown || '', 'what i built') || r.markdown || '') }));
  const shots = (prefix) => c.screenshots.map((s) => ({ ...s, file: prefix + s.file }));
  return {
    'README.md': render(TEMPLATES.readme, { ...c, screenshots: shots('docs/screenshots/') }),
    'docs/HOW-TO-PLAY.md': render(TEMPLATES.howToPlay, c),
    'docs/HOW-IT-WAS-MADE.md': render(TEMPLATES.madeWith, c),
    'docs/index.html': render(TEMPLATES.site, { ...c, screenshots: shots('screenshots/') }, { html: true }),
  };
}
