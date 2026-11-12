import { useEffect, useMemo, useState } from 'react';
import { AwardsPanel } from './AwardsPanel.jsx';
import { PreseasonBracket } from './PreseasonPanel.jsx';
import { CupBracketView } from './CupPanel.jsx';
import { endpoints } from '../../api/endpoints.js';
import { EntityLink } from '../../components/EntityLink.jsx';
import { LiveMovement, LivePosition, LiveTableStatus, PlayoffLegend, liveRowClass, playoffZone } from '../../components/LiveStandings.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useAuth } from '../../app/AuthGate.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, PageHeader, gp } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';
import { useLiveStandings } from './useLiveStandings.js';
import { Button, Notice, useEmbedded } from '../../ui/index.js';

function StandingsTable({ rows, resolveTeam, zones = false }) {
  return <><LiveTableStatus rows={rows}/><div className="table-scroll"><table className="league-table"><colgroup><col className="rank-column"/><col className="team-column"/><col className="stat-column" span="8"/></colgroup><thead><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th className="optional-stat">GF</th><th className="optional-stat">GC</th><th className="optional-stat">DG</th><th>PTS</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.team_id ?? row.id} className={liveRowClass(row, zones ? playoffZone(index, rows.length) : '')}><td><LivePosition position={index + 1}/></td><td><EntityLink to="team" id={row.team_id ?? row.id} className="table-team-link"><LiveMovement row={row}/><TeamMark team={resolveTeam(row)}/>{row.name}{row.isPlayingLive && <em className="live-team-tag">EN VIVO</em>}</EntityLink></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td className="optional-stat">{row.gf}</td><td className="optional-stat">{row.ga}</td><td className="optional-stat">{row.gd}</td><td><b>{row.points}</b></td></tr>)}</tbody></table></div>{zones && <PlayoffLegend total={rows.length}/>}</>;
}

function GroupStandings({ tournamentId, groupLabel, resolveTeam }) {
  const standings = useLiveStandings(tournamentId, groupLabel);
  const rows = Array.isArray(standings.data) ? standings.data : [];
  return <section className="workspace-panel"><h4>GRUPO {groupLabel}</h4><DataState query={standings}/>{rows.length > 0 && <StandingsTable rows={rows} resolveTeam={resolveTeam}/>}</section>;
}

/** Serie empatada en el global: se define por penales. La anota quien opera los partidos. */
function PlayoffPenalties({ decisiveMatch }) {
  const { canOperateMatches } = useAuth();
  return <div className="playoff-tiebreak"><span>EMPATE EN EL GLOBAL · FALTA ANOTAR QUIÉN PASÓ POR PENALES</span>
    {canOperateMatches && decisiveMatch && <EntityLink to="match" id={decisiveMatch.id} className="playoff-leg-link">ANOTAR EN LA FICHA DEL PARTIDO →</EntityLink>}
  </div>;
}

