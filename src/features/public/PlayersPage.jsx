import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, OverallBadge, PageHeader, Pagination, gp } from './DataStates.jsx';
import { PLAYING_STYLES, efootballPrice, profileLevel, skillLabel, STAT_GROUPS } from './EfootballCard.jsx';
import { useApiQuery } from './useApiQuery.js';
import { addToComparison, comparisonCandidate, readComparison, writeComparison } from '../../utils/playerComparison.js';
import { gpLabel, gpNumber } from '../../utils/money.js';
import { GpInput } from '../../components/GpInput.jsx';
import { Button } from '../../ui/index.js';

const positions = ['PT','LD','DEC','LI','MCD','MC','MDI','MDD','MO','EXD','EXI','SD','DC'];

export function PlayerActions({ player, teams, onChanged }) {
  const [teamId, setTeamId] = useState('');
  const buy = useApiMutation((id, signal) => endpoints.buyPlayer(player.id, id, signal), { onSuccess: onChanged });
  const release = useApiMutation((body, signal) => endpoints.releasePlayer(player.id, body, signal), { onSuccess: onChanged });
  const isFree = player.isFreeAgent ?? !player.team;
  const currentTeamId = player.team?.id ?? player.teamId;
  const feedback = buy.error || buy.success ? buy : release;

  const buyPlayer = () => {
    const team = teams.find(item => item.id === teamId);
    if (window.confirm(`¿Comprar a ${player.name} para ${team?.name ?? 'EL EQUIPO SELECCIONADO'} por su valor GP?`)) buy.execute(teamId);
  };
  const releasePlayer = () => {
    if (window.confirm(`¿Liberar a ${player.name}? Si su contrato está vigente es rescindir: pagas el 50% de los sueldos que le faltan y baja la reputación del club (salvo que lleve 4 torneos o más). Si ya venció, se va gratis.`)) release.execute({ teamId: currentTeamId });
  };

  return <section className="player-actions">
    <h3>EQUIPO</h3>
    {isFree ? <>
      <label>EQUIPO<select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">SELECCIONAR</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <div className="button-row"><Button disabled={!teamId || buy.loading} onClick={buyPlayer}>COMPRAR</Button></div>
    </> : <>
      <Button variant="danger" disabled={release.loading} onClick={releasePlayer}>LIBERAR JUGADOR · 20%</Button>
    </>}
    <FormFeedback mutation={feedback}/>
  </section>;
}

export function PlayerAdmin({ player, onChanged }) {
  const [name, setName] = useState(player.name); const [position, setPosition] = useState(player.position); const edit = useApiMutation((body, signal) => endpoints.updatePlayer(player.id, body, signal), { onSuccess: onChanged }); const retire = useApiMutation(signal => endpoints.deletePlayer(player.id, signal), { onSuccess: onChanged });
  return <section className="player-actions"><h3>ADMINISTRACIÓN</h3><label>NOMBRE<input value={name} onChange={event => setName(event.target.value)}/></label><label>POSICIÓN<select value={position} onChange={event => setPosition(event.target.value)}>{positions.map(item => <option key={item}>{item}</option>)}</select></label><div className="button-row"><Button disabled={!name.trim() || edit.loading} onClick={() => edit.execute({ name: name.trim(), position })}>GUARDAR CAMBIOS</Button><Button variant="danger" disabled={retire.loading} onClick={() => { if (window.confirm(`¿RETIRAR A ${player.name}? Se conservará su historial.`)) retire.execute(); }}>RETIRAR DE LA LIGA</Button></div><FormFeedback mutation={edit.error || edit.success ? edit : retire}/></section>;
}

