import { useEffect, useMemo, useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { Scoreboard } from '../../components/Scoreboard.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { SanctionBadge } from '../../components/SanctionBadge.jsx';
import { SimulatedBadge } from '../../components/SimulatedBadge.jsx';
import { restingByRound } from '../../utils/roundRest.js';
import { matchRoundLabel } from '../../utils/matchPresentation.js';
import { DataState, PageHeader } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';
import { Icon } from '../../ui/index.js';
import { rivalryOf } from '../../utils/rivalry.js';

const labels = { pending: 'PENDIENTE', live: 'EN VIVO', finished: 'FINALIZADO', cancelled: 'CANCELADO' };

// Tarjetas por fecha (partidos + libres), para que en "Todos" cada fecha ocupe una fila.
const perRoundOf = rows => {
  const counts = new Map();
  rows.forEach(match => counts.set(matchRound(match), (counts.get(matchRound(match)) ?? 0) + 1));
  return Math.max(1, ...counts.values());
};

const matchRound = match => match.roundNumber ?? match.round_number ?? match.matchday ?? match.match_day;

// Tarjeta compacta estilo marcador: un equipo por línea, marcador a la derecha y
// estado en una columna aparte, para ver muchos partidos sin hacer scroll.
function FixtureCard({ match, resolveTeam, onSelect, showRound }) {
  const finished = match.status === 'finished';
  const live = match.status === 'live';
  const hasScore = finished || live;
  const rivalry = rivalryOf(match);
  const home = Number(match.homeScore ?? 0);
  const away = Number(match.awayScore ?? 0);
  const winner = finished ? (home > away ? 'home' : away > home ? 'away' : match.winnerTeamId ? (match.winnerTeamId === match.homeTeam?.id ? 'home' : 'away') : '') : '';
  const team = (side, value) => <span className={`fixture-team ${winner && winner !== side ? 'lost' : ''} ${match.sanctioned && match.sanctionedTeamId === match[`${side}Team`]?.id ? 'sanctioned' : ''}`}><TeamMark team={resolveTeam(match[`${side}Team`])}/><b>{match[`${side}Team`]?.name ?? '—'}</b>{hasScore && <strong>{value}</strong>}</span>;
  const state = live
    ? 'EN VIVO'
    : finished
      ? (match.sanctioned ? 'FINAL POR CASTIGO' : 'FINAL')
      : match.status === 'cancelled'
        ? 'CANCELADO'
        : 'PENDIENTE';
  return <button type="button" className={`fixture-card fixture-${match.status}${match.sanctioned ? ' fixture-sanctioned' : ''}${match.derby ? ' fixture-derby' : ''}${rivalry ? ` rivalry-${rivalry.kind}${rivalry.both ? ' rivalry-both' : ''}` : ''}`} onClick={() => onSelect(match.id)} aria-label={`${match.homeTeam?.name ?? 'Equipo local'} contra ${match.awayTeam?.name ?? 'Equipo visitante'}: ${state}`}>
    <span className="fixture-teams" data-derby={rivalry ? rivalry.label.toUpperCase() : undefined}>{team('home', home)}{team('away', away)}{rivalry?.streak && <em className="fixture-streak">{rivalry.streak.text}</em>}</span>
    <small className="fixture-footer"><span>{rivalry && <Icon name={rivalry.icon} size={12} className="fixture-derby-flame" title={rivalry.label}/>}{showRound ? matchRoundLabel(match) : 'FECHA POR DEFINIR'}</span>{match.penaltiesHome != null && <span className="fixture-pens" title="Se definió por penales">PEN. {match.penaltiesHome}–{match.penaltiesAway}</span>}<SanctionBadge match={match} compact/><SimulatedBadge match={match}/>{match.homeTeam?.stadium && <span className="match-venue" title={`Estadio de ${match.homeTeam.name}`}>🏟️ {match.homeTeam.stadium}</span>}</small>
  </button>;
}

// Fecha libre de un equipo: mismo tamaño que un partido, con borde punteado. En "Todos"
// dice quién descansa; filtrando por equipo basta con "LIBRE".
function RestCard({ rest, resolveTeam }) {
  return <div className="fixture-card fixture-rest" role="note" aria-label={`Fecha ${rest.roundNumber}: libre ${rest.team?.name ?? ''}`}>
    <span className="fixture-rest-label">LIBRE{rest.team && <b><TeamMark team={resolveTeam(rest.team)}/>{rest.team.name}</b>}</span>
    <small className="fixture-footer"><span>{matchRoundLabel(rest)}</span></small>
  </div>;
}

const MULTI_SLOT_COUNT = 4;
const MULTI_STORAGE_KEY = 'koinonia-multipartido';
const MULTI_EMPTY_SLOT = { teamId: null, matchId: null };

function loadMultiSlots() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(MULTI_STORAGE_KEY) ?? '[]');
    return Array.from({ length: MULTI_SLOT_COUNT }, (_, index) => ({ ...MULTI_EMPTY_SLOT, ...stored[index] }));
  } catch {
    return Array.from({ length: MULTI_SLOT_COUNT }, () => ({ ...MULTI_EMPTY_SLOT }));
  }
}