function PlayoffSeriesCard({ series, resolveTeam, showWinner = true, onChanged }) {
  const stage = series.round === 'final' ? 'FINAL' : `${{ playin: 'PLAY-IN', quarterfinal: 'CUARTOS' }[series.round] ?? 'SEMIFINAL'} ${series.slot}`;
  const home = resolveTeam(series.homeTeam); const away = resolveTeam(series.awayTeam);
  const twoLegs = series.matches.length > 1;
  const firstLeg = series.matches.find(match => Number(match.leg) === 1) ?? series.matches[0];
  const secondLeg = twoLegs ? (series.matches.find(match => Number(match.leg) === 2) ?? series.matches[1]) : null;
  const matchTeamId = (match, side) => match?.[side === 'home' ? 'homeTeamId' : 'awayTeamId'] ?? match?.[side === 'home' ? 'home_team_id' : 'away_team_id'] ?? match?.[side === 'home' ? 'homeTeam' : 'awayTeam']?.id ?? match?.[side === 'home' ? 'home_team' : 'away_team']?.id;
  const sameTeam = (left, right) => left != null && right != null && String(left) === String(right);
  const matchScore = (match, side) => match?.[side === 'home' ? 'homeScore' : 'awayScore'] ?? match?.[side === 'home' ? 'home_score' : 'away_score'];
  const scoreFor = (match, team, side) => {
    if (!match) return '–';
    if (sameTeam(matchTeamId(match, 'home'), team.id)) return matchScore(match, 'home') ?? '–';
    if (sameTeam(matchTeamId(match, 'away'), team.id)) return matchScore(match, 'away') ?? '–';
    const reversedLeg = Number(match.leg) === 2;
    return side === 'home' ? matchScore(match, reversedLeg ? 'away' : 'home') ?? '–' : matchScore(match, reversedLeg ? 'home' : 'away') ?? '–';
  };
  const aggregateFor = (team, side) => {
    const scores = series.matches.map(match => Number(scoreFor(match, team, side)));
    return scores.every(Number.isFinite) ? scores.reduce((total, score) => total + score, 0) : '–';
  };
  const aggregate = { home: aggregateFor(home, 'home'), away: aggregateFor(away, 'away') };
  // La tanda de penales vive en el partido que definió la serie (la última vuelta); se muestra por equipo.
  const shootout = [...series.matches].reverse().find(match => match.penaltiesHome != null && match.penaltiesAway != null);
  const penaltiesFor = team => (sameTeam(matchTeamId(shootout, 'home'), team.id) ? shootout.penaltiesHome : shootout.penaltiesAway);
  const legLink = (match, label) => match ? <EntityLink to="match" id={match.id} className="playoff-leg-link">{label}</EntityLink> : <span>{label}</span>;
  return <article className={`playoff-series status-${series.status}`}><header className="playoff-series-head"><small>{stage}</small><span>{twoLegs ? 'IDA Y VUELTA' : 'PARTIDO ÚNICO'}</span></header><div className="playoff-score-table"><div className="playoff-score-heading"><span>CLUB</span>{legLink(firstLeg, twoLegs ? 'IDA' : 'ÚNICO')}{twoLegs ? legLink(secondLeg, 'VUELTA') : <span>—</span>}<span>GLOBAL</span></div>{[[home, 'home'], [away, 'away']].map(([team, side]) => <div className="playoff-score-row" key={team.id}><EntityLink to="team" id={team.id}><TeamMark team={team}/><span>{team.name}</span></EntityLink><b>{scoreFor(firstLeg, team, side)}</b><b>{scoreFor(secondLeg, team, side)}</b><b>{aggregate[side]}</b></div>)}</div>{shootout && <p className="playoff-penalties-result">PENALES · <b>{home.name} {penaltiesFor(home)}–{penaltiesFor(away)} {away.name}</b></p>}{series.status === 'awaiting_tiebreak' && <PlayoffPenalties decisiveMatch={[...series.matches].reverse().find(match => match.status === 'finished')}/>}{showWinner && series.winnerTeamId && <strong>CLASIFICA {series.winnerTeamId === home.id ? home.name : away.name}</strong>}</article>;
}

export function CreateTournamentForm({ teams, onChanged }) {
  const [form, setForm] = useState({ name: '', format: 'league', competitorKind: 'club', championPolicy: 'regular_season', teamIds: [] });
  const mutation = useApiMutation((body, signal) => endpoints.createTournament(body, signal), { onSuccess: onChanged });
  const candidates = teams.filter(team => team.kind === form.competitorKind);
  useEffect(() => {
    setForm(current => current.teamIds.length ? { ...current, teamIds: current.teamIds.filter(id => candidates.some(team => team.id === id)) } : { ...current, teamIds: candidates.map(team => team.id) });
  }, [form.competitorKind, teams]);
  const change = event => setForm(current => event.target.name === 'competitorKind'
    ? { ...current, competitorKind: event.target.value, teamIds: teams.filter(team => team.kind === event.target.value).map(team => team.id) }
    : { ...current, [event.target.name]: event.target.value });
  const toggle = teamId => setForm(current => ({ ...current, teamIds: current.teamIds.includes(teamId) ? current.teamIds.filter(id => id !== teamId) : [...current.teamIds, teamId] }));
  const submit = event => {
    event.preventDefault();
    if (window.confirm(`¿CREAR ${form.name} CON ${form.teamIds.length} PARTICIPANTES?`)) mutation.execute(form);
  };
  const invalidKnockout = form.format === 'knockout' && (form.teamIds.length < 2 || (form.teamIds.length & (form.teamIds.length - 1)) !== 0);
  return <form className="admin-form tournament-create-form" onSubmit={submit}><label>NOMBRE<input required name="name" value={form.name} onChange={change}/></label><label>FORMATO<select name="format" value={form.format} onChange={change}><option value="league">LIGA</option><option value="groups_knockout">GRUPOS + ELIMINACIÓN</option><option value="knockout">ELIMINACIÓN DIRECTA</option></select></label>{form.format === 'league' && <label>CAMPEONES<select name="championPolicy" value={form.championPolicy} onChange={change}><option value="regular_season">TABLA DE FASE REGULAR</option><option value="playoffs">PLAYOFFS</option><option value="both">LIGA REGULAR + PLAYOFFS</option></select></label>}<label>COMPETIDORES<select name="competitorKind" value={form.competitorKind} onChange={change}><option value="club">CLUBES</option><option value="national_team">SELECCIONES</option></select></label><section className="division-team-list"><p>PARTICIPANTES: <b>{form.teamIds.length}</b></p>{candidates.map(team => <label key={team.id}><input type="checkbox" checked={form.teamIds.includes(team.id)} onChange={() => toggle(team.id)}/><span>{team.name}</span></label>)}</section>{form.format === 'knockout' && <p className="admin-empty compact">La eliminación directa requiere 2, 4, 8, 16… participantes.</p>}<Button type="submit" disabled={mutation.loading || form.teamIds.length < 2 || invalidKnockout}>CREAR TORNEO</Button><FormFeedback mutation={mutation}/></form>;
}

