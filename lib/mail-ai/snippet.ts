/** Satz um eine Stelle herum, damit man ohne Mail oeffnen sieht, worauf sich ein Vorschlag stuetzt. */
export function snippetAround(text: string, start: number, end: number) {
  const headStart = Math.max(0, start - 120);
  const head = text.slice(headStart, start);
  const cut = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'), head.lastIndexOf('\n'));
  const from = headStart + (cut >= 0 ? cut + 1 : 0);
  const rest = text.slice(end).search(/[.!?\n]/);
  const to = Math.min(text.length, end + 120, rest < 0 ? text.length : end + rest + 1);
  return { before: text.slice(from, start).trimStart(), match: text.slice(start, end), after: text.slice(end, to).trimEnd() };
}