const STATUS_OPTIONS = [['', 'Todos'], ['registered', 'En la liga'], ['owned', 'Con equipo'], ['free', 'Agentes libres']];
const SORT_OPTIONS = [['price_desc', 'Precio: mayor a menor'], ['price_asc', 'Precio: menor a mayor'], ['overall_desc', 'Media: mayor a menor'], ['overall_asc', 'Media: menor a mayor'],['name', 'Nombre A-Z'], ['age_asc', 'Más jóvenes'], ['age_desc', 'Más veteranos']];
const POSITION_LINES = [['PORTERO', ['PT']], ['DEFENSA', ['DEC', 'LI', 'LD']], ['MEDIOCAMPO', ['MCD', 'MC', 'MDI', 'MDD', 'MO']], ['ATAQUE', ['EXI', 'EXD', 'SD', 'DC']]];
const PRICE_RANGES = [['', '', 'Cualquier precio'], ['', '50000000', 'Hasta 50 M'], ['50000000', '100000000', '50 M – 100 M'], ['100000000', '200000000', '100 M – 200 M'], ['200000000', '', 'Más de 200 M']];
const EMPTY_FILTERS = { q: '', positions: [], status: '', teamId: '', minGp: '', maxGp: '', nationality: '', sort: 'price_desc', page: 1 };
const filtersFromQuery = query => ({
  ...EMPTY_FILTERS,
  q: query.q ?? '',
  status: query.status ?? '',
  teamId: query.teamId ?? '',
  positions: query.position ? query.position.split(',').filter(Boolean) : [],
  minGp: query.minGp ?? '',
  maxGp: query.maxGp ?? '',
  nationality: query.nationality ?? '',
  sort: query.sort ?? 'price_desc',
  page: Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1),
});

const directoryQueryFromFilters = filters => Object.fromEntries(Object.entries({
  q: filters.q,
  status: filters.status,
  teamId: filters.teamId,
  position: filters.positions.join(','),
  minGp: filters.minGp,
  maxGp: filters.maxGp,
  nationality: filters.nationality,
  sort: filters.sort,
  page: filters.page > 1 ? filters.page : '',
}).filter(([, value]) => value !== ''));

export const playersReturnQuery = filters => new URLSearchParams(directoryQueryFromFilters(filters)).toString();

function DirectoryStatus({ player }) {
  if (player.status === 'owned') return null;
  if (player.status === 'free') return <span className="search-status free">AGENTE LIBRE</span>;
  return <span className="search-status free">AGENTE LIBRE</span>;
}

function FilterPanel({ filters, teams, set, togglePosition, total, onClose }) {
  const priceKey = `${filters.minGp}-${filters.maxGp}`;
  const custom = !PRICE_RANGES.some(([min, max]) => `${min}-${max}` === priceKey);
  return <aside className="filter-panel" aria-label="Filtros">
    <fieldset><legend>SITUACIÓN</legend>{STATUS_OPTIONS.map(([value, label]) => <label key={value || 'all'} className="filter-option"><input type="radio" name="status" checked={filters.status === value} onChange={() => set({ status: value })}/>{label}</label>)}</fieldset>
    <fieldset><legend>POSICIÓN</legend>{POSITION_LINES.map(([line, values]) => {
      const all = values.every(value => filters.positions.includes(value));
      return <div className="filter-line" key={line}>
        <label className="filter-option filter-line-title"><input type="checkbox" checked={all} onChange={() => set({ positions: all ? filters.positions.filter(value => !values.includes(value)) : [...new Set([...filters.positions, ...values])] })}/>{line}</label>
        {values.length > 1 && <div className="filter-line-values">{values.map(value => <label key={value} className="filter-option"><input type="checkbox" checked={filters.positions.includes(value)} onChange={() => togglePosition(value)}/>{value}</label>)}</div>}
      </div>;
    })}</fieldset>
    <fieldset><legend>PRECIO (GP)</legend>{PRICE_RANGES.map(([min, max, label]) => <label key={label} className="filter-option"><input type="radio" name="price" checked={!custom && priceKey === `${min}-${max}`} onChange={() => set({ minGp: min, maxGp: max })}/>{label}</label>)}
      <div className="filter-range"><GpInput hint={false} value={filters.minGp} onChange={event => set({ minGp: event.target.value })} placeholder="Mín." aria-label="GP mínimo"/><span>–</span><GpInput hint={false} value={filters.maxGp} onChange={event => set({ maxGp: event.target.value })} placeholder="Máx." aria-label="GP máximo"/></div>
    </fieldset>
    <fieldset><legend>EQUIPO</legend><select value={filters.teamId} onChange={event => set({ teamId: event.target.value })} aria-label="Equipo"><option value="">Todos los equipos</option>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></fieldset>
    <fieldset><legend>NACIONALIDAD</legend><input value={filters.nationality} onChange={event => set({ nationality: event.target.value })} placeholder="Ej: Argentina" aria-label="Nacionalidad"/></fieldset>
    <button type="button" className="filter-panel-close" onClick={onClose}>VER {total != null ? total.toLocaleString('es-CL') : ''} RESULTADOS</button>
  </aside>;
}

