import { useMemo, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { EntityLink } from '../../../components/EntityLink.jsx';
import { PlayerFace } from '../../../components/PlayerFace.jsx';
import { TeamMark } from '../../../components/TeamMark.jsx';
import { DataState, OverallBadge, gp } from '../DataStates.jsx';
import { useApiQuery } from '../useApiQuery.js';
import { useAutoRefresh } from './PollsSection.jsx';

// Todos los movimientos cerrados de la liga (no solo los de tu club), con cara, escudos y montos.
const PAGE = 40;

const KIND = {
  transfer: 'TRASPASO', trade: 'TRUEQUE', purchase: 'FICHAJE', assignment: 'ASIGNADO', loan: 'PRÉSTAMO',
  release: 'LIBERADO', termination: 'DESPEDIDO', lapsed: 'CONTRATO VENCIDO',
};
const FILTERS = [
  { id: 'todos', label: 'Todos', types: null },
  { id: 'traspasos', label: 'Traspasos', types: ['transfer'] },
  { id: 'trueques', label: 'Trueques', types: ['trade'] },
  { id: 'fichajes', label: 'Fichajes', types: ['purchase', 'assignment'] },
  { id: 'prestamos', label: 'Préstamos', types: ['loan'] },
  { id: 'salidas', label: 'Salidas', types: ['release', 'termination', 'lapsed'] },
];

// Las fechas del registro vienen sin zona ("2026-11-13 11:52:23", en UTC) o en ISO.
const parseDate = value => {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/[TZ]/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const dayKey = date => (date ? date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) : 'sin-fecha');
const dayLabel = date => (date ? date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).toUpperCase() : 'SIN FECHA');
const hourLabel = date => (date ? date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '');

const norm = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function Club({ team, fallback }) {
  if (!team) return <span className="lm-club is-none"><span className="lm-club-mark" aria-hidden="true">{fallback === 'libre' ? '🆓' : '✨'}</span><span>{fallback === 'libre' ? 'AGENTE LIBRE' : 'NUEVO'}</span></span>;
  return <EntityLink to="team" id={team.id} className="lm-club"><TeamMark team={team}/><span>{team.name}</span></EntityLink>;
}

function Player({ player }) {
  return <EntityLink to="player" id={player?.id} className="lm-player">
    <PlayerFace src={player?.faceUrl} name={player?.name}/>
    <span><b>{player?.name ?? 'JUGADOR'}</b><small>{player?.position ?? ''}{player?.overall != null && <OverallBadge value={player.overall}/>}</small></span>
  </EntityLink>;
}

function amountOf(move) {
  if (move.type === 'trade') {
    const extra = [move.gpPaid ? `${move.fromTeam?.name} pone ${gp(move.gpPaid)}` : null, move.gpReceived ? `${move.toTeam?.name} pone ${gp(move.gpReceived)}` : null].filter(Boolean);
    return extra.length ? extra.join(' · ') : 'Mano a mano';
  }
  if (move.type === 'assignment') return 'Sin costo';
  if (move.type === 'lapsed') return 'Se fue libre';
  if (move.type === 'termination') return move.gpAmount ? `Indemnización ${gp(move.gpAmount)}` : 'Sin indemnización';
  if (move.type === 'release') return `El club recibe ${gp(move.gpAmount)}`;
  if (move.type === 'loan') {
    const parts = [move.gpAmount ? `Cuota ${gp(move.gpAmount)}` : 'Sin cuota', move.buyPrice ? `opción de compra ${gp(move.buyPrice)}` : null];
    return parts.filter(Boolean).join(' · ');
  }
  return gp(move.gpAmount);
}

const LOAN_STATUS = { active: 'EN CURSO', returned: 'YA VOLVIÓ', bought: 'LO COMPRARON' };

