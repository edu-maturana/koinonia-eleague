import { useEffect, useState, useRef } from 'react';
import { boosterText, STYLE_LABELS } from '../../utils/managerBoosters.js';
import { endpoints } from '../../api/endpoints.js';
import { EntityLink } from '../../components/EntityLink.jsx';
import { SimulatedBadge } from '../../components/SimulatedBadge.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { useAuth } from '../../app/AuthGate.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { useApiQuery } from './useApiQuery.js';

const DURATIONS = [[0, 'INSTANTÁNEO'], [60, '1 MIN'], [180, '3 MIN'], [300, '5 MIN']];
const percent = value => `${Math.round((value ?? 0) * 100)}%`;

// Reloj del partido simulado: 90 minutos más los descuentos de cada tiempo.
const timeline = simulation => {
  const [first, second] = simulation.stoppage ?? [0, 0];
  const tickOf = event => event.minute <= 45 ? event.minute + (event.extra ?? 0) : 45 + first + (event.minute - 45) + (event.extra ?? 0);
  const clockOf = tick => {
    if (tick <= 45) return `${tick}'`;
    if (tick <= 45 + first) return `45+${tick - 45}'`;
    const minute = tick - first;
    return minute <= 90 ? `${minute}'` : `90+${minute - 90}'`;
  };
  return { total: 90 + first + second, halfTime: 45 + first, tickOf, clockOf };
};
export const replayEndsAt = simulation => new Date(simulation.replayStartsAt).getTime() + simulation.durationSeconds * 1000;

function StatRow({ label, home, away, format = value => value, higherIsBetter = true }) {
  const total = Math.abs(home) + Math.abs(away) || 1;
  const homeWins = higherIsBetter ? home > away : home < away;
  const awayWins = higherIsBetter ? away > home : away < home;
  return <div className="sim-stat">
    <b className={homeWins ? 'lead' : ''}>{format(home)}</b>
    <div className="sim-stat-bars" aria-hidden="true"><i style={{ width: `${(home / total) * 100}%` }}/><i style={{ width: `${(away / total) * 100}%` }}/></div>
    <b className={awayWins ? 'lead' : ''}>{format(away)}</b>
    <small>{label}</small>
  </div>;
}

function KeyPlayers({ side }) {
  return <ol className="sim-key-players">{side.keyPlayers.map(player => <li key={player.playerId}>
    <EntityLink to="player" id={player.playerId}>{player.name}</EntityLink><small>{player.position} · {percent(player.share)}</small>
  </li>)}</ol>;
}

function SimulateDialog({ match, onClose, onDone }) {
  const [duration, setDuration] = useState(60);
  const mutation = useApiMutation((body, signal) => endpoints.simulateMatch(match.id, body, signal), { onSuccess: onDone });
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !mutation.loading) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mutation.loading]);
  return <div className="sim-dialog-backdrop" onClick={() => !mutation.loading && onClose()}>
    <div className="sim-dialog" role="dialog" aria-modal="true" aria-labelledby="sim-dialog-title" onClick={event => event.stopPropagation()}>
      <h3 id="sim-dialog-title">SIMULAR PARTIDO OFICIAL</h3>
      <p className="sim-dialog-teams">{match.homeTeam?.name} <span>vs</span> {match.awayTeam?.name}</p>
      <p>El resultado queda registrado en la tabla, con goles, rojas y suspensiones. <b>Cada simulación es al azar</b> y queda guardada con su semilla: cualquiera puede ver cómo se calculó.</p>
      <fieldset className="sim-durations"><legend>Duración de la transmisión</legend>
        {DURATIONS.map(([seconds, label]) => <button key={seconds} type="button" className={duration === seconds ? 'active' : ''} aria-pressed={duration === seconds} onClick={() => setDuration(seconds)}>{label}</button>)}
      </fieldset>
      {mutation.error && <p className="sim-dialog-error">{mutation.error.message}</p>}
      <div className="sim-dialog-actions">
        <button type="button" onClick={onClose} disabled={mutation.loading}>CANCELAR</button>
        <button type="button" className="sim-go" onClick={() => mutation.execute({ durationSeconds: duration })} disabled={mutation.loading}>{mutation.loading ? 'SIMULANDO…' : '▶ SIMULAR'}</button>
      </div>
    </div>
  </div>;
}

