import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { z } from 'zod';
import { runPcControl } from '@/ai/lib/pc-control-core';

/**
 * RESTRICTION: This module is intentionally the *pure rendering core* of the PDF
 * engine. It has NO dependency on `@/ai/genkit` or any AI provider so that it can
 * be unit-tested / invoked in isolation (headless rendering + screenshot) without
 * triggering network / quota side effects. The Genkit tool wrapper lives in
 * `pdf-generator-flow.ts` and re-exports whatever it needs from here.
 *
 * PDF generation engine v3 — publication-grade, print-ready.
 *
 * What changed vs v2:
 *  - Redesigned header (eyebrow marker, tighter display title, gradient divider,
 *    and a *balanced* metadata card grid whose column count adapts to the number
 *    of fields so a lone trailing field never leaves a huge empty gap).
 *  - Crisper typography tokens (slate scale), better contrast + letter spacing.
 *  - Refined section / subtopic bars, math blocks, key-value grids, and tables.
 *  - Robust content inference: clusters of bare "fact" lines (no list markers, no
 *    blank lines) are rendered as a styled fact list instead of one run-on
 *    paragraph — this is what made loose AI output like chlorin.pdf unreadable.
 *  - Handles `[File: …]` captions, `---` rules, and `> ` blockquotes.
 *  - Print-ready hardening: table header repeat on page breaks, break-inside
 *    guards, full-colour printing, widows/orphans control.
 */

const PdfInputSchema = z.object({
  filename: z.string(),
  title: z.string(),
  renderer: z.enum(['auto', 'html', 'mathjax', 'hybrid', 'xelatex']).default('auto').describe("Renderer selection: 'auto' keeps HTML styling and uses MiKTeX math when available or portable MathJax SVG otherwise; 'html' forces HTML/KaTeX; 'mathjax' forces portable MathJax SVG math; 'hybrid' forces HTML styling with MiKTeX math; 'xelatex' forces full MiKTeX typesetting."),
  // Accepts standard text, Markdown, LaTeX math/chemistry ($...$ / $$...$$), and HTML tables
  content: z.string(),
  // Optional dynamic styling parameters for AI customization
  accentColor: z
    .string()
    .optional()
    .describe('Hex color for main accents and section bars (e.g. #0f766e)'),
  css: z.string().optional().describe('Custom CSS rules to override default document styling'),
  // Optional header metadata used to build the structured key-value metadata block
  subtitle: z.string().optional().describe('Short subtitle/description shown under the title'),
  kicker: z.string().optional().describe('Small eyebrow/eyebrow label above the title (e.g. "CHEMISTRY MASTERCLASS")'),
  subject: z.string().optional().describe('Subject/topic for the metadata grid (e.g. "Chemistry")'),
  documentType: z.string().optional().describe('Document type for the metadata grid (e.g. "Study Notes")'),
  author: z.string().optional().describe('Author/prepared-by for the metadata grid'),
  date: z.string().optional().describe('Display date for the metadata grid (falls back to today)'),
  version: z.string().optional().describe('Version label for the metadata grid (e.g. "v1.0")'),
});

type PdfInput = z.infer<typeof PdfInputSchema>;
const execFileAsync = promisify(execFile);
type MathJaxResult = { svg?: string; errors?: string[] };
type MathJaxNodeApi = {
  config(options: object): void;
  start(): void;
  typeset(options: {
    math: string;
    format: 'TeX';
    svg: true;
    ex: number;
    em: number;
    display: boolean;
    timeout: number;
  }): Promise<MathJaxResult>;
};
const mathjax = require('mathjax-node') as MathJaxNodeApi;
let mathJaxStarted = false;

function startMathJax() {
  if (mathJaxStarted) return;
  mathjax.config({ MathJax: { TeX: { extensions: ['AMSmath.js', 'AMSsymbols.js', 'mhchem.js'] } } });
  mathjax.start();
  mathJaxStarted = true;
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Lighten (positive) or darken (negative) a hex color by a percentage. */
function shadeColor(hex: string, percent: number): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function todayDisplay(): string {
  try {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/* ------------------------------------------------------------------ */
/* Content preprocessing (Markdown + LaTeX + HTML tables -> HTML)      */
/* ------------------------------------------------------------------ */

/**
 * Rewrites KaTeX stretchy reaction arrows into a fixed-width equivalent.
 *
 * In this KaTeX build `\xrightarrow{...}` renders an *extensible* arrow that can
 * measure to thousands of pixels wide (measured ~7.8k px for a 9-char label),
 * even when it is the only content in the display. The resulting overflow is
 * clipped by `.math-block { overflow: hidden }`, collapsing the whole equation
 * into an unreadable sliver that no font-size shrink can rescue. Replacing it
 * with `\overset{label}{\longrightarrow}` yields a normal-width arrow with the
 * same label centred above it, and the equation drops to a width that fits.
 */
function rewriteLatexArrows(tex: string): string {
  if (!tex.includes('\\xrightarrow')) return tex;
  let out = '';
  let i = 0;
  while (i < tex.length) {
    const idx = tex.indexOf('\\xrightarrow', i);
    if (idx === -1) {
      out += tex.slice(i);
      break;
    }
    out += tex.slice(i, idx);
    let j = idx + '\\xrightarrow'.length;
    while (j < tex.length && /\s/.test(tex[j])) j++;
    if (tex[j] === '{') {
      // Extract the balanced-brace label so nested `\text{...}` works.
      let depth = 0;
      let k = j;
      while (k < tex.length) {
        if (tex[k] === '\\' && (tex[k + 1] === '{' || tex[k + 1] === '}')) {
          k += 2;
          continue;
        }
        if (tex[k] === '{') depth++;
        else if (tex[k] === '}') {
          depth--;
          if (depth === 0) break;
        }
        k++;
      }
      const label = tex.slice(j + 1, k);
      out += `\\overset{${label}}{\\longrightarrow}`;
      i = k + 1;
    } else {
      out += '\\longrightarrow';
      i = j;
    }
  }
  return out;
}

const UNICODE_SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
  '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-',
  '⁽': '(', '⁾': ')', 'ⁿ': 'n',
};

const UNICODE_SUBSCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5',
  '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-',
  '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i',
  'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o',
  'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v',
  'ₓ': 'x',
};

function replaceUnicodeScript(value: string, map: Record<string, string>, marker: '^' | '_'): string {
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/g, (run) => {
    const mapped = [...run].map((char) => map[char]).join('');
    return `${marker}{${mapped}}`;
  });
}

/** Normalizes notation commonly emitted by models before KaTeX parses it. */
function normalizeMathTex(tex: string): string {
  let normalized = tex
    .replace(/\\\s+([A-Za-z]+)/g, '\\$1')
    .replace(/[−–]/g, '-')
    .replace(/×/g, '\\times ')
    .replace(/·/g, '\\cdot ')
    .replace(/÷/g, '\\div ')
    .replace(/≤/g, '\\leq ')
    .replace(/≥/g, '\\geq ')
    .replace(/≠/g, '\\neq ')
    .replace(/±/g, '\\pm ')
    .replace(/∞/g, '\\infty ')
    .replace(/→/g, '\\to ')
    .replace(/←/g, '\\leftarrow ')
    .replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(/√\s*([A-Za-z0-9])/g, '\\sqrt{$1}')
    .replace(/\\?sqrt\s*\(([^()]*)\)/gi, '\\sqrt{$1}')
    .replace(/\\?sqrt\s+([A-Za-z0-9])/gi, '\\sqrt{$1}');

  normalized = replaceUnicodeScript(normalized, UNICODE_SUPERSCRIPTS, '^');
  normalized = replaceUnicodeScript(normalized, UNICODE_SUBSCRIPTS, '_');

  // Only convert numeric fractions automatically. Variables, units, dates, and
  // compound expressions should remain unchanged unless the model emits \frac.
  normalized = normalized.replace(
    /(?<![\\\w])((?:\d+(?:\.\d+)?))\s*\/\s*((?:\d+(?:\.\d+)?))(?![\w])/g,
    '\\frac{$1}{$2}'
  );
  return normalized;
}

function wrapMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(normalizeMathTex(rewriteLatexArrows(tex)).trim(), { displayMode, throwOnError: false });
  } catch {
    return `<span class="math-error">${escapeHtml(tex)}</span>`;
  }
}