function saveMultiSlots(slots) {
  try {
    window.localStorage.setItem(MULTI_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // el navegador no permite guardar preferencias locales; no es crítico.
  }
}

// Los filtros se recuerdan por vista (todos, jugados, pendientes): al entrar a un
// partido y volver, la lista queda como estaba.
const FILTERS_STORAGE_KEY = 'koinonia-filtros-partidos';

function loadFilters(mode, initialStatus) {
  const defaults = { tournament: '', team: '', opponent: '', status: initialStatus, page: 1 };
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${FILTERS_STORAGE_KEY}:${mode}`) ?? '{}');
    const pick = key => typeof stored[key] === 'string' ? stored[key] : defaults[key];
    return { ...defaults, tournament: pick('tournament'), team: pick('team'), opponent: pick('opponent'), status: pick('status') };
  } catch {
    return defaults;
  }
}

function saveFilters(mode, { tournament, team, opponent, status }) {
  try {
    window.localStorage.setItem(`${FILTERS_STORAGE_KEY}:${mode}`, JSON.stringify({ tournament, team, opponent, status }));
  } catch {
    // el navegador no permite guardar preferencias locales; no es crítico.
  }
}

function TeamChipBar({ teams, value, onChange }) {
  return <div className="team-chip-bar" role="group" aria-label="Filtrar por equipo">
    <button className={`team-chip ${value === '' ? 'active' : ''}`} onClick={() => onChange('')}>TODOS</button>
    {[...teams].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(team => <button className={`team-chip ${value === team.id ? 'active' : ''}`} key={team.id} title={team.name} aria-label={team.name} onClick={() => onChange(team.id)}><TeamMark team={team}/></button>)}
  </div>;
}

function MultiTeamPicker({ teams, value, onChange }) {
  return <select className="multi-slot-picker" value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">— EQUIPO DE REFERENCIA —</option>
    {[...teams].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
  </select>;
}

function MultiMatchPicker({ teamId, matches, value, onChange }) {
  const teamMatches = matches
    .filter(match => match.homeTeam?.id === teamId || match.awayTeam?.id === teamId)
    .sort((a, b) => (a.roundNumber ?? Infinity) - (b.roundNumber ?? Infinity));
  return <select className="multi-slot-picker" value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">{teamMatches.length ? '— ELEGIR PARTIDO —' : 'SIN PARTIDOS PENDIENTES'}</option>
    {teamMatches.map(match => {
      const isHome = match.homeTeam?.id === teamId;
      const rival = isHome ? match.awayTeam?.name : match.homeTeam?.name;
      const roundLabel = matchRoundLabel(match);
      return <option key={match.id} value={match.id}>{roundLabel} · {isHome ? 'LOCAL' : 'VISITA'} vs {rival} · {match.status === 'live' ? 'EN VIVO' : 'PENDIENTE'}</option>;
    })}
  </select>;
}

function MultiSlot({ index, teamId, matchId, matches, teams, onSelectTeam, onSelectMatch, onClear }) {
  return <div className="multi-slot">
    <div className="multi-slot-bar">
      <MultiTeamPicker teams={teams} value={teamId} onChange={id => onSelectTeam(index, id)}/>
      {teamId && <MultiMatchPicker teamId={teamId} matches={matches} value={matchId} onChange={id => onSelectMatch(index, id)}/>}
      {teamId && <button className="multi-slot-clear" onClick={() => onClear(index)}>QUITAR</button>}
    </div>
    {matchId ? <Scoreboard matchId={matchId} mode="manage" density="tile" teams={teams} onFinished={() => onClear(index)}/> : <div className="scoreboard scoreboard-tile scoreboard-empty">{teamId ? 'Elige uno de sus partidos pendientes.' : 'Elige un equipo de referencia para esta casilla.'}</div>}
  </div>;
}

export function MatchesPage({ mode = 'all', teams, navigate }) {
  const initialStatus = mode === 'played' ? 'finished' : mode === 'pending' ? 'pending' : '';
  const [filters, setFilters] = useState(() => loadFilters(mode, initialStatus));
  const [showMulti, setShowMulti] = useState(false);
  const [multiSlots, setMultiSlots] = useState(loadMultiSlots);
  const [multiFullscreen, setMultiFullscreen] = useState(false);
  const multiGridRef = useRef(null);
  const tournaments = useApiQuery(signal => endpoints.tournaments({ status: 'active', page: 1, pageSize: 100 }, signal));
  // Se cargan todos los partidos del filtro (la API entrega hasta 100 por página)
  // para armar una sola línea de tiempo, sin paginación.
  const matches = useApiQuery(async signal => {
    // La API filtra por un equipo. Para el cruce directo pedimos los encuentros
    // del equipo de referencia y filtramos el rival en cliente.
    const { opponent, ...queryFilters } = filters;
    const query = { ...queryFilters, team: filters.team || opponent, activeOnly: 1, pageSize: 100 };
    const first = await endpoints.matches({ ...query, page: 1 }, signal);
    const totalPages = Math.min(first?.pagination?.totalPages ?? 1, 10);
    const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => endpoints.matches({ ...query, page: index + 2 }, signal)));
    return { data: [first, ...rest].flatMap(page => Array.isArray(page?.data) ? page.data : []) };
  }, [filters.tournament, filters.team, filters.opponent, filters.status]);
  // Fixture completo de las ligas activas, para saber quién queda libre en cada fecha
  // aunque la lista esté filtrada por estado.
  const leagueIds = (tournaments.data ?? []).filter(item => item.format === 'league').map(item => item.id);
  const leagueFixtures = useApiQuery(signal => Promise.all(leagueIds.map(id => endpoints.fixtures(id, signal)))
    .then(pages => ({ data: pages.flatMap(page => Array.isArray(page?.data) ? page.data : []) })), [leagueIds.join(','), matches.data]);
  const restingFor = useMemo(() => restingByRound(leagueFixtures.data ?? []), [leagueFixtures.data]);
  const multiMatchesQuery = useApiQuery(signal => showMulti ? endpoints.matches({ activeOnly: 1, pageSize: 100, page: 1 }, signal) : Promise.resolve({ data: [] }), [showMulti]);
  const multiMatches = useMemo(() => (Array.isArray(multiMatchesQuery.data) ? multiMatchesQuery.data : []).filter(match => match.status === 'pending' || match.status === 'live'), [multiMatchesQuery.data]);
  const teamIndex = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);
  const resolveTeam = team => ({ ...team, ...(teamIndex.get(team?.id ?? team?.team_id) ?? {}) });
  const apiRows = useMemo(() => {
    const rows = Array.isArray(matches.data) ? matches.data : [];
    if (!filters.opponent) return rows;
    return rows.filter(match => match.homeTeam?.id === filters.opponent || match.awayTeam?.id === filters.opponent);
  }, [matches.data, filters.opponent]);
  // Los partidos en vivo van primero; el resto conserva el orden cronológico de
  // la fecha/jornada, sin separar pendientes de finalizados.
  // En ligas a dos vueltas se separan primera vuelta, segunda vuelta y playoffs.
  const sections = useMemo(() => {
    const byRound = (left, right) => (Number(matchRound(left)) || Number.MAX_SAFE_INTEGER) - (Number(matchRound(right)) || Number.MAX_SAFE_INTEGER);
    const scheduledAt = match => String(match.scheduledAt ?? match.scheduled_at ?? match.date ?? match.playedAt ?? match.played_at ?? '');
    const chronology = (left, right) => {
      const leftDate = scheduledAt(left);
      const rightDate = scheduledAt(right);
      if (leftDate && rightDate && leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      if (leftDate && !rightDate) return -1;
      if (!leftDate && rightDate) return 1;
      return byRound(left, right);
    };
    // Sin filtro de estado ni rival, las fechas libres entran a la grilla como una tarjeta más:
    // las del equipo filtrado o, en "Todos", la de quien descansa en cada fecha.
    const restRows = !filters.opponent && !filters.status
      ? restingFor.rests(filters.team || null).filter(rest => !filters.tournament || rest.tournament.id === filters.tournament)
      : [];
    const ordered = [...apiRows, ...restRows].sort((left, right) => {
      const live = Number(right.status === 'live') - Number(left.status === 'live');
      return live || chronology(left, right);
    });
    const tournamentsById = new Map((tournaments.data ?? []).map(item => [item.id, item]));
    const maxRound = new Map();
    apiRows.forEach(match => {
      const id = match.tournament?.id;
      const round = Number(matchRound(match));
      if (id && match.stage !== 'playoffs' && Number.isFinite(round)) maxRound.set(id, Math.max(maxRound.get(id) ?? 0, round));
    });
    // Fechas por vuelta en un todos contra todos: n-1 con equipos pares, n con impares (hay descanso).
    const legRoundsFor = id => {
      const tournament = tournamentsById.get(id);
      if (!tournament || tournament.format !== 'league' || !tournament.teamCount) return null;
      const perLeg = tournament.teamCount % 2 ? tournament.teamCount : tournament.teamCount - 1;
      return (maxRound.get(id) ?? 0) > perLeg ? perLeg : null;
    };
    const sectionOf = match => {
      const tournamentName = match.tournament?.name ?? 'TORNEO';
      const tournamentKey = match.tournament?.id ?? tournamentName;
      // La Copa Grande Giocatore se juega entre las dos vueltas de la liga: primera vuelta, copa, segunda vuelta.
      const isCup = match.stage === 'knockout' && /grande\s+giocatore/i.test(tournamentName);
      const section = isCup
        ? { key: 'cup', label: '', order: 1.5 }
        : match.stage === 'playoffs'
        ? { key: 'playoffs', label: 'PLAYOFFS', order: 3 }
        : (() => {
          const perLeg = legRoundsFor(match.tournament?.id);
          if (!perLeg) return { key: 'all', label: '', order: 0 };
          return Number(matchRound(match)) > perLeg ? { key: 'second', label: 'SEGUNDA VUELTA', order: 2 } : { key: 'first', label: 'PRIMERA VUELTA', order: 1 };
        })();
      return { ...section, key: `${tournamentKey}:${section.key}`, label: section.label ? `${tournamentName} · ${section.label}` : tournamentName };
    };
    const groups = new Map();
    ordered.forEach(match => {
      const section = sectionOf(match);
      if (!groups.has(section.key)) groups.set(section.key, { ...section, rows: [] });
      groups.get(section.key).rows.push(match);
    });
    return [...groups.values()].sort((left, right) => left.order - right.order);
  }, [apiRows, tournaments.data, restingFor, filters.team, filters.opponent, filters.status, filters.tournament]);

  useEffect(() => saveMultiSlots(multiSlots), [multiSlots]);
  useEffect(() => saveFilters(mode, filters), [mode, filters]);
  // Un filtro guardado puede apuntar a un torneo que ya no está activo o a un equipo que ya no existe.
  useEffect(() => {
    if (!tournaments.data) return;
    const activeIds = new Set(tournaments.data.map(item => item.id));
    const teamIds = new Set(teams.map(team => team.id));
    setFilters(current => {
      const stale = {
        tournament: current.tournament && !activeIds.has(current.tournament),
        team: current.team && teams.length && !teamIds.has(current.team),
        opponent: current.opponent && teams.length && !teamIds.has(current.opponent),
      };
      if (!stale.tournament && !stale.team && !stale.opponent) return current;
      return { ...current, ...(stale.tournament && { tournament: '' }), ...(stale.team && { team: '', opponent: '' }), ...(stale.opponent && { opponent: '' }) };
    });
  }, [tournaments.data, teams]);

  useEffect(() => {
    const onFullscreenChange = () => setMultiFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!showMulti) return undefined;
    const interval = window.setInterval(multiMatchesQuery.retry, 12000);
    return () => window.clearInterval(interval);
  }, [showMulti, multiMatchesQuery.retry]);

  // Compacta las casillas con partido hacia el frente (si el partido 1 termina, el 2
  // pasa a ser el 1, sin huecos en medio) y rellena las que queden vacías con partidos
  // en vivo disponibles. Se usa tanto en el refresco automático como al quitar/terminar
  // una casilla a mano, para que la grilla se reordene al instante.
  const compactMultiSlots = list => {
    const active = list.filter(slot => slot.matchId);
    const inactive = list.filter(slot => !slot.matchId);
    const packed = [...active, ...inactive].slice(0, MULTI_SLOT_COUNT);
    while (packed.length < MULTI_SLOT_COUNT) packed.push({ ...MULTI_EMPTY_SLOT });
    const usedMatchIds = new Set(packed.filter(slot => slot.matchId).map(slot => slot.matchId));
    const available = multiMatches.filter(match => match.status === 'live' && !usedMatchIds.has(match.id));
    let cursor = 0;
    return packed.map(slot => {
      if (slot.matchId || cursor >= available.length) return slot;
      const match = available[cursor];
      cursor += 1;
      return { teamId: match.homeTeam?.id ?? null, matchId: match.id };
    });
  };

  useEffect(() => {
    // Espera a que llegue el primer dato real: multiMatches parte en [] mientras
    // carga, y tomar eso como "no hay nada pendiente/en vivo" vaciaría las casillas
    // guardadas antes de tiempo.
    if (!showMulti || multiMatchesQuery.data == null) return;
    const availableIds = new Set(multiMatches.map(match => match.id));
    setMultiSlots(current => {
      const withValidMatches = current.map(slot => (slot.matchId && !availableIds.has(slot.matchId)) ? { ...slot, matchId: null } : slot);
      const filled = compactMultiSlots(withValidMatches);
      const changed = filled.some((slot, index) => slot.matchId !== current[index]?.matchId || slot.teamId !== current[index]?.teamId);
      return changed ? filled : current;
    });
  }, [showMulti, multiMatches, multiMatchesQuery.data]);

  const selectMatch = id => navigate?.(`/partidos/${encodeURIComponent(id)}`);
  const change = event => {
    setFilters(current => ({ ...current, [event.target.name]: event.target.value, page: 1 }));
  };
  const selectTeamFilter = teamId => {
    setFilters(current => ({ ...current, team: teamId, opponent: current.opponent === teamId ? '' : current.opponent, page: 1 }));
  };
  const toggleMulti = () => {
    setShowMulti(value => !value);
  };
  const toggleMultiFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else multiGridRef.current?.requestFullscreen?.();
  };
  const selectMultiTeam = (index, teamId) => setMultiSlots(current => current.map((slot, slotIndex) => slotIndex === index ? { teamId, matchId: null } : slot));
  const selectMultiMatch = (index, matchId) => setMultiSlots(current => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, matchId } : slot));
  const clearMultiSlot = index => setMultiSlots(current => compactMultiSlots(current.map((slot, slotIndex) => slotIndex === index ? { ...MULTI_EMPTY_SLOT } : slot)));
  const title = mode === 'pending' ? 'PRÓXIMOS PARTIDOS' : mode === 'played' ? 'PARTIDOS JUGADOS' : 'CENTRO DE PARTIDOS';

  return <main className="newspaper data-page"><section className="data-paper"><PageHeader kicker="CALENDARIO Y ACTAS" title={title}><div className="news-header-actions"><button className={`page-action ${showMulti ? 'active' : ''}`} onClick={toggleMulti}>{showMulti ? 'CERRAR MULTIPARTIDO' : '🎮 MULTIPARTIDO'}</button></div></PageHeader>
    {showMulti ? <>
      <p className="multi-inline-help">Las casillas vacías se llenan solas con partidos en vivo. También puedes elegir un equipo y uno de sus partidos a mano.<button type="button" className="multi-fullscreen-button" onClick={toggleMultiFullscreen}>{multiFullscreen ? '✕ Salir de pantalla completa' : '⛶ PANTALLA COMPLETA'}</button></p>
      <div className="multi-grid" ref={multiGridRef}>
        {multiSlots.map((slot, index) => <MultiSlot key={index} index={index} teamId={slot.teamId} matchId={slot.matchId} matches={multiMatches} teams={teams} onSelectTeam={selectMultiTeam} onSelectMatch={selectMultiMatch} onClear={clearMultiSlot}/>)}
      </div>
    </> : <>
      <TeamChipBar teams={teams} value={filters.team} onChange={selectTeamFilter}/>
      <div className="filter-bar"><select name="tournament" value={filters.tournament} onChange={change} aria-label="Torneo"><option value="">TORNEOS ACTIVOS</option>{(tournaments.data ?? []).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select name="status" value={filters.status} onChange={change} aria-label="Estado"><option value="">TODOS LOS ESTADOS</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{filters.team && <select name="opponent" value={filters.opponent} onChange={change} aria-label="Rival para cruce directo"><option value="">CONTRA CUALQUIER RIVAL</option>{[...teams].filter(team => team.id !== filters.team).sort((a, b) => a.name.localeCompare(b.name, 'es')).map(team => <option value={team.id} key={team.id}>VS {team.name}</option>)}</select>}</div>
      <DataState query={matches} empty={null}/>{!matches.loading && !matches.error && (sections.length
        ? <div className="fixture-board">{sections.map(section => <section className="fixture-group" key={section.key}>{section.label && <h3>{section.label} <small>{section.rows.filter(match => match.status === 'finished').length} / {section.rows.filter(match => !match.rest).length} JUGADOS</small></h3>}<div className={`fixture-grid ${!filters.team && section.rows.some(match => match.rest) ? 'fixture-grid-rounds' : ''}`} style={{ '--per-round': perRoundOf(section.rows) }}>{section.rows.map(match => match.rest ? <RestCard key={match.id} rest={match} resolveTeam={resolveTeam}/> : <FixtureCard key={match.id} match={match} showRound resolveTeam={resolveTeam} onSelect={selectMatch}/>)}</div></section>)}</div>
        : <p className="empty-copy">No hay partidos con estos filtros.</p>)}
    </>}
  </section></main>;
}