/** Previa de un partido pendiente: probabilidades y fuerzas, sin revelar el resultado. */
export function SimulationPreview({ match, onSimulated }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const preview = useApiQuery(signal => endpoints.matchSimulationPreview(match.id, signal), [match.id]);
  const data = preview.data;
  return <section className="match-card-panel sim-preview"><h2>PREVIA <small>Simulador · sin castigos · cartas en nivel base</small></h2>
    {preview.loading ? <p className="empty-copy">CALCULANDO…</p> : preview.error ? <p className="empty-copy">{preview.error.message}</p> : data && <>
      <div className="sim-odds" role="img" aria-label={`Probabilidades: ${match.homeTeam?.name} ${percent(data.odds.home)}, empate ${percent(data.odds.draw)}, ${match.awayTeam?.name} ${percent(data.odds.away)}`}>
        <span className="home" style={{ flexGrow: data.odds.home }}>{percent(data.odds.home)}</span>
        <span className="draw" style={{ flexGrow: data.odds.draw }}>{percent(data.odds.draw)}</span>
        <span className="away" style={{ flexGrow: data.odds.away }}>{percent(data.odds.away)}</span>
      </div>
      <div className="sim-odds-legend" aria-hidden="true"><span>{match.homeTeam?.name}</span><span>EMPATE</span><span>{match.awayTeam?.name}</span></div>
      <div className="sim-stats">
        <StatRow label="GOLES ESPERADOS" home={data.home.expectedGoals} away={data.away.expectedGoals} format={value => value.toFixed(2)}/>
        <StatRow label="ATAQUE HISTÓRICO" home={data.home.attack * 100} away={data.away.attack * 100} format={Math.round}/>
        <StatRow label="GOLES RECIBIDOS (HISTÓRICO)" home={data.home.defense * 100} away={data.away.defense * 100} format={Math.round} higherIsBetter={false}/>
        <StatRow label="CARTAS · ATAQUE" home={data.home.cardAttack} away={data.away.cardAttack} format={Math.round}/>
        <StatRow label="CARTAS · DEFENSA" home={data.home.cardDefense} away={data.away.cardDefense} format={Math.round}/>
      </div>
      <div className="sim-key"><div><h3>A SEGUIR</h3><KeyPlayers side={data.home}/></div><div><h3>A SEGUIR</h3><KeyPlayers side={data.away}/></div></div>
      <p className="sim-footnote">Índices históricos: 100 = promedio de la liga, ponderando más los torneos recientes. Basado en {data.historyMatches} partidos y {data.odds.runs.toLocaleString('es-CL')} simulaciones de prueba (distintas de la oficial).{data.previousVoided > 0 && ` Este partido tiene ${data.previousVoided} simulación${data.previousVoided === 1 ? '' : 'es'} anulada${data.previousVoided === 1 ? '' : 's'}.`}</p>
      {isAdmin && <button type="button" className="sim-launch" onClick={() => setOpen(true)}>▶ SIMULAR PARTIDO OFICIAL</button>}
    </>}
    {open && <SimulateDialog match={match} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onSimulated(); }}/>}
  </section>;
}

function narrate(event, match) {
  const team = event.side === 'home' ? match.homeTeam?.name : match.awayTeam?.name;
  if (event.type === 'red') return { icon: '🟥', text: `ROJA DIRECTA A ${event.playerName?.toUpperCase()} (${team?.toUpperCase()})` };
  if (event.type === 'sub') return { icon: event.reason === 'injury' ? '🩹' : '🔁', text: `${event.reason === 'injury' ? 'SE LESIONA' : 'CAMBIO EN'} ${team?.toUpperCase()}: ENTRA ${event.playerInName?.toUpperCase()} POR ${event.playerOutName?.toUpperCase()}`, sub: true };
  if (event.ownGoal) return { icon: '⚽', text: `¡AUTOGOL DE ${event.playerName?.toUpperCase()}! SUMA ${team?.toUpperCase()}`, goal: true };
  return { icon: '⚽', text: `¡GOOOL DE ${team?.toUpperCase()}! ${event.playerName?.toUpperCase() ?? ''}`, goal: true };
}

/**
 * Transmisión del partido simulado. Con `startsAt` + `durationSeconds` todos ven el mismo minuto;
 * la repetición local usa su propio inicio y duración.
 */