function activeTags(filters, teams) {
  const tags = [];
  if (filters.q) tags.push(['q', `“${filters.q}”`, { q: '' }]);
  if (filters.status) tags.push(['status', STATUS_OPTIONS.find(([value]) => value === filters.status)?.[1], { status: '' }]);
  for (const value of filters.positions) tags.push([`position-${value}`, value, { positions: filters.positions.filter(item => item !== value) }]);
  if (filters.minGp || filters.maxGp) tags.push(['price', `${filters.minGp ? gpNumber(Number(filters.minGp)) : '0'} – ${filters.maxGp ? gpNumber(Number(filters.maxGp)) : '∞'} GP`, { minGp: '', maxGp: '' }]);
  if (filters.teamId) tags.push(['team', teams.find(team => team.id === filters.teamId)?.name ?? 'Equipo', { teamId: '' }]);
  if (filters.nationality) tags.push(['nationality', filters.nationality, { nationality: '' }]);
  return tags;
}

const comparisonSelectionKey = selection => selection ? `${selection.playerId ?? 'efootball'}:${selection.pesId ?? selection.key}:${selection.variation ?? 0}` : 'empty';
const numericComparisonValue = value => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const comparisonState = (value, otherValue) => {
  const own = numericComparisonValue(value);
  const other = numericComparisonValue(otherValue);
  if (own == null || other == null) return '';
  if (own === other) return 'is-tie';
  return own > other ? 'is-winner' : 'is-loser';
};

const comparisonWins = (stats, opponentStats) => Object.keys(stats).reduce((total, stat) => total + (comparisonState(stats[stat], opponentStats[stat]) === 'is-winner' ? 1 : 0), 0);

// Carga ficha de liga + carta eFootball de un seleccionado y la reporta al comparador.
function ComparisonLoader({ selection, onData }) {
  const key = comparisonSelectionKey(selection);
  const profile = useApiQuery(signal => selection.playerId
    ? endpoints.player(selection.playerId, signal)
    : selection.pesId ? endpoints.efootballCard(selection.pesId, selection.variation ?? 0, signal) : Promise.resolve(null), [key]);
  const cardId = selection.playerId ? profile.data?.efootballPesId : null;
  const linkedCard = useApiQuery(signal => cardId
    ? endpoints.efootballCard(cardId, profile.data?.efootballVariation ?? 0, signal)
    : Promise.resolve(null), [cardId, profile.data?.efootballVariation]);
  const player = selection.playerId ? profile.data : null;
  const card = selection.playerId ? linkedCard.data : profile.data;
  const loading = profile.loading || (Boolean(cardId) && linkedCard.loading);
  const error = Boolean(profile.error);
  useEffect(() => { onData(key, { player, card, loading, error }); }, [card, error, key, loading, onData, player]);
  return null;
}

