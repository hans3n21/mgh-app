/**
 * Minimal Markdown → HTML converter for KI-Ausgaben.
 * Unterstützt: Überschriften (##/###), Bold, Bullet-Listen, nummerierte Listen, Paragraphen.
 * Kein XSS-Risiko da nur für KI-generierte, bereits de-anonymisierte Texte.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inUl = false;
  let inOl = false;

  function closeList() {
    if (inUl) { output.push('</ul>'); inUl = false; }
    if (inOl) { output.push('</ol>'); inOl = false; }
  }

  function inlineFormat(s: string): string {
    return s
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-800 px-1 rounded text-xs">$1</code>');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H2
    if (/^## (.+)/.test(line)) {
      closeList();
      output.push(`<h2 class="text-sm font-semibold text-slate-100 mt-3 mb-1">${inlineFormat(line.replace(/^## /, ''))}</h2>`);
      continue;
    }

    // H3
    if (/^### (.+)/.test(line)) {
      closeList();
      output.push(`<h3 class="text-xs font-semibold text-slate-200 mt-2 mb-0.5 uppercase tracking-wide">${inlineFormat(line.replace(/^### /, ''))}</h3>`);
      continue;
    }

    // Bullet list
    if (/^[-*] (.+)/.test(line)) {
      if (!inUl) { output.push('<ul class="list-disc pl-4 space-y-0.5 my-1">'); inUl = true; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(`<li class="text-sm text-slate-200">${inlineFormat(line.replace(/^[-*] /, ''))}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+\. (.+)/.test(line)) {
      if (!inOl) { output.push('<ol class="list-decimal pl-4 space-y-0.5 my-1">'); inOl = true; }
      if (inUl) { output.push('</ul>'); inUl = false; }
      output.push(`<li class="text-sm text-slate-200">${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      output.push('<hr class="border-slate-700 my-2" />');
      continue;
    }

    // Empty line → paragraph break
    if (line.trim() === '') {
      closeList();
      output.push('<div class="h-1.5"></div>');
      continue;
    }

    // Normal paragraph line
    closeList();
    output.push(`<p class="text-sm text-slate-200 leading-relaxed">${inlineFormat(line)}</p>`);
  }

  closeList();
  return output.join('\n');
}