function looksLikeStandaloneMath(line: string): boolean {
  const value = line.trim();
  if (!value || /<[^>]+>/.test(value) || value.length > 180) return false;
  // Markdown structure (blockquotes, lists, tables, headings, captions) is
  // never an equation — its leading marker must not be read as an operator.
  if (/^(?:>|\||#|[-*+]\s|\d+[.)]\s|\[)/.test(value)) return false;
  // An explicit LaTeX command is a confident signal.
  if (/\\[a-zA-Z]{2,}/.test(value)) return true;
  // Otherwise require a real operator AND a digit, and reject anything that
  // reads like an English sentence (three or more real words).
  const hasOperator = /[=<>^_]|[√∫∑≤≥≠±÷×→←]/.test(value);
  if (!hasOperator || !/\d/.test(value)) return false;
  const words = value.match(/[A-Za-z]{2,}/g) || [];
  return words.length <= 2;
}

/**
 * Converts a single block of GitHub-flavoured Markdown pipe-table lines into a
 * `<table>`. Cells already carry inline math/bold HTML from earlier passes.
 * Returns `null` when the block is not actually a table (so callers can fall
 * back to prose/list handling). An aligned head row plus a separator row is
 * required to distinguish a real table from a stray pipe-separated paragraph.
 */
/** Normalised blockquote labels -> branded callout variant, and their display text. */
const CALL_LABELS: Record<string, string> = {
  'exam trap': 'trap',
  'trap': 'trap',
  'exam tip': 'tip',
  'note': 'note',
  'important': 'note',
  'remember': 'key',
  'remember this': 'key',
  'key point': 'key',
  'key': 'key',
  'tip': 'tip',
  'hint': 'tip',
  'warning': 'warning',
  'caution': 'warning',
  'danger': 'warning',
  'exam trick': 'trick',
  'trick': 'trick',
};

const CALL_LABEL_TEXT: Record<string, string> = {
  trap: 'EXAM TRAP',
  note: 'NOTE',
  tip: 'TIP',
  warning: 'WARNING',
  key: 'KEY POINT',
  trick: 'TRICK',
};

function parseMarkdownTable(block: string): string | null {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  // Every line must be a full pipe row: starts and ends with `|`.
  if (!lines.every((l) => l.startsWith('|') && l.endsWith('|'))) return null;
  const cells = (l: string) =>
    l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const rows = lines.map(cells);
  // Second row must be a dashes/colons alignment separator.
  const isSep = (c: string) => /^:?-{2,}:?$/.test(c);
  if (!rows[1] || !rows[1].every(isSep)) return null;
  const align = rows[1].map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'center'
    : c.startsWith(':') ? 'left'
    : c.endsWith(':') ? 'right'
    : 'left'
  );
  const th = (c: string, i: number) =>
    `<th${align[i] !== 'left' ? ` style="text-align:${align[i]}"` : ''}>${c}</th>`;
  const td = (c: string, i: number) =>
    `<td${align[i] !== 'left' ? ` style="text-align:${align[i]}"` : ''}>${c}</td>`;
  let html = `<table><thead><tr>${rows[0].map(th).join('')}</tr></thead><tbody>`;
  for (const row of rows.slice(2)) {
    html += `<tr>${row.map(td).join('')}</tr>`;
  }
  html += '</tbody></table>';
  return html;
}

/** True when a block of bare text reads as a list of discrete fact lines. */
function looksLikeFactCluster(lines: string[]): boolean {
  if (lines.length < 3) return false;
  // Never treat a block that still contains HTML tags as a fact list.
  if (lines.some((l) => l.includes('<'))) return false;
  // Allow reasonably short lines only (a long wrapped sentence is prose, not a list).
  if (lines.some((l) => l.length > 140)) return false;
  // At least 60% of the lines must NOT end in sentence punctuation.
  const sentenceEnded = lines.filter((l) => /[.!?]\s*$/.test(l)).length;
  return sentenceEnded <= lines.length * 0.4;
}

function looksLikeKeyValueCluster(lines: string[]): Array<{ label: string; value: string }> | null {
  if (lines.length < 2) return null;
  if (lines.some((l) => l.includes('<'))) return null;
  const matches = lines
    .map((line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9()\-/ &]+?)\s*:\s*(.+)$/);
      if (!match) return null;
      const label = match[1].trim();
      const value = match[2].trim();
      if (!label || !value || value.length > 180) return null;
      return { label, value };
    })
    .filter((entry): entry is { label: string; value: string } => Boolean(entry));

  if (matches.length < 2 || matches.length !== lines.length) return null;
  return matches;
}

/**
 * Chooses the number of columns for a key-value grid so the row layout is
 * balanced. Prefers a column count that divides the item count exactly (no
 * ragged final row); otherwise falls back to a count that leaves a single-item
 * tail, which callers widen to fill the full row via `.kv-wide`.
 */
function kvColumns(n: number): number {
  if (n <= 1) return 1;
  for (const c of [2, 3, 4]) {
    if (n % c === 0) return c;
  }
  for (const c of [3, 2, 4]) {
    if (n % c === 1) return c;
  }
  return n > 4 ? 3 : Math.max(1, n);
}

/**
 * Builds the publication-grade contents block. Scans the processed content for
 * `<h2>` / `<h3>` headings, assigns anchor ids, and emits a structured
 * table-of-contents nav plus the same html with ids backfilled (so the anchors
 * resolve on the rendered page). Returns `''` when there are too few sections
 * to justify a contents block — short docs stay minimal.
 */
function buildTableOfContents(html: string): {
  tocHtml: string;
  html: string;
} {
  const headingRe = /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const entries: Array<{ level: number; text: string; id: string }> = [];
  let counter = 0;

  const htmlWithIds = html.replace(headingRe, (m, level: string, attrs: string, inner: string) => {
    const text = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    const id = `sec-${++counter}`;
    entries.push({ level: Number(level), text, id });
    const idAttr = /id="/.test(attrs || '') ? '' : ` id="${id}"`;
    return `<h${level}${idAttr}${attrs}>${inner}</h${level}>`;
  });

  const topLevel = entries.filter((e) => e.level === 2).length;
  if (topLevel < 3 || entries.length < 3) {
    return { tocHtml: '', html: htmlWithIds };
  }

  const items = entries
    .map((e) => {
      const cls = e.level === 3 ? 'toc-sub' : 'toc-main';
      return `<li class="${cls}"><a href="#${e.id}">${escapeHtml(e.text)}</a></li>`;
    })
    .join('');

  const tocHtml = `<nav class="toc">
    <div class="toc-title"><span>Contents</span></div>
    <ol class="toc-list">${items}</ol>
  </nav>`;

  return { tocHtml, html: htmlWithIds };
}

/**
 * Converts LaTeX math/chemistry, Markdown syntax, bullet & numbered lists,
 * Markdown/HTML tables, caption tokens, blockquotes, and rules into structured
 * HTML. A contiguous run of bullet items formatted as `**Key:** value` is
 * auto-upgraded into a multi-column key-value grid. Clusters of bare fact lines
 * (no list markers) are auto-upgraded into a styled fact list.
 */