const tournamentStartValue = tournament => tournament.startDate
  ?? tournament.start_date
  ?? tournament.startedAt
  ?? tournament.started_at
  ?? tournament.startAt
  ?? tournament.start_at
  ?? tournament.createdAt
  ?? tournament.created_at
  ?? tournament.date
  ?? '';

const tournamentStartTime = tournament => {
  const value = tournamentStartValue(tournament);
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
};

function ScorersPanel({ query }) {
  const rows = Array.isArray(query.data) ? query.data : [];
  return <section className="workspace-panel tournament-scorers"><h3>GOLEADORES</h3><DataState query={query} empty={null}/>
    {!query.loading && !query.error && (rows.length ? <ol className="tournament-scorer-list">{rows.map((row, index) => <li key={row.playerId ?? row.name}><b>{index + 1}</b><EntityLink to="player" id={row.playerId}>{row.playerName ?? row.name}</EntityLink><strong>{row.goals ?? 0}</strong></li>)}</ol> : <p className="empty-copy">AÚN NO HAY GOLES.</p>)}
  </section>;
}

// Rondas de los playoffs: con 8 clasificados parte en cuartos. Los cuartos se muestran en orden de cuadro
// (1.º-8.º y 4.º-5.º alimentan la semi 1; 2.º-7.º y 3.º-6.º, la semi 2).
const PLAYOFF_ROUNDS = { playin: { label: 'PLAY-IN', slots: [1, 2, 3] }, quarterfinal: { label: 'CUARTOS DE FINAL', slots: [1, 4, 2, 3] }, semifinal: { label: 'SEMIFINALES', slots: [1, 2] }, final: { label: 'FINAL', slots: [1] } };
const legsText = legs => (Number(legs) === 1 ? 'PARTIDO ÚNICO' : 'IDA Y VUELTA');

/** Un cruce que todavía no es una serie: sale de la tabla de hoy (CONFIRMADO cuando los dos puestos ya están asegurados) o espera a un ganador. */
function ProvisionalTie({ stage, home, away, confirmed = false, hint = null, resolveTeam }) {
  const side = entry => entry?.name
    ? <div><EntityLink to="team" id={entry.teamId} className="table-team-link"><TeamMark team={resolveTeam({ id: entry.teamId, name: entry.name })}/>{entry.rank}.º {entry.name}</EntityLink><small>{entry.points} PTS</small></div>
    : <div><span className="playoff-pending-side">{entry?.label ?? 'POR DEFINIR'}</span></div>;
  return <article className={`playoff-series is-provisional${confirmed ? ' is-confirmed' : ''}`}><header className="playoff-series-head"><small>{stage}</small><span>{confirmed ? 'CONFIRMADO' : 'PROVISIONAL'}</span></header>
    {side(home)}{side(away)}{hint && <p className="playoff-note">{hint}</p>}</article>;
}

// Explicación en palabras simples de cada cruce del cuadro de 6.
const PLAYOFF_HELP = {
  'playin:1': 'El 3.º contra el 4.º. Quien gane pasa a semifinales; quien pierda juega el Play-in 3.',
  'playin:2': 'El 5.º contra el 6.º. Quien gane juega el Play-in 3; quien pierda queda eliminado.',
  'playin:3': 'Segunda oportunidad: el perdedor del Play-in 1 contra el ganador del Play-in 2. Quien gane pasa a semifinales; quien pierda queda eliminado.',
  'semifinal:1': 'El 1.º de la tabla contra el ganador del Play-in 3.',
  'semifinal:2': 'El 2.º de la tabla contra el ganador del Play-in 1.',
  'final:1': 'Se enfrentan los ganadores de las dos semifinales. Quien gane es el campeón.',
};

