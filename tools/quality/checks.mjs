import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: true });
const binaryExtensionPattern = /\.(png|jpe?g|gif|ico|pdf|woff2?|zip)$/i;

export function isText(name, bytes) {
  return !bytes.includes(0) && !binaryExtensionPattern.test(name);
}

// Filenames must work on Windows and on case-insensitive filesystems.
export function filenameFindings(files) {
  const findings = [];
  // Exact language:fail pattern from pre-commit-hooks v6.0.0.
  const illegalWindows = /(^|\/)(CON|PRN|AUX|NUL|COM[\d¹²³]|LPT[\d¹²³])(\.|\/|$)|[<>:"\\|?*\x00-\x1F]|\/[^/]*[.\s]\/|[^/]*[.\s]$/i;
  const names = new Map();
  for (const name of files) {
    if (illegalWindows.test(name)) {
      findings.push({
        check: 'windows-names', file: name, rule: 'check-illegal-windows-names',
        message: 'Illegal Windows filename; rename the path.',
      });
    }
    const parts = name.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      const previous = names.get(prefix.toLowerCase());
      if (previous && previous !== prefix) {
        findings.push({
          check: 'case-conflict', file: name, rule: 'case-conflict',
          message: `Path case conflicts: ${previous} and ${prefix}`,
        });
      }
      names.set(prefix.toLowerCase(), prefix);
    }
  }
  return findings;
}

// The index uses normalized LF; batch files in the working tree use CRLF.
export function textFindings(name, bytes, normalizedIndex = false) {
  if (!isText(name, bytes)) return [];
  const findings = [];
  const text = bytes.toString('utf8');
  const add = (line, rule, message) => findings.push({ check: 'repository', file: name, line, rule, message });
  if (text.startsWith('\uFEFF')) add(1, 'bom', 'Remove the UTF-8 byte order mark.');
  const crlf = !normalizedIndex && /\.(bat|cmd)$/i.test(name);
  if (crlf ? /(?<!\r)\n|\r(?!\n)/.test(text) : text.includes('\r')) {
    add(1, 'line-ending', `Expected ${crlf ? 'CRLF' : 'LF'} line endings.`);
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/[\t ]+$/.test(line)) add(i + 1, 'trailing-whitespace', 'Remove trailing spaces or tabs.');
  });
  if (text && !text.endsWith('\n')) add(lines.length, 'final-newline', 'Add a final newline.');
  if (/\n\r?\n$/.test(text)) add(lines.length - 1, 'final-newline', 'Remove extra blank lines at EOF.');
  return findings;
}

export function diagrams(name, text) {
  return markdown.parse(text, {})
    .filter(token => token.type === 'fence' && token.info.trim() === 'mermaid')
    .map(token => ({ file: name, line: token.map[0] + 1, source: token.content }));
}

// GitHub-style heading anchors include suffixes for repeated headings.
function headingIds(text) {
  const ids = new Set();
  const counts = new Map();
  const tokens = markdown.parse(text, {});
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return;
    const content = tokens[i + 1].children
      .filter(child => ['text', 'code_inline'].includes(child.type))
      .map(child => child.content).join('');
    const base = content.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(base) || 0;
    ids.add(count ? `${base}-${count}` : base);
    counts.set(base, count + 1);
  });
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

export function linkFindings(root, name, text, files) {
  const targets = repositoryTargets(files);
  return markdownLinks(text).flatMap(({ href, line }) => {
    const message = localLinkError(root, name, href, targets);
    return message ? [{ check: 'local-links', file: name, line, rule: 'local-link', message }] : [];
  });
}

function repositoryTargets(files) {
  const targets = new Set([...files, '.']);
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) targets.add(parts.slice(0, i).join('/'));
  }
  return targets;
}

function localLinkError(root, name, href, targets) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null;
  // Split URL delimiters before decoding: %23 and %3F may belong to a filename.
  const [targetWithQuery, rawFragment = ''] = href.split(/#(.*)/s);
  const target = decodeLinkPart(targetWithQuery.split('?')[0]);
  const fragment = decodeLinkPart(rawFragment);
  const directory = target.startsWith('/') ? '' : path.posix.dirname(name);
  const resolved = target
    ? path.posix.normalize(path.posix.join(directory, target.replace(/^\//, ''))).replace(/\/$/, '')
    : name;
  if (resolved.startsWith('../') || !targets.has(resolved)) {
    return `Missing repository target: ${href}`;
  }
  if (fragment && /\.md$/i.test(resolved)) {
    const contents = fs.readFileSync(path.join(root, resolved), 'utf8');
    if (!headingIds(contents).has(fragment)) return `Missing heading/anchor: ${href}`;
  }
  return null;
}

function decodeLinkPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function markdownLinks(text) {
  const links = [];
  let lastLine = 1;
  for (const token of markdown.parse(text, {})) {
    const line = token.map ? token.map[0] + 1 : lastLine;
    lastLine = line;
    for (const child of token.children || []) {
      if (child.type === 'link_open') links.push({ href: child.attrGet('href'), line });
      if (child.type === 'image') links.push({ href: child.attrGet('src'), line });
    }
    // MarkdownIt resolves inline/reference links; HTML targets need explicit coverage.
    if (token.type === 'html_block' || token.children?.some(child => child.type === 'html_inline')) {
      for (const match of token.content.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
        links.push({ href: match[1], line });
      }
    }
  }
  return links;
}