function processMathAndChem(content: string, renderMath = wrapMath): string {
  // 0) Normalize line endings so all line-based regexes behave consistently.
  let processed = content.replace(/\r\n/g, '\n');
  const mathTokens: string[] = [];
  const saveMath = (tex: string, displayMode: boolean): string => {
    // Block and inline math get distinguishable tokens so the block pass can
    // seat display equations on their own line (never inside a <p> element).
    const token = `${displayMode ? '@@PDFBLOCKMATH' : '@@PDFINLINEMATH'}${mathTokens.length}@@`;
    mathTokens.push(displayMode
      ? `<div class="math-block">${renderMath(tex, true)}</div>`
      : renderMath(tex, false));
    return token;
  };

  // 1) Block math/chem: $$ ... $$  (can span multiple lines)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    return saveMath(tex, true);
  });

  // 2) Inline math/chem: $ ... $  (single line only)
  processed = processed.replace(/\$(?!\$)([^\n$]*?)\$/g, (_, tex) => {
    return saveMath(tex, false);
  });

  // Models sometimes omit dollar delimiters for a line that is visibly an
  // equation. Promote only short, equation-like lines so ordinary prose and
  // units such as "m/s" are not unexpectedly typeset as display math.
  processed = processed.replace(/^(?!\s*<)[^\n]+$/gm, (line) => {
    const value = line.trim();
    if (value.includes('$') || !looksLikeStandaloneMath(value)) return line;
    // Never lift Markdown structure into a display equation.
    if (/^(?:>|\||#|[-*+]\s|\d+[.)]\s|\[)/.test(value)) return line;
    if (/[.!?]\s*$/.test(value) && !/[=^_]/.test(value)) return line;
    return saveMath(value, true);
  });

  // 3) Markdown headings (h1..h6)
  processed = processed
    .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
    .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 4) Source captions: "[File: foo.jpg]" / "[Image: ...]" -> small caption line.
  processed = processed.replace(
    /^\[\s*(?:file|image|source|page)\s*[:]\s*(.*?)\s*\]\s*$/gim,
    '<p class="figcap">$1</p>'
  );

  // 5) Bold text
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 6) Horizontal rule
  processed = processed.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr/>');

  // 7) Bullet / numbered markers -> list item tokens (kept distinct until grouping).
  processed = processed.replace(/^[\*\-] (.*$)/gim, '<li data-k="b">$1</li>');
  processed = processed.replace(/^(\d+)\.\s+(.*$)/gim, '<li data-k="n">$2</li>');

  // 8) Group consecutive same-type items into <ol> / <ul>. Keeping the marker
  //    kind on the token prevents a bullet run from absorbing an ordered list.
  processed = processed.replace(
    /(?:<li data-k="n">[\s\S]*?<\/li>\s*)+/g,
    (m) => `<ol>${m.replace(/ data-k="n"/g, '')}</ol>`
  );
  processed = processed.replace(
    /(?:<li data-k="b">[\s\S]*?<\/li>\s*)+/g,
    (m) => `<ul>${m.replace(/ data-k="b"/g, '')}</ul>`
  );

  // 9) Upgrade fully-labelled bullet blocks ("**Key:** value") -> multi-column kv grid.
  processed = processed.replace(
    /(<ul[^>]*>)([\s\S]*?)(<\/ul>)/g,
    (full: string, _open: string, inner: string, _close: string) => {
      const lis = inner.match(/<li>[\s\S]*?<\/li>/g);
      if (!lis || lis.length < 2) return full;
      const items = lis
        .map((li) => {
          const m = li.match(/<li><strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/);
          if (!m) return null;
          const label = m[1].trim().replace(/:$/, '').trim();
          const value = m[2].trim();
          if (!label || !value) return null;
          return { label, value };
        })
        .filter((x): x is { label: string; value: string } => x !== null);
      if (items.length === 0 || items.length < 2) return full;
      const cols = kvColumns(items.length);
      const orphan = items.length > cols && items.length % cols === 1;
      const rendered = items
        .map((it, i) => {
          const cls = orphan && i === items.length - 1 ? 'kv-item kv-wide' : 'kv-item';
          return `<div class="${cls}"><div class="kv-label">${it.label}</div><div class="kv-value">${it.value}</div></div>`;
        })
        .join('');
      return `<div class="kv-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));">${rendered}</div>`;
    }
  );

  // 10) Blockquotes: "> text" runs. When the first line opens with a bolded
  //     (or plain-text) callout label — "**Exam Trap:** ...", "> Note: ..." — the
  //     quote is branded as a coloured callout card; otherwise it stays a plain
  //     blockquote. (Runs after list grouping so blockquote body text is never
  //     mistaken for list markers.)
  processed = processed.replace(/(?:^>[^\n]*\n?)+/gm, (m) => {
    const lines = m
      .split('\n')
      .map((l) => l.replace(/^>\s?/, '').trim())
      .filter((l) => l);
    if (!lines.length) return '';
    const first = lines[0];
    let callVariant: string | undefined;
    let restText = '';
    const strongMatch = first.match(/^<strong>([\s\S]*?)<\/strong>\s*:?\s*(.*)$/);
    if (strongMatch) {
      const v = CALL_LABELS[
        strongMatch[1].trim().toLowerCase().replace(/\s+/g, ' ').replace(/:$/, '')
      ];
      if (v) {
        callVariant = v;
        restText = strongMatch[2].trim();
      }
    } else {
      const plainMatch = first.match(
        /^(exam\s+trap|exam\s+tip|note|important|remember\s+this|remember|key\s+point|key|tip|hint|warning|caution|danger|trap|exam\s+trick|trick)\s*:\s*(.*)$/i
      );
      if (plainMatch) {
        const v = CALL_LABELS[plainMatch[1].toLowerCase().replace(/\s+/g, ' ')];
        if (v) {
          callVariant = v;
          restText = plainMatch[2].trim();
        }
      }
    }
    if (callVariant) {
      const body = [restText, ...lines.slice(1)]
        .filter(Boolean)
        .map((l) => `<p>${l}</p>`)
        .join('');
      return `<div class="callout callout-${callVariant}"><span class="callout-label">${CALL_LABEL_TEXT[callVariant]}</span>${body}</div>`;
    }
    return `<blockquote>${lines.map((l) => `<p>${l}</p>`).join('')}</blockquote>`;
  });

  // 11) Seat every display equation on its own block so it is never wrapped in
  //     a <p> (block content inside a paragraph is invalid HTML; Chrome then
  //     closes the paragraph early and leaves stray empty boxes on the page).
  processed = processed.replace(/[^\n]*@@PDFBLOCKMATH\d+@@[^\n]*/g, (m) => `\n\n${m.trim()}\n\n`);
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // 12) Recognize workflow blocks like [Target IP Resolution] (TCP Handshakes)
  //     and render them as a premium step grid instead of plain paragraphs.
  processed = processed
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<table') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<p') ||
        trimmed.startsWith('@@PDFBLOCKMATH')
      ) {
        return trimmed;
      }
      const tableHtml = parseMarkdownTable(trimmed);
      if (tableHtml) return tableHtml;
      const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
      const workflowMatches = lines
        .map((line) => line.match(/^\[([^\]]+)\](?:\s*\(([^)]+)\))?$/))
        .filter((value): value is RegExpMatchArray => Boolean(value));
      if (lines.length > 0 && workflowMatches.length === lines.length) {
        const items = workflowMatches.map((match, index) => {
          const title = match[1].trim();
          const detail = match[2]?.trim() || '';
          return `<div class="workflow-step"><div class="workflow-num">${index + 1}</div><div class="workflow-copy"><div class="workflow-title">${title}</div>${detail ? `<div class="workflow-detail">${detail}</div>` : ''}</div></div>`;
        }).join('');
        return `<div class="workflow-grid">${items}</div>`;
      }
      const kvCluster = looksLikeKeyValueCluster(lines);
      if (kvCluster && kvCluster.length >= 2) {
        const cols = kvColumns(kvCluster.length);
        const rendered = kvCluster
          .map((entry, index) => {
            const isWide = kvCluster.length > cols && index === kvCluster.length - 1 && kvCluster.length % cols === 1;
            return `<div class="${isWide ? 'kv-item kv-wide' : 'kv-item'}"><div class="kv-label">${entry.label}</div><div class="kv-value">${entry.value}</div></div>`;
          })
          .join('');
        return `<div class="kv-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));">${rendered}</div>`;
      }
      if (looksLikeFactCluster(lines)) {
        return `<ul class="fact-list">${lines
          .map((l) => {
            const isLabel = /:\s*$/.test(l) && !/\d/.test(l.slice(-8));
            return isLabel ? `<li class="fact-label">${l}</li>` : `<li>${l}</li>`;
          })
          .join('')}</ul>`;
      }
      return `<p>${trimmed.replace(/\n/g, ' ')}</p>`;
    })
    .join('\n');

  // Restore rendered math only after Markdown and structural transforms have
  // finished, so operators and LaTeX markup cannot be mistaken for Markdown.
  return processed.replace(/@@PDF(?:BLOCK|INLINE)MATH(\d+)@@/g, (_, index) => mathTokens[Number(index)] ?? '');
}

/**
 * Removes a leading `<h1>` that merely duplicates the document title (the model
 * often echoes the title as the first content line, producing a doubled header).
 */
function stripDuplicateTitle(html: string, title: string): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const t = norm(title);
  if (!t) return html;
  return html.replace(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    (match, inner) => {
      const innerText = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      return innerText === t || (t.length > 6 && innerText.includes(t)) ? '' : match;
    }
  );
}

/* ------------------------------------------------------------------ */
/* HTML template builder (print-ready, publication-grade)             */
/* ------------------------------------------------------------------ */

const KATEX_CSS = (() => {
  const cssPath = path.join(process.cwd(), 'node_modules', 'katex', 'dist', 'katex.min.css');
  const cssDir = path.dirname(cssPath);
  const rawCss = fs.readFileSync(cssPath, 'utf8');

  return rawCss.replace(/url\((?:['"])?fonts\/([^'"\)]+)(?:['"])?\)/g, (_match, fontName: string) => {
    const fontPath = path.join(cssDir, 'fonts', fontName);
    const extension = path.extname(fontPath).toLowerCase();
    const mimeType = extension === '.woff2'
      ? 'font/woff2'
      : extension === '.woff'
        ? 'font/woff'
        : extension === '.ttf'
          ? 'font/ttf'
          : 'font/woff2';

    const fontData = fs.readFileSync(fontPath);
    return `url(data:${mimeType};base64,${fontData.toString('base64')})`;
  });
})();

function escapeTex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}$&#%_])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function inlineMarkdownToTex(value: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  const inlinePattern = /@@TEXMATH\d+@@|\*\*(.+?)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)/g;
  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    parts.push(escapeTex(value.slice(lastIndex, index)));
    if (match[0].startsWith('@@TEXMATH')) {
      parts.push(match[0]);
    } else if (match[1] !== undefined) {
      parts.push(`\\textbf{${escapeTex(match[1])}}`);
    } else {
      parts.push(`\\textit{${escapeTex(match[2])}}`);
    }
    lastIndex = index + match[0].length;
  }
  parts.push(escapeTex(value.slice(lastIndex)));
  return parts.join('');
}

function markdownTableToTex(lines: string[]): string | null {
  const rows = lines.map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  if (rows.length < 2 || rows.some((row) => row.length === 0)) return null;
  if (!rows[1].every((cell) => /^:?-{2,}:?$/.test(cell))) return null;
  const columnCount = rows[0].length;
  if (columnCount < 2 || rows.some((row) => row.length !== columnCount)) return null;

  const columns = `|${'Y|'.repeat(columnCount)}`;
  const header = rows[0].map((cell) => `\\textcolor{white}{\\textbf{${inlineMarkdownToTex(cell)}}}`).join(' & ');
  const body = rows.slice(2).map((row, index) => `${index % 2 === 1 ? '\\rowcolor{soft}' : ''}${row.map(inlineMarkdownToTex).join(' & ')} \\\\`).join('\n');
  return [
    '\\begin{center}',
    '{\\small',
    `\\setlength{\\tabcolsep}{6pt}\\renewcommand{\\arraystretch}{1.35}\\begin{tabularx}{\\linewidth}{${columns}}`,
    '\\rowcolor{accent}',
    '\\hline',
    `${header} \\\\`,
    '\\hline',
    body,
    '\\hline',
    '\\end{tabularx}',
    '}',
    '\\end{center}',
  ].filter(Boolean).join('\n');
}