function PlayoffsSection({ tournamentId, resolveTeam, playoffsEnabled = true }) {
  const playoffs = useApiQuery(signal => endpoints.playoffs(tournamentId, signal), [tournamentId]);
  const preview = useApiQuery(signal => endpoints.playoffsPreview(tournamentId, signal), [tournamentId]);
  const data = playoffs.data;
  const view = preview.data;
  if (playoffs.loading || playoffs.error) return null;
  const count = Number(data?.qualifiedCount ?? view?.qualifiedCount ?? 0);
  const done = data?.status === 'completed';
  // Sin playoffs creados todavía, o con parte del cuadro por jugar: se muestra cómo irían los cruces con la tabla de hoy.
  const pairs = !done && playoffsEnabled ? (view?.pairs ?? []) : [];
  if (!data && !pairs.length) return <section className="workspace-panel playoff-workspace"><h3>PLAYOFFS</h3><p className="league-note">TODAVÍA NO HAY TABLA SUFICIENTE PARA PROYECTAR LOS CRUCES.</p></section>;
  const rounds = count === 8 ? ['quarterfinal', 'semifinal', 'final'] : count === 6 ? ['playin', 'semifinal', 'final'] : ['semifinal', 'final'];
  const legs = { playin: 1, quarterfinal: data?.quarterfinalLegs ?? 2, semifinal: data?.semifinalLegs ?? (count === 6 ? 1 : 2), final: data?.finalLegs ?? (count === 6 ? 1 : 2) };
  const final = data?.series?.find(series => series.round === 'final');
  const champion = final?.winnerTeamId ? [resolveTeam(final.homeTeam), resolveTeam(final.awayTeam)].find(team => String(team.id) === String(final.winnerTeamId)) : null;
  const summary = rounds.map(round => `${PLAYOFF_ROUNDS[round].label} ${legsText(legs[round])}`).join(' · ');
  const real = (round, slot) => data?.series?.find(item => item.round === round && Number(item.slot) === slot);
  const firstRound = rounds[0];
  const pairAt = slot => pairs.find(pair => Number(pair.slot) === slot);
  const byes = view?.byes ?? [];
  const nameOf = pair => pair ? `${pair.home.rank}.º-${pair.away.rank}.º` : '';
  // Lo que se puede decir hoy de un cruce que todavía no es serie.
  const provisional = (round, slot) => {
    const label = `${PLAYOFF_ROUNDS[round].label}${round === 'final' ? '' : ` ${slot}`}`;
    if (count === 6 && round === 'playin' && slot === 3) return <ProvisionalTie key={slot} stage={label} home={{ label: `PERDEDOR DEL PLAY-IN 1 (${nameOf(pairAt(1))})` }} away={{ label: `GANADOR DEL PLAY-IN 2 (${nameOf(pairAt(2))})` }} resolveTeam={resolveTeam}/>;
    if (round === firstRound) { const pair = pairAt(slot); return pair ? <ProvisionalTie key={slot} stage={label} home={{ ...pair.home }} away={{ ...pair.away }} confirmed={pair.confirmed} resolveTeam={resolveTeam}/> : null; }
    if (count === 6 && round === 'semifinal') {
      const bye = byes[slot === 1 ? 0 : 1];
      return <ProvisionalTie key={slot} stage={label} home={bye ? { ...bye } : { label: 'POR DEFINIR' }} away={{ label: slot === 1 ? 'GANADOR DEL PLAY-IN 3' : `GANADOR DEL PLAY-IN 1 (${nameOf(pairAt(1))})` }} hint={bye && !bye.locked ? `EL ${bye.rank}.º TODAVÍA PUEDE CAMBIAR` : null} resolveTeam={resolveTeam}/>;
    }
    if (round === 'final') return <ProvisionalTie key={slot} stage={label} home={{ label: 'GANADOR DE LA SEMIFINAL 1' }} away={{ label: 'GANADOR DE LA SEMIFINAL 2' }} resolveTeam={resolveTeam}/>;
    return null;
  };
  return <section className="workspace-panel playoff-workspace"><h3>PLAYOFFS <small>TOP {count} · {summary}</small></h3>
    {(data?.qualifiers ?? []).filter(row => row.withdrawn).map(row => <p className="playoff-note" key={row.teamId}><b>{row.name}</b> ({row.tableRank}.º DE LA TABLA) SE RETIRÓ DE LOS PLAYOFFS: LOS DE ABAJO SUBIERON UN PUESTO. CONSERVA SU PUESTO Y SU PREMIO DE LA TABLA.</p>)}
    {!done && pairs.length > 0 && <p className="playoff-note">LOS CRUCES SE ARMAN CON LA TABLA DE HOY Y SE CONFIRMAN CUANDO LOS DOS PUESTOS QUEDAN ASEGURADOS.</p>}
    {count === 6 && <details className="playoff-howto-box"><summary>CÓMO FUNCIONAN LOS PLAYOFFS</summary><ol>
      <li><b>Clasifican los 6 primeros de la tabla.</b> Todos los partidos son únicos: no hay vuelta.</li>
      <li><b>El 1.º y el 2.º pasan directo a las semifinales</b> y esperan descansados.</li>
      <li><b>Del 3.º al 6.º juegan el play-in:</b> el 3.º contra el 4.º (Play-in 1) y el 5.º contra el 6.º (Play-in 2).</li>
      <li><b>Play-in 1:</b> el que gana pasa a semifinales; el que pierde tiene una segunda oportunidad.</li>
      <li><b>Play-in 2:</b> el que gana sigue vivo; el que pierde queda eliminado.</li>
      <li><b>Play-in 3 (segunda oportunidad):</b> el perdedor del Play-in 1 contra el ganador del Play-in 2. El que gana pasa a semifinales; el que pierde queda eliminado.</li>
      <li><b>Semifinales:</b> el 1.º contra el ganador del Play-in 3, y el 2.º contra el ganador del Play-in 1. Los dos ganadores juegan la <b>final</b>.</li></ol></details>}
    <div className={`playoff-tree rounds-${rounds.length}`}>{rounds.map(round => <section className={`playoff-col playoff-col-${round}`} key={round}>
      <h4>{PLAYOFF_ROUNDS[round].label}</h4>
      {PLAYOFF_ROUNDS[round].slots.map(slot => {
        const series = real(round, slot);
        const help = count === 6 ? PLAYOFF_HELP[`${round}:${slot}`] : null;
        const card = series
          ? <PlayoffSeriesCard key={slot} series={series} resolveTeam={resolveTeam} showWinner={round !== 'final'} onChanged={() => { playoffs.retry(); preview.retry(); }}/>
          : (!done && provisional(round, slot)) || <p key={slot} className="playoff-awaiting">{round === 'final' ? 'ESPERANDO FINALISTAS' : 'POR DEFINIR'}</p>;
        return <div className="playoff-slot" key={slot}>{help && <p className="playoff-help">{help}</p>}{card}</div>;
      })}
    </section>)}</div>
    {champion && <div className="playoff-champion" role="status"><span aria-hidden="true">🏆</span><strong>CAMPEÓN: {champion.name}</strong></div>}
  </section>;
}

