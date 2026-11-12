import { useEffect, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { DataState } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { FormFeedback } from './FormFeedback.jsx';
import { useApiMutation } from './useApiMutation.js';
import { TeamMark } from '../../components/TeamMark.jsx';
import { gpLabel } from '../../utils/money.js';
import { LEAGUE_FIRST_PRIZE, LEAGUE_PRIZE_STEP } from '../../utils/payrollSim.js';
import { GpInput } from '../../components/GpInput.jsx';
import { Button } from '../../ui/index.js';

function MutationAction({ action, label, confirmText, onChanged, danger = false }) {
  const mutation = useApiMutation(signal => action(signal), { onSuccess: onChanged });
  const run = () => { if (!confirmText || window.confirm(confirmText)) mutation.execute(); };
  return <div className="mutation-action"><Button variant={danger ? 'danger' : 'primary'} type="submit" disabled={mutation.loading} onClick={run}>{label}</Button><FormFeedback mutation={mutation}/></div>;
}

// Premios sugeridos (se pre-llenan y el admin los puede cambiar antes de otorgar):
// liga: 1.º 150 M y bajando de a 10 M (el 10.º recibe 60 M); playoffs: play-in (o cuartos) 5 M, semifinalista 10 M, subcampeón 20 M y campeón 40 M (1 GP = 1 €).
const LEAGUE_FIRST = LEAGUE_FIRST_PRIZE;
const LEAGUE_STEP = LEAGUE_PRIZE_STEP;
const PLAYOFF_PRIZES = {
  champion: { label: 'CAMPEÓN', gp: 40_000_000 },
  runnerUp: { label: 'SUBCAMPEÓN', gp: 20_000_000 },
  semifinal: { label: 'SEMIFINALISTA', gp: 10_000_000 },
  quarterfinal: { label: 'CUARTOFINALISTA', gp: 5_000_000 },
  playin: { label: 'PLAY-IN', gp: 5_000_000 },
};
const PLACE_DEPTH = { playin: 1, quarterfinal: 1, semifinal: 2 };
const gpText = value => gpLabel(Number(value || 0));

/** Cómo terminó cada club en los playoffs del torneo (si los hubo y ya se jugaron). */
function playoffPlaces(playoffs) {
  const places = {};
  for (const series of playoffs?.series ?? []) {
    if (!series.winnerTeamId) continue;
    const loser = series.homeTeam.id === series.winnerTeamId ? series.awayTeam.id : series.homeTeam.id;
    if (series.round === 'final') { places[series.winnerTeamId] = 'champion'; places[loser] = 'runnerUp'; }
    else if ((PLACE_DEPTH[series.round] ?? 0) > (PLACE_DEPTH[places[loser]] ?? 0)) places[loser] = series.round;
  }
  return places;
}

function suggested(rows, places) {
  return Object.fromEntries(rows.map((row, index) => {
    const prize = PLAYOFF_PRIZES[places[row.team_id]];
    return [row.team_id, { league: String(Math.max(0, LEAGUE_FIRST - LEAGUE_STEP * index)), playoff: String(prize?.gp ?? 0) }];
  }));
}

/** Lo que ya se pagó en premios de este torneo: por club, con el detalle de cada abono. */
function GrantedPrizes({ prizes }) {
  const byTeam = new Map();
  for (const row of prizes.rows) {
    const entry = byTeam.get(row.teamId) ?? { name: row.teamName, total: 0, items: [] };
    entry.total += row.amount; entry.items.push(row.reason.split(' · ').slice(1).join(' · ') || row.reason);
    byTeam.set(row.teamId, entry);
  }
  const teams = [...byTeam.values()].sort((a, b) => b.total - a.total);
  return <section className="tournament-awards">
    <header><div><h3>Premios ya otorgados</h3><p>Este torneo ya pagó sus premios: no se pueden volver a otorgar. Para corregir un monto, haz un abono o descuento manual al club.</p></div>{prizes.total > 0 && <b>{gpText(prizes.total)}</b>}</header>
    {prizes.manualNote && <p className="poll-hint">{prizes.manualNote}</p>}
    {teams.length > 0 && <div className="tournament-awards-table"><table>
      <thead><tr><th>CLUB</th><th>POR QUÉ</th><th>TOTAL</th></tr></thead>
      <tbody>{teams.map(team => <tr key={team.name}><td>{team.name}</td><td>{team.items.join(' + ')}</td><td><b>{gpText(team.total)}</b></td></tr>)}</tbody>
    </table></div>}
  </section>;
}

export function TournamentAwardsPanel({ tournament, onChanged }) {
  const standings = useApiQuery(signal => endpoints.standings(tournament.id, {}, signal), [tournament.id]);
  const playoffs = useApiQuery(signal => endpoints.playoffs(tournament.id, signal).catch(() => ({ data: null })), [tournament.id]);
  const prizes = useApiQuery(signal => endpoints.tournamentPrizes(tournament.id, signal), [tournament.id]);
  const rows = Array.isArray(standings.data) ? standings.data : [];
  const places = playoffPlaces(playoffs.data);
  const [values, setValues] = useState(null);
  const [confirming, setConfirming] = useState(false);
  // Se pre-llena apenas llegan la tabla y los playoffs; después manda lo que edite el admin.
  const ready = !standings.loading && !playoffs.loading && rows.length > 0;
  useEffect(() => { setValues(null); setConfirming(false); }, [tournament.id]);
  useEffect(() => { if (ready && values === null) setValues(suggested(rows, places)); }, [ready, values]);
  const form = values ?? {};
  const set = (teamId, field, value) => setValues(current => ({ ...current, [teamId]: { ...current[teamId], [field]: value } }));
  const grants = rows.map((row, index) => {
    const entry = form[row.team_id] ?? {};
    return { row, position: index + 1, place: places[row.team_id] ?? null,
      league: Number(entry.league || 0), playoff: Number(entry.playoff || 0) };
  }).filter(item => item.league > 0 || item.playoff > 0);
  const totalGp = grants.reduce((sum, item) => sum + item.league + item.playoff, 0);
  // Un solo pedido al servidor: otorga todo junto y se niega si el torneo ya pagó sus premios.
  const mutation = useApiMutation(signal => endpoints.grantTournamentPrizes(tournament.id, {
    grants: grants.map(grant => ({ teamId: grant.row.team_id, position: grant.position, league: grant.league, playoff: grant.playoff,
      placeLabel: grant.place ? PLAYOFF_PRIZES[grant.place].label.toLowerCase() : null })),
  }, signal), { onSuccess: () => { setConfirming(false); prizes.retry(); onChanged?.(); } });

  if (!prizes.data) return <DataState query={prizes}/>;
  if (prizes.data.granted) return <GrantedPrizes prizes={prizes.data}/>;
  return <section className="tournament-awards">
    <header><div><h3>Clasificación final y premios</h3><p>Vienen pre-llenados (1.º de la liga 150 M GP y bajando de a 10 M; cuartofinalista 5 M; semifinalista 10 M; subcampeón 20 M; campeón 40 M). Revisa, ajusta y otorga todo con un solo guardado: se paga una sola vez.</p></div><b>{gpText(totalGp)}</b></header>
    <DataState query={standings}/>
    {rows.length > 0 && <div className="tournament-awards-table"><table>
      <thead><tr><th>#</th><th>CLUB</th><th>PTS</th><th>GP LIGA</th><th>PLAYOFFS</th><th>GP PLAYOFFS</th></tr></thead>
      <tbody>{rows.map((row, index) => {
        const entry = form[row.team_id] ?? {};
        const place = places[row.team_id];
        return <tr key={row.team_id}>
          <td>{index + 1}</td><td>{row.name}</td><td><b>{row.points}</b></td>
          <td><GpInput aria-label={`GP de liga para ${row.name}`} value={entry.league ?? ''} onChange={event => set(row.team_id, 'league', event.target.value)} placeholder="0"/></td>
          <td>{place ? PLAYOFF_PRIZES[place].label : '—'}</td>
          <td><GpInput aria-label={`GP de playoffs para ${row.name}`} value={entry.playoff ?? ''} onChange={event => set(row.team_id, 'playoff', event.target.value)} placeholder="0"/></td>
        </tr>;
      })}</tbody>
    </table></div>}
    {rows.length > 0 && !playoffs.data && <p className="poll-hint">Este torneo no tiene playoffs: solo se pre-llenan los premios de la liga.</p>}
    {confirming
      ? <div className="offer-confirm" role="group" aria-label="CONFIRMAR PREMIOS">
        <span>¿OTORGAR {gpText(totalGp)} A {grants.length} CLUBES? SE ACREDITA AL TIRO Y SE PAGA UNA SOLA VEZ.</span>
        <div className="mini-actions">
          <button type="button" disabled={mutation.loading} onClick={() => mutation.execute()}>{mutation.loading ? 'OTORGANDO…' : 'SÍ, OTORGAR'}</button>
          <button type="button" className="ghost" disabled={mutation.loading} onClick={() => setConfirming(false)}>VOLVER</button>
        </div>
      </div>
      : <div className="button-row">
        <Button className="tournament-awards-save" type="submit" disabled={!grants.length} onClick={() => setConfirming(true)}>Guardar y otorgar premios</Button>
        <Button variant="ghost" className="ghost-button" disabled={!ready} onClick={() => setValues(suggested(rows, places))}>VOLVER A LOS SUGERIDOS</Button>
      </div>}
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </section>;
}

function StatusPanel({ tournament, onChanged, onDeleted }) {
  const [status, setStatus] = useState(tournament.status === 'completed' ? 'completed' : 'active');
  const [championPolicy, setChampionPolicy] = useState(tournament.championPolicy ?? 'regular_season');
  const update = useApiMutation((value, signal) => endpoints.updateTournamentStatus(tournament.id, value, signal), { onSuccess: onChanged });
  const policy = useApiMutation((value, signal) => endpoints.updateTournamentChampionPolicy(tournament.id, value, signal), { onSuccess: onChanged });
  const remove = useApiMutation(signal => endpoints.deleteTournament(tournament.id, signal), { onSuccess: onDeleted });
  const save = () => { if (window.confirm(`¿Cambiar el estado de ${tournament.name} a ${status.toUpperCase()}?`)) update.execute(status); };
  const saveChampionPolicy = () => { if (window.confirm(championPolicy === 'playoffs' ? `¿Definir que el campeón de ${tournament.name} sea el ganador de los playoffs? Se retirará cualquier título y noticia de campeón de fase regular.` : `¿Definir que el campeón de ${tournament.name} sea el líder de la fase regular?`)) policy.execute(championPolicy); };
  const deleteTournament = () => { if (window.confirm(`¿Eliminar definitivamente ${tournament.name} y sus datos relacionados?`)) remove.execute(); };
  return <section className="tournament-admin-section"><p>ESTADO ACTUAL: <b>{String(tournament.status).toUpperCase()}</b></p><div className="admin-form compact-form"><label>NUEVO ESTADO<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">ACTIVO</option><option value="completed">COMPLETADO</option></select></label><Button type="submit" disabled={update.loading} onClick={save}>ACTUALIZAR ESTADO</Button>{tournament.format === 'league' && <><label>CAMPEONES DE LA LIGA<select value={championPolicy} onChange={event => setChampionPolicy(event.target.value)}><option value="regular_season">FASE REGULAR</option><option value="playoffs">PLAYOFFS</option><option value="both">AMBOS TÍTULOS</option></select></label><Button type="submit" disabled={policy.loading || championPolicy === tournament.championPolicy} onClick={saveChampionPolicy}>ACTUALIZAR REGLA</Button></>}<Button variant="danger" type="submit" disabled={remove.loading} onClick={deleteTournament}>ELIMINAR TORNEO</Button><FormFeedback mutation={update.error || update.success ? update : policy.error || policy.success ? policy : remove}/></div></section>;
}

function ParticipationPanel({ tournament, teams, onChanged }) {
  const candidates = teams.filter(team => team.kind === tournament.competitorKind);
  const [selected, setSelected] = useState(() => (tournament.teams ?? []).map(team => team.id));
  useEffect(() => setSelected((tournament.teams ?? []).map(team => team.id)), [tournament.id, tournament.teams]);
  const mutation = useApiMutation((teamIds, signal) => endpoints.replaceTournamentParticipations(tournament.id, teamIds, signal), { onSuccess: onChanged });
  const toggle = teamId => setSelected(current => current.includes(teamId) ? current.filter(id => id !== teamId) : [...current, teamId]);
  const invalidKnockout = tournament.format === 'knockout' && (selected.length < 2 || (selected.length & (selected.length - 1)) !== 0);
  const save = () => { if (window.confirm(`¿Guardar ${selected.length} participantes? El sorteo actual se reiniciará.`)) mutation.execute(selected); };
  if (tournament.rosterLocked) return <section className="tournament-admin-section"><p>LA NÓMINA DE <b>{tournament.teams?.length ?? 0} PARTICIPANTES</b> Está bloqueada porque el fixture ya fue creado.</p></section>;
  return <section className="tournament-admin-section"><p>Selecciona los participantes. Podrás cambiarlos hasta generar el fixture: <b>{selected.length}</b></p><div className="division-team-list">{candidates.map(team => <label key={team.id}><input type="checkbox" checked={selected.includes(team.id)} onChange={() => toggle(team.id)}/><span>{team.name}</span></label>)}</div>{invalidKnockout && <p className="admin-empty compact">La eliminación directa requiere 2, 4, 8, 16… participantes.</p>}<Button type="submit" disabled={selected.length < 2 || invalidKnockout || mutation.loading} onClick={save}>GUARDAR PARTICIPANTES</Button><FormFeedback mutation={mutation}/></section>;
}

function DrawPanel({ tournament, onChanged }) {
  const participants = tournament.teams ?? [];
  const [labels, setLabels] = useState(() => Object.fromEntries(participants.map((team, index) => [team.id, team.groupLabel ?? (index % 2 ? 'B' : 'A')])));
  const mutation = useApiMutation((groups, signal) => endpoints.drawTournament(tournament.id, groups, signal), { onSuccess: onChanged });
  const groups = participants.reduce((result, team) => {
    const label = String(labels[team.id] ?? '').trim().toUpperCase();
    if (label) (result[label] ??= []).push(team.id);
    return result;
  }, {});
  const submit = () => {
    if (Object.values(groups).flat().length !== participants.length) return;
    if (window.confirm(`¿Sortear ${participants.length} participantes en ${Object.keys(groups).length} grupos?`)) mutation.execute(groups);
  };
  return <section className="tournament-admin-section"><p>Asigna una etiqueta de grupo a cada participante.</p><div className="draw-team-list">{participants.map(team => <label key={team.id}><span>{team.name}</span><input maxLength="4" aria-label={`Grupo de ${team.name}`} value={labels[team.id] ?? ''} onChange={event => setLabels(current => ({ ...current, [team.id]: event.target.value }))}/></label>)}</div><Button type="submit" disabled={!participants.length || mutation.loading || Object.values(groups).flat().length !== participants.length} onClick={submit}>GUARDAR SORTEO</Button><FormFeedback mutation={mutation}/></section>;
}

function FixturesPanel({ tournament, onChanged }) {
  const [groupLabel, setGroupLabel] = useState('');
  const [legs, setLegs] = useState('1');
  const [preview, setPreview] = useState(null);
  const payload = () => ({ ...(groupLabel.trim() ? { groupLabel: groupLabel.trim().toUpperCase() } : {}), ...(legs ? { legs: Number(legs) } : {}) });
  const previewMutation = useApiMutation(async (body, signal) => {
    const response = await endpoints.previewRoundRobin(tournament.id, body, signal);
    setPreview({ ...(response?.data ?? response), body });
    return response;
  });
  const roundRobin = useApiMutation((body, signal) => endpoints.generateRoundRobin(tournament.id, body, signal), { onSuccess: () => { setPreview(null); onChanged?.(); } });
  const groups = useApiMutation((body, signal) => endpoints.generateGroupFixtures(tournament.id, body, signal), { onSuccess: onChanged });
  const confirmPreview = () => { if (window.confirm(`¿Crear este calendario para ${tournament.name}? Después no se podrá cambiar.`)) roundRobin.execute({ ...preview.body, seed: preview.seed }); };
  const generateGroups = () => { if (window.confirm(`¿Generar el fixture de grupos para ${tournament.name}?`)) groups.execute(payload()); };
  const teamCount = tournament.teams?.length ?? 0;
  const feedback = roundRobin.error || roundRobin.success ? roundRobin : previewMutation.error ? previewMutation : groups;
  return <section className="tournament-admin-section"><p>{teamCount} PARTICIPANTES{teamCount % 2 ? ' · Habrá un descanso por jornada.' : ''}</p><div className="admin-form compact-form"><label>GRUPO OPCIONAL<input maxLength="4" value={groupLabel} onChange={event => { setGroupLabel(event.target.value); setPreview(null); }}/></label><label>VUELTAS<select value={legs} onChange={event => { setLegs(event.target.value); setPreview(null); }}><option value="1">1</option><option value="2">2</option></select></label><Button type="submit" disabled={previewMutation.loading} onClick={() => previewMutation.execute(payload())}>{preview ? 'OTRA VISTA PREVIA' : 'VISTA PREVIA ROUND ROBIN'}</Button>{preview && <Button type="submit" disabled={roundRobin.loading} onClick={confirmPreview}>CONFIRMAR ESTE CALENDARIO</Button>}<Button type="submit" disabled={groups.loading} onClick={generateGroups}>FIXTURE DE GRUPOS</Button><FormFeedback mutation={feedback}/></div>{preview && <div className="fixture-preview"><p>VISTA PREVIA · NO GUARDADA · RACHA MÁXIMA: <b>{preview.maxStreak}</b></p>{preview.rounds.map(round => <div className="fixture-preview-round" key={round.round}><b>JORNADA {round.round}</b>{round.matches.map(match => <span key={`${match.homeTeamId}-${match.awayTeamId}`}>{match.homeName} <i>VS</i> {match.awayName}</span>)}{round.resting.map(team => <span className="resting" key={team.teamId}>DESCANSA: {team.name}</span>)}</div>)}</div>}</section>;
}

function BracketPanel({ tournament, onChanged }) {
  const [directPerGroup, setDirectPerGroup] = useState('2');
  const [bestThirdCount, setBestThirdCount] = useState('0');
  const bracket = useApiMutation((body, signal) => endpoints.generateBracket(tournament.id, body, signal), { onSuccess: onChanged });
  const create = event => {
    event.preventDefault();
    const body = { ...(directPerGroup ? { directPerGroup: Number(directPerGroup) } : {}), ...(bestThirdCount ? { bestThirdCount: Number(bestThirdCount) } : {}) };
    if (window.confirm('¿Generar o actualizar la llave del torneo?')) bracket.execute(body);
  };
  return <section className="tournament-admin-section"><form className="admin-form compact-form" onSubmit={create}><label>DIRECTOS POR GRUPO<input type="number" min="0" step="1" value={directPerGroup} onChange={event => setDirectPerGroup(event.target.value)}/></label><label>MEJORES TERCEROS<input type="number" min="0" step="1" value={bestThirdCount} onChange={event => setBestThirdCount(event.target.value)}/></label><Button type="submit" disabled={bracket.loading}>GENERAR LLAVE</Button><FormFeedback mutation={bracket}/></form><div className="admin-action-grid"><MutationAction label="AVANZAR LLAVE" confirmText="¿AVANZAR LOS GANADORES A LA SIGUIENTE RONDA?" action={signal => endpoints.advanceBracket(tournament.id, signal)} onChanged={onChanged}/><MutationAction label="CUARTOS DE COPA" confirmText="¿GENERAR LOS CUARTOS DE FINAL DE COPA?" action={signal => endpoints.generateCupQuarterfinals(tournament.id, signal)} onChanged={onChanged}/><MutationAction label="OCTAVOS MUNDIAL" confirmText="¿GENERAR LOS OCTAVOS DE FINAL DEL MUNDIAL?" action={signal => endpoints.generateWorldRoundOf16(tournament.id, signal)} onChanged={onChanged}/></div></section>;
}

function PlayoffsPanel({ tournament, teams, onChanged }) {
  const playoffs = useApiQuery(signal => endpoints.playoffs(tournament.id, signal), [tournament.id]);
  // Con 8 clubes o más clasifican 6 (1.º y 2.º directo a semis, play-in 3-4 y 5-6, todo a partido único); con menos, 4.
  const defaultQualified = (tournament.teams?.length ?? 0) >= 8 ? '6' : '4';
  const [form, setForm] = useState({ qualifiedCount: defaultQualified, pairingMode: 'seeded', quarterfinalLegs: '2', semifinalLegs: defaultQualified === '6' ? '1' : '2', finalLegs: defaultQualified === '6' ? '1' : '2', semi1a: '', semi1b: '', semi2a: '', semi2b: '' });
  const create = useApiMutation((body, signal) => endpoints.createPlayoffs(tournament.id, body, signal), { onSuccess: () => { playoffs.retry(); onChanged(); } });
  const tiebreak = useApiMutation(({ seriesId, winnerTeamId, penalties }, signal) => endpoints.resolvePlayoffTiebreak(seriesId, winnerTeamId, penalties, signal), { onSuccess: () => { playoffs.retry(); onChanged(); } });
  const [withdrawId, setWithdrawId] = useState('');
  const withdraw = useApiMutation((teamId, signal) => endpoints.withdrawFromPlayoffs(tournament.id, teamId, signal), { onSuccess: () => { setWithdrawId(''); playoffs.retry(); onChanged(); } });
  const configured = playoffs.data;
  const submit = event => {
    event.preventDefault();
    const eight = form.qualifiedCount !== '4';
    const body = { qualifiedCount: Number(form.qualifiedCount), pairingMode: eight ? 'seeded' : form.pairingMode, quarterfinalLegs: Number(form.quarterfinalLegs), semifinalLegs: Number(form.semifinalLegs), finalLegs: Number(form.finalLegs) };
    if (!eight && form.pairingMode === 'custom') body.semifinalPairs = [[form.semi1a, form.semi1b], [form.semi2a, form.semi2b]];
    if (window.confirm('¿Confirmar los playoffs? La clasificación y las llaves quedarán fijadas.')) create.execute(body);
  };
  const team = id => teams.find(item => item.id === id);
  return <section className="tournament-admin-section"><DataState query={playoffs}/>{configured ? <div className="playoff-admin-summary"><p><b>PLAYOFFS {configured.status.toUpperCase()}</b> · TOP {configured.qualifiedCount}{configured.qualifiedCount === 8 ? ` · CUARTOS A ${configured.quarterfinalLegs === 1 ? 'PARTIDO ÚNICO' : 'IDA Y VUELTA'}` : ''} · SEMIS A {configured.semifinalLegs === 1 ? 'PARTIDO ÚNICO' : 'IDA Y VUELTA'} · FINAL A {configured.finalLegs === 1 ? 'PARTIDO ÚNICO' : 'IDA Y VUELTA'}</p><div className="playoff-qualifiers">{configured.qualifiers.map(row => <span key={row.teamId}><b>{row.withdrawn ? `RETIRADO (${row.tableRank}.º)` : `#${row.rank}`}</b><TeamMark team={team(row.teamId) ?? row}/>{row.name}</span>)}</div>{configured.series.filter(series => series.status === 'awaiting_tiebreak').map(series => <div className="playoff-tiebreak" key={series.id}><span>{series.round === 'final' ? 'FINAL' : `${{ playin: 'PLAY-IN', quarterfinal: 'CUARTOS' }[series.round] ?? 'SEMIFINAL'} ${series.slot}`} EMPATADA EN EL GLOBAL: LOS PENALES SE ANOTAN EN LA FICHA DEL PARTIDO.</span>{[...series.matches].reverse().find(match => match.status === 'finished') && <a className="playoff-leg-link" href={`#/partidos/${[...series.matches].reverse().find(match => match.status === 'finished').id}`}>ABRIR LA FICHA →</a>}</div>)}<FormFeedback mutation={tiebreak}/>{configured.status !== 'completed' && <div className="admin-form compact-form"><label>RETIRAR DE LOS PLAYOFFS<select value={withdrawId} onChange={event => setWithdrawId(event.target.value)}><option value="">ELEGIR CLUB</option>{configured.qualifiers.filter(row => !row.withdrawn).map(row => <option key={row.teamId} value={row.teamId}>{row.name}</option>)}</select></label><Button type="button" disabled={!withdrawId || withdraw.loading} onClick={() => { if (window.confirm('¿Retirar a este club de los playoffs? Los de abajo suben un puesto, el cuadro se rehace y se anulan los play-in ya jugados. Conserva su puesto en la tabla.')) withdraw.execute(withdrawId); }}>RETIRAR</Button><FormFeedback mutation={withdraw}/></div>}</div> : <form className="admin-form compact-form" onSubmit={submit}><label>CLASIFICAN<select value={form.qualifiedCount} onChange={event => setForm(current => ({ ...current, qualifiedCount: event.target.value }))}><option value="6">6 · PLAY-IN (1.º Y 2.º DIRECTO A SEMIS) · PARTIDO ÚNICO</option><option value="8">8 · CUARTOS DE FINAL (1-8, 2-7, 3-6, 4-5)</option><option value="4">4 · SEMIFINALES</option></select></label>{form.qualifiedCount === '8' && <label>CUARTOS<select value={form.quarterfinalLegs} onChange={event => setForm(current => ({ ...current, quarterfinalLegs: event.target.value }))}><option value="2">IDA Y VUELTA</option><option value="1">PARTIDO ÚNICO</option></select></label>}{form.qualifiedCount === '4' && <label>CRUCES<select value={form.pairingMode} onChange={event => setForm(current => ({ ...current, pairingMode: event.target.value }))}><option value="seeded">1° VS 4° · 2° VS 3°</option><option value="custom">ELEGIR MANUALMENTE</option></select></label>}{form.qualifiedCount !== '6' && <label>SEMIFINALES<select value={form.semifinalLegs} onChange={event => setForm(current => ({ ...current, semifinalLegs: event.target.value }))}><option value="2">IDA Y VUELTA</option><option value="1">PARTIDO ÚNICO</option></select></label>}{form.qualifiedCount !== '6' && <label>FINAL<select value={form.finalLegs} onChange={event => setForm(current => ({ ...current, finalLegs: event.target.value }))}><option value="2">IDA Y VUELTA</option><option value="1">PARTIDO ÚNICO</option></select></label>}{form.qualifiedCount === '4' && form.pairingMode === 'custom' && <><label>SEMIFINAL 1 · EQUIPO 1<select required value={form.semi1a} onChange={event => setForm(current => ({ ...current, semi1a: event.target.value }))}><option value="">ELEGIR</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>SEMIFINAL 1 · EQUIPO 2<select required value={form.semi1b} onChange={event => setForm(current => ({ ...current, semi1b: event.target.value }))}><option value="">ELEGIR</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>SEMIFINAL 2 · EQUIPO 1<select required value={form.semi2a} onChange={event => setForm(current => ({ ...current, semi2a: event.target.value }))}><option value="">ELEGIR</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>SEMIFINAL 2 · EQUIPO 2<select required value={form.semi2b} onChange={event => setForm(current => ({ ...current, semi2b: event.target.value }))}><option value="">ELEGIR</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}<Button type="submit" disabled={create.loading}>CREAR PLAYOFFS</Button><FormFeedback mutation={create}/></form>}</section>;
}

function DivisionsPanel({ tournament, teams, onChanged }) {
  const [selected, setSelected] = useState([]);
  const initialize = useApiMutation((ids, signal) => endpoints.initializeDivisions(ids, signal), { onSuccess: onChanged });
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 6 ? [...current, id] : current);
  const runInitialize = () => { if (selected.length === 6 && window.confirm('¿Inicializar las divisiones con estos seis equipos en primera?')) initialize.execute(selected); };
  return <section className="tournament-admin-section"><p>Selecciona exactamente seis equipos para primera división: <b>{selected.length}/6</b></p><div className="division-team-list">{teams.map(team => <label key={team.id}><input type="checkbox" checked={selected.includes(team.id)} onChange={() => toggle(team.id)}/><span>{team.name}</span></label>)}</div><Button type="submit" disabled={selected.length !== 6 || initialize.loading} onClick={runInitialize}>INICIALIZAR DIVISIONES</Button><FormFeedback mutation={initialize}/><div className="admin-action-grid"><MutationAction label="APLICAR ASCENSO" confirmText="¿APLICAR EL ASCENSO DEFINIDO POR ESTE TORNEO?" action={signal => endpoints.applyPromotion(tournament.id, signal)} onChanged={onChanged}/><MutationAction label="MOVIMIENTOS DIVISIONALES" confirmText="¿APLICAR LOS MOVIMIENTOS DIVISIONALES DE ESTE TORNEO?" action={signal => endpoints.applyDivisionMovements(tournament.id, signal)} onChanged={onChanged}/></div></section>;
}

