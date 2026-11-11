import { useMemo, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { EntityLink } from '../../components/EntityLink.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { Button, Card, Chip, ConfirmStep, HowItWorks, Notice } from '../../ui/index.js';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, gp } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';

const upper = text => String(text ?? '').toUpperCase();
const ROUND_LABEL = { GA: 'GRUPO A', GB: 'GRUPO B', QF: 'CUARTOS DE FINAL', SF: 'SEMIFINALES', F: 'FINAL', '3P': 'TERCER LUGAR' };
const roundOf = slot => (/^G[AB]/.test(slot) ? slot.slice(0, 2) : slot.startsWith('QF') ? 'QF' : slot.startsWith('SF') ? 'SF' : slot);
const PLACE = ['CAMPEÓN', '2.º', '3.º', '4.º'];

/** Un lado de un partido de gira: escudo, nombre y goles. */
function MatchSide({ match, teamId, name, score, teamIndex }) {
  return <div className={`preseason-side ${match.winnerTeamId === teamId ? 'is-winner' : ''}`}>
    <EntityLink to="team" id={teamId} className="table-team-link"><TeamMark team={teamIndex?.[teamId] ?? { id: teamId, name }}/>{upper(name)}</EntityLink>
    <b>{match.status === 'finished' ? score : '–'}</b>
  </div>;
}

function MatchCard({ match, teamIndex, canOperateMatches }) {
  const live = match.status === 'live';
  return <article className={`preseason-match ${live ? 'is-live' : ''}`}>
    <MatchSide match={match} teamId={match.homeTeamId} name={match.homeName} score={match.homeScore} teamIndex={teamIndex}/>
    <MatchSide match={match} teamId={match.awayTeamId} name={match.awayName} score={match.awayScore} teamIndex={teamIndex}/>
    {match.penaltiesHome != null && <small className="preseason-pens">PENALES {match.penaltiesHome}–{match.penaltiesAway}</small>}
    {match.status !== 'finished' && <EntityLink to="match" id={match.id} className="preseason-play">{live ? 'EN VIVO →' : 'JUGAR →'}</EntityLink>}
    {match.needsWinner && (canOperateMatches
      ? <div className="preseason-penalties"><small>EMPATE: FALTA ANOTAR QUIÉN PASÓ POR PENALES</small>
        <EntityLink to="match" id={match.id} className="preseason-play">ANOTAR EN LA FICHA →</EntityLink></div>
      : <small className="preseason-penalties">EMPATE: FALTA ANOTAR QUIÉN GANÓ POR PENALES</small>)}
  </article>;
}

/** Grupo de la gira de 6: tabla con la misma estética que la de liga (pasan los dos primeros) y sus tres partidos. */
function GroupPanel({ group, matches, teamIndex, names, renderMatch }) {
  return <section className="workspace-panel preseason-group-panel">
    <h3>GRUPO {group.name}<small>PASAN 2</small></h3>
    <div className="table-scroll"><table className="league-table preseason-group-table">
      <colgroup><col className="rank-column"/><col className="team-column"/><col className="stat-column" span="6"/></colgroup>
      <thead><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead>
      <tbody>{group.rows.map(row => <tr key={row.teamId} className={row.qualified ? 'is-qualified' : ''}>
        <td>{row.position}</td>
        <td><EntityLink to="team" id={row.teamId} className="table-team-link"><TeamMark team={teamIndex?.[row.teamId] ?? { id: row.teamId, name: names?.[row.teamId] }}/>{names?.[row.teamId] ?? ''}{row.byLot && row.played === 2 && <em className="live-team-tag" title="Empate total: lo definió un sorteo">SORTEO</em>}</EntityLink></td>
        <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td><td><b>{row.points}</b></td>
      </tr>)}</tbody>
    </table></div>
    <div className="preseason-group-matches">{matches.map(renderMatch)}</div>
  </section>;
}

/** Cuadro de una gira: grupos (si los hay), rondas, resultados y el ganador por penales cuando hubo empate. */
export function PreseasonBracket({ bracket, onChanged }) {
  const { canOperateMatches } = useAuth();
  const teamIndex = bracket.teamIndex;
  const renderMatch = match => <MatchCard key={match.id} match={match} teamIndex={teamIndex} canOperateMatches={canOperateMatches}/>;
  const rounds = ['QF', 'SF', 'F', '3P'].map(key => [key, bracket.matches.filter(match => roundOf(match.slot) === key)]).filter(([, list]) => list.length);
  return <div className="preseason-bracket">
    {bracket.groups && <div className="preseason-groups">{bracket.groups.map(group => <GroupPanel key={group.name} group={group} names={bracket.teamNames} teamIndex={teamIndex}
      matches={bracket.matches.filter(match => roundOf(match.slot) === `G${group.name}`)} renderMatch={renderMatch}/>)}</div>}
    <div className="preseason-rounds">{rounds.map(([key, list]) => <section key={key} className={`preseason-round round-${key}`}>
      <h4>{ROUND_LABEL[key]}</h4>
      {list.map(renderMatch)}
    </section>)}</div>
    {bracket.standings && <ol className="preseason-standings">{bracket.standings.map((row, index) => <li key={row.teamId}>
      <span>{bracket.placeLabels?.[row.place] ?? (index < 4 ? PLACE[index] : bracket.groups ? 'GRUPOS' : 'CUARTOS')}</span>
      <EntityLink to="team" id={row.teamId} className="table-team-link"><TeamMark team={teamIndex?.[row.teamId] ?? { id: row.teamId, name: bracket.teamNames?.[row.teamId] }}/>{upper(bracket.teamNames?.[row.teamId] ?? '')}</EntityLink><b>{gp(row.prize)}</b>
    </li>)}</ol>}
  </div>;
}

const CHAMPION = item => item.standings?.[0]?.teamId ?? null;

/** Giras: torneos amistosos que se arman cuando sea (4, 6 u 8 clubes, cruces a mano) y el formulario para organizar una. Aquí viven todas las giras (no se repiten en el selector de torneos). */
export function PreseasonPanel({ teams = [], myTeamId = null }) {
  const { isAdmin, canEditTeam } = useAuth();
  const query = useApiQuery(signal => endpoints.preseasons(signal), []);
  const [creating, setCreating] = useState(false);
  const data = query.data;
  if (!data) return <DataState query={query}/>;
  const canOrganize = isAdmin || (myTeamId && canEditTeam(myTeamId) && !data.busyTeamIds.includes(myTeamId));
  const names = Object.fromEntries(teams.map(team => [team.id, team.name]));
  const teamIndex = Object.fromEntries(teams.map(team => [team.id, team]));
  const playing = data.tournaments.filter(item => item.status !== 'completed');
  const finished = data.tournaments.filter(item => item.status === 'completed');
  const showTour = item => <section key={item.id} className="preseason-item">
    <header><b>{upper(item.name)}</b><Chip tone={item.status === 'completed' ? 'green' : 'yellow'}>{item.status === 'completed' ? 'TERMINADA' : `${item.size} CLUBES · EN JUEGO`}</Chip></header>
    {item.paidTeamIds.length < item.size && <p className="club-life-hint">Sin plata en esta gira (ya cobraron sus {data.paidPerSeason} giras de la temporada): {item.matches.flatMap(match => [match.homeTeamId, match.awayTeamId]).filter((teamId, index, list) => list.indexOf(teamId) === index && !item.paidTeamIds.includes(teamId)).map(teamId => names[teamId]).join(', ')}.</p>}
    <PreseasonBracket bracket={{ ...item, teamNames: names, teamIndex }} onChanged={query.retry}/>
  </section>;
  return <Card title="GIRAS" className="preseason-panel"
    aside={canOrganize && !creating ? <Button size="sm" icon="trophy" onClick={() => setCreating(true)}>ORGANIZAR GIRA</Button> : null}>
    {creating && <PreseasonForm teams={teams} busy={data.busyTeamIds} paidLeft={data.paidLeft} prizes={data.prizes} myTeamId={myTeamId} onDone={() => { setCreating(false); query.retry(); }} onCancel={() => setCreating(false)}/>}
    {playing.map(showTour)}
    {finished.length > 0 && <details className="preseason-finished">
      <summary>GIRAS TERMINADAS ({finished.length})</summary>
      {finished.map(item => <details key={item.id} className="preseason-finished-item">
        <summary><b>{upper(item.name)}</b>{CHAMPION(item) && <span className="preseason-champion"><TeamMark team={teamIndex[CHAMPION(item)] ?? { name: names[CHAMPION(item)] }}/>CAMPEÓN: {upper(names[CHAMPION(item)] ?? '')}</span>}</summary>
        {showTour(item)}
      </details>)}
    </details>}
    {!data.tournaments.length && !creating && <p className="club-life-hint">Todavía no hay giras. Si se juntan 4, 6 u 8 en Discord, armen una acá.</p>}
    <HowItWorks><p>Cuando se junten 4, 6 u 8 clubes (por ejemplo en Discord), un presi arma la gira y elige los cruces. Es a partido único (si empatan, se define por penales), con final y partido por el 3.er lugar, y se juega en el eFootball como cualquier partido. La de 6 son dos grupos de 3 (todos contra todos, un partido cada par; el empate vale un punto): pasan los dos mejores y las semis son 1.º A–2.º B y 1.º B–2.º A. Todos recaudan: el local reparte la taquilla con la visita y la organización paga premios por puesto.</p><p>Se puede jugar cuando sea, pero cada club cobra (premios, taquilla y ánimo) solo en sus primeras {data.paidPerSeason} giras de cada temporada; las demás se juegan igual, sin plata. Un club no puede estar en dos giras a la vez. Es un amistoso: no cuenta para la forma, el cara a cara, las suspensiones, los sueldos ni la directiva.</p></HowItWorks>
  </Card>;
}

function PreseasonForm({ teams, busy, paidLeft = {}, prizes, myTeamId, onDone, onCancel }) {
  const { isAdmin } = useAuth();
  const clubs = useMemo(() => teams.filter(team => team.kind !== 'national_team' && !team.hidden && !busy.includes(team.id)), [teams, busy]);
  const [size, setSize] = useState(4);
  const [name, setName] = useState('');
  const [slots, setSlots] = useState(() => [myTeamId ?? '', '', '', '', '', '', '', ''].slice(0, 8));
  const [confirming, setConfirming] = useState(false);
  const create = useApiMutation((body, signal) => endpoints.createPreseason(body, signal), { onSuccess: onDone });
  const chosen = slots.slice(0, size);
  const ready = chosen.every(Boolean) && new Set(chosen).size === size && (isAdmin || chosen.includes(myTeamId));
  const setSlot = (index, value) => setSlots(current => current.map((item, position) => (position === index ? value : item)));
  const prizeList = prizes?.[size] ?? [];
  // Casilleros: pares para 4 y 8; dos grupos de 3 para 6.
  const groupsLayout = size === 6
    ? [{ label: 'GRUPO A', indexes: [0, 1, 2] }, { label: 'GRUPO B', indexes: [3, 4, 5] }]
    : Array.from({ length: size / 2 }, (_, pair) => ({ label: size === 8 ? `CUARTOS ${pair + 1}` : `SEMI ${pair + 1}`, indexes: [pair * 2, pair * 2 + 1] }));
  return <div className="preseason-form">
    <div className="preseason-form-row">
      <label className="club-kit-field"><span>NOMBRE</span><input value={name} maxLength={60} placeholder="Gira por Asia" onChange={event => setName(event.target.value)}/></label>
      <div className="preseason-size" role="group" aria-label="Cantidad de clubes">{[4, 6, 8].map(value => <Button key={value} size="sm" variant={size === value ? 'primary' : 'ghost'} onClick={() => setSize(value)}>{value} CLUBES</Button>)}</div>
    </div>
    <div className="preseason-slots">{groupsLayout.map((group, pair) => <div key={pair} className="preseason-pair">
      <small>{group.label}</small>
      {group.indexes.map((index, position) => <select key={index} value={slots[index]} aria-label={`Club ${index + 1}`} onChange={event => setSlot(index, event.target.value)}>
        <option value="">{size === 6 ? `Club ${position + 1}…` : position % 2 === 0 ? 'Local…' : 'Visita…'}</option>
        {clubs.map(team => <option key={team.id} value={team.id} disabled={chosen.includes(team.id) && slots[index] !== team.id}>{team.name}{paidLeft[team.id] === 0 ? ' (sin plata)' : ''}</option>)}
      </select>)}
    </div>)}</div>
    <p className="club-life-hint">Premios por puesto: {prizeList.slice(0, 4).map((amount, index) => `${PLACE[index].toLowerCase()} ${gp(amount)}`).join(' · ')}{size === 8 ? ` · eliminados en cuartos ${gp(prizeList[4])}` : size === 6 ? ` · eliminados en grupos ${gp(prizeList[4])}` : ''}. Además, cada partido reparte la taquilla mitad y mitad.</p>
    {!isAdmin && myTeamId && !chosen.includes(myTeamId) && <p className="club-life-hint">Tu club tiene que estar en el cuadro.</p>}
    <div className="club-nickname-actions">
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={create.loading}>Cancelar</Button>
      {!confirming && <Button type="button" size="sm" disabled={!ready || create.loading} onClick={() => setConfirming(true)}>Crear gira</Button>}
    </div>
    {confirming && <ConfirmStep message="¿Crear la gira con estos cruces? Los partidos quedan listos para jugarse." confirmLabel="SÍ, CREAR" busy={create.loading}
      onConfirm={() => create.execute({ name: name.trim() || undefined, slots: chosen, teamId: myTeamId })} onCancel={() => setConfirming(false)}/>}
    {create.error && <Notice tone="error">{create.error.message}</Notice>}
  </div>;
}
