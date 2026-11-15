import { gpLabel } from '../utils/money.js';
import { useEffect, useId, useRef, useState } from 'react';
import { endpoints } from '../api/endpoints.js';
import { PlayerFace } from './PlayerFace.jsx';
import { TeamMark } from './TeamMark.jsx';
import { compareUpcoming, matchRoundLabel } from '../utils/matchPresentation.js';

const MIN_QUERY = 2;
const gp = value => typeof value === 'number' ? gpLabel(value) : '—';

// Une la plantilla de la liga con el catálogo de eFootballDB y responde, para cada
// jugador, quién lo tiene: un equipo, nadie (agente libre) o nadie porque aún no está inscrito.
function mergeResults(leaguePlayers, catalogCards) {
  const results = leaguePlayers.map(player => ({
    key: `league-${player.id}`,
    kind: player.team ? 'owned' : 'free',
    id: player.id,
    name: player.name,
    faceUrl: player.faceUrl,
    detail: [player.position, player.nationality].filter(Boolean).join(' · '),
    value: player.gpValue,
    team: player.team,
  }));
  const known = new Set(results.map(result => result.id));
  for (const card of catalogCards) {
    if (card.league?.id && known.has(card.league.id)) continue;
    if (card.league?.id) {
      known.add(card.league.id);
      results.push({ key: `league-${card.league.id}`, kind: card.league.teamId ? 'owned' : 'free', id: card.league.id, name: card.league.name ?? card.name, faceUrl: card.faceUrl, detail: [card.position, card.nationality].filter(Boolean).join(' · '), value: null, team: card.league.teamId ? { id: card.league.teamId, name: card.league.teamName } : null });
      continue;
    }
    results.push({ key: `unregistered-${card.pesId}-${card.variation}`, kind: 'unregistered', pesId: card.pesId, variation: card.variation, name: card.name, faceUrl: card.faceUrl, detail: [card.position, card.nationality, card.clubName].filter(Boolean).join(' · '), value: card.gpPrice });
  }
  const order = { owned: 0, free: 1, unregistered: 2 };
  return results.sort((left, right) => order[left.kind] - order[right.kind]);
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Palabras que no identifican a un club ("FC Barcelona" y "Deportivo X" comparten estas).
const GENERIC_WORDS = new Set(['fc', 'cf', 'club', 'deportivo', 'de', 'la', 'el', 'los', 'las', 'del', 'que', 'real', 'sc', 'ac']);
const VERSUS = /\s+(?:vs\.?|v|contra|x|-)\s+/i;

const teamScore = (team, words) => {
  const teamWords = normalize(team.name).split(/[^a-z0-9]+/).filter(Boolean);
  const hit = word => teamWords.some(teamWord => teamWord.startsWith(word) || (word.length >= 4 && teamWord.includes(word)));
  return words.reduce((score, word) => score + (hit(word) ? (GENERIC_WORDS.has(word) ? 0.1 : 1) : 0), 0);
};

// Detecta equipos en el texto: "forestyle" (uno), "forestyle poruña" o "forestyle vs poruña"
// (cruce entre dos). Devuelve los equipos y si se trata de un cruce.
export function detectTeams(term, teams) {
  const bestFor = text => {
    const words = normalize(text).split(/[^a-z0-9]+/).filter(word => word.length >= 3 || /\d/.test(word));
    const threshold = words.length && words.every(word => GENERIC_WORDS.has(word)) ? 0.1 : 1;
    return teams.map(team => ({ team, score: teamScore(team, words) })).filter(item => item.score >= threshold).sort((a, b) => b.score - a.score);
  };
  const parts = term.split(VERSUS);
  if (parts.length === 2) {
    const [home] = bestFor(parts[0]);
    const [away] = bestFor(parts[1]).filter(item => item.team.id !== home?.team.id);
    const found = [home?.team, away?.team].filter(Boolean);
    return { teams: found, crossing: found.length === 2 };
  }
  // Sin separador: cada palabra se asigna a su mejor equipo; si aparecen dos distintos, es un cruce.
  const byWord = normalize(term).split(/\s+/).filter(word => word.length >= 3 && !GENERIC_WORDS.has(word))
    .map(word => bestFor(word)[0]?.team).filter(Boolean);
  const unique = [...new Map(byWord.map(team => [team.id, team])).values()];
  if (unique.length === 2) return { teams: unique, crossing: true };
  return { teams: bestFor(term).slice(0, 3).map(item => item.team), crossing: false };
}

function pickMatches(rows, [first, second]) {
  const involved = second ? rows.filter(match => [match.homeTeam?.id, match.awayTeam?.id].includes(second.id)) : rows;
  const live = involved.filter(match => match.status === 'live');
  const pending = involved.filter(match => match.status === 'pending').sort(compareUpcoming);
  const played = involved.filter(match => match.status === 'finished').sort((a, b) => String(b.finishedAt ?? '').localeCompare(String(a.finishedAt ?? '')));
  return second ? [...live, ...pending.slice(0, 1), ...played.slice(0, 4)] : [...live, ...pending.slice(0, 2), ...played.slice(0, 2)];
}

function statusLabel(result, teamsById) {
  if (result.kind === 'owned') {
    const team = teamsById.get(result.team?.id) ?? result.team;
    return <span className="search-status owned">{team?.imageUrl && <img src={team.imageUrl} alt=""/>}LO TIENE {team?.name ?? 'UN EQUIPO'}</span>;
  }
  if (result.kind === 'free') return <span className="search-status free" title="Inscrito en la liga, sin equipo">AGENTE LIBRE</span>;
  return <span className="search-status unregistered" title="Nadie lo tiene y no está inscrito en la liga; se puede importar desde eFootballDB">NO INSCRITO</span>;
}

export function GlobalSearch({ navigate, teams = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, error: null, results: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const listId = useId();
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  const term = query.trim();

  useEffect(() => {
    const openWithSlash = event => {
      if (event.key !== '/' || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', openWithSlash);
    return () => document.removeEventListener('keydown', openWithSlash);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setState({ loading: false, error: null, results: [] });
      return undefined;
    }
    const controller = new AbortController();
    setState(current => ({ ...current, loading: true, error: null }));
    const { teams: foundTeams, crossing } = detectTeams(term, teamsRef.current);
    const matchTeams = crossing ? foundTeams : foundTeams.length === 1 ? foundTeams : [];
    const timer = window.setTimeout(() => {
      Promise.all([
        endpoints.players({ q: term, pageSize: 10 }, controller.signal),
        crossing ? Promise.resolve({ data: [] }) : endpoints.efootballPlayers({ q: term }, controller.signal),
        matchTeams.length ? endpoints.matches({ team: matchTeams[0].id, ...(matchTeams[1] ? { opponent: matchTeams[1].id } : {}), order: 'recent', page: 1, pageSize: 20 }, controller.signal) : Promise.resolve({ data: [] }),
      ]).then(([league, catalog, teamMatches]) => {
        setActive(0);
        const players = mergeResults(league?.data ?? [], catalog?.data ?? []).map(result => ({ ...result, type: 'player' }));
        const matches = pickMatches(Array.isArray(teamMatches?.data) ? teamMatches.data : [], matchTeams).map(match => ({ key: `match-${match.id}`, type: 'match', match }));
        const teamResults = foundTeams.map(team => ({ key: `team-${team.id}`, type: 'team', team }));
        const results = crossing ? [...matches, ...teamResults, ...players] : [...teamResults, ...matches, ...players];
        setState({ loading: false, error: null, results, crossing: crossing ? foundTeams : null });
      }).catch(error => {
        if (error?.code !== 'REQUEST_ABORTED') setState({ loading: false, error, results: [] });
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);

  const choose = result => {
    if (!result) return;
    setOpen(false);
    setQuery('');
    if (result.type === 'team') navigate(`/equipos/${encodeURIComponent(result.team.id)}`);
    else if (result.type === 'match') navigate(`/partidos/${encodeURIComponent(result.match.id)}`);
    else if (result.kind === 'unregistered') navigate(`/efootball/${result.pesId}${result.variation ? `?v=${result.variation}` : ''}`);
    else navigate(`/jugadores/${encodeURIComponent(result.id)}`);
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') setOpen(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, state.results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(state.results[active]); }
  };

  return <div className="global-search" ref={rootRef}>
    <button type="button" className="global-search-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)} title="Buscar jugador, equipo o partido (tecla /)"><span aria-hidden="true">⌕</span><b>BUSCAR</b></button>
    {open && <div className="global-search-panel" role="dialog" aria-label="Buscar">
      <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="JUGADOR, EQUIPO O CRUCE: “FORESTYLE VS PORUÑA”" aria-label="Buscar jugador, equipo o partido" aria-controls={listId} autoComplete="off"/>
      <div className="global-search-results" id={listId} role="listbox">
        {term.length < MIN_QUERY ? <div className="global-search-hint"><p>Escribe un <b>equipo</b> para ir a su ficha y ver sus partidos, <b>dos equipos</b> (“forestyle poruña”) para ver su cruce, o un <b>jugador</b> para saber quién lo tiene:</p><ul><li><span className="search-status owned">LO TIENE…</span> juega en un equipo de la liga.</li><li><span className="search-status free">AGENTE LIBRE</span> está inscrito, pero sin equipo.</li><li><span className="search-status unregistered">NO INSCRITO</span> nadie lo tiene y aún no está en la liga; se puede importar.</li></ul></div>
          : state.loading && !state.results.length ? <p className="global-search-hint">BUSCANDO…</p>
          : state.error ? <p className="global-search-hint">NO SE PUDO BUSCAR: {state.error.message}</p>
          : !state.results.length ? <p className="global-search-hint">NADA COINCIDE CON “{term}”.</p>
          : state.results.map((result, index) => {
            const previous = state.results[index - 1];
            const heading = previous?.type !== result.type ? { team: 'EQUIPOS', match: state.crossing ? `${state.crossing[0].name.toUpperCase()} VS ${state.crossing[1].name.toUpperCase()}` : 'PARTIDOS', player: 'JUGADORES' }[result.type] : null;
            const common = { type: 'button', role: 'option', 'aria-selected': index === active, onMouseEnter: () => setActive(index), onClick: () => choose(result) };
            return <div key={result.key} className="global-search-row">{heading && <h4 className="global-search-heading">{heading}</h4>}
              {result.type === 'team' ? <button {...common} className={`global-search-result global-search-team ${index === active ? 'active' : ''}`}><TeamMark team={teamsById.get(result.team.id) ?? result.team}/><span className="global-search-name"><b>{result.team.name}</b><small>FICHA DEL CLUB</small></span><span className="global-search-go">→</span></button>
              : result.type === 'match' ? <button {...common} className={`global-search-result global-search-match ${index === active ? 'active' : ''}`}><span className="global-search-fixture"><TeamMark team={teamsById.get(result.match.homeTeam?.id) ?? result.match.homeTeam}/><b>{result.match.homeTeam?.name}</b><strong>{result.match.status === 'pending' ? 'VS' : `${result.match.homeScore ?? 0} - ${result.match.awayScore ?? 0}`}</strong><b>{result.match.awayTeam?.name}</b><TeamMark team={teamsById.get(result.match.awayTeam?.id) ?? result.match.awayTeam}/></span><small className={`global-search-match-state ${result.match.status}`}>{result.match.status === 'live' ? '● EN VIVO' : result.match.status === 'pending' ? 'PRÓXIMO' : 'FINAL'} · {matchRoundLabel(result.match)}{result.match.homeTeam?.stadium ? ` · 🏟️ ${result.match.homeTeam.stadium}` : ''}</small></button>
              : <button {...common} className={`global-search-result ${index === active ? 'active' : ''}`}>
                <PlayerFace src={result.faceUrl} name={result.name}/>
                <span className="global-search-name"><b>{result.name}</b><small>{result.detail || 'SIN DATOS'}{result.value != null ? ` · ${gp(result.value)}` : ''}</small></span>
                {statusLabel(result, teamsById)}
              </button>}
            </div>;
          })}
      </div>
      {term.length >= MIN_QUERY && !state.crossing && <button type="button" className="global-search-all" onClick={() => { setOpen(false); navigate(`/equipos/jugadores?q=${encodeURIComponent(term)}`); }}>Ver todos los resultados en jugadores →</button>}
    </div>}
  </div>;
}