export function TournamentAdminPanel({ tournament, teams, onChanged, onDeleted }) {
  const completed = tournament.status === 'completed';
  const league = tournament.format === 'league';
  // Solo las pestañas que sirven para este torneo: premios en una sola parte; sorteo y calendario mientras no termine;
  // llaves para las eliminatorias y playoffs para las ligas.
  const tabs = [
    ['status', 'ESTADO'],
    ...(completed ? [['prizes', 'PREMIOS']] : []),
    ['participants', 'PARTICIPANTES'],
    ...(!completed ? [['draw', 'SORTEO'], ['fixtures', 'CALENDARIO']] : []),
    ...(!league ? [['bracket', 'LLAVES']] : []),
    ...(league ? [['playoffs', 'PLAYOFFS']] : []),
    ...(tournament.divisionsReady ? [['divisions', 'DIVISIONES']] : []),
  ];
  const [tab, setTab] = useState(completed ? 'prizes' : 'status');
  return <section className="tournament-admin"><nav>{tabs.map(([value, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {tab === 'status' && <StatusPanel tournament={tournament} onChanged={onChanged} onDeleted={onDeleted}/>}
    {tab === 'prizes' && completed && <TournamentAwardsPanel tournament={tournament} onChanged={onChanged}/>}
    {tab === 'participants' && <ParticipationPanel tournament={tournament} teams={teams} onChanged={onChanged}/>}
    {tab === 'draw' && <DrawPanel tournament={tournament} onChanged={onChanged}/>}
    {tab === 'fixtures' && <FixturesPanel tournament={tournament} onChanged={onChanged}/>}
    {tab === 'bracket' && <BracketPanel tournament={tournament} onChanged={onChanged}/>}
    {tab === 'playoffs' && <PlayoffsPanel tournament={tournament} teams={teams} onChanged={onChanged}/>}
    {tab === 'divisions' && tournament.divisionsReady && <DivisionsPanel tournament={tournament} teams={teams} onChanged={onChanged}/>}
  </section>;
}