// Filas comparables: [etiqueta, lector, formato]. Los datos descriptivos (club,
// nacionalidad, edad, estilo) van en la cabecera de cada jugador.
const COMPARISON_FACTS = [
  ['MEDIA eFOOTBALL', ({ player, card }) => card?.overall ?? player?.external?.overall],
  ['VALOR LIGA', ({ player }) => player?.gpValue, gp],
  ['PRECIO EN eFOOTBALL', ({ player, card }) => card?.gpPrice ?? player?.external?.gpPrice, efootballPrice],
  ['GOLES HISTÓRICOS', ({ player }) => player ? player.goals ?? 0 : null],
  ['ALTURA', ({ card }) => card?.height, value => `${value} CM`],
  ['USO PIE MALO', ({ card }) => card?.profile?.weakFootUsage, value => profileLevel('weakFootUsage', value)],
  ['PRECISIÓN PIE MALO', ({ card }) => card?.profile?.weakFootAccuracy, value => profileLevel('weakFootAccuracy', value)],
  ['FORMA', ({ card }) => card?.profile?.form, value => profileLevel('form', value)],
  ['RESIST. LESIONES', ({ card }) => card?.profile?.injuryResistance, value => profileLevel('injuryResistance', value)],
];

const comparisonProfile = data => {
  const player = data?.player;
  const card = data?.card;
  const age = player?.age ?? card?.age;
  return [
    player?.nationality ?? card?.nationality,
    age ? `${age} AÑOS` : null,
    card?.strongFoot === 1 ? 'ZURDO' : card?.strongFoot === 0 ? 'DIESTRO' : null,
    PLAYING_STYLES[card?.playingStyle],
  ].filter(Boolean).join(' · ');
};

// Misma escala que la ficha eFootball: excelente, alta, media y baja.
const statTone = value => Number(value) >= 90 ? '#0a8fd1' : Number(value) >= 80 ? '#1c7a3e' : Number(value) >= 70 ? '#e0b400' : '#e07a2e';

// Buscador dentro del comparador: usa el mismo directorio (liga + eFootballDB).
function ComparisonSearch({ excludedKeys, onAdd }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const results = useApiQuery(signal => term.length >= 2
    ? endpoints.playerDirectory({ q: term, page: 1, pageSize: 6 }, signal)
    : Promise.resolve({ data: [] }), [term]);
  const rows = (Array.isArray(results.data) ? results.data : []).filter(player => !excludedKeys.has(player.playerId ?? `${player.pesId}-${player.variation ?? 0}`));
  return <div className="h2h-player h2h-search">
    <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar jugador para comparar…" aria-label="Buscar jugador para comparar"/>
    {search.trim().length >= 2 && <div className="h2h-search-results">{results.loading || term !== search.trim() ? <p>BUSCANDO…</p> : rows.length ? rows.map(player => <button type="button" key={player.playerId ?? `${player.pesId}-${player.variation}`} onClick={() => { onAdd(player); setSearch(''); }}><PlayerFace src={player.faceUrl} name={player.name} className="squad-simulator-face"/><span><b>{player.name}</b><small>{player.position ?? '—'} · OVR {player.overall ?? '—'} · {player.team?.name ?? player.clubName ?? 'AGENTE LIBRE'}</small></span><i aria-hidden="true">+</i></button>) : <p>SIN RESULTADOS.</p>}</div>}
  </div>;
}

function ComparisonHead({ selection, data, wins, onRemove, excludedKeys, onAdd }) {
  if (!selection) return <ComparisonSearch excludedKeys={excludedKeys} onAdd={onAdd}/>;
  const name = data?.player?.name ?? data?.card?.name ?? selection.name;
  const faceUrl = data?.player?.faceUrl ?? data?.card?.faceUrl ?? selection.faceUrl;
  const team = data?.player?.team?.name ?? data?.card?.clubName ?? (data ? 'AGENTE LIBRE' : null);
  const overall = data?.card?.overall ?? data?.player?.external?.overall;
  return <div className="h2h-player">
    <PlayerFace src={faceUrl} name={name} className="player-comparison-face"/>
    <div><h3>{name}</h3><small>{[data?.player?.position ?? data?.card?.position, team].filter(Boolean).join(' · ') || 'CARGANDO…'}</small>{data && <p>{comparisonProfile(data)}</p>}{wins != null && <strong className="player-comparison-score">{wins} ATRIBUTOS SUPERIORES</strong>}</div>
    {overall != null && <b className="h2h-overall" title="Media eFootball">{overall}</b>}
    <button type="button" className="player-comparison-remove" onClick={() => onRemove(selection)} aria-label={`Quitar a ${name} del comparador`}>×</button>
  </div>;
}

