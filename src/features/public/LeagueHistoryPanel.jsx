import { useMemo, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { EntityLink } from '../../components/EntityLink.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { Card, Tabs } from '../../ui/index.js';
import { DataState } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';

// Historia de toda la liga (no de un torneo): palmarés, tabla histórica, récords, jugadores, evolución y cara a cara.
// Todo sale de /league-history; la tabla histórica se suma aquí según el filtro.

const SECTIONS = [
  { id: 'palmares', label: 'Palmarés' }, { id: 'tabla', label: 'Tabla histórica' }, { id: 'records', label: 'Récords' },
  { id: 'jugadores', label: 'Jugadores' }, { id: 'evolucion', label: 'Evolución' }, { id: 'cara', label: 'Cara a cara' },
];
const AWARD_LABELS = { balon_oro: 'Balón de Oro', bota_oro: 'Bota de Oro', guante_oro: 'Guante de Oro', golden_boy: 'Golden Boy', dt_torneo: 'DT del torneo' };
const decimal = (value, digits = 2) => Number(value ?? 0).toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (part, total) => (total ? `${Math.round(part / total * 100)}%` : '—');

export function LeagueHistoryPanel({ teams = [] }) {
  const query = useApiQuery(signal => endpoints.leagueHistory(signal), []);
  const [section, setSection] = useState('palmares');
  const history = query.data;
  const club = useMemo(() => {
    const live = new Map(teams.map(team => [team.id, team]));
    const stored = new Map((history?.teams ?? []).map(team => [team.id, team]));
    return id => ({ id, ...(stored.get(id) ?? { name: 'Equipo eliminado' }), ...(live.get(id) ?? {}) });
  }, [teams, history]);
  if (!history) return <DataState query={query}/>;
  return <div className="league-history">
    <Tabs tabs={SECTIONS} value={section} onChange={setSection} label="Secciones de la historia" className="league-history-tabs"/>
    {section === 'palmares' && <Honours history={history} club={club}/>}
    {section === 'tabla' && <AllTimeTable history={history} club={club}/>}
    {section === 'records' && <Records history={history} club={club}/>}
    {section === 'jugadores' && <Players history={history} club={club}/>}
    {section === 'evolucion' && <Evolution history={history} club={club}/>}
    {section === 'cara' && <Matrix history={history} club={club}/>}
  </div>;
}

function Club({ id, club, short = false }) {
  const team = club(id);
  if (!id) return <span className="history-club is-empty">—</span>;
  const body = <><TeamMark team={team} className="history-crest"/>{!short && <span>{team.name}</span>}</>;
  return team.hidden ? <span className="history-club is-gone" title={team.name}>{body}</span> : <EntityLink to="team" id={id} className="history-club" title={team.name}>{body}</EntityLink>;
}

function MatchLine({ match, club }) {
  const pens = match.penalties ? ` (${match.penalties.home}-${match.penalties.away} pen.)` : '';
  return <EntityLink to="match" id={match.matchId} className="history-match">
    <small>{match.edition}</small>
    <span className="history-match-team"><TeamMark team={club(match.homeTeamId)} className="history-crest"/><span>{club(match.homeTeamId).name}</span></span>
    <b>{match.homeScore}-{match.awayScore}{pens}</b>
    <span className="history-match-team is-away"><span>{club(match.awayTeamId).name}</span><TeamMark team={club(match.awayTeamId)} className="history-crest"/></span>
  </EntityLink>;
}

function Labels({ items, tone = '' }) {
  if (!items?.length) return <span className="history-none">—</span>;
  return <span className="history-labels">{items.map((item, index) => <i key={`${item}-${index}`} className={tone}>{item}</i>)}</span>;
}

/* ───────────── Palmarés ───────────── */

function finalScore(final) {
  if (!final) return '—';
  // Siempre desde el lado del campeón: "8-2", no "2-8" según quién fue local en la ida.
  const flip = final.winnerTeamId && final.winnerTeamId === final.awayTeamId;
  const [a, b] = flip ? [final.aggregate.away, final.aggregate.home] : [final.aggregate.home, final.aggregate.away];
  const pens = final.penalties ? ` · pen. ${flip ? final.penalties.away : final.penalties.home}-${flip ? final.penalties.home : final.penalties.away}` : '';
  return `${a}-${b}${final.legs.length > 1 ? ' (global)' : ''}${pens}`;
}

function Honours({ history, club }) {
  const { totals } = history.records;
  const leagues = [...history.editions].filter(edition => edition.kind === 'league').reverse();
  const cups = [...history.editions].filter(edition => edition.kind === 'cup').reverse();
  return <>
    <div className="history-totals">
      <span><b>{totals.editions}</b>ligas</span><span><b>{totals.cups}</b>copas GG</span><span><b>{history.tours.length}</b>giras</span>
      <span><b>{totals.matches.toLocaleString('es-CL')}</b>partidos</span><span><b>{totals.goals.toLocaleString('es-CL')}</b>goles</span>
      <span><b>{decimal(totals.goals / Math.max(1, totals.matches))}</b>goles por partido</span>
    </div>
    <Card title="TÍTULOS POR CLUB" className="history-card">
      <div className="table-scroll"><table className="history-table">
        <thead><tr><th className="left">Club</th><th>Títulos</th><th className="left">Ligas</th><th className="left">Copas GG</th><th title="Finales perdidas">Subcamp.</th><th title="Veces que terminó 1.º la fase regular">1.º fase reg.</th><th>Giras</th></tr></thead>
        <tbody>{history.honours.map(row => <tr key={row.teamId}>
          <td className="left"><Club id={row.teamId} club={club}/></td><td className="strong">{row.total}</td>
          <td className="left"><Labels items={row.leagues} tone="is-league"/></td><td className="left"><Labels items={row.cups} tone="is-cup"/></td>
          <td>{row.finalsLost || '—'}</td><td>{row.leaderships.length || '—'}</td><td>{row.tours.length || '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
    <Card title="EDICIÓN POR EDICIÓN" className="history-card">
      <div className="table-scroll"><table className="history-table history-editions">
        <thead><tr><th className="left">Edición</th><th className="left">Campeón</th><th>Final</th><th className="left">Subcampeón</th><th className="left">1.º fase regular</th><th className="left">Goleador</th><th className="left">Balón de Oro</th></tr></thead>
        <tbody>{leagues.map(edition => <tr key={edition.id} className={edition.status === 'active' ? 'is-live' : ''}>
          <td className="left"><b>{edition.label}</b>{edition.status === 'active' && <small className="history-live">EN CURSO</small>}</td>
          <td className="left">{edition.championTeamId ? <Club id={edition.championTeamId} club={club}/> : <span className="history-none">{edition.status === 'active' ? 'por jugarse' : 'sin campeón'}</span>}</td>
          <td className="nowrap">{edition.final?.legs?.length ? <EntityLink to="match" id={edition.final.legs.at(-1).matchId}>{finalScore(edition.final)}</EntityLink> : '—'}</td>
          <td className="left">{edition.runnerUpTeamId ? <Club id={edition.runnerUpTeamId} club={club}/> : '—'}</td>
          <td className="left">{edition.leaderTeamId ? <Club id={edition.leaderTeamId} club={club} short/> : '—'}{edition.table?.[0] && <small className="history-sub"> {edition.table[0].points} pts</small>}</td>
          <td className="left">{edition.topScorers.length ? edition.topScorers.map(scorer => <span key={scorer.playerId} className="history-player"><EntityLink to="player" id={scorer.playerId}>{scorer.name}</EntityLink> <small>{scorer.goals}</small></span>) : '—'}</td>
          <td className="left">{edition.awards.balon_oro ? <EntityLink to="player" id={edition.awards.balon_oro.playerId}>{edition.awards.balon_oro.name}</EntityLink> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="history-note">El marcador de la final va desde el lado del campeón. El Balón de Oro se entrega desde la v10.</p>
    </Card>
    <div className="history-grid">
      <Card title="COPA GRANDE GIOCATORE" className="history-card">
        <ul className="history-list">{cups.map(edition => <li key={edition.id}><b>{edition.label}</b>
          {edition.championTeamId ? <><Club id={edition.championTeamId} club={club}/><small>{edition.final ? `${finalScore(edition.final)} vs ${club(edition.runnerUpTeamId).name}` : ''}</small></> : <small>en juego</small>}</li>)}</ul>
      </Card>
      <Card title="GIRAS DE PRETEMPORADA" className="history-card">
        <ul className="history-list">{history.tours.map(tour => <li key={tour.id}><b>{tour.name.replace(/^gira\s+por\s+/i, '')}</b><Club id={tour.teamId} club={club}/>{tour.season && <small>{tour.season.replace(/^Koinonia E-League /i, '')}</small>}</li>)}</ul>
      </Card>
    </div>
  </>;
}

/* ───────────── Tabla histórica ───────────── */

function AllTimeTable({ history, club }) {
  const [phase, setPhase] = useState('league');
  const [era, setEra] = useState('all');
  const [order, setOrder] = useState('points');
  const seasonOf = useMemo(() => new Map(history.editions.map(edition => [edition.id, edition])), [history]);
  const rows = useMemo(() => {
    const map = new Map();
    for (const split of history.splits) {
      const edition = seasonOf.get(split.tournamentId);
      if (!edition) continue;
      if (phase === 'league' && split.stage !== 'league') continue;
      if (era === 'v11' && (edition.season ?? 0) < 11) continue;
      const row = map.get(split.teamId) ?? { teamId: split.teamId, editions: new Set(), played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 };
      if (split.stage === 'league') row.editions.add(split.tournamentId);
      for (const key of ['played', 'wins', 'draws', 'losses', 'gf', 'ga', 'points']) row[key] += split[key];
      map.set(split.teamId, row);
    }
    const score = row => (order === 'ppg' ? row.points / Math.max(1, row.played) : row.points);
    return [...map.values()].sort((a, b) => score(b) - score(a) || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }, [history, seasonOf, phase, era, order]);
  return <Card title="TABLA HISTÓRICA" className="history-card">
    <div className="history-filters">
      <Toggle value={phase} onChange={setPhase} options={[['league', 'Fase regular'], ['all', 'Con playoffs y copa']]} label="Qué partidos"/>
      <Toggle value={era} onChange={setEra} options={[['all', 'Todas las ediciones'], ['v11', 'Desde la v11']]} label="Desde cuándo"/>
      <Toggle value={order} onChange={setOrder} options={[['points', 'Por puntos'], ['ppg', 'Por promedio']]} label="Orden"/>
    </div>
    <div className="table-scroll"><table className="history-table history-alltime">
      <thead><tr><th>#</th><th className="left">Club</th><th title="Ligas jugadas">Ed.</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th><th title="Puntos por partido">Prom.</th><th title="Porcentaje de partidos ganados">% G</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.teamId}>
        <td className="strong">{index + 1}</td><td className="left"><Club id={row.teamId} club={club}/></td><td>{row.editions.size}</td>
        <td>{row.played}</td><td className="win">{row.wins}</td><td className="draw">{row.draws}</td><td className="loss">{row.losses}</td>
        <td>{row.gf}</td><td>{row.ga}</td><td>{row.gf - row.ga > 0 ? '+' : ''}{row.gf - row.ga}</td><td className="strong">{row.points}</td>
        <td>{decimal(row.points / Math.max(1, row.played))}</td><td>{percent(row.wins, row.played)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="history-note">Victoria 3, empate 1. Incluye la liga en curso. En eliminatorias, el empate que se definió por penales cuenta como empate. Los partidos castigados cuentan con su resultado oficial.</p>
  </Card>;
}

function Toggle({ value, onChange, options, label }) {
  return <div className="history-toggle" role="group" aria-label={label}>{options.map(([id, text]) =>
    <button type="button" key={id} className={value === id ? 'active' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>;
}

/* ───────────── Récords ───────────── */

function Streaks({ rows, club, unit = 'partidos' }) {
  return <ol className="history-rank">{rows.slice(0, 5).map((row, index) => <li key={`${row.teamId}-${index}`}>
    <Club id={row.teamId} club={club}/><b>{row.length}</b><small>{unit} · {row.from.edition === row.to.edition ? row.from.edition : `${row.from.edition} a ${row.to.edition}`}{row.ongoing ? ' · vigente' : ''}</small>
  </li>)}</ol>;
}

function Campaigns({ rows, club, value }) {
  return <ol className="history-rank">{rows.slice(0, 5).map(row => <li key={`${row.teamId}-${row.edition}`}>
    <Club id={row.teamId} club={club}/><b>{value(row)}</b><small>{row.edition} · {row.points} pts en {row.played} · {row.wins}G {row.draws}E {row.losses}P{row.champion ? ' · campeón' : ''}</small>
  </li>)}</ol>;
}

function Records({ history, club }) {
  const records = history.records;
  const [streak, setStreak] = useState('wins');
  const streakTabs = [['wins', 'Victorias seguidas'], ['unbeaten', 'Invicto'], ['losses', 'Derrotas seguidas'], ['winless', 'Sin ganar']];
  return <div className="history-grid">
    <Card title="LAS GOLEADAS MÁS GRANDES" className="history-card">
      <div className="history-matches">{records.biggestWins.slice(0, 6).map(match => <MatchLine key={match.matchId} match={match} club={club}/>)}</div>
      <p className="history-note">No cuentan los castigos ni los partidos con más de un gol sin jugador asignado.</p>
    </Card>
    <Card title="LOS PARTIDOS CON MÁS GOLES" className="history-card">
      <div className="history-matches">{records.highestScoring.slice(0, 6).map(match => <MatchLine key={match.matchId} match={match} club={club}/>)}</div>
    </Card>
    <Card title="RACHAS" className="history-card">
      <Toggle value={streak} onChange={setStreak} options={streakTabs} label="Tipo de racha"/>
      <Streaks rows={records.streaks[streak]} club={club}/>
      <p className="history-note">Partido a partido entre ligas, playoffs y copa (sin giras). Una racha puede cruzar de una edición a otra.</p>
    </Card>
    <Card title="MEJORES CAMPAÑAS" className="history-card">
      <Campaigns rows={records.campaigns.best} club={club} value={row => decimal(row.ppg)}/>
      <p className="history-note">Puntos por partido en la fase regular: las ediciones no tuvieron siempre la misma cantidad de fechas.</p>
    </Card>
    <Card title="PEORES CAMPAÑAS" className="history-card">
      <Campaigns rows={records.campaigns.worst} club={club} value={row => decimal(row.ppg)}/>
    </Card>
    <Card title="MEJOR ATAQUE EN UNA EDICIÓN" className="history-card">
      <Campaigns rows={records.campaigns.attack} club={club} value={row => decimal(row.gf / row.played)}/>
      <p className="history-note">Goles a favor por partido.</p>
    </Card>
    <Card title="MEJOR DEFENSA EN UNA EDICIÓN" className="history-card">
      <Campaigns rows={records.campaigns.defense} club={club} value={row => decimal(row.ga / row.played)}/>
      <p className="history-note">Goles en contra por partido.</p>
    </Card>
    {records.campaigns.unbeaten.length > 0 && <Card title="CAMPAÑAS INVICTAS" className="history-card">
      <Campaigns rows={records.campaigns.unbeaten} club={club} value={row => row.points}/>
    </Card>}
    <Card title="HAT-TRICKS" className="history-card" aside={<small>{records.hatTrickCount} en total</small>}>
      <ol className="history-rank">{records.hatTrickLeaders.slice(0, 5).map(row => <li key={row.playerId}>
        <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink><b>{row.count}</b><small>hat-tricks</small></li>)}</ol>
      <h4 className="history-subtitle">Más goles de un jugador en un partido</h4>
      <ul className="history-list">{records.hatTricks.slice(0, 5).map(row => <li key={`${row.matchId}-${row.playerId}`}>
        <b>{row.goals}</b><EntityLink to="player" id={row.playerId}>{row.name}</EntityLink>
        <EntityLink to="match" id={row.matchId}><small>{row.match.edition} · {club(row.match.homeTeamId).name} {row.match.homeScore}-{row.match.awayScore} {club(row.match.awayTeamId).name}</small></EntityLink></li>)}</ul>
    </Card>
    <Card title="FINALES MÁS ABULTADAS" className="history-card">
      <ul className="history-list">{records.finals.slice(0, 6).map(final => <li key={final.edition}>
        <b>{final.edition}</b><Club id={final.winnerTeamId} club={club}/>
        <small>{finalScore(final)} a {club(final.winnerTeamId === final.homeTeamId ? final.awayTeamId : final.homeTeamId).name}</small></li>)}</ul>
    </Card>
    <Card title="DEFINICIONES POR PENALES" className="history-card">
      {records.shootouts.length ? <>
        <ol className="history-rank">{records.shootouts.map(row => <li key={row.teamId}><Club id={row.teamId} club={club}/><b>{row.won}-{row.lost}</b><small>ganadas-perdidas</small></li>)}</ol>
        <div className="history-matches">{records.shootoutMatches.slice(0, 5).map(match => <MatchLine key={match.matchId} match={match} club={club}/>)}</div>
      </> : <p className="empty-copy">Todavía no hubo tandas de penales.</p>}
    </Card>
  </div>;
}

/* ───────────── Jugadores ───────────── */

function Players({ history, club }) {
  const players = history.players;
  const [count, setCount] = useState(15);
  return <>
    <Card title="GOLEADORES HISTÓRICOS" className="history-card">
      <div className="table-scroll"><table className="history-table">
        <thead><tr><th>#</th><th className="left">Jugador</th><th>Goles</th><th title="Ligas en las que marcó">Ligas con gol</th><th className="left">Por club</th></tr></thead>
        <tbody>{players.scorers.slice(0, count).map((row, index) => <tr key={row.playerId}>
          <td className="strong">{index + 1}</td><td className="left"><EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink></td>
          <td className="strong">{row.goals}</td><td>{row.editionsScored}</td>
          <td className="left"><span className="history-club-goals">{row.clubs.map(entry => <span key={entry.teamId} title={club(entry.teamId).name}><TeamMark team={club(entry.teamId)} className="history-crest"/>{entry.goals}</span>)}</span></td>
        </tr>)}</tbody>
      </table></div>
      {count < players.scorers.length && <button type="button" className="history-more" onClick={() => setCount(players.scorers.length)}>VER LOS {players.scorers.length}</button>}
    </Card>
    <div className="history-grid">
      <Card title="EL GOLEADOR DE CADA CLUB" className="history-card">
        <ul className="history-list">{players.clubScorers.map(row => <li key={row.teamId}><Club id={row.teamId} club={club} short/>
          <span className="history-club-top">{row.players.map((player, index) => <span key={player.playerId} className={index ? 'is-minor' : ''}><EntityLink to="player" id={player.playerId}>{player.name}</EntityLink> <small>{player.goals}</small></span>)}</span></li>)}</ul>
      </Card>
      <Card title="MÁS TÍTULOS" className="history-card">
        <ol className="history-rank">{players.titleHolders.slice(0, 10).map(row => <li key={row.playerId}>
          <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink><b>{row.titles.length}</b><small>{row.titles.map(title => title.edition).join(' · ')}</small></li>)}</ol>
        <p className="history-note">Cuenta a los que estaban en el plantel del campeón cuando terminó el torneo (ligas y Copa GG).</p>
      </Card>
      <Card title="MÁS EDICIONES EN LA LIGA" className="history-card">
        <ol className="history-rank">{players.veterans.slice(0, 10).map(row => <li key={row.playerId}>
          <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink><b>{row.seasons}</b><small>ligas · {row.goals} goles</small></li>)}</ol>
        <p className="history-note">Ligas que terminó inscrito en algún club.</p>
      </Card>
      <Card title="TROTAMUNDOS" className="history-card">
        <ol className="history-rank">{players.travellers.slice(0, 10).map(row => <li key={row.playerId}>
          <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink><b>{row.clubs.length}</b>
          <span className="history-club-trail">{row.clubs.map((teamId, index) => <TeamMark key={`${teamId}-${index}`} team={club(teamId)} className="history-crest"/>)}</span></li>)}</ol>
        <p className="history-note">Clubes de la liga por los que pasó, en orden.</p>
      </Card>
      <Card title="MÁS EXPULSADOS" className="history-card">
        <ol className="history-rank">{players.reds.map(row => <li key={row.playerId}>
          <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink><b>{row.reds}</b><small>rojas</small></li>)}</ol>
      </Card>
    </div>
    <Card title="PREMIOS INDIVIDUALES" className="history-card">
      <div className="table-scroll"><table className="history-table">
        <thead><tr><th className="left">Ganador</th>{Object.values(AWARD_LABELS).map(label => <th key={label} className="left">{label}</th>)}<th>Total</th></tr></thead>
        <tbody>{players.awards.map(row => <tr key={row.playerId ?? row.coachId ?? row.name}>
          <td className="left">{row.playerId ? <EntityLink to="player" id={row.playerId} className="history-player-name">{row.name}</EntityLink> : <b>{row.name}</b>}</td>
          {Object.keys(AWARD_LABELS).map(award => <td key={award} className="left"><Labels items={row.awards[award]}/></td>)}
          <td className="strong">{row.total}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="history-note">Los premios individuales se entregan desde la v10.</p>
    </Card>
  </>;
}

/* ───────────── Evolución ───────────── */

function Evolution({ history, club }) {
  const leagues = history.editions.filter(edition => edition.kind === 'league');
  const clubs = useMemo(() => {
    const ids = new Set(leagues.flatMap(edition => (edition.table ?? []).map(row => row.teamId)));
    return [...ids].map(teamId => {
      const positions = leagues.map(edition => edition.table?.find(row => row.teamId === teamId)?.position ?? null);
      const played = positions.filter(Boolean);
      return { teamId, positions, average: played.reduce((sum, value) => sum + value, 0) / Math.max(1, played.length), count: played.length };
    }).sort((a, b) => a.average - b.average);
  }, [leagues]);
  return <Card title="PUESTO FINAL EDICIÓN POR EDICIÓN" className="history-card">
    <div className="table-scroll"><table className="history-table history-evolution">
      <thead><tr><th className="left sticky">Club</th>{leagues.map(edition => <th key={edition.id}>{edition.label}</th>)}<th title="Puesto promedio">Prom.</th></tr></thead>
      <tbody>{clubs.map(row => <tr key={row.teamId}>
        <td className="left sticky"><Club id={row.teamId} club={club}/></td>
        {row.positions.map((position, index) => {
          const edition = leagues[index];
          const champion = edition.championTeamId === row.teamId;
          const size = edition.table?.length ?? 8;
          const tone = position == null ? 'is-out' : position === 1 ? 'is-first' : position <= Math.ceil(size / 3) ? 'is-top' : position > size - Math.ceil(size / 3) ? 'is-low' : 'is-mid';
          return <td key={edition.id} className={`history-cell ${tone}${champion ? ' is-champion' : ''}`} title={position ? `${edition.label}: ${position}.º de ${size}${champion ? ' · campeón' : ''}${edition.status === 'active' ? ' · en curso' : ''}` : `${edition.label}: no jugó`}>
            {position ?? '·'}{champion && <i aria-label="campeón">★</i>}
          </td>;
        })}
        <td className="strong">{decimal(row.average, 1)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="history-note">Puesto al terminar la fase regular; la estrella marca al campeón de la edición (en casi todas, por playoffs). La última columna es la liga en curso.</p>
  </Card>;
}

/* ───────────── Cara a cara ───────────── */

function Matrix({ history, club }) {
  const lines = useMemo(() => new Map(history.matrix.map(line => [`${line.teamId}|${line.rivalId}`, line])), [history]);
  const ids = useMemo(() => {
    const visible = history.teams.filter(team => !team.hidden).map(team => team.id);
    const points = id => history.matrix.filter(line => line.teamId === id).reduce((sum, line) => sum + line.points, 0);
    return visible.filter(id => history.matrix.some(line => line.teamId === id)).sort((a, b) => points(b) - points(a));
  }, [history]);
  return <Card title="TODOS CONTRA TODOS" className="history-card">
    <div className="table-scroll"><table className="history-matrix">
      <thead><tr><th className="sticky"/>{ids.map(id => <th key={id} title={club(id).name}><TeamMark team={club(id)} className="history-crest"/></th>)}</tr></thead>
      <tbody>{ids.map(id => <tr key={id}>
        <th className="sticky"><Club id={id} club={club}/></th>
        {ids.map(rival => {
          if (rival === id) return <td key={rival} className="is-self"/>;
          const line = lines.get(`${id}|${rival}`);
          if (!line) return <td key={rival} className="is-empty">—</td>;
          const share = (line.wins + line.draws / 2) / line.played;
          const tone = share >= 0.6 ? 'is-good' : share >= 0.52 ? 'is-fair' : share > 0.48 ? 'is-even' : share > 0.4 ? 'is-poor' : 'is-bad';
          return <td key={rival} className={tone} title={`${club(id).name} vs ${club(rival).name}: ${line.played} partidos · ${line.wins}G ${line.draws}E ${line.losses}P · goles ${line.gf}-${line.ga}`}>
            <b>{line.wins}-{line.draws}-{line.losses}</b><small>{line.gf}:{line.ga}</small>
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
    <p className="history-note">Cada fila es el club y cada columna su rival: ganados-empatados-perdidos y goles. Verde si le va mejor, rojo si le va peor. Suma ligas, playoffs y copa (sin giras). El detalle de cada cruce está en la pestaña Rivales de cada club.</p>
  </Card>;
}