function htmlTableToTex(tableHtml: string): string | null {
  const rowMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows = rowMatches.map((rowMatch) => [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
    .map((cellMatch) => cellMatch[1]
      .replace(/<strong\b[^>]*>/gi, '**')
      .replace(/<\/strong>/gi, '**')
      .replace(/<em\b[^>]*>/gi, '*')
      .replace(/<\/em>/gi, '*')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim()));
  if (rows.length < 2 || rows.some((row) => row.length === 0)) return null;
  const columnCount = rows[0].length;
  if (columnCount < 2 || rows.some((row) => row.length !== columnCount)) return null;

  const columns = `|${'Y|'.repeat(columnCount)}`;
  const header = rows[0].map((cell) => `\\textcolor{white}{\\textbf{${inlineMarkdownToTex(cell)}}}`).join(' & ');
  const body = rows.slice(1).map((row, index) => `${index % 2 === 1 ? '\\rowcolor{soft}' : ''}${row.map(inlineMarkdownToTex).join(' & ')} \\\\`).join('\n');
  return [
    '\\begin{center}',
    '{\\small',
    `\\setlength{\\tabcolsep}{6pt}\\renewcommand{\\arraystretch}{1.35}\\begin{tabularx}{\\linewidth}{${columns}}`,
    '\\rowcolor{accent}',
    '\\hline',
    `${header} \\\\`,
    '\\hline',
    body,
    '\\hline',
    '\\end{tabularx}',
    '}',
    '\\end{center}',
  ].join('\n');
}

function markdownToTex(content: string): string {
  const math: string[] = [];
  const tables: string[] = [];
  let source = content.replace(/\r\n/g, '\n');
  source = source.replace(/\$\$([\s\S]*?)\$\$/g, (_, value) => {
    const token = `@@TEXMATH${math.length}@@`;
    math.push(`\\begin{tcolorbox}[mathband]\n\\[\n${value.trim()}\n\\]\n\\end{tcolorbox}`);
    return token;
  });
  source = source.replace(/\$(?!\$)([^\n$]*?)\$/g, (_, value) => {
    const token = `@@TEXMATH${math.length}@@`;
    math.push(`\\(${value.trim()}\\)`);
    return token;
  });
  source = source.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
    const table = htmlTableToTex(tableHtml);
    if (!table) return tableHtml;
    const token = `@@TEXTABLE${tables.length}@@`;
    tables.push(table);
    return token;
  }).replace(/<[^>]+>/g, '');

  const lines = source.split('\n');
  const rendered: string[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const value = line.trim();
      if (!value) {
        rendered.push('');
        continue;
      }
      if (value.startsWith('|')) {
        const tableLines: string[] = [];
        while (lineIndex < lines.length && lines[lineIndex].trim().startsWith('|')) {
          tableLines.push(lines[lineIndex]);
          lineIndex++;
        }
        lineIndex--;
        const table = markdownTableToTex(tableLines);
        if (table) {
          rendered.push(table);
          continue;
        }
      }
      if (/^#{2,6}\s+/.test(value)) {
        const heading = inlineMarkdownToTex(value.replace(/^#{2,6}\s+/, ''));
        rendered.push(value.startsWith('###') ? `\\subsectionbar{${heading}}` : `\\sectionbar{${heading}}`);
        continue;
      }
      if (/^[-*]\s+/.test(value)) {
        rendered.push(`\\textbullet{} ${inlineMarkdownToTex(value.replace(/^[-*]\s+/, ''))}\\par`);
        continue;
      }
      if (/^>\s?/.test(value)) {
        rendered.push(`\\begin{tcolorbox}[callout]\\textbf{NOTE}\\quad ${inlineMarkdownToTex(value.replace(/^>\s?/, ''))}\\end{tcolorbox}`);
        continue;
      }
      if (/^---+$/.test(value)) {
        rendered.push('\\par\\vspace{2pt}\\textcolor{rule}{\\rule{\\linewidth}{0.6pt}}\\par\\vspace{2pt}');
        continue;
      }
      if (/^\d+\.\s+/.test(value)) {
        rendered.push(`${value.match(/^\d+/)?.[0] || ''}. ${inlineMarkdownToTex(value.replace(/^\d+\.\s+/, ''))}\\par`);
        continue;
      }
      rendered.push(`${inlineMarkdownToTex(value)}\\par`);
  }

  return rendered.join('\n')
    .replace(/@@TEXTABLE(\d+)@@/g, (_, index) => tables[Number(index)] ?? '')
    .replace(/@@TEXMATH(\d+)@@/g, (_, index) => math[Number(index)] ?? '');
}

function resolveXeLatex(): string {
  const electronResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const winCandidates = process.platform === 'win32'
    ? [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'),
        path.join(process.env.ProgramFiles || 'C:/Program Files', 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'),
        electronResourcesPath ? path.join(electronResourcesPath, 'miktex', 'miktex', 'bin', 'x64', 'xelatex.exe') : '',
      ]
    : [];

  const candidates = [
    process.env.XELATEX_PATH,
    'xelatex',
    ...winCandidates,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate !== 'xelatex') {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const extensions = process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
    for (const directory of (process.env.PATH || '').split(path.delimiter)) {
      for (const extension of extensions) {
        const executable = path.join(directory, `xelatex${extension}`);
        if (fs.existsSync(executable)) return executable;
      }
    }
  }
  throw new Error('XeLaTeX is not installed. Install MiKTeX or set XELATEX_PATH to xelatex.exe.');
}

/** True when a real XeLaTeX (MiKTeX / TeX Live) binary exists on this machine. */
function isXeLatexAvailable(): boolean {
  try {
    resolveXeLatex();
    return true;
  } catch {
    return false;
  }
}

function buildXeLatexSource(input: PdfInput): string {
  const title = escapeTex(input.title.toUpperCase());
  const kicker = escapeTex(input.kicker || 'DOCUMENT').toUpperCase();
  const subtitle = input.subtitle ? `\\normalsize\\itshape\\color{accentdark} ${escapeTex(input.subtitle)}\\par` : '';
  const metadataItems = [
    input.subject ? ['SUBJECT', input.subject] : null,
    input.documentType ? ['DOCUMENT', input.documentType] : null,
    input.version ? ['VERSION', input.version] : null,
    input.author ? ['PREPARED BY', input.author] : null,
    ['DATE', input.date || todayDisplay()],
  ].filter((item): item is [string, string] => item !== null);
  const metadataColumns = Math.min(3, Math.max(1, metadataItems.length));
  const metadataRows: string[] = [];
  for (let index = 0; index < metadataItems.length; index += metadataColumns) {
    metadataRows.push(metadataItems.slice(index, index + metadataColumns)
      .map(([label, value]) => `\\metaitem{${escapeTex(label)}}{${escapeTex(value)}}`).join(' & '));
  }
  const metadata = metadataItems.length
    ? `\\begin{tabularx}{\\linewidth}{${'Y'.repeat(metadataColumns)}}\n${metadataRows.join(' \\\\\n')}\n\\end{tabularx}`
    : '';
  const body = markdownToTex(input.content);
  const tcbset = String.fromCharCode(92) + 'tcbset';
  const accent = (input.accentColor || '0F766E').replace(/[^0-9A-Fa-f]/g, '').slice(-6) || '0F766E';
  return String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[a4paper,margin=20mm]{geometry}
\usepackage{fontspec}
\usepackage{amsmath,amssymb,mathtools}
\usepackage[version=4]{mhchem}
\usepackage{array,tabularx,colortbl}
\usepackage{xcolor}
\usepackage[most]{tcolorbox}
\tcbuselibrary{skins}
\usepackage{fancyhdr}
\usepackage{enumitem}
\usepackage{parskip}
\usepackage{hyperref}
\IfFontExistsTF{Segoe UI}{\setmainfont{Segoe UI}}{\setmainfont{Latin Modern Roman}}
\definecolor{accent}{HTML}{${accent}}
\definecolor{ink}{HTML}{172033}
\definecolor{muted}{HTML}{526174}
\definecolor{accentdark}{HTML}{0B5D59}
\definecolor{accentgold}{HTML}{C47A24}
\definecolor{band}{HTML}{F1F5F9}
\definecolor{soft}{HTML}{F8FAFC}
\definecolor{rule}{HTML}{E2E8F0}
\color{ink}
\renewcommand{\familydefault}{\sfdefault}
\AtBeginDocument{\fontsize{10.5pt}{17pt}\selectfont}
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}
\newcolumntype{Y}{>{\raggedright\arraybackslash}X}
\newcommand{\metaitem}[2]{\cellcolor{white}\fcolorbox{rule}{white}{\parbox[t]{\linewidth}{\scriptsize\bfseries\color{accent}#1\\[-1pt]\footnotesize\color{muted}#2}}}
\newcounter{sectionnumber}
\setlist[itemize]{leftmargin=1.8em,itemsep=2pt,topsep=3pt}
\setlist[enumerate]{leftmargin=1.8em,itemsep=2pt,topsep=3pt}
\pagestyle{fancy}
\fancyhf{}
\lfoot{\scriptsize\bfseries\color{muted}${title}}
\cfoot{\scriptsize\color{muted}Page \thepage}
\rfoot{\scriptsize\color{muted}${escapeTex(input.date || todayDisplay())}}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0.4pt}
\renewcommand{\footrule}{\color{accent}\hrulefill}
${tcbset}{mathband/.style={colback=band,colframe=accent,boxrule=0pt,leftrule=2pt,left=8mm,right=8mm,top=5mm,bottom=5mm,halign=center,arc=2mm},callout/.style={enhanced,colback=accentgold!7,colframe=accentgold!55,boxrule=0.35pt,leftrule=3pt,left=4mm,right=4mm,top=2.5mm,bottom=2.5mm,arc=1.5mm,breakable}}
\hypersetup{colorlinks=true,linkcolor=accent,urlcolor=accent}
\newcommand{\sectionbar}[1]{%
  \stepcounter{sectionnumber}%
  \par\vspace{1.1em}%
  \noindent\begin{tcolorbox}[enhanced,colback=band,colframe=rule,boxrule=0.4pt,leftrule=5pt,left=4mm,right=4mm,top=2.5mm,bottom=2.5mm,arc=2mm]
  {\scriptsize\bfseries\color{accent}\thesectionnumber\quad\textbar\quad}{\bfseries\color{ink}\normalsize\MakeUppercase{#1}}\end{tcolorbox}%
  \vspace{0.35em}%
}
\newcommand{\subsectionbar}[1]{%
  \par\vspace{0.8em}%
  \noindent\hspace{0.25em}\textcolor{accent}{\rule{0.28em}{1.8ex}}\hspace{0.55em}\textbf{\color{accentdark}\normalsize #1}\par\vspace{0.35em}%
}
\begin{document}
\noindent\begin{tcolorbox}[enhanced, colback=accent!7, colframe=accent!30, boxrule=0pt, left=7mm, right=7mm, top=6mm, bottom=6mm, arc=0mm, borderline north={1pt}{0pt}{accent}, borderline south={1pt}{0pt}{accent!70}]
{\scriptsize\bfseries\color{accentdark}\rule{1.4em}{0.7pt}\hspace{0.5em}${kicker}\par}
\vspace{2mm}
{\LARGE\bfseries\color{ink}${title}\par}
${subtitle}
\vspace{2mm}
${metadata ? `{\\color{muted}\\small ${metadata}\\par}` : ''}
\end{tcolorbox}
\vspace{4mm}
${body}
\end{document}
`;
}

type MathExpression = { tex: string; displayMode: boolean };

function buildMathSvgSource(expressions: MathExpression[]): string {
  const pages = expressions.map(({ tex, displayMode }) =>
    `\\(${displayMode ? '\\displaystyle' : '\\textstyle'} ${tex.trim()}\\)`
  ).join('\n');
  return String.raw`\documentclass[12pt,crop=true,math=true]{standalone}
\usepackage{fontspec}
\usepackage{amsmath,amssymb,mathtools}
\usepackage[version=4]{mhchem}
\begin{document}
${pages}
\end{document}
`;
}

async function compileMathToSvgs(expressions: MathExpression[]): Promise<string[]> {
  if (expressions.length === 0) return [];
  const texSource = buildMathSvgSource(expressions);
  if (process.platform === 'win32') {
    const result = await runPcControl({
      command: 'compileLatex',
      args: { texSource, outputFormat: 'svg' },
      timeoutMs: 120000,
    });
    if (!result.ok) throw new Error(result.error || 'MiKTeX math SVG rendering failed.');
    const data = result.data as { svgs?: unknown } | undefined;
    const svgs = Array.isArray(data?.svgs) ? data.svgs.filter((svg): svg is string => typeof svg === 'string') : [];
    if (svgs.length !== expressions.length) {
      throw new Error(`MiKTeX produced ${svgs.length} math SVGs for ${expressions.length} expressions.`);
    }
    return svgs;
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jimskay-math-svg-'));
  const texFile = path.join(tempDirectory, 'math.tex');
  const pdfFile = path.join(tempDirectory, 'math.pdf');
  try {
    fs.writeFileSync(texFile, texSource, 'utf8');
    await execFileAsync(resolveXeLatex(), [
      '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape',
      '-output-directory', tempDirectory, texFile,
    ], { cwd: tempDirectory, timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    const dvisvgm = process.env.DVISVGM_PATH || 'dvisvgm';
    await execFileAsync(dvisvgm, [
      '--pdf', '--page=1-', '--output=math-%p.svg', pdfFile,
    ], { cwd: tempDirectory, timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    const svgFiles = fs.readdirSync(tempDirectory)
      .map((name) => ({ name, page: Number(name.match(/^math-(\d+)\.svg$/)?.[1]) }))
      .filter((entry) => Number.isFinite(entry.page))
      .sort((a, b) => a.page - b.page);
    if (svgFiles.length !== expressions.length) {
      throw new Error(`dvisvgm produced ${svgFiles.length} math SVGs for ${expressions.length} expressions.`);
    }
    return svgFiles.map(({ name }) =>
      fs.readFileSync(path.join(tempDirectory, name), 'utf8').replace(/<\?xml[^>]*\?>\s*/i, '')
    );
  } finally {
    try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

async function compileMathJaxToSvgs(expressions: MathExpression[]): Promise<string[]> {
  startMathJax();
  const svgs: string[] = [];
  for (const { tex, displayMode } of expressions) {
    const math = normalizeMathTex(rewriteLatexArrows(tex)).trim();
    const result = await mathjax.typeset({
      math: `${displayMode ? '\\displaystyle' : '\\textstyle'} ${math}`,
      format: 'TeX',
      svg: true,
      ex: 16,
      em: 16,
      display: displayMode,
      timeout: 15000,
    });
    if (result.errors?.length || !result.svg) {
      throw new Error(`MathJax could not render expression: ${result.errors?.join('; ') || 'no SVG output'}`);
    }
    svgs.push(result.svg.replace(/<\?xml[^>]*\?>\s*/i, ''));
  }
  return svgs;
}

async function buildHybridDocumentHtml(input: PdfInput): Promise<string> {
  const expressions: MathExpression[] = [];
  const built = buildDocumentHtml(input, (tex, displayMode) => {
    const index = expressions.push({ tex, displayMode }) - 1;
    return `@@PDFTEXMATH${index}@@`;
  });
  if (expressions.length === 0) return built.fullHtml;

  const svgs = await compileMathToSvgs(expressions);
  return built.fullHtml.replace(/@@PDFTEXMATH(\d+)@@/g, (_token, value: string) => {
    const index = Number(value);
    const svg = svgs[index];
    if (!svg) return '';
    const className = expressions[index].displayMode ? 'tex-math-display' : 'tex-math-inline';
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return `<img class="${className}" src="${source}" alt="${escapeHtml(expressions[index].tex)}">`;
  });
}

export async function buildMathJaxDocumentHtml(input: PdfInput): Promise<string> {
  const expressions: MathExpression[] = [];
  const built = buildDocumentHtml(input, (tex, displayMode) => {
    const index = expressions.push({ tex, displayMode }) - 1;
    return `@@PDFTEXMATH${index}@@`;
  });
  if (expressions.length === 0) return built.fullHtml;

  const svgs = await compileMathJaxToSvgs(expressions);
  return built.fullHtml.replace(/@@PDFTEXMATH(\d+)@@/g, (_token, value: string) => {
    const index = Number(value);
    const svg = svgs[index];
    if (!svg) return '';
    const className = expressions[index].displayMode ? 'tex-math-display' : 'tex-math-inline';
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return `<img class="${className}" src="${source}" alt="${escapeHtml(expressions[index].tex)}">`;
  });
}

async function generateXeLatexPdf(input: PdfInput, safeFilename: string) {
  if (process.platform === 'win32') {
    const localResult = await runPcControl({
      command: 'compileLatex',
      args: { texSource: buildXeLatexSource(input) },
      timeoutMs: 120000,
    });
    if (!localResult.ok) throw new Error(localResult.error || 'Local XeLaTeX compilation failed.');
    const data = localResult.data as { base64?: string } | undefined;
    if (!data?.base64) throw new Error('Local XeLaTeX returned no PDF data.');
    return { base64Data: data.base64, filename: safeFilename };
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jimskay-xelatex-'));
  const texFile = path.join(tempDirectory, 'document.tex');
  const pdfFile = path.join(tempDirectory, 'document.pdf');
  try {
    fs.writeFileSync(texFile, buildXeLatexSource(input), 'utf8');
    const compiler = resolveXeLatex();
    await execFileAsync(compiler, [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-no-shell-escape',
      '-file-line-error',
      '-output-directory',
      tempDirectory,
      texFile,
    ], { cwd: tempDirectory, timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (!fs.existsSync(pdfFile)) throw new Error('XeLaTeX completed without producing a PDF.');
    return { base64Data: fs.readFileSync(pdfFile).toString('base64'), filename: safeFilename };
  } catch (err: any) {
    const logPath = path.join(tempDirectory, 'document.log');
    const logText = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    const log = logText.split('\n')
      .filter((line) => /^!|LaTeX Error:|File .* not found|Emergency stop/.test(line.trim()))
      .slice(0, 6)
      .join(' ');
    const compilerOutput = [err.stdout, err.stderr]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(-1200);
    throw new Error(`XeLaTeX compilation failed: ${err.message}${log ? ` ${log}` : ''}${compilerOutput ? ` Output: ${compilerOutput}` : ''}`);
  } finally {
    try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function buildDocumentHtml(input: PdfInput, renderMath = wrapMath): {
  fullHtml: string;
  headerHtml: string;
  footerHtml: string;
  accent: string;
  accentDark: string;
} {
  const accent = (input.accentColor || '#0f766e').trim().replace(/[^#0-9a-fA-F]/g, '');
  const accentDark = shadeColor(accent, -22);
  const accentDeep = shadeColor(accent, -38);
  const accentSoft = `${accent}1a`; // ~10% alpha
  const accentSoft2 = `${accent}2b`; // ~17% alpha
  const accentBorder = `${accent}40`; // ~25% alpha

  const subtitle = input.subtitle ? escapeHtml(input.subtitle) : '';
  const kicker = input.kicker ? escapeHtml(input.kicker).toUpperCase() : 'DOCUMENT';
  const customCss = input.css || '';
  const pageTitle = escapeHtml(input.title || 'Document');
  const pageDate = escapeHtml(input.date || todayDisplay());

  // Auto contents block when the doc carries at least three top-level sections.
  const { tocHtml, html: tocContent } = buildTableOfContents(
    stripDuplicateTitle(processMathAndChem(input.content, renderMath), input.title)
  );

  // Build the structured header metadata grid from provided fields (date always defaults).
  const metaItems: Array<[string, string]> = [];
  if (input.subject) metaItems.push(['Subject', escapeHtml(input.subject)]);
  if (input.documentType) metaItems.push(['Document', escapeHtml(input.documentType)]);
  if (input.version) metaItems.push(['Version', escapeHtml(input.version)]);
  if (input.author) metaItems.push(['Prepared by', escapeHtml(input.author)]);
  metaItems.push(['Date', escapeHtml(input.date || todayDisplay())]);

  // Meta / spec strip: one white band of labelled chips below the header.
  const metaStrip = metaItems.length
    ? `<div class="meta-strip">${metaItems
        .map(
          ([label, value]) =>
            `<span class="meta-chip"><span class="meta-chip-label">${label}</span><span class="meta-chip-value">${value}</span></span>`
        )
        .join('<span class="meta-sep"></span>')}</div>`
    : '';

  const headerHtml = `<div style="width:100%;height:4px;background:linear-gradient(90deg,${accent} 0%,${accentDark} 55%,transparent 100%);padding:0;margin:0;"></div>`;

  const footerHtml = `
    <div style="width:100%;padding:8px 15mm 0 15mm;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Inter',Helvetica,Arial,sans-serif;font-size:8px;color:#64748b;">
      <div style="width:100%;height:1px;background:linear-gradient(90deg,${accent}66,${accent}08);margin:0 0 7px 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="letter-spacing:0.9px;text-transform:uppercase;font-weight:700;color:#94a3b8;max-width:38%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(input.title)}</span>
        <span style="font-weight:700;color:${accent};background:${accent}14;border:1px solid ${accent}33;border-radius:999px;padding:2px 11px;font-size:7.5px;">Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        <span style="color:#94a3b8;">${escapeHtml(input.date || todayDisplay())}</span>
      </div>
    </div>
  `;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      ${KATEX_CSS}

      :root {
        --accent: ${accent};
        --accent-dark: ${accentDark};
        --accent-deep: ${accentDeep};
        --accent-soft: ${accentSoft};
        --accent-soft2: ${accentSoft2};
        --accent-border: ${accentBorder};
        --ink: #0f172a;
        --ink-soft: #334155;
        --muted: #64748b;
        --rule: #e5e7eb;
        --band: #f8fafc;
        --band-2: #f1f5f9;
        --page: #ffffff;
        --sans: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Roboto, Helvetica, Arial, sans-serif;
        --serif: Georgia, 'Times New Roman', serif;
      }

      @page {
        size: A4;
        margin: 12mm 12mm 16mm 12mm;
        margin-top: 12mm;
        margin-bottom: 14mm;
        --doc-footer-title: "${pageTitle}";
        --doc-footer-date: "${pageDate}";

        @bottom-left {
          content: var(--doc-footer-title);
          color: #64748b;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          vertical-align: bottom;
          padding: 0 0 4px 0;
        }

        @bottom-center {
          content: "Page " counter(page) " / " counter(pages);
          color: ${accent};
          background: ${accent}14;
          border: 1px solid ${accent}33;
          border-radius: 999px;
          padding: 3px 12px;
          font-size: 7.5px;
          font-weight: 700;
          vertical-align: bottom;
        }

        @bottom-right {
          content: var(--doc-footer-date);
          color: #64748b;
          font-size: 8.5pt;
          font-weight: 600;
          vertical-align: bottom;
          padding: 0 0 4px 0;
        }
      }
      * { box-sizing: border-box; }
      html {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15,118,110,0.08), transparent 28%),
          linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        font-family: var(--sans);
        font-size: 10.5pt;
        line-height: 1.62;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        overflow-wrap: break-word;
      }

      .doc {
        width: 100%;
        background: transparent;
      }
      main, p, div, li { color: var(--ink); }
      p { text-align: left; hyphens: auto; overflow-wrap: anywhere; }
      .doc-body > p:first-of-type {
        margin-top: 0; font-size: 11pt; line-height: 1.75; color: var(--ink-soft);
        padding: 12px 14px; border-left: 4px solid var(--accent);
        background: linear-gradient(90deg, var(--accent-soft2), rgba(255,255,255,0.7));
        border-radius: 0 8px 8px 0; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
      }
      img, svg { max-width: 100%; height: auto; }

      /* ------------------------------ Header ------------------------------ */
      .doc-header {
        position: relative;
        overflow: hidden;
        background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, white) 0%, #ffffff 58%, color-mix(in srgb, var(--accent) 8%, white) 100%);
        border: 1px solid var(--accent-border);
        border-top: 0;
        box-shadow: 0 12px 26px rgba(15, 23, 42, 0.06);
        padding: 18px 24px 17px 24px;
        margin: 0 0 18px 0;
        border-radius: 0 0 18px 18px;
        break-after: avoid;
        page-break-after: avoid;
      }
      /* Soft watermark orb top-right + gradient rule sealing the header block */
      .doc-header::before {
        content: ''; position: absolute; right: -70px; top: -70px;
        width: 220px; height: 220px; border-radius: 50%;
        background: radial-gradient(circle, var(--accent-soft2) 0%, rgba(255,255,255,0) 70%);
      }
      .doc-header::after {
        content: ''; display: block; height: 2px; margin-top: 18px;
        border-radius: 2px;
        background: linear-gradient(90deg, var(--accent) 0%, var(--accent-border) 55%, transparent 100%);
      }
      .header-top {
        position: relative; z-index: 1;
        display: flex; align-items: center; justify-content: space-between; gap: 24px;
      }
      .header-left { min-width: 0; flex: 1; }
      .header-mark {
        flex: 0 0 64px; width: 64px; height: 64px;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid var(--accent-border); border-radius: 14px;
        background: linear-gradient(145deg, var(--accent), var(--accent-dark));
        box-shadow: 0 8px 18px var(--accent-soft2);
        color: #ffffff; font-size: 25pt; font-weight: 800; line-height: 1;
      }
      .kicker {
        font-size: 8.5pt; font-weight: 800; letter-spacing: 0.22em;
        text-transform: uppercase; color: var(--accent-dark); margin: 0 0 6px 0;
        display: flex; align-items: center; gap: 9px;
      }
      .kicker::before { content: ''; width: 20px; height: 2px; background: var(--accent); border-radius: 1px; }
      .doc-title {
        font-size: 23pt; font-weight: 800; letter-spacing: -0.02em;
        text-transform: uppercase; line-height: 1.04; margin: 0 0 8px 0;
        color: var(--ink);
      }
      .doc-subtitle {
        font-size: 10pt; font-weight: 500; font-style: italic;
        color: var(--accent-dark); margin: 0 0 12px 0; line-height: 1.4;
      }
      .meta-strip {
        position: relative; z-index: 1;
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 0; margin-top: 15px; padding-top: 11px;
        border-top: 1px solid var(--accent-border);
      }
      .meta-chip {
        display: flex; flex-direction: column; justify-content: center; gap: 3px;
        min-width: 90px; max-width: 100%; padding: 2px 15px;
        break-inside: avoid; page-break-inside: avoid;
      }
      .meta-chip:first-child { padding-left: 0; }
      .meta-chip-label {
        font-size: 7pt; font-weight: 800; letter-spacing: 0.1em;
        text-transform: uppercase; color: var(--accent-dark);
      }
      .meta-chip-value {
        font-size: 8.5pt; font-weight: 600; line-height: 1.3;
        color: var(--ink-soft); overflow-wrap: anywhere;
      }
      .meta-sep { flex: 0 0 1px; height: 27px; background: var(--accent-border); }

      /* --------------------- Table of contents ---------------------- */
      .toc {
        border: 1px solid var(--rule);
        border-left: 4px solid var(--accent);
        border-radius: 12px;
        background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
        padding: 18px 20px 14px 20px;
        margin: 0 0 18px 0;
        box-shadow: 0 6px 16px rgba(15, 23, 42, 0.03);
        break-inside: avoid; page-break-inside: avoid;
      }
      .toc-title {
        display: flex; align-items: center; gap: 10px;
        font-size: 11.5pt; font-weight: 800; letter-spacing: 0.14em;
        text-transform: uppercase; color: var(--ink);
        margin: 0 0 12px 0; padding-bottom: 10px;
        border-bottom: 1px solid var(--rule);
      }
      .toc-title::before {
        content: ''; width: 11px; height: 11px; border-radius: 3px;
        background: linear-gradient(135deg, var(--accent), var(--accent-dark));
      }
      .toc-list { list-style: none; margin: 0; padding: 0; }
      .toc-list li { margin: 0; line-height: 1.4; }
      .toc-list a { text-decoration: none; color: inherit; display: block; }
      .toc-main { font-size: 10.5pt; font-weight: 700; color: var(--ink); }
      .toc-main a { padding: 6px 8px; border-radius: 6px; }
      .toc-main a::before {
        content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 2px;
        background: var(--accent); margin-right: 10px; vertical-align: 1px;
      }
      .toc-sub { font-size: 9.5pt; font-weight: 500; color: var(--ink-soft); padding-left: 26px; }
      .toc-sub a { padding: 3px 8px; }
      .toc-sub a::before { content: '–'; color: var(--muted); margin-right: 8px; }
      .toc-main a:hover, .toc-sub a:hover { background: var(--accent-soft2); }

      /* ------------------------------ Body ------------------------------ */
      .doc-body { padding: 0 28px 34px 28px; }
      .doc-body::after { content: ''; display: block; height: 18px; }

      h1, h2, h3, h4, h5, h6 {
        font-family: var(--sans);
        break-after: avoid;
        page-break-after: avoid;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      /* Top-level section */
      h1 {
        font-size: 15pt; font-weight: 800; letter-spacing: -0.01em;
        color: var(--ink); margin: 28px 0 12px 0; padding: 10px 0 10px 14px;
        border-left: 5px solid var(--accent);
        background: linear-gradient(90deg, var(--accent-soft2), transparent);
        border-radius: 0 6px 6px 0;
      }

      /* Page / major section card (e.g. "PAGE 1 SUMMARY (...)" ) */
      h2 {
        font-size: 12.5pt; font-weight: 800; letter-spacing: 0.03em;
        text-transform: uppercase; color: var(--ink);
        margin: 24px 0 12px 0; padding: 11px 14px 11px 16px;
        background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%);
        border: 1px solid var(--rule);
        border-left: 6px solid var(--accent);
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
        break-after: avoid; page-break-after: avoid;
      }
      h2::after { content: ''; display: inline-block; width: 7px; height: 7px; margin-left: 10px; border-radius: 50%; background: var(--accent); vertical-align: middle; }

      /* Subtopic (e.g. "Subtopic: Silicon Overview & Occurrence") */
      h3 {
        font-size: 11.5pt; font-weight: 800; color: var(--accent-dark);
        margin: 20px 0 9px 0; padding-left: 12px; position: relative; letter-spacing: 0.01em;
      }
      h3::before {
        content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 4px;
        border-radius: 2px; background: var(--accent);
      }

      h4 { font-size: 10.5pt; font-weight: 700; color: var(--ink); margin: 16px 0 6px 0; padding-left: 10px; position: relative; }
      h4::before { content: ''; position: absolute; left: 0; top: 5px; bottom: 5px; width: 3px; border-radius: 2px; background: var(--accent-border); }
      h5 { font-size: 10pt; font-weight: 700; color: var(--ink-soft); margin: 13px 0 6px 0; }
      h6 { font-size: 9.5pt; font-weight: 700; color: var(--ink-soft); margin: 13px 0 6px 0; }

      strong { font-weight: 700; color: var(--ink); }

      ul, ol { padding-left: 20px; margin: 7px 0 14px 0; }
      li { margin: 0 0 5px 0; line-height: 1.56; color: var(--ink-soft); }
      li p { margin: 0; }
      ul li::marker { color: var(--accent); }
      ol li::marker { color: var(--accent-dark); font-weight: 700; }
      li > strong { color: var(--ink); }

      /* Inferred fact list (loose text without any list markers) */
      ul.fact-list { padding-left: 18px; }
      ul.fact-list li { list-style: none; position: relative; padding-left: 15px; margin: 0 0 6px 0; }
      ul.fact-list li::before { content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 2px; background: var(--accent); }
      ul.fact-list li.fact-label { font-weight: 700; color: var(--ink); margin-top: 10px; }
      ul.fact-list li.fact-label::before { top: 9px; width: 8px; height: 8px; background: var(--accent-dark); }

      /* Multi-column key-value grid */
      .kv-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px 14px; margin: 12px 0 16px 0;
      }
      .kv-item {
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid var(--rule); border-top: 3px solid var(--accent);
        border-radius: 10px; padding: 10px 12px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.025);
        break-inside: avoid; page-break-inside: avoid;
      }
      .kv-label {
        font-size: 8pt; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--accent); margin: 0 0 4px 0;
      }
      .kv-value { font-size: 10pt; line-height: 1.5; color: var(--ink-soft); }
      .kv-value p { margin: 0; text-align: left; }
      .kv-wide { grid-column: 1 / -1; }

      .workflow-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px 14px;
        margin: 18px 0 18px 0;
      }
      .workflow-step {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid var(--rule);
        border-left: 4px solid var(--accent);
        border-radius: 10px;
        padding: 12px 14px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.025);
        break-inside: avoid; page-break-inside: avoid;
      }
      .workflow-num {
        min-width: 26px; height: 26px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 7px;
        background: linear-gradient(135deg, var(--accent), var(--accent-dark));
        color: #ffffff;
        font-size: 9pt; font-weight: 800;
      }
      .workflow-copy {
        flex: 1;
      }
      .workflow-title {
        font-size: 10.2pt; font-weight: 800; color: var(--ink);
        margin-bottom: 3px;
      }
      .workflow-detail {
        font-size: 9.2pt; color: var(--ink-soft);
        line-height: 1.45;
      }

      /* Math / chemistry blocks */
      .math-block {
        margin: 13px 0; padding: 13px 16px;
        background: linear-gradient(180deg, #f8fafc 0%, #eef7ff 100%);
        border: 1px solid var(--rule);
        border-left: 5px solid var(--accent); border-radius: 10px;
        text-align: center; overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 10px rgba(15,23,42,0.02);
        break-inside: avoid; page-break-inside: avoid;
      }
      .math-block .katex-display { margin: 0; }
      .tex-math-inline { max-width: 100%; vertical-align: middle; }
      .tex-math-display { display: block; max-width: 100%; height: auto; margin: 0 auto; }
      .math-error { color: #b91c1c; background: #fef2f2; padding: 2px 6px; border-radius: 4px; }

      /* Tables */
      table {
        width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
        margin: 13px 0 16px 0; font-size: 9.5pt;
        border: 1px solid var(--rule); border-radius: 10px; overflow: hidden;
        background: white;
        page-break-inside: auto;
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.025);
      }
      thead { display: table-header-group; background: linear-gradient(180deg, var(--accent-soft2), rgba(255,255,255,0.7)); }
      th {
        background: linear-gradient(180deg, var(--accent-soft2), rgba(255,255,255,0.7)); color: var(--accent-deep);
        font-weight: 800; text-align: left; padding: 9px 11px;
        border-bottom: 1px solid var(--rule); border-right: 1px solid var(--rule);
        font-size: 9.5pt; letter-spacing: 0.02em; text-transform: uppercase;
      }
      td {
        padding: 9px 11px; border-right: 1px solid var(--rule);
        border-bottom: 1px solid var(--rule);
        color: var(--ink-soft); vertical-align: top;
      }
      tr { break-inside: avoid; page-break-inside: avoid; }
      tr:nth-child(even) td { background: #f8fafc; }
      th:last-child, td:last-child { border-right: none; }
      tbody tr:last-child td { border-bottom: none; }

      /* Figure caption (from [File: …] / [Image: …]) */
      .figcap { font-size: 8.5pt; font-style: italic; color: var(--muted); margin: 6px 0 12px 0; text-align: left; }

      /* Callouts */
      .callout {
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.92));
        border: 1px solid var(--accent-border);
        border-left: 5px solid var(--accent); border-radius: 10px;
        padding: 12px 16px; margin: 15px 0; box-shadow: 0 5px 12px rgba(15, 23, 42, 0.03);
        break-inside: avoid; page-break-inside: avoid;
      }
      .callout-label {
        display: inline-block; font-size: 7.5pt; font-weight: 800;
        letter-spacing: 0.16em; text-transform: uppercase;
        padding: 3px 10px; border-radius: 999px; margin: 0 0 8px 0;
        background: var(--accent-dark); color: #ffffff;
      }
      .callout p { margin: 0 0 6px 0; text-align: left; }
      .callout p:last-child { margin: 0; }
      .callout ul, .callout ol { margin: 6px 0 2px 0; }

      /* Semantic callout variants (bold pastel band + tinted label) */
      .callout-note { background: #eff6ff; border-color: #bfdbfe; border-left-color: #3b82f6; }
      .callout-note .callout-label { background: #3b82f6; }
      .callout-key { background: var(--accent-soft); border-color: var(--accent-border); border-left-color: var(--accent); }
      .callout-key .callout-label { background: var(--accent); }
      .callout-tip { background: #f0fdf4; border-color: #bbf7d0; border-left-color: #16a34a; }
      .callout-tip .callout-label { background: #16a34a; }
      .callout-warning { background: #fffbeb; border-color: #fde68a; border-left-color: #d97706; }
      .callout-warning .callout-label { background: #d97706; }
      .callout-trap { background: #fef2f2; border-color: #fecaca; border-left-color: #dc2626; }
      .callout-trap .callout-label { background: #dc2626; }
      .callout-trick { background: #faf5ff; border-color: #e9d5ff; border-left-color: #9333ea; }
      .callout-trick .callout-label { background: #9333ea; }

      blockquote {
        background: var(--band); border-left: 4px solid var(--rule);
        margin: 13px 0; padding: 11px 16px; color: var(--ink-soft);
        border-radius: 0 6px 6px 0; break-inside: avoid;
      }

      hr { border: none; border-top: 1px solid var(--rule); margin: 16px 0; }

      /* Page break helpers */
      .page-break {
        break-before: page; page-break-before: always;
        margin-top: 8mm;
      }
      .page-break-after {
        break-after: page; page-break-after: always;
      }
      p, li { orphans: 3; widows: 3; }

      /* Custom AI / user override CSS (applied last) */
      ${customCss}
    </style>
  </head>
  <body>
    <div class="doc">
      <header class="doc-header">
        <div class="header-top">
          <div class="header-left">
            <p class="kicker">${kicker}</p>
            <h1 class="doc-title">${escapeHtml(input.title)}</h1>
            ${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}
          </div>
          <div class="header-mark">${escapeHtml((input.title || 'D').trim().charAt(0).toUpperCase())}</div>
        </div>
        ${metaStrip}
      </header>
      <main class="doc-body">
        ${tocHtml}
        ${tocContent}
      </main>
    </div>
  </body>
</html>`;

  return { fullHtml, headerHtml, footerHtml, accent, accentDark };
}

/* ------------------------------------------------------------------ */
/* Render entry point                                                  */
/* ------------------------------------------------------------------ */

interface PdfBrowserResolution {
  executablePath: string;
  chromiumArgs: string[];
}

/** Ordered list of installed Chromium-family browsers to try before any download. */
function pdfBrowserCandidates(): string[] {
  const list: string[] = [];
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) list.push(envPath);
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:/Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const la = process.env['LOCALAPPDATA'] || '';
    list.push(
      `${pf}/Google/Chrome/Application/chrome.exe`,
      `${pf86}/Google/Chrome/Application/chrome.exe`,
      la ? `${la}/Google/Chrome/Application/chrome.exe` : '',
      `${pf86}/Microsoft/Edge/Application/msedge.exe`,
      `${pf}/Microsoft/Edge/Application/msedge.exe`,
      la ? `${la}/Microsoft/Edge/Application/msedge.exe` : ''
    );
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    list.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge'
    );
  }
  return list.filter(Boolean).map((p) => p.replace(/\\/g, '/'));
}

/**
 * Picks a local Chrome/Edge/Chromium for headless PDF rendering. Falls back to the
 * @sparticuz/chromium download ONLY in production when nothing is installed, so the
 * packaged desktop app never depends on a network download just to print a PDF.
 */
async function resolvePdfBrowserExecutable(): Promise<PdfBrowserResolution> {
  for (const candidate of pdfBrowserCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        return { executablePath: candidate, chromiumArgs: [] };
      }
    } catch {
      /* ignore invalid paths */
    }
  }
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      'PDF Generation Failed: No Chrome, Edge or Chromium was found. Install Google Chrome or Microsoft Edge (or set CHROME_PATH) and try again.'
    );
  }
  console.log('[PDF-ENGINE] No installed browser found — downloading @sparticuz/chromium (first render can be slow)...');
  const executablePath = await chromium.executablePath(
    'https://github.com/sparticuz/chromium/releases/download/v126.0.0/chromium-v126.0.0-pack.tar'
  );
  return { executablePath, chromiumArgs: [...chromium.args, '--single-process'] };
}