// Cada fila muestra ambos valores, quién gana y por cuánto (la diferencia va en el lado ganador).
function ComparisonRow({ label, left, right, format = value => value, bar }) {
  const empty = value => value == null || value === '';
  const show = value => empty(value) ? '—' : format(value);
  const leftNumber = numericComparisonValue(left);
  const rightNumber = numericComparisonValue(right);
  const diff = leftNumber != null && rightNumber != null ? leftNumber - rightNumber : null;
  const side = (position, value, state, delta) => <span className={`h2h-value h2h-${position} ${state}`.trim()} style={bar && !empty(value) ? { '--h2h-bar': statTone(value) } : undefined}>{bar && !empty(value) && <i style={{ width: `${Math.min(100, Number(value))}%` }}/>}<b>{show(value)}</b>{delta > 0 && <em>+{format === gp ? gp(delta) : delta}</em>}</span>;
  return <div className="h2h-row">
    {side('left', left, comparisonState(left, right), diff)}
    <span className="h2h-label">{label}</span>
    {side('right', right, comparisonState(right, left), diff == null ? null : -diff)}
  </div>;
}

// Radar de áreas: cada eje va de 40 a 100 (el rango útil de las medias eFootball).
function ComparisonRadar({ axes }) {
  const size = 260;
  const center = size / 2;
  const radius = 92;
  const scale = value => Math.max(0, Math.min(1, ((value ?? 40) - 40) / 60));
  const point = (index, ratio) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };
  const polygon = key => axes.map((axis, index) => point(index, scale(axis[key])).join(',')).join(' ');
  return <svg className="h2h-radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Radar: ${axes.map(axis => `${axis.label} ${axis.left ?? '—'} contra ${axis.right ?? '—'}`).join(', ')}`}>
    {[0.25, 0.5, 0.75, 1].map(ratio => <polygon key={ratio} className="h2h-radar-grid" points={axes.map((_, index) => point(index, ratio).join(',')).join(' ')}/>)}
    {axes.map((axis, index) => { const [x, y] = point(index, 1); const [lx, ly] = point(index, 1.2); return <g key={axis.label}><line className="h2h-radar-axis" x1={center} y1={center} x2={x} y2={y}/><text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{axis.label}</text></g>; })}
    <polygon className="h2h-radar-left" points={polygon('left')}/>
    <polygon className="h2h-radar-right" points={polygon('right')}/>
  </svg>;
}