/** La Copa Grande Giocatore se ve como su cuadro, con los cupos que dio la tabla del torneo anterior. */
function CupWorkspace({ tournamentId, teams, onChanged }) {
  const bracket = useApiQuery(signal => endpoints.cupBracket(tournamentId, signal), [tournamentId]);
  if (!bracket.data) return <DataState query={bracket}/>;
  return <section className="workspace-panel"><CupBracketView cup={bracket.data} teams={teams} onChanged={() => { bracket.retry(); onChanged?.(); }}/></section>;
}

/** Una gira se ve como su cuadro (no tiene tabla ni goleadores propios). */
function PreseasonWorkspace({ tournamentId, teams, onChanged }) {
  const bracket = useApiQuery(signal => endpoints.preseasonBracket(tournamentId, signal), [tournamentId]);
  const names = Object.fromEntries(teams.map(team => [team.id, team.name]));
  const teamIndex = Object.fromEntries(teams.map(team => [team.id, team]));
  if (!bracket.data) return <DataState query={bracket}/>;
  return <section className="workspace-panel"><h3>CUADRO DE LA GIRA <small>{bracket.data.size} CLUBES · {bracket.data.size === 6 ? '2 GRUPOS DE 3 · ' : ''}PARTIDO ÚNICO · FINAL Y 3.ER LUGAR</small></h3>
    <PreseasonBracket bracket={{ ...bracket.data, teamNames: names, teamIndex }} onChanged={() => { bracket.retry(); onChanged?.(); }}/></section>;
}

