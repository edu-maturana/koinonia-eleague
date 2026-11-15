export function matchRoundLabel(match, { leagueRound = 'FECHA' } = {}) {
  if (match.stage === 'playoffs') {
    const slot = match.bracketSlot ?? match.bracket_slot ?? '';
    if (slot.startsWith('PI')) return `PLAYOFFS · PLAY-IN ${slot.slice(2)}`;
    if (slot.startsWith('QF')) return `PLAYOFFS · CUARTOS ${slot.slice(2)}`;
    if (slot.startsWith('SF')) return `PLAYOFFS · SEMIFINAL ${slot.slice(2)}`;
    if (slot.startsWith('F')) return 'PLAYOFFS · FINAL';
    return 'PLAYOFFS';
  }
  // Copa Grande Giocatore (y otras copas a partido único con cuadro QF/SF/F).
  if (match.stage === 'knockout') {
    const slot = match.bracketSlot ?? match.bracket_slot ?? '';
    if (slot.startsWith('QF')) return `CUARTOS ${slot.slice(2)}`;
    if (slot.startsWith('SF')) return `SEMIFINAL ${slot.slice(2)}`;
    if (slot === 'F') return 'FINAL';
  }
  const group = match.groupLabel ?? match.group_label;
  if (group) return `GRUPO ${group}`;
  return `${leagueRound} ${match.roundNumber ?? match.round_number ?? '—'}`;
}

/**
 * Orden de los partidos por jugar: primero el que se está jugando y después por día del calendario y fecha. La copa se sortea
 * al arrancar la liga con sus cuartos `pending` y ronda 1, pero se juega en su día (`calendarDay`): sin ese orden quedaba
 * arriba de la fecha de liga que de verdad viene.
 */
export function compareUpcoming(left, right) {
  const live = match => (match.status === 'live' ? 0 : 1);
  const big = Number.MAX_SAFE_INTEGER;
  return live(left) - live(right)
    || (left.calendarDay ?? big) - (right.calendarDay ?? big)
    || (left.roundNumber ?? big) - (right.roundNumber ?? big)
    || String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? ''));
}

/** Del más reciente al más antiguo. */
export const compareRecent = (left, right) => String(right.finishedAt ?? '').localeCompare(String(left.finishedAt ?? ''));

/** Etiqueta corta de la competición de un partido para listas mezcladas: "Copa GG · Final", "Gira", "Liga · Fecha 9". */
export function competitionTag(match) {
  const name = match.tournament?.name ?? '';
  if (match.stage === 'preseason') return 'Gira';
  if (match.stage === 'knockout') return `${/giocatore/i.test(name) ? 'Copa GG' : 'Copa'} · ${titleCase(matchRoundLabel(match))}`;
  if (match.stage === 'playoffs') return titleCase(matchRoundLabel(match));
  return `Liga · ${titleCase(matchRoundLabel(match))}`;
}

const titleCase = text => text.toLowerCase().replace(/(^|[\s·-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