function PlayerComparator({ selections, onAdd, onRemove }) {
  const [comparisonData, setComparisonData] = useState({});
  const onData = useCallback((key, data) => setComparisonData(current => {
    const previous = current[key];
    return previous && previous.card === data.card && previous.player === data.player && previous.loading === data.loading && previous.error === data.error ? current : { ...current, [key]: data };
  }), []);
  const [leftSelection, rightSelection] = selections;
  const left = leftSelection ? comparisonData[comparisonSelectionKey(leftSelection)] : null;
  const right = rightSelection ? comparisonData[comparisonSelectionKey(rightSelection)] : null;
  const leftStats = left?.card?.stats ?? {};
  const rightStats = right?.card?.stats ?? {};
  const both = Boolean(left?.card && right?.card);
  const loading = [left, right].some(item => item?.loading) || selections.some(selection => !comparisonData[comparisonSelectionKey(selection)]);
  const excludedKeys = new Set(selections.map(selection => selection.key));
  const statGroups = STAT_GROUPS
    .map(([title, rows]) => [title, rows.filter(([stat]) => leftStats[stat] != null || rightStats[stat] != null)])
    .filter(([, rows]) => rows.length);
  const groupAverage = (stats, rows) => {
    const values = rows.map(([stat]) => numericComparisonValue(stats[stat])).filter(value => value != null);
    return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null;
  };
  const skills = data => (data?.card?.skills ?? []).map(skillLabel);
  return <section className="player-comparator">
    <header><div><h2>COMPARADOR DE JUGADORES</h2><p>Busca dos jugadores o agrégalos desde su ficha. Se destaca quién gana cada atributo y por cuánto.</p></div><small>{selections.length} / 2 SELECCIONADOS</small></header>
    {selections.map(selection => <ComparisonLoader key={comparisonSelectionKey(selection)} selection={selection} onData={onData}/>)}
    <div className="h2h">
      <div className="h2h-heads">
        <ComparisonHead selection={leftSelection} data={left} wins={both ? comparisonWins(leftStats, rightStats) : null} onRemove={onRemove} excludedKeys={excludedKeys} onAdd={onAdd}/>
        <span className="h2h-versus">VS</span>
        <ComparisonHead selection={rightSelection} data={right} wins={both ? comparisonWins(rightStats, leftStats) : null} onRemove={onRemove} excludedKeys={excludedKeys} onAdd={onAdd}/>
      </div>
      {selections.length > 0 && (loading ? <div className="arcade-state compact">CARGANDO DATOS...</div> : <>
        {[left, right].some(item => item?.error) && <p className="empty-copy">No se pudo cargar uno de los jugadores.</p>}
        {both && statGroups.length > 0 && <section className="h2h-section h2h-overview"><h4>RESUMEN POR ÁREA</h4><div><div className="h2h-overview-rows">{statGroups.map(([title, rows]) => <ComparisonRow key={title} label={title} left={groupAverage(leftStats, rows)} right={groupAverage(rightStats, rows)} bar/>)}</div><ComparisonRadar axes={statGroups.filter(([title]) => title !== 'PORTERO' || [left, right].some(item => (item?.card?.position ?? item?.player?.position) === 'PT')).map(([title, rows]) => ({ label: title, left: groupAverage(leftStats, rows), right: groupAverage(rightStats, rows) }))}/></div></section>}
        <section className="h2h-section"><h4>DATOS GENERALES</h4>{COMPARISON_FACTS.map(([label, read, format]) => <ComparisonRow key={label} label={label} left={left ? read(left) : null} right={right ? read(right) : null} format={format}/>)}</section>
        {statGroups.map(([title, rows]) => <section className="h2h-section" key={title}><h4>{title}</h4>{rows.map(([stat, label]) => <ComparisonRow key={stat} label={label} left={leftStats[stat]} right={rightStats[stat]} bar/>)}</section>)}
        {(skills(left).length > 0 || skills(right).length > 0) && <section className="h2h-section h2h-skills"><h4>HABILIDADES</h4><div><p>{skills(left).join(' · ') || '—'}</p><p>{skills(right).join(' · ') || '—'}</p></div></section>}
      </>)}
    </div>
  </section>;
}