export async function generatePdfInMemory(input: PdfInput) {
  const safeFilename = input.filename.endsWith('.pdf') ? input.filename : `${input.filename}.pdf`;
  const renderer = input.renderer || 'auto';
  const effectiveRenderer = renderer === 'auto' ? (isXeLatexAvailable() ? 'hybrid' : 'mathjax') : renderer;
  if (effectiveRenderer === 'xelatex') {

    try {
      return await generateXeLatexPdf(input, safeFilename);
    } catch (error: any) {
      const message = String(error?.message || error);
      const compilerUnavailable = /not installed|ENOENT|spawn .*xelatex/i.test(message);
      if (!compilerUnavailable) throw error;
      console.warn('[PDF-ENGINE] XeLaTeX is unavailable in this runtime; falling back to HTML/KaTeX.', message);
      return generatePdfInMemory({ ...input, renderer: 'html' });
    }
  }
  let fullHtml: string;
  let headerHtml: string;
  let footerHtml: string;
  if (effectiveRenderer === 'hybrid') {
    try {
      fullHtml = await buildHybridDocumentHtml(input);
    } catch (error: any) {
      console.warn('[PDF-ENGINE] MiKTeX math rendering failed; using portable MathJax SVG math.', error?.message || error);
      try {
        fullHtml = await buildMathJaxDocumentHtml(input);
      } catch (mathJaxError: any) {
        console.warn('[PDF-ENGINE] MathJax rendering failed; using HTML/KaTeX math.', mathJaxError?.message || mathJaxError);
        fullHtml = buildDocumentHtml(input).fullHtml;
      }
    }
    ({ headerHtml, footerHtml } = buildDocumentHtml(input));
  } else if (effectiveRenderer === 'mathjax') {
    try {
      fullHtml = await buildMathJaxDocumentHtml(input);
    } catch (error: any) {
      console.warn('[PDF-ENGINE] MathJax rendering failed; using HTML/KaTeX math.', error?.message || error);
      fullHtml = buildDocumentHtml(input).fullHtml;
    }
    ({ headerHtml, footerHtml } = buildDocumentHtml(input));
  } else {
    ({ fullHtml, headerHtml, footerHtml } = buildDocumentHtml(input));
  }

  // Per-render temp profile. Launching Chrome/Edge against the default profile while
  // the user already has that browser open makes the new process hand off to the
  // running instance and never open a CDP endpoint — the cause of the old
  // "Timed out after waiting 30000/45000ms" hangs. A fresh profile sidesteps the
  // singleton lock and lets concurrent renders coexist safely.
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jimskay-pdf-'));

  let browser;
  try {
    const resolved = await resolvePdfBrowserExecutable();
    console.log(`[PDF-ENGINE] rendering with ${resolved.executablePath}`);
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        ...resolved.chromiumArgs,
        `--user-data-dir=${tempProfileDir}`,
      ],
      defaultViewport: { width: 1240, height: 1754 },
      executablePath: resolved.executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Print-safe: shrink any display math wider than its block so long equations
    // never clip horizontally (overflow-x is not scrollable in a PDF).
    await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.math-block'));
      for (const b of blocks) {
        const katexEl = (b.querySelector('.katex-display .katex') || b.querySelector('.katex')) as HTMLElement | null;
        if (!katexEl) continue;
        const avail = b.clientWidth - 20;
        const need = b.scrollWidth;
        if (need > avail && need > 0) {
          // Scale the whole display down so a long equation fits the band; keep
          // a sensible floor so it never becomes unreadable, but go low enough
          // that multi-step `\xrightarrow{...}` chains are not clipped mid-arrow.
          const base = parseFloat(getComputedStyle(katexEl).fontSize);
          katexEl.style.fontSize = `${Math.max((base * avail) / need, base * 0.32)}px`;
        }
      }
    });

    // Use Chromium's native running header/footer layer as a second line of
    // defence. The document itself still contains the publication header, while
    // this layer provides reliable page numbers/date even when a document spans
    // many pages. The previous engine built headerHtml/footerHtml but never
    // enabled them, so the page-number UI was effectively dead code.
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerHtml,
      footerTemplate: footerHtml,
      margin: { top: '15mm', bottom: '21mm', left: '15mm', right: '15mm' },
      preferCSSPageSize: true,
    });

    return {
      base64Data: Buffer.from(pdfBuffer).toString('base64'),
      filename: safeFilename,
    };
  } catch (err: any) {
    console.error('PDF GENERATION ERROR:', err);
    throw new Error(`PDF Generation Failed: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    // Best-effort cleanup of the per-render temp profile so repeated renders
    // never leak Chromium user-data dirs.
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

export { PdfInputSchema, processMathAndChem, buildDocumentHtml, buildXeLatexSource };
export type { PdfInput };