export function SimulationReplay({ match, simulation, resolveTeam, startsAt, durationSeconds, onEnded, onEvent }) {
  const clock = timeline(simulation);
  const [now, setNow] = useState(() => Date.now());
  const durationMs = Math.max(durationSeconds, 1) * 1000;
  const progress = Math.min(1, Math.max(0, (now - startsAt) / durationMs));
  const tick = Math.floor(progress * clock.total);
  const ended = progress >= 1;
  useEffect(() => {
    if (ended) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [ended]);
  useEffect(() => { if (ended) onEnded?.(); }, [ended, onEnded]);

  const shown = simulation.events.filter(event => clock.tickOf(event) <= tick);
  const score = shown.reduce((sum, event) => event.type === 'goal' ? { ...sum, [event.side]: sum[event.side] + 1 } : sum, { home: 0, away: 0 });
  const lastGoal = [...shown].reverse().find(event => event.type === 'goal');
  const penaltyWinner = simulation.penalties?.winnerTeamId === match.homeTeam?.id ? match.homeTeam?.name : match.awayTeam?.name;
  // `order` es el minuto (en ticks) del relato; el entretiempo cae justo después de su descuento.
  const feed = [
    { key: 'ko', order: -1, clock: "0'", icon: '📣', text: 'ARRANCA EL PARTIDO' },
    ...shown.map((event, index) => ({ key: index, order: clock.tickOf(event) + index / 1000, clock: clock.clockOf(clock.tickOf(event)), ...narrate(event, match) })),
    ...(tick >= clock.halfTime ? [{ key: 'ht', order: clock.halfTime + 0.5, clock: 'ET', icon: '⏸', text: 'FINAL DEL PRIMER TIEMPO' }] : []),
    ...(ended ? [{ key: 'ft', order: clock.total + 1, clock: 'FIN', icon: '🏁', text: `FINAL: ${match.homeTeam?.name} ${simulation.homeScore}-${simulation.awayScore} ${match.awayTeam?.name}`.toUpperCase() }] : []),
    ...(ended && simulation.penalties ? [{ key: 'pen', order: clock.total + 2, clock: 'PEN', icon: '🥅', text: `PENALES ${simulation.penalties.home}-${simulation.penalties.away}: GANA ${penaltyWinner?.toUpperCase()}` }] : []),
  ];
  const ordered = feed.sort((left, right) => right.order - left.order);
  // Efectos (gol, roja, entretiempo, final) para lo que aparece mientras se mira: lo que ya había al abrir no suena.
  const seen = useRef(null);
  useEffect(() => {
    const state = { count: shown.length, half: tick >= clock.halfTime, ended };
    const before = seen.current;
    seen.current = state;
    if (!before || !onEvent) return;
    for (const event of shown.slice(before.count)) {
      const team = resolveTeam(event.side === 'home' ? match.homeTeam : match.awayTeam);
      if (event.type === 'goal') onEvent({ kind: 'goal', side: event.side, team, detail: event.playerName });
      else if (event.type === 'red') onEvent({ kind: 'red', side: event.side, team, detail: event.playerName });
    }
    if (!before.half && state.half && !ended) onEvent({ kind: 'halftime' });
    if (!before.ended && ended) onEvent({ kind: 'fulltime', detail: `${match.homeTeam?.name} ${simulation.homeScore}-${simulation.awayScore} ${match.awayTeam?.name}` });
  }, [shown.length, tick >= clock.halfTime, ended]);

  return <article className="scoreboard scoreboard-full sim-replay" aria-live="polite">
    <header className="scoreboard-bezel">{!ended && <i className="scoreboard-live-dot" aria-hidden="true"/>}<span className="scoreboard-meta">TRANSMISIÓN SIMULADA · {match.tournament?.name ?? 'TORNEO'}</span><span className={`scoreboard-tag ${ended ? 'scoreboard-tag-finished' : 'scoreboard-tag-live'}`}>{ended ? 'FINAL' : clock.clockOf(Math.max(tick, 0))}</span></header>
    <div className="scoreboard-teams">
      <div className="scoreboard-team"><TeamMark team={resolveTeam(match.homeTeam)}/><b>{match.homeTeam?.name}</b></div>
      <div className="scoreboard-score">
        <span key={`h${score.home}`} className={`scoreboard-digit ${lastGoal?.side === 'home' && score.home ? 'scoreboard-digit-flash' : ''}`}>{score.home}</span>
        <span className="scoreboard-colon">:</span>
        <span key={`a${score.away}`} className={`scoreboard-digit ${lastGoal?.side === 'away' && score.away ? 'scoreboard-digit-flash' : ''}`}>{score.away}</span>
      </div>
      <div className="scoreboard-team"><TeamMark team={resolveTeam(match.awayTeam)}/><b>{match.awayTeam?.name}</b></div>
    </div>
    <div className="sim-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }}/><b style={{ left: `${(clock.halfTime / clock.total) * 100}%` }}/></div>
    <ol className="sim-feed">{ordered.map(item => <li key={item.key} className={item.goal ? 'goal' : item.sub ? 'sub' : ''}><time>{item.clock}</time><span aria-hidden="true">{item.icon}</span><p>{item.text}</p></li>)}</ol>
  </article>;
}

/** Datos de una simulación ya registrada: cómo se calculó, reproducible con su semilla guardada. */
function SimulationBasis({ simulation }) {
  const { basis } = simulation;
  const enabled = basis.factors ?? {};
  const styleName = style => STYLE_LABELS.find(([key]) => key === style)?.[1] ?? style;
  const side = team => {
    const ratedBench = team.bench?.filter(player => player.overallWithCoach != null) ?? [];
    const benchAverage = ratedBench.length ? Math.round(ratedBench.reduce((sum, player) => sum + player.overallWithCoach, 0) / ratedBench.length) : null;
    return <div><h3>{team.name}</h3>
    <dl>
      <div><dt>Goles esperados</dt><dd>{team.expectedGoals.toFixed(2)}</dd></div>
      <div><dt>Ataque histórico</dt><dd>{Math.round(team.attack * 100)}</dd></div>
      <div><dt>Goles recibidos (hist.)</dt><dd>{Math.round(team.defense * 100)}</dd></div>
      <div><dt>Cartas ataque / defensa</dt><dd>{Math.round(team.cardAttack)} / {Math.round(team.cardDefense)}</dd></div>
      <div><dt>Partidos en su historial</dt><dd>{team.historyMatches}</dd></div>
      <div><dt>Formación</dt><dd>{team.formation}</dd></div>
      {enabled.day && <div><dt>Factor del día</dt><dd>×{team.dayFactor.toFixed(3)}</dd></div>}
      {enabled.headToHead && <div><dt>Historial directo sin castigos ({team.headToHeadMatches})</dt><dd>×{team.headToHead.toFixed(3)}</dd></div>}
    </dl>
    <p className="sim-lineup-used"><b>DT:</b> {team.coach ? `${team.coach.name} · ${team.coach.proficiency ? `${styleName(team.coach.proficiency.style)} (${team.coach.proficiency.value})` : 'sin estilo'} · ${team.coach.boosters.length ? team.coach.boosters.map(boosterText).join(' · ') : 'sin potenciadores'} (se suman a las stats base de sus jugadores)` : 'sin DT del catálogo vinculado'}</p>
    <p className="sim-lineup-used"><b>TITULARES:</b> {team.lineup.map(player => `${player.position} ${player.name}`).join(' · ')}</p>
    {team.bench?.length > 0 && <p className="sim-lineup-used"><b>BANCO{benchAverage != null ? ` · MEDIA ${benchAverage}` : ''}:</b> {team.bench.map(player => `${player.position} ${player.name}`).join(' · ')}</p>}
  </div>;
  };
  return <details className="sim-basis"><summary>CÓMO SE CALCULÓ</summary><div>
    <p>Motor v{simulation.engineVersion} · semilla <code>{simulation.seed}</code> · {basis.historyMatches} partidos de historial sin castigos · promedio de la liga {basis.leagueMeanGoals} goles por equipo · ventaja de local ×{basis.homeAdvantage}. Las cartas usan sus 26 stats base (sin progresión de nivel), su perfil y sus habilidades; el estilo elegido del DT potencia las cartas.{enabled.formation && ' La pizarra define la formación y el puesto si los once están ubicados.'}{enabled.day && ' El factor del día (±5%) ajusta los goles esperados.'}{enabled.headToHead && ' El historial directo, muy suavizado hacia el promedio, ajusta los goles esperados.'} Hay cansancio y cambios desde el banco. Con esta semilla y estos datos, el motor reproduce exactamente este partido.</p>
    <div className="sim-basis-teams">{side(basis.home)}{side(basis.away)}</div>
    {simulation.previousVoided > 0 && <p>Este partido tiene {simulation.previousVoided} simulación{simulation.previousVoided === 1 ? '' : 'es'} anterior{simulation.previousVoided === 1 ? '' : 'es'} anulada{simulation.previousVoided === 1 ? '' : 's'}.</p>}
  </div></details>;
}

/** Aviso bajo el marcador de un partido simulado, con la repetición y el detalle del cálculo. */
export function SimulationBanner({ match, simulation, onReplay }) {
  return <div className="sim-banner">
    <p><SimulatedBadge match={match}/> RESULTADO DEL SIMULADOR OFICIAL{simulation?.penalties ? ` · PENALES ${simulation.penalties.home}-${simulation.penalties.away}` : ''}
      {simulation && <button type="button" className="sim-replay-button" onClick={() => onReplay(simulation.durationSeconds || 30)}>▶ VER REPETICIÓN</button>}
    </p>
    {simulation && <SimulationBasis simulation={simulation}/>}
  </div>;
}
