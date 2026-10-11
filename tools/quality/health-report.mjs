const advisory = 'These measurements support review and do not block merging. Required behavior can legitimately increase complexity; review the changes and their rationale.';
const safe = value => String(value).replace(/[\r\n|`]/g, ' ');

export function comparable(before, after) {
  if (!before?.available || !after?.available) return 'Missing or failed measurement';
  if (before.schema !== after.schema || before.tool.version !== after.tool.version
    || before.tool.configHash !== after.tool.configHash || before.input.scope !== after.input.scope) {
    return 'Tool version, configuration, schema or source scope differs';
  }
  const dimensions = report => report.health.dimensions.filter(item => item.score != null)
    .map(item => item.id).sort().join(',');
  if (dimensions(before) !== dimensions(after)) return 'Scoring dimensions differ';
  return undefined;
}

export function assessment(oldValue, newValue, higher = false) {
  if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) return '⚪ Unavailable';
  if (newValue === oldValue) return '🟡 Unchanged';
  return (newValue > oldValue) === higher ? '🟢 Improved' : '🔴 Regressed';
}

function appendFileTable(output, report) {
  output.push('### Complexity hotspots', '', '| File | Complexity |', '| --- | --- |');
  for (const file of report.complexity.files.slice(0, 5)) {
    output.push(`| ${safe(file.path)} | ${file.complexity} |`);
  }
  if (!report.complexity.files.length) output.push('| No reported hotspots | n/a |');
  output.push('', '### Dead-code findings (heuristic)', '',
    '| File | Finding | Line | Confidence |', '| --- | --- | --- | --- |');
  for (const finding of report.deadCode.findings.slice(0, 5)) {
    output.push(`| ${safe(finding.path)} | ${safe(finding.category)} | ${finding.start.line} | ${finding.confidence}% |`);
  }
  if (!report.deadCode.findings.length) output.push('| No reported findings in supported inputs | n/a | n/a | n/a |');
  output.push('');
  if (!report.mcp.refresh.duplications.length) return;
  output.push('### Duplication locations', '',
    '| File | Line | Shared with | Lines |', '| --- | --- | --- | --- |');
  for (const clone of report.mcp.refresh.duplications.slice(0, 10)) {
    output.push(`| ${safe(clone.fileA)} | ${clone.startA} | ${safe(clone.fileB)}:${clone.startB} | ${clone.lines} |`);
  }
  output.push('');
}

function appendMetrics(output, before, after, development) {
  const rows = [];
  function add(label, oldValue, newValue, unit = '', higher = false, neutral = false) {
    const valid = Number.isFinite(oldValue) && Number.isFinite(newValue);
    const delta = valid ? newValue - oldValue : undefined;
    const change = valid ? `${delta > 0 ? '+' : ''}${Number(delta.toFixed(10))}${unit === '%' ? ' pp' : unit}` : 'n/a';
    const status = neutral && valid ? '⚪ Context' : assessment(oldValue, newValue, higher);
    rows.push({ label, status });
    output.push(`| ${label} | ${valid ? oldValue + unit : 'n/a'} | ${valid ? newValue + unit : 'n/a'} | ${change} | ${status} |`);
  }
  const overall = assessment(before.health.score, after.health.score, true);
  const headings = development
    ? '| Metric | Baseline | Saved working tree | Change | Assessment |'
    : '| Metric | Before merge | After merge | Change | Assessment |';
  output.push(`Overall health: **${overall}**.`, '',
    headings,
    '| --- | --- | --- | --- | --- |');
  add('Overall health (0–100)', before.health.score, after.health.score, '', true);
  for (const id of ['duplication', 'complexity', 'dead-code']) {
    const left = before.health.dimensions.find(item => item.id === id);
    const right = after.health.dimensions.find(item => item.id === id);
    add(`${id} score (0–100)`, left?.score, right?.score, '', true);
    if (id !== 'duplication') add(`${id} share`, left?.value, right?.value, '%');
    if (id === 'dead-code') add('Dead-code analysis coverage', left?.coverage, right?.coverage, '%', false, true);
  }
  const left = before.mcp.statistics.statistics.total;
  const right = after.mcp.statistics.statistics.total;
  add('Duplication', left.percentage, right.percentage, '%');
  add('Duplicated lines', left.duplicatedLines, right.duplicatedLines);
  add('Clones', left.clones, right.clones);
  const maxComplexity = report => Math.max(...report.complexity.files.map(file => file.complexity));
  add('Maximum file complexity', maxComplexity(before), maxComplexity(after));
  add('Dead-code findings (heuristic)', before.deadCode.findings.length, after.deadCode.findings.length);
  add('Analyzed files', left.sources, right.sources, '', false, true);
  add('Analyzed lines', left.lines, right.lines, '', false, true);
  return { overall, rows };
}

function comparisonProblem({ available, reason, before, after, identity }) {
  if (!available) return reason || 'Missing or failed measurement';
  const mismatch = comparable(before, after);
  if (mismatch) return mismatch;
  if (identity && (identity.kind !== 'pr-merge'
    || before.identity.commit !== identity.base
    || after.identity.base !== identity.base || after.identity.head !== identity.head
    || after.identity.candidate !== identity.candidate)) {
    return 'Conflicting PR measurement identity; regenerate for the current target and head';
  }
  return undefined;
}

function appendRegressions(output, rows, overall) {
  const regressions = rows.filter(row => row.status.includes('Regressed')).map(row => row.label);
  const improvements = rows.some(row => row.status.includes('Improved'));
  if (regressions.length) {
    const decline = overall.includes('Regressed') ? '**Overall health declined.** ' : '';
    const mixed = improvements ? '🟡 Mixed results. ' : '';
    output.push(decline + mixed + 'Regressions: ' + regressions.join(', ') + '.',
      'Rationale: explain the required behavior and tradeoffs for these increases before publishing.', '');
  }
  if (rows.some(row => row.status.includes('Unavailable'))) {
    output.push('Unavailable dimensions are unsupported or were not measurable; n/a does not mean clean code.', '');
  }
}

function appendClones(output, clones) {
  if (!clones.length) output.push('- No reported clones.');
  for (const clone of clones.slice(0, 10)) {
    output.push(`- ${safe(clone.fileA)}:${clone.startA} ↔ ${safe(clone.fileB)}:${clone.startB} (${clone.lines} lines).`);
  }
}

export function renderComparison(comparison, { compact = Boolean(comparison.identity) } = {}) {
  const { before, after, identity } = comparison;
  const reason = comparisonProblem(comparison);
  const output = ['## Code health', ''];
  if (reason) {
    output.push(`⚪ **Unavailable**: ${safe(reason)}.`, '');
    if (!compact) output.push(advisory, '');
    return output.join('\n');
  }
  if (compact && identity) {
    output.push(`Target commit: ${identity.base}; PR head: ${identity.head}; candidate merge tree: ${identity.candidate}.`, '');
  }
  const { overall, rows } = appendMetrics(output, before, after, !compact && !identity);
  if (compact) {
    output.push('');
    appendFileTable(output, after);
    return output.join('\n');
  }
  output.push('');
  appendRegressions(output, rows, overall);
  output.push(advisory, '', 'Measurement identity:', '',
    `- jscpd ${before.tool.version}; configuration SHA-256: ${before.tool.configHash}.`,
    `- Scope: ${safe(before.input.scope)}; exclusions: ${before.tool.config.ignore.map(safe).join(', ')}.`,
    `- Before source SHA-256: ${before.input.hash}; after: ${after.input.hash}.`);
  if (identity) {
    output.push(`- Target commit: ${identity.base}; PR head: ${identity.head}; candidate merge tree: ${identity.candidate}.`);
  } else {
    output.push(`- Development baseline: ${safe(JSON.stringify(before.identity))}; current: ${safe(JSON.stringify(after.identity))}.`,
      '- Working-tree measurements; these are not staged hook evidence or PR merge measurements.');
  }
  output.push('', 'Complexity hotspots after the change:', '');
  for (const file of after.complexity.files.slice(0, 5)) {
    output.push(`- ${safe(file.path)}: complexity ${file.complexity}.`);
  }
  output.push('', 'Affected clone files after the change:', '');
  appendClones(output, after.mcp.refresh.duplications);
  const oldClones = before.mcp.refresh.duplications;
  if (oldClones.length) {
    output.push('', 'Clone locations before the change:', '');
    appendClones(output, oldClones);
  }
  output.push('', 'Dead-code findings after the change (inspect confidence):', '');
  if (!after.deadCode.findings.length) output.push('- No reported findings in supported inputs.');
  for (const finding of after.deadCode.findings.slice(0, 5)) {
    output.push(`- ${safe(finding.path)}:${finding.start.line}: ${safe(finding.category)} (${finding.confidence}% confidence).`);
  }
  output.push('', 'Limitations: ' + after.limitations.join(' '), '',
    'Detailed machine-readable findings are retained under `quality-reports/health/`.', '');
  return output.join('\n');
}