// Directorio único: plantilla de la liga y cartas de eFootballDB sin inscribir.
export function PlayersPage({ teams, initialQuery = {} }) {
  const [filters, setFilters] = useState(() => filtersFromQuery(initialQuery));
  const [search, setSearch] = useState(initialQuery.q ?? '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialQuery.tab === 'comparador' ? 'comparator' : 'directory');
  const [compareSelections, setCompareSelections] = useState(readComparison);
  useEffect(() => writeComparison(compareSelections), [compareSelections]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(current => current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { positions, ...rest } = filters;
  const query = Object.fromEntries(Object.entries({ ...rest, position: positions.join(','), pageSize: 12 }).filter(([, value]) => value !== ''));
  const directory = useApiQuery(signal => endpoints.playerDirectory(query, signal), [JSON.stringify(query)]);
  const rows = Array.isArray(directory.data) ? directory.data : [];
  const set = patch => { if ('q' in patch) setSearch(patch.q); setFilters(current => ({ ...current, ...patch, page: 1 })); };
  const togglePosition = value => set({ positions: filters.positions.includes(value) ? filters.positions.filter(item => item !== value) : [...filters.positions, value] });
  const tags = activeTags(filters, teams);
  const open = player => {
    const params = new URLSearchParams({ from: 'jugadores', ...directoryQueryFromFilters(filters) });
    if (player.playerId) return `#/jugadores/${encodeURIComponent(player.playerId)}?${params.toString()}`;
    if (player.variation) params.set('v', player.variation);
    return `#/efootball/${player.pesId}?${params.toString()}`;
  };
  const addCompare = player => setCompareSelections(current => addToComparison(current, comparisonCandidate(player)));
  const removeCompare = selection => setCompareSelections(current => current.filter(item => item.key !== selection.key));
  return <main className="newspaper data-page"><section className="data-paper players-paper">
    <PageHeader kicker="LIGA + eFOOTBALLDB" title="JUGADORES"><nav className="player-page-tabs" aria-label="Secciones de jugadores"><button type="button" className={activeTab === 'directory' ? 'active' : ''} onClick={() => setActiveTab('directory')}>DIRECTORIO</button><button type="button" className={activeTab === 'comparator' ? 'active' : ''} onClick={() => setActiveTab('comparator')}>COMPARADOR{compareSelections.length ? ` (${compareSelections.length})` : ''}</button></nav></PageHeader>
    {activeTab === 'directory' && <>
    <div className={`directory-layout ${panelOpen ? 'panel-open' : ''}`}>
      <FilterPanel filters={filters} teams={teams} set={set} togglePosition={togglePosition} total={directory.pagination?.total} onClose={() => setPanelOpen(false)}/>
      <div className="directory-results">
        <div className="directory-toolbar">
          <input className="directory-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="BUSCAR POR NOMBRE" aria-label="Buscar jugador"/>
          <button type="button" className="directory-filter-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(value => !value)}>FILTROS{tags.length ? ` (${tags.length})` : ''}</button>
          <label className="directory-sort">ORDENAR<select value={filters.sort} onChange={event => set({ sort: event.target.value })}>{SORT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="directory-summary"><b>{directory.pagination?.total != null ? `${directory.pagination.total.toLocaleString('es-CL')} JUGADORES` : ' '}</b>
          {tags.map(([key, label, patch]) => <button type="button" key={key} className="filter-tag" onClick={() => set(patch)} aria-label={`Quitar filtro ${label}`}>{label} <span aria-hidden="true">×</span></button>)}
          {tags.length > 0 && <button type="button" className="club-link-button" onClick={() => { setSearch(''); setFilters(EMPTY_FILTERS); }}>LIMPIAR TODO</button>}
        </div>
        <DataState query={directory} empty={null}/>
        {!directory.loading && !directory.error && (rows.length ? <div className="player-card-grid">{rows.map(player => { const playerKey = player.playerId ?? `${player.pesId}-${player.variation}`; return <article className={`player-card status-${player.status}`} key={playerKey}>
          <a className="player-card-link" href={open(player)}>
            <PlayerFace src={player.faceUrl} name={player.name} className="player-card-face"/>
            <span className="player-card-body"><b>{player.name}</b><small>{[player.nationality, player.age ? `${player.age} AÑOS` : null].filter(Boolean).join(' · ') || '—'}</small><span className="player-card-details"><em>{player.position ?? '—'}</em><OverallBadge value={player.overall}/><strong>{gp(player.price)}</strong></span></span>
            {player.status === 'owned' && player.team?.imageUrl ? <span className="player-card-team-mark" title={player.team.name}><img src={player.team.imageUrl} alt={`Emblema de ${player.team.name}`}/></span> : <span className="player-card-team-mark player-card-status-mark"><DirectoryStatus player={player}/></span>}
          </a>
        </article>; })}</div> : <p className="empty-copy">Ningún jugador coincide con los filtros.</p>)}
        <Pagination pagination={directory.pagination} page={filters.page} onPage={page => { setFilters(current => ({ ...current, page })); window.scrollTo({ top: 0 }); }}/>
      </div>
    </div>
    </>}
    {activeTab === 'comparator' && <PlayerComparator selections={compareSelections} onAdd={addCompare} onRemove={removeCompare}/>}
  </section></main>;
}