function TournamentWorkspace({ tournamentId, teams, onChanged, onDeleted, hideName = false, initialTab = 'standings', onTab = null }) {
  const { isAdmin } = useAuth();
  // Dentro de Liga, la tabla, los goleadores y los playoffs son pestañas de la pantalla: el torneo no repite las suyas.
  const embedded = useEmbedded();
  const [workspaceTab, setWorkspaceTabState] = useState(['standings', 'scorers', 'playoffs', 'awards'].includes(initialTab) ? initialTab : 'standings');
  const setWorkspaceTab = value => { setWorkspaceTabState(value); onTab?.(value); };
  const detail = useApiQuery(signal => endpoints.tournament(tournamentId, signal), [tournamentId]);
  const standings = useLiveStandings(tournamentId);
  const scorers = useApiQuery(signal => endpoints.scorers(tournamentId, signal), [tournamentId]);
  const standingRows = Array.isArray(standings.data) ? standings.data : [];
  const teamIndex = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);
  const resolveTeam = team => ({ ...team, ...(teamIndex.get(team?.id ?? team?.team_id) ?? {}) });
  const groupLabels = useMemo(() => [...new Set((detail.data?.teams ?? []).map(team => team.groupLabel).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right))), [detail.data]);
  const refresh = () => { detail.retry(); standings.retry(); scorers.retry(); onChanged?.(); };
  const remove = useApiMutation(signal => endpoints.deleteTournament(tournamentId, signal), { onSuccess: () => onDeleted?.() });
  const deleteTournament = () => {
    const played = standingRows.reduce((sum, row) => sum + Number(row.played ?? 0), 0);
    const warning = played ? ` Tiene partidos jugados: se borran sus resultados, goles y títulos.` : '';
    if (window.confirm(`¿Eliminar ${detail.data?.name ?? 'este torneo'} para siempre?${warning} Esto no se puede deshacer.`)) remove.execute();
  };
  useEffect(() => { setWorkspaceTab(initialTab); }, [tournamentId]);
  useEffect(() => { if (embedded) setWorkspaceTabState(['standings', 'scorers', 'playoffs', 'awards'].includes(initialTab) ? initialTab : 'standings'); }, [initialTab, embedded]);
  const data = detail.data;
  const statusLabel = { active: 'EN JUEGO', completed: 'TERMINADO', draft: 'EN PREPARACIÓN' }[data?.status] ?? data?.status;
  const regularChampionId = data?.championTeamId ?? data?.champion_team_id;
  const regularChampionRow = regularChampionId
    ? standingRows.find(row => String(row.team_id ?? row.id) === String(regularChampionId))
    : standingRows[0];
  const regularChampion = data?.status === 'completed' && data?.format === 'league' && data?.championPolicy !== 'playoffs' && groupLabels.length === 0 && regularChampionRow
    ? resolveTeam(regularChampionRow)
    : null;

  return <section className="tournament-workspace"><DataState query={detail}/>{data && <>
    <header className="tournament-header"><div><small>{data.format === 'league' ? 'LIGA' : data.format === 'knockout' ? 'ELIMINACIÓN DIRECTA' : 'GRUPOS + ELIMINACIÓN'}{data.format === 'league' ? ` · CAMPEONES: ${data.championPolicy === 'both' ? 'LIGA REGULAR + PLAYOFFS' : data.championPolicy === 'playoffs' ? 'PLAYOFFS' : 'TABLA'}` : ''}</small>{hideName ? null : <h2>{data.name}</h2>}</div><b className={`status status-${data.status}`}>{statusLabel}</b>{isAdmin && <a className="tournament-manage-button" href={`#/admin?tab=torneos&id=${data.id}`}>⚙ Gestionar en la sala de control</a>}{isAdmin && <Button variant="danger" type="button" disabled={remove.loading} onClick={deleteTournament}>ELIMINAR TORNEO</Button>}</header>{isAdmin && (remove.error || remove.success) && <FormFeedback mutation={remove}/>}
    {data.rules?.kind === 'grande_giocatore' ? <CupWorkspace tournamentId={tournamentId} teams={teams} onChanged={refresh}/> : data.rules?.kind === 'preseason' ? <PreseasonWorkspace tournamentId={tournamentId} teams={teams} onChanged={refresh}/> : <>
      {!embedded && <nav className="tournament-subtabs" aria-label="Secciones del torneo" role="tablist">
        <button type="button" role="tab" aria-selected={workspaceTab === 'standings'} className={workspaceTab === 'standings' ? 'active' : ''} onClick={() => setWorkspaceTab('standings')}>TABLA DE POSICIONES</button>
        <button type="button" role="tab" aria-selected={workspaceTab === 'scorers'} className={workspaceTab === 'scorers' ? 'active' : ''} onClick={() => setWorkspaceTab('scorers')}>GOLEADORES</button>
        <button type="button" role="tab" aria-selected={workspaceTab === 'playoffs'} className={workspaceTab === 'playoffs' ? 'active' : ''} onClick={() => setWorkspaceTab('playoffs')} disabled={data.format !== 'league'}>PLAYOFFS</button>
        {data.format === 'league' && data.competitorKind !== 'national_team' && <button type="button" role="tab" aria-selected={workspaceTab === 'awards'} className={workspaceTab === 'awards' ? 'active' : ''} onClick={() => setWorkspaceTab('awards')}>PREMIOS</button>}
      </nav>}
      <div className="tournament-main">
        {workspaceTab === 'standings' && (groupLabels.length > 0
          ? <section className="workspace-panel standings-workspace-panel"><h3>CLASIFICACIÓN POR GRUPOS</h3><div className="tournament-groups">{groupLabels.map(groupLabel => <GroupStandings key={groupLabel} tournamentId={tournamentId} groupLabel={groupLabel} resolveTeam={resolveTeam}/>)}</div></section>
          : <section className="workspace-panel standings-workspace-panel"><h3>TABLA DE POSICIONES</h3><DataState query={standings}/>{standingRows.length > 0 && <StandingsTable rows={standingRows} resolveTeam={resolveTeam} zones={data?.format === 'league' && data?.championPolicy !== 'regular_season'}/>} {regularChampion && <div className="playoff-champion" role="status"><span aria-hidden="true">🏆</span><TeamMark team={regularChampion}/><strong>CAMPEÓN: {regularChampion.name}</strong></div>}</section>)}
        {workspaceTab === 'scorers' && <ScorersPanel query={scorers}/>}
        {workspaceTab === 'playoffs' && data.format === 'league' && <PlayoffsSection tournamentId={tournamentId} resolveTeam={resolveTeam} playoffsEnabled={data.championPolicy !== 'regular_season'}/>}
        {workspaceTab === 'awards' && (data.format === 'league' && data.competitorKind !== 'national_team'
          ? <AwardsPanel tournament={data} resolveTeam={resolveTeam}/>
          : <p className="empty-copy">ESTE TORNEO NO TIENE PREMIOS INDIVIDUALES: SOLO LAS LIGAS DE CLUBES.</p>)}
      </div>
    </>}
  </>}</section>;
}

