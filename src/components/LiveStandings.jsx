import { EntityLink } from './EntityLink.jsx';

export function LiveTableStatus({ rows = [] }) {
  const live = rows.some(row => row.hasLiveMatches);
  return live ? <small className="live-table-status" role="status"><i aria-hidden="true"/>TABLA EN VIVO</small> : null;
}

export function LivePosition({ position }) {
  return <span className="live-position">{position}</span>;
}

const places = count => `${count} ${count === 1 ? 'puesto' : 'puestos'}`;

export function LiveMovement({ row }) {
  if (!row.hasLiveMatches) return null;
  const change = Number(row.positionChange ?? 0);
  if (!change) return <span className="live-movement" aria-hidden="true"/>;
  const up = change > 0;
  const label = up ? `Sube ${places(change)} provisionalmente` : `Baja ${places(Math.abs(change))} provisionalmente`;
  const path = up ? 'M2 8 L6 4 L10 8' : 'M2 4 L6 8 L10 4';
  return <span className={`live-movement ${up ? 'up' : 'down'}`} aria-label={label}><svg viewBox="0 0 12 12" aria-hidden="true"><path d={path}/></svg></span>;
}

/**
 * Cuántos puestos se movió el club desde la fecha anterior (sale de la evolución de la tabla). Con partidos en vivo manda la
 * flecha provisional de LiveMovement, así no se muestran dos flechas distintas.
 */
export function RoundMovement({ movement }) {
  if (movement == null) return null;
  const value = Number(movement);
  if (!value) return <span className="round-movement same" title="Mismo puesto que en la fecha anterior" aria-label="Mismo puesto que en la fecha anterior">–</span>;
  const up = value > 0;
  const label = `${up ? 'Subió' : 'Bajó'} ${places(Math.abs(value))} desde la fecha anterior`;
  return <span className={`round-movement ${up ? 'up' : 'down'}`} title={label} aria-label={label}><span aria-hidden="true">{up ? '▲' : '▼'}{Math.abs(value)}</span></span>;
}

/** La flecha que corresponde a la fila: la provisional si hay partidos en vivo, si no la de la última fecha. */
export function RowMovement({ row, progressionTeam }) {
  if (row.hasLiveMatches) return <LiveMovement row={row}/>;
  return progressionTeam ? <RoundMovement movement={progressionTeam.movement}/> : null;
}

const RESULT_WORD = { G: 'ganó', E: 'empató', P: 'perdió' };

const competitionOf = entry => {
  if (entry.stage === 'playoffs') return 'Playoffs';
  if (entry.stage === 'knockout') return /giocatore/i.test(entry.tournamentName ?? '') ? 'Copa GG' : 'Copa';
  return `Liga · Fecha ${entry.round ?? '—'}`;
};

/**
 * Forma del club: sus últimos 5 partidos oficiales (liga, playoffs y copa), en el orden en que se jugaron; el más reciente a la
 * derecha y marcado. Es la misma en toda la web: la calcula el servidor (`form`), este es el único lugar que la dibuja.
 * `size` "lg" es para fichas y portadas; `linkMatches` hace que cada chip lleve al partido.
 */
export function FormChips({ form = [], size = 'sm', linkMatches = false }) {
  if (!form.length) return <span className="form-chips is-empty" aria-label="Sin partidos oficiales jugados">—</span>;
  const summary = form.map(entry => entry.result).join(', ');
  const label = `Últimos ${form.length} partidos oficiales (liga, playoffs y copa), el más reciente a la derecha: ${summary}`;
  return <span className={`form-chips form-chips--${size}`} role={linkMatches ? 'group' : 'img'} aria-label={label} title="Últimos 5 oficiales (liga, playoffs y copa), el más reciente a la derecha">
    {form.map((entry, index) => {
      const latest = index === form.length - 1;
      const className = `form-chip is-${entry.result}${latest ? ' is-latest' : ''}`;
      const title = `${competitionOf(entry)}: ${RESULT_WORD[entry.result]} ${entry.goalsFor}-${entry.goalsAgainst} ${entry.home ? 'ante' : 'en casa de'} ${entry.opponentName ?? 'su rival'}${latest ? ' (el más reciente)' : ''}`;
      return linkMatches
        ? <EntityLink to="match" id={entry.matchId} key={entry.matchId} className={className} title={title}>{entry.result}</EntityLink>
        : <i key={entry.matchId} className={className} title={title}>{entry.result}</i>;
    })}
  </span>;
}

// Clase de cada zona: las de pase directo (semis, cuartos o la semifinal directa) en verde y el play-in en azul.
const ZONE_CLASS = { playin: 'is-playin' };
const zoneClass = kind => ZONE_CLASS[kind] ?? 'is-qualified';

/**
 * Zonas de la tabla según el formato real del torneo (lo informa el servidor en `progression.zones`), nunca según cuántas filas hay:
 * el v11 clasificó 8 a cuartos y el formato de hoy da semifinal directa al 1.º y 2.º y play-in del 3.º al 6.º.
 * Los clubes retirados de los playoffs no ocupan cupo: los de abajo suben. Devuelve un Map team_id → clase.
 */
export function tableZones(rows = [], format = null) {
  const zones = format?.zones ?? [];
  const withdrawn = new Set(format?.withdrawnTeamIds ?? []);
  const result = new Map();
  let rank = 0;
  for (const row of rows) {
    const teamId = row.team_id ?? row.id;
    if (withdrawn.has(teamId)) { result.set(teamId, 'is-withdrawn'); continue; }
    rank += 1;
    const zone = zones.find(item => rank >= item.from && rank <= item.to);
    result.set(teamId, zone ? zoneClass(zone.kind) : '');
  }
  return result;
}

export function PlayoffLegend({ format }) {
  const zones = format?.zones ?? [];
  if (!zones.length) return null;
  const span = zone => (zone.from === zone.to ? `${zone.from}.º` : `${zone.from}.º–${zone.to}.º`);
  return <p className="playoff-legend" aria-label="Zonas de clasificación">
    {zones.map(zone => <span key={zone.kind} className={zone.kind === 'playin' ? 'legend-playin' : 'legend-qualified'}>{span(zone)} {zone.label}</span>)}
    {(format?.withdrawnTeamIds ?? []).length > 0 && <span className="legend-withdrawn">RETIRADO DE LOS PLAYOFFS</span>}
  </p>;
}

export function liveRowClass(row, extra = '') {
  const movement = Number(row.positionChange ?? 0);
  return [extra, row.isPlayingLive ? 'is-playing-live' : '', movement > 0 ? 'position-up' : movement < 0 ? 'position-down' : ''].filter(Boolean).join(' ');
}