function MoveCard({ move }) {
  const date = parseDate(move.date);
  const head = <header className="lm-head">
    <b className={`lm-kind kind-${move.type}`}>{KIND[move.type] ?? move.type.toUpperCase()}</b>
    {move.type === 'loan' && LOAN_STATUS[move.loanStatus] && <small className="lm-tag">{LOAN_STATUS[move.loanStatus]}</small>}
    {move.bundleId && <small className="lm-tag">ACUERDO COMPUESTO</small>}
    {move.type === 'purchase' && <small className="lm-tag">{move.origin === 'new' ? 'NUEVO EN LA LIGA' : 'AGENTE LIBRE'}</small>}
    <time dateTime={date?.toISOString()}>{hourLabel(date)}</time>
  </header>;
  if (move.type === 'trade') {
    // fromTeam recibe a `player` y entrega a `givenPlayer`.
    return <article className="lm-card is-trade">
      {head}
      <div className="lm-trade">
        <div className="lm-side"><Player player={move.givenPlayer}/><span className="lm-to">→ <Club team={move.toTeam}/></span></div>
        <span className="lm-swap" aria-label="a cambio de">⇄</span>
        <div className="lm-side"><Player player={move.player}/><span className="lm-to">→ <Club team={move.fromTeam}/></span></div>
      </div>
      <p className="lm-amount">{amountOf(move)}</p>
    </article>;
  }
  const outbound = ['release', 'termination', 'lapsed'].includes(move.type);
  const origin = move.type === 'purchase' || move.type === 'assignment' ? (move.origin === 'new' ? 'nuevo' : 'libre') : 'libre';
  return <article className={`lm-card ${outbound ? 'is-out' : ''}`}>
    {head}
    <Player player={move.player}/>
    <div className="lm-route">
      <Club team={move.fromTeam} fallback={origin}/>
      <span className="lm-arrow" aria-label="hacia">→</span>
      <Club team={move.toTeam} fallback="libre"/>
    </div>
    <p className="lm-amount">{amountOf(move)}</p>
  </article>;
}

export function LeagueMovesSection({ teams = [], revision }) {
  const moves = useApiQuery(signal => endpoints.marketMoves({ limit: 1000 }, signal), [revision]);
  useAutoRefresh(moves.retry, 60000);
  const [filter, setFilter] = useState('todos');
  const [teamId, setTeamId] = useState('');
  const [text, setText] = useState('');
  const [shown, setShown] = useState(PAGE);
  const all = Array.isArray(moves.data) ? moves.data : [];
  const rows = useMemo(() => {
    const types = FILTERS.find(item => item.id === filter)?.types;
    const query = norm(text.trim());
    return all.filter(move => (!types || types.includes(move.type))
      && (!teamId || move.fromTeam?.id === teamId || move.toTeam?.id === teamId)
      && (!query || [move.player?.name, move.givenPlayer?.name].some(name => norm(name).includes(query))));
  }, [all, filter, teamId, text]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(item => [item.id, item.types ? all.filter(move => item.types.includes(move.type)).length : all.length])), [all]);
  const days = [];
  for (const move of rows.slice(0, shown)) {
    const date = parseDate(move.date);
    const key = dayKey(date);
    if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(date), moves: [] });
    days.at(-1).moves.push(move);
  }
  const reset = setter => value => { setter(value); setShown(PAGE); };
  return <section className="market-section league-moves">
    <header>
      <h2>FICHAJES DE LA LIGA <small>{all.length}</small></h2>
      <p>Todos los movimientos ya cerrados de todos los clubes: traspasos, trueques, fichajes, préstamos y salidas.</p>
    </header>
    <div className="lm-filters" role="group" aria-label="Tipo de movimiento">
      {FILTERS.map(item => <button key={item.id} type="button" className={filter === item.id ? 'active' : ''} aria-pressed={filter === item.id} onClick={() => reset(setFilter)(item.id)}>
        {item.label}{counts[item.id] ? <small>{counts[item.id]}</small> : null}
      </button>)}
    </div>
    <div className="lm-search">
      <select value={teamId} onChange={event => reset(setTeamId)(event.target.value)} aria-label="Filtrar por club">
        <option value="">TODOS LOS CLUBES</option>
        {teams.filter(team => !team.hidden).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <input type="search" value={text} placeholder="🔎 BUSCAR JUGADOR" autoComplete="off" onChange={event => reset(setText)(event.target.value)} aria-label="Buscar jugador"/>
    </div>
    {moves.loading && moves.data === null && <div className="arcade-state compact">CARGANDO FICHAJES...</div>}
    {moves.error && <DataState query={moves}/>}
    {!moves.error && !moves.loading && !rows.length && <p className="empty-copy">No hay movimientos con esos filtros.</p>}
    {days.map(day => <div key={day.key} className="lm-day">
      <h3>{day.label} <small>{day.moves.length}</small></h3>
      <div className="lm-list">{day.moves.map(move => <MoveCard key={`${move.type}-${move.id}`} move={move}/>)}</div>
    </div>)}
    {rows.length > shown && <button type="button" className="lm-more" onClick={() => setShown(value => value + PAGE)}>VER MÁS ({rows.length - shown})</button>}
  </section>;
}
