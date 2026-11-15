import { newsTemplates } from './newsTemplates.js';
import { getNewsImage } from './newsImageSelector.js';
import { deterministicItem, hashString } from './deterministic.js';
import { contract } from '../../utils/spanish.js';

export { deterministicItem, hashString } from './deterministic.js';

const categories = {
  victory: new Set(['narrow', 'normal', 'big']),
  defeat: new Set(['narrow', 'normal', 'big']),
  draw: new Set(['goalless', 'normal', 'crazy']),
  transfer: new Set(['arrival', 'departure', 'move']),
  sanction: new Set(['player', 'club']),
};

const hasValue = value => value !== undefined && value !== null && value !== '';
const numericScore = value => hasValue(value) && Number.isFinite(Number(value)) ? Number(value) : null;

// "a el Lado Oscuro" → "al Lado Oscuro" cuando el valor insertado es un apodo.
export function fillTemplate(text, values) {
  return contract(text.replace(/\{(\w+)\}/g, (placeholder, key) => hasValue(values[key]) ? String(values[key]) : placeholder));
}

export function classifyMatchResult(event) {
  const goalsFor = numericScore(event?.golesEquipo);
  const goalsAgainst = numericScore(event?.golesRival);
  if (goalsFor === null || goalsAgainst === null || goalsFor < 0 || goalsAgainst < 0) return null;

  const difference = goalsFor - goalsAgainst;
  const totalGoals = goalsFor + goalsAgainst;
  if (difference > 0) {
    if (difference === 1) return { type: 'victory', subtype: 'narrow' };
    if (difference >= 3) return { type: 'victory', subtype: 'big' };
    return { type: 'victory', subtype: 'normal' };
  }
  if (difference < 0) {
    if (Math.abs(difference) === 1) return { type: 'defeat', subtype: 'narrow' };
    if (Math.abs(difference) >= 3) return { type: 'defeat', subtype: 'big' };
    return { type: 'defeat', subtype: 'normal' };
  }
  if (goalsFor === 0) return { type: 'draw', subtype: 'goalless' };
  if (totalGoals >= 6) return { type: 'draw', subtype: 'crazy' };
  return { type: 'draw', subtype: 'normal' };
}

function classificationOf(event) {
  if (categories[event?.type]?.has(event?.subtype)) return { type: event.type, subtype: event.subtype };
  if (event?.kind === 'match' || event?.sourceType === 'match' || hasValue(event?.golesEquipo) || hasValue(event?.golesRival)) {
    return classifyMatchResult(event);
  }
  return null;
}

function normalizeTemplate(candidate) {
  return typeof candidate === 'string' ? { text: candidate, requires: [] } : candidate;
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
}

function eligibleTemplates(candidates, values) {
  return candidates.map(normalizeTemplate).filter(candidate => {
    const requirements = new Set([...(candidate.requires ?? []), ...placeholders(candidate.text)]);
    return [...requirements].every(key => hasValue(values[key]));
  });
}

function selectText(candidates, values, seed, offset) {
  const selected = deterministicItem(eligibleTemplates(candidates, values), seed, offset);
  return selected ? fillTemplate(selected.text, values) : null;
}

export function generateNews(event) {
  if (!event || !hasValue(event.id)) return null;
  const classification = classificationOf(event);
  if (!classification) return null;

  const { type, subtype } = classification;
  const templates = newsTemplates[type]?.[subtype];
  if (!templates) return null;

  const label = selectText(templates.labels, event, event.id, 1);
  const headline = selectText(templates.headlines, event, event.id, 2);
  const body = selectText(templates.bodies, event, event.id, 3);
  if (!label || !headline || !body) return null;

  const image = getNewsImage({ id: event.id, type, subtype });
  return { id: event.id, type, subtype, label, headline, body, image };
}
