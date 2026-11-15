import { useEffect } from 'react';
import { endpoints } from '../api/endpoints.js';
import { useApiQuery } from '../features/public/useApiQuery.js';
import { matchRoundLabel } from '../utils/matchPresentation.js';
import { EntityLink } from './EntityLink.jsx';
import { TeamMark } from './TeamMark.jsx';
import { LivePosition, LiveTableStatus, PlayoffLegend, RowMovement, liveRowClass, tableZones } from './LiveStandings.jsx';
import { useLiveStandings } from '../features/public/useLiveStandings.js';
import { playedKey, useTableProgression } from '../features/public/useTableProgression.js';
import { TrophyCase } from './TrophyCase.jsx';

const LIVE_REFRESH_MS = 12000;

function LiveMatches({ rows, resolveTeam }) {
  if (!rows.length) return null;
  return <section className="score-panel live-panel"><h2><span className="live-dot" aria-hidden="true"/>EN VIVO <small>{rows.length}</small></h2>{rows.map(match =>
    <EntityLink to="match" id={match.id} className="result-match" key={match.id}><small>{[match.tournament?.name ?? 'TORNEO', matchRoundLabel(match, { leagueRound: 'JORNADA' })].join(' · ')}</small><div className="score-line"><TeamMark team={resolveTeam(match.homeTeam)}/><span className="home-name">{match.homeTeam.name}</span><strong>{match.homeScore ?? 0} - {match.awayScore ?? 0}</strong><span className="away-name">{match.awayTeam.name}</span><TeamMark team={resolveTeam(match.awayTeam)}/></div>{match.homeTeam?.stadium && <span className="match-venue compact">🏟️ {match.homeTeam.stadium}</span>}</EntityLink>)}
  </section>;
}

function StandingsPanel({ tournament, standings, resolveTeam, loading, navigate }) {
  const liveStandings = useLiveStandings(tournament?.id);
  const rows = Array.isArray(liveStandings.data) && liveStandings.data.length ? liveStandings.data : standings;
  // Zonas según el formato del torneo y flecha de cuántos puestos se movió cada club desde la fecha anterior.
  const progression = useTableProgression(tournament?.id, playedKey(rows)).data;
  const zones = tableZones(rows, progression);
  const progressOf = teamId => progression?.teams?.find(item => item.teamId === teamId);
  return <section className="score-panel standings-home-panel"><h2>TABLA <small>{tournament?.name ?? ''}</small></h2>
    <LiveTableStatus rows={rows}/>{rows.length ? <table className="standings-home-table"><thead><tr><th>#</th><th>EQUIPO</th><th title="Partidos jugados">PJ</th><th title="Diferencia de goles">DG</th><th title="Puntos">PTS</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.team_id} className={liveRowClass(row, zones.get(row.team_id))}><td><LivePosition position={index + 1}/></td><td><EntityLink to="team" id={row.team_id} className="table-team-link"><RowMovement row={row} progressionTeam={progressOf(row.team_id)}/><TeamMark team={resolveTeam({ id: row.team_id, ...row })}/><span>{row.name}</span>{row.isPlayingLive && <em className="live-team-tag">EN VIVO</em>}</EntityLink></td><td>{row.played}</td><td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td><b>{row.points}</b></td></tr>)}</tbody></table>
      : <p className="league-note">{loading || liveStandings.loading ? 'CARGANDO...' : 'SIN TABLA PUBLICADA.'}</p>}
    {rows.length > 0 && <PlayoffLegend format={progression}/>}
    <button className="sidebar-more" type="button" onClick={() => navigate('/torneos')}>VER TORNEO COMPLETO →</button>
  </section>;
}

export function MatchSidebar({ tournament, standings = [], teams = [], activeTournaments = [], resolveTeam, loading, navigate }) {
  const live = useApiQuery(signal => endpoints.matches({ status: 'live', activeOnly: 1, page: 1, pageSize: 20 }, signal));
  // Con la pestaña oculta no se consulta (antes seguía preguntando cada 12 s); al volver se refresca de inmediato.
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== 'hidden') live.retry(); };
    const timer = window.setInterval(tick, LIVE_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') live.retry(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [live.retry]);
  const liveMatches = (Array.isArray(live.data) ? live.data : []).filter(match => match.status === 'live');
  // Si hay un encuentro de liga en vivo, su torneo manda (otra edición de la liga).
  // Una gira nunca desplaza a la tabla de la liga.
  const leagueIds = new Set(activeTournaments.filter(item => item.format === 'league').map(item => String(item.id)));
  const liveLeague = liveMatches.find(match => match.tournament?.id && leagueIds.has(String(match.tournament.id)))?.tournament;
  const liveTournament = liveLeague ?? tournament;
  const fallbackStandings = String(liveTournament?.id) === String(tournament?.id) ? standings : [];
  return <aside className="match-sidebar">
    <LiveMatches rows={liveMatches} resolveTeam={resolveTeam}/>
    <StandingsPanel tournament={liveTournament} standings={fallbackStandings} resolveTeam={resolveTeam} loading={loading} navigate={navigate}/>
    <TrophyCase teams={teams}/>
  </aside>;
}
