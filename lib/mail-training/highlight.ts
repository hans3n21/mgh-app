import type { Annotation } from './contracts';

export function highlightSegments(text: string, annotations: Annotation[]) {
  const bounds = Array.from(new Set([0, text.length, ...annotations.flatMap(a => [a.start, a.end])]))
    .filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  return bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1],
    ids: annotations.filter(a => !a.dismissed && a.start <= start && a.end >= bounds[i + 1]).map(a => a.id) }));
}
