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
