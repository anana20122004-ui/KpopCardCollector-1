export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeLyricAnswer(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
