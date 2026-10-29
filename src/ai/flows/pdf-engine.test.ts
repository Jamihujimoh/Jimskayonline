import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMathJaxDocumentHtml } from './pdf-engine';

test('MathJax embeds inline, display, and chemistry expressions as SVGs', async () => {
  const html = await buildMathJaxDocumentHtml({
    filename: 'mathjax-check.pdf',
    title: 'MathJax Check',
    renderer: 'mathjax',
    content: [
      'Inline formula: $E=mc^2$.',
      '',
      '$$\\frac{a}{b}$$',
      '',
      '$$\\ce{2H2 + O2 -> 2H2O}$$',
    ].join('\n'),
  });

  const svgSources = [...html.matchAll(/src="data:image\/svg\+xml;base64,([^"]+)"/g)];
  assert.equal(svgSources.length, 3);
  assert.doesNotMatch(html, /@@PDFTEXMATH\d+@@/);

  for (const [, base64Svg] of svgSources) {
    const svg = Buffer.from(base64Svg, 'base64').toString('utf8');
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /<path\b/);
  }
});