// Torneo y vista quedan en el enlace (#/torneos?vista=goleadores|playoffs&torneo=…) para compartirlo o volver al mismo lugar.
const VIEW_PARAM = { standings: 'tabla', scorers: 'goleadores', playoffs: 'playoffs', awards: 'premios' };
const VIEW_FROM_PARAM = Object.fromEntries(Object.entries(VIEW_PARAM).map(([key, value]) => [value, key]));
const writeUrl = (id, view) => {
  const params = new URLSearchParams();
  if (view && view !== 'standings') params.set('vista', VIEW_PARAM[view]);
  if (id) params.set('torneo', id);
  try { window.history.replaceState(null, '', `#/torneos${params.size ? `?${params}` : ''}`); } catch { /* sin historial: no pasa nada */ }
};

export function TournamentsPage({ teams = [], initialId = null, initialView = null }) {
  const tournaments = useApiQuery(signal => endpoints.tournaments({ page: 1, pageSize: 100 }, signal));
  const [selectedId, setSelectedId] = useState(initialId);
  const [view, setView] = useState(VIEW_FROM_PARAM[initialView] ?? 'standings');
  const { isAdmin } = useAuth();
  // Las giras viven en su pestaña (GIRAS): no se repiten aquí como un torneo más.
  const all = (Array.isArray(tournaments.data) ? tournaments.data : []).filter(item => item.rules?.kind !== 'preseason');
  const priority = tournament => tournament.format === 'league' || /liga/i.test(tournament.name ?? '') ? 0 : 1;
  const active = useMemo(() => all.filter(item => item.status !== 'completed').sort((a, b) => priority(a) - priority(b) || (a.name ?? '').localeCompare(b.name ?? '', 'es')), [all]);
  const completed = useMemo(() => all
    .filter(item => item.status === 'completed')
    .sort((a, b) => tournamentStartTime(b) - tournamentStartTime(a) || (a.name ?? '').localeCompare(b.name ?? '', 'es')), [all]);
  // Por defecto, el torneo en curso más importante (o el último jugado si no hay ninguno en curso).
  useEffect(() => {
    if (!all.length || all.some(item => item.id === selectedId)) return;
    setSelectedId(active[0]?.id ?? completed[0]?.id ?? null);
  }, [all, active, completed, selectedId]);
  // Un enlace nuevo a otro torneo (desde una noticia o un partido) cambia la selección.
  useEffect(() => { if (initialId) setSelectedId(initialId); }, [initialId]);
  // En Liga la vista la manda la pestaña de la pantalla.
  useEffect(() => { if (VIEW_FROM_PARAM[initialView]) setView(VIEW_FROM_PARAM[initialView]); }, [initialView]);
  const choose = id => { setSelectedId(id); writeUrl(id, view); };
  const changeView = value => { setView(value); writeUrl(selectedId, value); };
  const deleted = () => { setSelectedId(null); tournaments.retry(); };
  const selectedCompletedId = completed.some(item => item.id === selectedId) ? selectedId : '';
  // Con selector de torneos en curso, el botón activo ya dice el nombre: el encabezado no lo repite.
  const nameInPicker = active.length > 1 && active.some(item => item.id === selectedId);
  return <main className="newspaper data-page"><section className="data-paper">
    <PageHeader kicker="COMPETICIONES OFICIALES" title="TORNEOS">{isAdmin && <a className="page-action" href="#/admin?tab=torneos">⚙ ADMINISTRAR TORNEOS</a>}</PageHeader>
    <DataState query={tournaments} empty={null}/>
    {all.length > 0 && <div className="tournament-chooser">
      {/* Con un solo torneo en curso no hace falta elegir: los botones aparecen desde dos. */}
      {active.length > 1 && <div className="tournament-picker" role="group" aria-label="Torneos en curso">
        {active.map(item => <button type="button" key={item.id} className={selectedId === item.id ? 'active' : ''} aria-pressed={selectedId === item.id} onClick={() => choose(item.id)}>{item.name}</button>)}
      </div>}
      {active.length === 1 && selectedId !== active[0].id && <span className="tournament-live-label"><i aria-hidden="true"/>EN CURSO: <b>{active[0].name}</b><button type="button" onClick={() => choose(active[0].id)}>VOLVER</button></span>}
      {completed.length > 0 && <label className="tournament-history-select">ANTERIORES
        <select value={selectedCompletedId} onChange={event => event.target.value && choose(event.target.value)}>
          <option value="">{selectedCompletedId ? 'ELEGIR…' : 'VER UN TORNEO JUGADO…'}</option>
          {completed.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </div>}
    {!tournaments.loading && !all.length && <p className="empty-copy">AÚN NO HAY TORNEOS.</p>}
    {selectedId && <TournamentWorkspace key={selectedId} tournamentId={selectedId} teams={teams} hideName={nameInPicker} initialTab={view} onTab={changeView} onChanged={() => tournaments.retry()} onDeleted={deleted}/>}
  </section></main>;
}

export function RankingsPage({ teams = [], navigate }) {
  const rankings = useApiQuery(signal => endpoints.squadRankings({ page: 1, pageSize: 100 }, signal));
  const divisions = useApiQuery(signal => endpoints.divisions(signal));
  const rankingRows = Array.isArray(rankings.data) ? rankings.data : [];
  const divisionRows = Array.isArray(divisions.data) ? divisions.data : Object.entries(divisions.data ?? {}).map(([name, members]) => ({ name, teams: Array.isArray(members) ? members : [] }));
  const teamIndex = new Map(teams.map(team => [team.id, team]));
  return <main className="newspaper data-page"><section className="data-paper"><PageHeader kicker="ESTADÍSTICAS DE EQUIPOS" title="RANKINGS Y DIVISIONES"/><div className="workspace-columns"><section className="workspace-panel"><h3>VALOR DE PLANTELES</h3><DataState query={rankings}/>{rankingRows.map((row, index) => <p className="ranking-row ranking-team-row" key={row.teamId ?? row.team_id ?? row.id}><b>{index + 1}</b><TeamMark team={{ ...row, ...(teamIndex.get(row.teamId ?? row.team_id ?? row.id) ?? {}) }}/><EntityLink to="team" id={row.teamId ?? row.team_id ?? row.id}>{row.teamName ?? row.team_name ?? row.name}</EntityLink><strong>{gp(row.squadValue ?? row.squad_value ?? row.value)}</strong></p>)}</section><section className="workspace-panel"><h3>DIVISIONES</h3><DataState query={divisions}/>{divisionRows.map(row => <p className="ranking-row division-row" key={row.id ?? row.name}><span>{String(row.name ?? row.division).replaceAll('_', ' ').toUpperCase()}</span><strong>{row.teamCount ?? row.team_count ?? row.teams?.length ?? '—'} EQUIPOS</strong></p>)}</section></div></section></main>;
}
