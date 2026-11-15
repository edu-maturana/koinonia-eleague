// Contracciones del español para textos armados con apodos ("el Lado Oscuro"): "a el" → "al", "de el" → "del".
// Igual que en la API (cheeto, src/lib/spanish.js): solo con el artículo en minúscula ("de El Tanque FC", nombre propio,
// queda igual) y, en titulares en mayúsculas, "A EL" / "DE EL". La preposición tiene que ser palabra suelta ("Poruña el" no cuenta).
const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';
const rules = [
  ['de el', 'del'], ['De el', 'Del'], ['a el', 'al'], ['A el', 'Al'], ['DE EL', 'DEL'], ['A EL', 'AL'],
].map(([from, to]) => [new RegExp(`${BEFORE}${from}${AFTER}`, 'gu'), to]);

export function contract(text) {
  return rules.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), String(text ?? ''));
}

/** "a" + "el Lado Oscuro" → "al Lado Oscuro"; como es un apodo, también con mayúscula: "de" + "El Tranque" → "del Tranque". */
export function withPreposition(preposition, label) {
  const text = String(label ?? '').trim();
  const match = /^el\s+(.+)$/i.exec(text);
  if (!match || !['a', 'de'].includes(preposition.toLowerCase())) return `${preposition} ${text}`;
  const upper = preposition === preposition.toUpperCase() && text === text.toUpperCase();
  return `${upper ? `${preposition}L` : `${preposition}l`} ${match[1]}`;
}
