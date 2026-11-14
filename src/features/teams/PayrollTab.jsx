import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { GpInput } from '../../components/GpInput.jsx';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, OverallBadge, gp } from '../public/DataStates.jsx';
import { gpNumber } from '../../utils/money.js';
import { useApiQuery } from '../public/useApiQuery.js';
import { HORIZON, PLAYOFF_PRIZES, leaguePrize, maxSalaryFor, roundStep, simulate } from '../../utils/payrollSim.js';
import { BalanceLine, PayrollBars } from './PayrollCharts.jsx';
import { SigningSheet } from './SigningSheet.jsx';
import { ArrivalSheets } from './ArrivalSheet.jsx';
import { Button, HowItWorks } from '../../ui/index.js';

const SEASONS = [2, 4, 6];
// En la simulación son los torneos que le quedan, que pueden ser impares.
const SIM_YEARS = [1, 2, 3, 4, 5, 6];
const upper = text => String(text ?? '').toUpperCase();
const PLAYOFF_SHORT = { none: 'NADA', playin: 'PLAY-IN', semifinal: 'SEMIFINAL', runnerUp: 'SUBCAMPEÓN', champion: 'CAMPEÓN' };
const PLAYOFF_LABEL = { none: 'NO CLASIFICA', playin: 'JUEGA EL PLAY-IN', semifinal: 'SEMIFINALISTA', runnerUp: 'SUBCAMPEÓN', champion: 'CAMPEÓN' };

// ---------- almacenamiento local (la simulación y la forma de verla son solo de este navegador) ----------
const readJson = (key, fallback) => { try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: sigue funcionando */ } };

const DEFAULT_SIM = { players: {}, raise: 15, renew: true, position: null, playoff: 'none', positions: [], playoffs: [] };
function loadSim(teamId) {
  const stored = readJson(`payroll-sim:${teamId}`, null);
  // Versión anterior (sin puestos por torneo): su "4.º" era un valor por defecto, no una elección; ahora parte de tu puesto de hoy.
  if (stored) return { ...DEFAULT_SIM, ...stored, ...(stored.positions ? {} : { position: null }) };
  // Compatibilidad: antes solo se guardaban los años elegidos por jugador.
  const years = readJson(`payroll-years:${teamId}`, {});
  return { ...DEFAULT_SIM, players: Object.fromEntries(Object.entries(years).map(([id, value]) => [id, { years: value }])) };
}

const SIM_SYNC_DELAY = 1200;
function useSim(teamId) {
  const [sim, setSim] = useState(() => loadSim(teamId));
  const timer = useRef(null);
  // Se guarda en el navegador al tiro y en la cuenta con un pequeño retraso, para seguirla desde otro dispositivo.
  const change = patch => setSim(current => {
    const next = { ...current, ...patch, savedAt: Date.now() };
    writeJson(`payroll-sim:${teamId}`, next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { endpoints.savePayrollSim(teamId, next).catch(() => {}); }, SIM_SYNC_DELAY);
    return next;
  });
  // Al abrir: gana la copia más nueva entre este navegador y la cuenta.
  useEffect(() => {
    let active = true;
    endpoints.payrollSim(teamId).then(response => {
      if (!active) return;
      const remote = response?.data?.draft ?? null;
      const local = readJson(`payroll-sim:${teamId}`, null);
      if (remote && (!local || (remote.savedAt ?? 0) > (local.savedAt ?? 0))) {
        const merged = { ...DEFAULT_SIM, ...remote };
        writeJson(`payroll-sim:${teamId}`, merged);
        setSim(merged);
      } else if (local && (!remote || (local.savedAt ?? 0) > (remote.savedAt ?? 0))) {
        endpoints.savePayrollSim(teamId, { ...local, savedAt: local.savedAt ?? Date.now() }).catch(() => {});
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [teamId]);
  const changePlayer = (playerId, patch) => change({ players: { ...sim.players, [playerId]: { ...sim.players[playerId], ...patch } } });
  const reset = () => change({ ...DEFAULT_SIM });
  // El aumento y la renovación "por defecto" se aplican a todos los jugadores (borran lo que se había ajustado a mano);
  // después se corrige a los que se quiera distintos.
  const applyToAll = patch => change({ ...patch, players: Object.fromEntries(Object.entries(sim.players).map(([id, own]) => { const { raise, renew, ...rest } = own; return [id, rest]; })) });
  return { sim, change, changePlayer, reset, applyToAll };
}

function useLayout() {
  const [layout, setLayout] = useState(() => (readJson('payroll-layout', 'cards') === 'table' ? 'table' : 'cards'));
  return [layout, value => { setLayout(value); writeJson('payroll-layout', value); }];
}

// ---------- piezas pequeñas ----------
/** Cuánto cobra respecto a su valor de mercado; la barra llena es el tope del 20%. */
function ShareBar({ salary, value, compact = false }) {
  const share = value > 0 ? salary / value : 0;
  const percent = Math.round(share * 1000) / 10;
  const tone = share > 0.2 ? 'over' : share > 0.15 ? 'high' : share > 0.1 ? 'mid' : 'ok';
  return <span className={`share-bar ${tone}`} title={`Cobra ${percent.toLocaleString('es-CL')}% de su valor de mercado. El máximo permitido es 20%.`}>
    <span className="share-track"><i style={{ width: `${Math.min(100, (share / 0.2) * 100)}%` }}/></span>
    <b>{percent.toLocaleString('es-CL')}%{!compact && <small> DE SU VALOR · MÁX. 20%</small>}</b>
  </span>;
}

const RISK_LABEL = { alto: '🔴 SE NEGARÍA', medio: '🟠 PEDIRÁ MÁS', bajo: '🟢 RENOVARÍA' };
const RISK_DETAIL = {
  alto: 'Hoy se negaría a renovar: está muy molesto. Arregla su rol o su sueldo antes de ofrecerle algo.',
  medio: 'Renovaría, pero pedirá un sueldo más alto de lo normal porque no está del todo conforme.',
  bajo: 'Debería renovar sin problemas con un aumento normal.',
};
const TRAIT_NAME = { ganador: 'GANADOR', titular: 'TITULAR', sociable: 'SOCIABLE', mercenario: 'MERCENARIO', ego: 'EGO', leal: 'LEAL' };
/** Qué haría hoy si le ofrecieras renovar, según su ánimo (rol, sueldo, resultados y personalidad). */
function RiskChip({ row }) {
  if (!row.renewalRisk) return null; // el ánimo de un club ajeno no se publica
  const detail = `${RISK_DETAIL[row.renewalRisk] ?? ''} Ánimo: ${row.moodLabel} (${row.mood}/100). Personalidad: ${(row.traits ?? []).map(trait => (TRAIT_NAME[trait] ?? trait).toLowerCase()).join(', ')}.`;
  return <span className={`risk-chip ${row.renewalRisk}`} title={detail}>{RISK_LABEL[row.renewalRisk]}</span>;
}

function LayoutToggle({ layout, onChange }) {
  return <span className="layout-toggle" role="group" aria-label="Forma de ver la nómina">
    <button type="button" className={layout === 'cards' ? 'on' : ''} onClick={() => onChange('cards')}>▦ TARJETAS</button>
    <button type="button" className={layout === 'table' ? 'on' : ''} onClick={() => onChange('table')}>☰ TABLA</button>
  </span>;
}

function SeasonDots({ paid, total }) {
  return <span className="season-dots" aria-label={`${paid} de ${total} torneos pagados`}>{Array.from({ length: total }, (_, index) => <i key={index} className={index < paid ? 'paid' : ''}/>)}</span>;
}

function YearsChips({ value, onChange, disabled = false, label, options = SEASONS }) {
  return <span className="chips years-chips" role="group" aria-label={label}>{options.map(n => <button type="button" key={n} disabled={disabled} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>)}</span>;
}

function TerminateButton({ team, contract, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const release = useApiMutation(signal => endpoints.releasePlayer(contract.playerId, { teamId: team.id }, signal), { onSuccess: () => { setConfirming(false); onDone(); } });
  if (!confirming) return <button type="button" className="ghost" onClick={() => setConfirming(true)}>{contract.endsWith ? 'SOLTAR' : 'RESCINDIR'}</button>;
  return <span className="offer-confirm" role="group" aria-label="CONFIRMAR RESCISIÓN">
    <span>{contract.endsWith
      ? `¿Soltar a ${upper(contract.playerName)}? Su contrato termina con el ${upper(contract.endsWith.name)}: no pagas nada, no recibes nada y no baja la reputación. Queda agente libre.`
      : `¿Rescindir a ${upper(contract.playerName)}? Pagas ${gp(contract.terminationCost)} (50% de ${contract.seasonsLeft} torneo(s)), no recibes nada y baja la reputación. No se deshace.`}</span>
    <button type="button" disabled={release.loading} onClick={() => release.execute()}>{release.loading ? 'ESPERA…' : contract.endsWith ? 'SÍ, SOLTAR' : 'SÍ, RESCINDIR'}</button>
    <button type="button" className="ghost" disabled={release.loading} onClick={() => setConfirming(false)}>VOLVER</button>
    <FormFeedback mutation={release}/>
  </span>;
}

function ContractYears({ team, contract, onDone, options }) {
  const change = useApiMutation((body, signal) => endpoints.setContractSeasons(team.id, contract.id, body, signal), { onSuccess: onDone });
  return <><YearsChips value={contract.seasons} disabled={change.loading} onChange={seasons => change.execute({ seasons })} options={options} label={`Torneos de ${contract.playerName}`}/><FormFeedback mutation={change}/></>;
}

/** Primas pactadas: por gol (máx. 1% del valor), por llegar a playoffs (5%) y por ser campeón (10%). Solo se cambian con el mercado abierto. */
function BonusEditor({ team, contract, editable, onDone }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(String(contract.goalBonus ?? 0));
  const [playoffs, setPlayoffs] = useState(String(contract.playoffBonus ?? 0));
  const [title, setTitle] = useState(String(contract.titleBonus ?? 0));
  // Si las primas cambian por fuera (renovación, recorte), el formulario parte de las nuevas.
  useEffect(() => { setGoal(String(contract.goalBonus ?? 0)); setPlayoffs(String(contract.playoffBonus ?? 0)); setTitle(String(contract.titleBonus ?? 0)); }, [contract.goalBonus, contract.playoffBonus, contract.titleBonus]);
  const save = useApiMutation((body, signal) => endpoints.setContractBonuses(team.id, contract.playerId, body, signal), { onSuccess: () => { setOpen(false); onDone(); } });
  const summary = contract.goalBonus || contract.playoffBonus || contract.titleBonus
    ? [contract.goalBonus ? `${gp(contract.goalBonus)} POR GOL` : null, contract.playoffBonus ? `${gp(contract.playoffBonus)} POR PLAYOFFS` : null, contract.titleBonus ? `${gp(contract.titleBonus)} POR TÍTULO` : null].filter(Boolean).join(' · ')
    : 'SIN PRIMAS';
  if (contract.status !== 'active') return null;
  return <span className="bonus-editor">
    <small className="bonus-summary">🎯 {summary}</small>
    {editable && !open && <button type="button" className="ghost" onClick={() => setOpen(true)}>PRIMAS</button>}
    {open && <span className="bonus-form" role="group" aria-label={`Primas de ${contract.playerName}`}>
      <label>POR GOL (MÁX. {gp(contract.maxGoalBonus)})<GpInput value={goal} onChange={event => setGoal(event.target.value)} max={contract.maxGoalBonus} aria-label="Prima por gol"/></label>
      <label>POR LLEGAR A PLAYOFFS (MÁX. {gp(contract.maxPlayoffBonus)})<GpInput value={playoffs} onChange={event => setPlayoffs(event.target.value)} max={contract.maxPlayoffBonus} aria-label="Prima por llegar a playoffs"/></label>
      <label>POR SER CAMPEÓN DE PLAYOFFS (MÁX. {gp(contract.maxTitleBonus)})<GpInput value={title} onChange={event => setTitle(event.target.value)} max={contract.maxTitleBonus} aria-label="Prima por título"/></label>
      <small>LA PRIMA POR GOL CUENTA PARA EL TOPE DEL 20% CON LOS {contract.expectedGoals} GOLES QUE SE ESPERAN DE SU POSICIÓN. AL JUGADOR LE GUSTAN LOS INCENTIVOS: MEJORA SU ÁNIMO.</small>
      <span className="mini-actions">
        <button type="button" disabled={save.loading} onClick={() => save.execute({ goalBonus: Number(goal) || 0, playoffBonus: Number(playoffs) || 0, titleBonus: Number(title) || 0 })}>{save.loading ? 'GUARDANDO…' : 'GUARDAR PRIMAS'}</button>
        <button type="button" className="ghost" disabled={save.loading} onClick={() => setOpen(false)}>VOLVER</button>
      </span>
      <FormFeedback mutation={save}/>
    </span>}
  </span>;
}

const OUTCOME_LABEL = { accepted: ['✅', 'ACEPTÓ'], counter: ['🤝', 'CONTRAOFERTA'], refused: ['❌', 'SE NEGÓ'], error: ['⚠️', 'NO SE PUDO'] };

/** Una misma propuesta para todos los jugadores con contrato vencido; cada uno responde por su cuenta. */
function RenewAll({ team, expiredCount, onDone, marketOpen, seasonOptions = SEASONS }) {
  const [seasons, setSeasons] = useState(seasonOptions[0]);
  const [raise, setRaise] = useState(15);
  const [results, setResults] = useState(null);
  const send = useApiMutation((body, signal) => endpoints.negotiateAllContracts(team.id, body, signal), { onSuccess: response => { setResults(response?.data ?? []); onDone(); } });
  if (!expiredCount && !results) return null;
  return <section className="renew-all">
    <header><h3>RENOVAR A TODOS</h3><p>{expiredCount} JUGADOR(ES) CON CONTRATO VENCIDO O POR TERMINAR: UNA PROPUESTA PARA TODOS.</p><HowItWorks><p>Cada uno acepta, contraoferta o se niega según su ánimo y personalidad. Una propuesta masiva no se conversa: cada jugador pide un 10% más que si hablas con él. A los que no acepten los negocias uno a uno en su hoja (hasta 3 propuestas en total). Al firmar, el club paga una prima de renovación: el 25% del sueldo nuevo de un torneo.</p></HowItWorks></header>
    {expiredCount > 0 && !marketOpen && <p className="payroll-empty">🔒 Sin mercado abierto: las renovaciones solo se hacen en periodos de mercado.</p>}
    {expiredCount > 0 && marketOpen && <div className="renew-all-form">
      <span className="chips">{seasonOptions.map(n => <button type="button" key={n} className={seasons === n ? 'on' : ''} onClick={() => setSeasons(n)}>{n} TORNEOS</button>)}</span>
      <span className="sheet-slider"><input type="range" min="1" max="100" value={raise} onChange={event => setRaise(Number(event.target.value))} aria-label="Aumento de sueldo en porcentaje"/><b>+{raise}%</b></span>
      <Button variant="positive" disabled={send.loading} onClick={() => send.execute({ seasons, raisePercent: raise })}>{send.loading ? 'ENVIANDO…' : 'ENVIAR A TODOS'}</Button>
    </div>}
    <FormFeedback mutation={send}/>
    {results && <ul className="renew-all-results">{results.map(item => { const [icon, label] = OUTCOME_LABEL[item.outcome] ?? ['•', item.outcome]; return <li key={item.playerId} className={item.outcome}><b>{icon} {item.name}</b> <small>{label}</small> <span>{item.reply}</span></li>; })}</ul>}
  </section>;
}

function Tiles({ items }) {
  return <div className="payroll-tiles">{items.map(([label, value, note]) => <div key={label}><small>{label}</small><b>{value}</b>{note && <em>{note}</em>}</div>)}</div>;
}

const covered = (payroll, balance) => (payroll > 0 && typeof balance === 'number' ? `${(Math.floor(balance / payroll * 10) / 10).toLocaleString('es-CL')} TORNEOS` : '—');

// ---------- vista REAL ----------
function RealView({ team, query, balance, marketOpen, canEdit, layout, refresh }) {
  const upcoming = query.data?.upcoming ?? [];
  const projection = query.data?.projection;
  // Duraciones que se pueden firmar hoy (el admin fija un máximo al abrir el mercado).
  const seasonOptions = query.data?.seasonOptions?.length ? query.data.seasonOptions : SEASONS;
  // De mayor a menor sueldo (a igual sueldo, mayor media): se ve de un vistazo quién pesa más en la nómina.
  const contracts = [...(query.data?.contracts ?? [])].sort((a, b) => b.salary - a.salary || (b.overall ?? -1) - (a.overall ?? -1));
  const enabled = Boolean(projection?.enabled);
  const cap = projection?.cap ?? null;
  const livePayroll = projection?.payroll ?? 0;
  const [signedIds, setSignedIds] = useState([]);
  const [signedSnapshots, setSignedSnapshots] = useState({});
  // Las hojas que ya se firmaron siguen a la vista (con su firma animada) aunque el contrato ya no esté vencido.
  const renewables = contracts.filter(contract => contract.renewable);
  const sheets = [...renewables, ...signedIds.filter(id => !renewables.some(contract => contract.id === id)).map(id => signedSnapshots[id]).filter(Boolean)];
  const keepSigned = contract => { setSignedSnapshots(items => ({ ...items, [contract.id]: contract })); setSignedIds(ids => ids.includes(contract.id) ? ids : [...ids, contract.id]); };
  const remainingCost = contracts.filter(contract => contract.status === 'active' && !contract.endsWith).reduce((sum, contract) => sum + contract.salary * (contract.loan?.leaguesLeft ?? contract.seasonsLeft), 0);
  // Qué torneos le quedan por cobrar a un contrato ("v11 y v12"), con los nombres reales cuando se pueden deducir.
  const pending = contract => upcoming.slice(0, contract.loan?.leaguesLeft ?? contract.seasonsLeft).map(upper);
  const chargeText = names => (names.length <= 2 ? names.join(' Y ') : `${names[0]} A ${names[names.length - 1]}`);
  const contractText = contract => {
    if (contract.arrivalPending) return 'RECIÉN LLEGADO: CONTRATO POR FIRMAR';
    if (contract.loan) { const names = pending(contract); return `A PRÉSTAMO DE ${upper(contract.loan.ownerName)}${names.length ? ` HASTA EL ${names[names.length - 1]}` : ''}`; }
    if (contract.status === 'expired') return 'VENCIDO: RENOVAR';
    if (contract.leavesFree) return 'NO RENOVÓ: SIGUE JUGANDO Y SALE LIBRE CUANDO TERMINE EL TORNEO';
    if (contract.startsAfter) return `RENOVADO: EL SUELDO NUEVO RIGE DESPUÉS DEL ${upper(contract.startsAfter.name ?? 'TORNEO EN CURSO')}`;
    if (contract.renewable && !contract.endsWith) return 'ÚLTIMA TEMPORADA: SE PUEDE RENOVAR YA';
    if (contract.endsWith) return `VIGENTE: TERMINA CON EL ${upper(contract.endsWith.name)}`;
    const names = pending(contract);
    return names.length ? `VIGENTE HASTA EL ${names[names.length - 1]}` : `${contract.seasonsLeft} TORNEO(S) POR PAGAR`;
  };
  const chargeNote = contract => { const names = contract.status === 'active' && !contract.endsWith ? pending(contract) : []; return names.length ? `SE COBRA AL TERMINAR: ${chargeText(names)}` : null; };
  // Solo los firmados en este mercado (llegadas y renovaciones): un contrato de antes ya está cerrado.
  const editable = contract => canEdit && marketOpen && contract.status === 'active' && contract.seasonsPaid === 0 && contract.seasonsEditable === true;
  const actions = contract => <>
    {editable(contract) && <ContractYears team={team} contract={contract} onDone={refresh} options={seasonOptions}/>}
    <BonusEditor team={team} contract={contract} editable={canEdit && marketOpen} onDone={refresh}/>
    {canEdit && contract.status === 'active' && <TerminateButton team={team} contract={contract} onDone={refresh}/>}
  </>;

  return <div className="payroll-real">
    <div className="view-badge is-real">📄 NÓMINA REAL · CONTRATOS FIRMADOS</div>
    <HowItWorks title="¿Cómo funcionan los contratos?"><p>Cada jugador tiene un contrato de 2, 4 o 6 torneos. Su sueldo queda congelado y se cobra al terminar cada torneo de liga mientras siga en el club. Nadie puede cobrar más del 20% de su valor de mercado.{upcoming[0] ? ` Los sueldos se cobran desde el ${upcoming[0]}; el torneo en curso no se cobra.` : ''}</p><p>Cuando un contrato vence, se renueva en el período de renovaciones del mercado siguiente. Si no, el jugador queda libre cuando el mercado pasa a transacciones (sin costo ni castigo). Todo jugador que llega (traspaso, trueque o agente libre) negocia su contrato en la hoja de firma.</p></HowItWorks>
    {!enabled && <p className="payroll-empty">Los contratos todavía no están activos. Mientras tanto usa la simulación para planificar.</p>}
    {enabled && <>
      {canEdit && !marketOpen && <p className="payroll-empty">🔒 Mercado cerrado: años y renovaciones se cambian cuando abra. Rescindir se puede siempre.</p>}
      <Tiles items={[
        ['NÓMINA ANUAL', gp(livePayroll)],
        ['TOPE DE NÓMINA', cap === null ? 'SIN DEFINIR' : gp(cap), cap !== null && livePayroll > cap ? `TE PASAS POR ${gp(livePayroll - cap)}` : null],
        ['SALDO', gp(balance)],
        ['ALCANZA PARA', covered(livePayroll, balance)],
        ['POR PAGAR EN CONTRATOS', gp(remainingCost)],
      ]}/>
      {canEdit && <ArrivalSheets team={team} onDone={refresh} seasonOptions={seasonOptions}/>}
      {canEdit && <RenewAll team={team} expiredCount={renewables.length} onDone={refresh} marketOpen={marketOpen} seasonOptions={seasonOptions}/>}
      {canEdit && sheets.map(contract => <SigningSheet key={contract.id} team={team} contract={contract} args={query.data?.arguments ?? []} maxRounds={query.data?.maxRounds ?? 3} marketOpen={marketOpen} seasonOptions={seasonOptions} onDone={refresh} onAccepted={() => keepSigned(contract)}/>)}
      {layout === 'cards'
        ? <div className="payroll-grid">{contracts.map(contract => <article key={contract.id} className={`payroll-card ${contract.status}`}>
          <header><PlayerFace src={contract.faceUrl} name={contract.playerName}/><div><b>{contract.playerName}</b><small>{contract.position} · VALE {gp(contract.marketValue)}</small></div><OverallBadge value={contract.overall}/></header>
          <div className="payroll-card-salary"><b>{gp(contract.salary)}</b><small>POR TORNEO</small></div>
          <ShareBar salary={contract.salary} value={contract.marketValue}/>
          <div className="payroll-card-years">
            {!contract.endsWith && !contract.loan && <SeasonDots paid={contract.seasonsPaid} total={contract.seasons}/>}
            <span>{contractText(contract)}</span>
          </div>
          {chargeNote(contract) && <small className="payroll-card-total">{chargeNote(contract)}</small>}
          {actions(contract)}
        </article>)}</div>
        : <div className="ptable-wrap"><table className="ptable">
          <thead><tr><th>JUGADOR</th><th>MEDIA</th><th>VALOR</th><th>SUELDO / TORNEO</th><th>% DEL VALOR</th><th>CONTRATO</th>{canEdit && <th></th>}</tr></thead>
          <tbody>{contracts.map(contract => <tr key={contract.id} className={contract.status}>
            <td><span className="ptable-player"><PlayerFace src={contract.faceUrl} name={contract.playerName}/><span><b>{contract.playerName}</b> <small>{contract.position}</small></span></span></td>
            <td><OverallBadge value={contract.overall}/></td>
            <td>{gp(contract.marketValue)}</td>
            <td><b>{gp(contract.salary)}</b></td>
            <td><ShareBar salary={contract.salary} value={contract.marketValue} compact/></td>
            <td><span className="ptable-contract" title={chargeNote(contract) ?? undefined}>{!contract.endsWith && !contract.loan && <SeasonDots paid={contract.seasonsPaid} total={contract.seasons}/>}<small>{contractText(contract)}{chargeNote(contract) ? ` · ${chargeNote(contract).replace('SE COBRA AL TERMINAR: ', 'PAGA ')}` : ''}</small></span></td>
            {canEdit && <td className="ptable-actions">{actions(contract)}</td>}
          </tr>)}</tbody>
        </table></div>}
    </>}
  </div>;
}

// ---------- vista SIMULACIÓN ----------
function SimView({ team, projection, balance, canEdit, layout, currentPosition, upcoming = [], onTab = null }) {
  const labelOf = index => (upcoming[index] ? upper(upcoming[index]) : `T${index + 1}`);
  const { sim, change, changePlayer, reset, applyToAll } = useSim(team.id);
  // Sin elegir, parte de tu puesto actual en la tabla (o 4.º si no hay torneo en curso).
  const defaultPosition = sim.position ?? currentPosition ?? 4;
  const setTorneo = (key, index, value) => change({ [key]: Array.from({ length: HORIZON }, (_, i) => (i === index ? value : sim[key]?.[i] ?? null)) });
  const cap = projection?.cap ?? null;
  const rows = (projection?.players ?? []).map(player => {
    const own = sim.players[player.playerId] ?? {};
    const years = own.years ?? (player.contract ? Math.max(1, player.contract.seasons - player.contract.seasonsPaid) : 2);
    const salary = own.salary ?? player.contract?.salary ?? player.projectedSalary;
    const limit = player.salaryCap ?? maxSalaryFor(player.marketValue);
    // Aumento y renovación por jugador: vacío = el global.
    const renewedSalary = Math.min(roundStep(salary * (1 + (own.raise ?? sim.raise) / 100)), maxSalaryFor(player.marketValue));
    return { ...player, years, salary, renewedSalary, cappedAtRenewal: roundStep(salary * (1 + (own.raise ?? sim.raise) / 100)) > maxSalaryFor(player.marketValue), over: salary > limit, raiseOwn: own.raise, raise: own.raise ?? sim.raise, renew: own.renew ?? sim.renew, sold: own.sell === true };
  });
  const timeline = simulate(rows.map(row => ({ value: row.marketValue, salary: row.salary, years: row.years, raise: row.raiseOwn, renew: row.renew, sold: row.sold })), {
    raise: sim.raise, renew: sim.renew, position: defaultPosition, playoff: sim.playoff, positions: sim.positions, playoffs: sim.playoffs, balance: typeof balance === 'number' ? balance : 0, cap,
  });
  const kept = rows.filter(row => !row.sold);
  const payroll = kept.reduce((sum, row) => sum + row.salary, 0);
  const total = kept.reduce((sum, row) => sum + row.salary * row.years, 0);
  const overCount = kept.filter(row => row.over).length;
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const timelineCost = timeline.reduce((sum, row) => sum + row.payroll, 0);

  const salaryInput = row => canEdit
    ? <GpInput aria-label={`Sueldo simulado de ${row.playerName}`} value={row.salary} onChange={event => changePlayer(row.playerId, { salary: event.target.value === '' ? undefined : Number(event.target.value) })}/>
    : <b>{gp(row.salary)}</b>;
  // Por jugador: aumento al renovar (vacío = el global), si renueva y si se vende (sale desde el T1).
  const renewControls = row => <span className="sim-player-controls">
    <label title="Aumento al renovar. Parte con el valor por defecto de arriba; cámbialo si este jugador va distinto.">AUMENTO<span className={`mini-percent ${row.raiseOwn !== undefined && row.raiseOwn !== sim.raise ? 'custom' : ''}`}><input type="number" min="0" max="100" step="1" inputMode="numeric" disabled={!canEdit || row.sold} aria-label={`Aumento al renovar de ${row.playerName}`}
      value={row.raise} onChange={event => changePlayer(row.playerId, { raise: event.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(event.target.value))) })}/>%</span></label>
    <small className="renew-result" title="Sueldo por torneo después de renovar, con el aumento elegido y sin pasar el 20% de su valor.">{row.sold ? '' : row.renew ? `AL RENOVAR: ${gpNumber(row.renewedSalary)} GP${row.cappedAtRenewal ? ' (TOPE 20%)' : ''}` : 'NO RENUEVA: SALE'}</small>
    <label><input type="checkbox" checked={row.renew} disabled={!canEdit || row.sold} onChange={event => changePlayer(row.playerId, { renew: event.target.checked })}/> RENUEVA</label>
    <RiskChip row={row}/>
    <label className="sell"><input type="checkbox" checked={row.sold} disabled={!canEdit} onChange={event => changePlayer(row.playerId, { sell: event.target.checked })}/> VENDER</label>
  </span>;
  const yearsInput = row => (canEdit ? <YearsChips value={row.years} options={SIM_YEARS} onChange={years => changePlayer(row.playerId, { years })} label={`Torneos simulados de ${row.playerName}`}/> : <span>{row.years} TORNEOS</span>);

  return <div className="payroll-sim">
    <div className="view-badge is-sim">🧪 Simulación · nada de esto es real ni se cobra</div>
    {onTab && <p className="payroll-note sim-link">¿Quieres probar fichajes y ventas? <button type="button" className="ghost" onClick={() => onTab('finanzas')}>IR AL SIMULADOR →</button></p>}
    <p className="payroll-note">Prueba sueldos, años, aumentos y ventas: nada de esto se guarda en la liga.</p>
    <HowItWorks><p>El aumento se aplica cuando vence cada contrato, así que se nota en los últimos torneos, en el costo total y en los gráficos.</p><p>Usa los valores de mercado de hoy (cambian con cada refresco de Transfermarkt). La simulación se guarda en tu cuenta, no en la liga. Si un jugador pasa el 20% de su valor sale en rojo: ese sueldo no se podría firmar.</p></HowItWorks>
    <section className="sim-controls">
      <label>AUMENTO AL RENOVAR (POR DEFECTO)<span className="sheet-slider"><input type="range" min="0" max="100" value={sim.raise} onChange={event => applyToAll({ raise: Number(event.target.value) })} aria-label="Aumento al renovar en porcentaje"/><b>+{sim.raise}%</b></span><small className="sim-hint">Se aplica a todos los jugadores; después cambias a los que quieras distintos.</small></label>
      <label className="sim-check"><input type="checkbox" checked={sim.renew} onChange={event => applyToAll({ renew: event.target.checked })}/> Renovar a quien le venza el contrato (por defecto)</label>
      <label>PUESTO POR DEFECTO{sim.position === null && currentPosition ? ' (TU PUESTO HOY)' : ''}<select value={defaultPosition} onChange={event => change({ position: Number(event.target.value) })}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}.º · {gp(leaguePrize(n))}</option>)}</select></label>
      <label>PLAYOFFS POR DEFECTO<select value={sim.playoff} onChange={event => change({ playoff: event.target.value })}>{Object.keys(PLAYOFF_PRIZES).map(key => <option key={key} value={key}>{PLAYOFF_LABEL[key]}{PLAYOFF_PRIZES[key] ? ` · ${gp(PLAYOFF_PRIZES[key])}` : ''}</option>)}</select></label>
      {canEdit && <button type="button" className="ghost" onClick={reset}>RESTABLECER</button>}
    </section>
    <Tiles items={[
      ['NÓMINA ANUAL SIMULADA', gp(payroll)],
      ['TOPE DE NÓMINA', cap === null ? 'SIN DEFINIR' : gp(cap), cap !== null && payroll > cap ? `TE PASAS POR ${gp(payroll - cap)}` : null],
      ['SALDO HOY', gp(balance)],
      [`SALDO AL ${upcoming[0] ? upper(upcoming[0]) : 'TORNEO 1'}`, first ? gp(first.balance) : '—', first && first.net < 0 ? 'GASTAS MÁS DE LO QUE GANAS' : null],
      ['CONTRATOS DE HOY (SUELDO × TORNEOS)', gp(total)],
      [`NÓMINA EN EL ${labelOf(HORIZON - 1)}`, gp(last.payroll), `${last.payroll >= payroll ? '+' : '−'}${gp(Math.abs(last.payroll - payroll))} VS HOY, CON LAS RENOVACIONES`],
      [`COSTO ${labelOf(0)} A ${labelOf(HORIZON - 1)}`, gp(timelineCost), 'Incluye renovaciones con el aumento elegido'],
    ]}/>
    {kept.filter(row => row.renew && row.renewalRisk === 'alto').length > 0 && <p className="payroll-empty sim-warn">🔴 {kept.filter(row => row.renew && row.renewalRisk === 'alto').map(row => row.playerName).join(', ')}: HOY SE NEGARÍA(N) A RENOVAR. LA SIMULACIÓN SUPONE QUE RENUEVAN; ARREGLA SU ROL O SU SUELDO ANTES.</p>}
    {overCount > 0 && <p className="payroll-empty sim-warn">⚠️ {overCount} JUGADOR(ES) SOBRE EL 20% DE SU VALOR: ESOS SUELDOS NO SE PODRÍAN FIRMAR.</p>}
    {layout === 'cards'
      ? <div className="payroll-grid">{rows.map(row => <article key={row.playerId} className={`payroll-card sim-card ${row.over && !row.sold ? 'over' : ''} ${row.sold ? 'sold' : ''}`}>
        <header><PlayerFace src={row.faceUrl} name={row.playerName}/><div><b>{row.playerName}</b><small>{row.position} · VALE {gp(row.marketValue)}</small></div></header>
        {salaryInput(row)}
        <ShareBar salary={row.salary} value={row.marketValue}/>
        {yearsInput(row)}
        {renewControls(row)}
        <small className="payroll-card-total">{row.sold ? 'Vendido: no cuenta desde el t1' : <>{row.years} TORNEOS × {gp(row.salary)} = <b>{gp(row.salary * row.years)}</b></>}</small>
      </article>)}</div>
      : <div className="ptable-wrap"><table className="ptable ptable-sim">
        <thead><tr><th>JUGADOR</th><th>VALOR</th><th>SUELDO / TORNEO</th><th>% DEL VALOR</th><th>TORNEOS</th><th>AL RENOVAR</th><th>COSTO TOTAL</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.playerId} className={`${row.over && !row.sold ? 'over' : ''} ${row.sold ? 'sold' : ''}`}>
          <td><span className="ptable-player"><PlayerFace src={row.faceUrl} name={row.playerName}/><span><b>{row.playerName}</b> <small>{row.position}</small></span></span></td>
          <td>{gp(row.marketValue)}</td>
          <td className="ptable-salary">{salaryInput(row)}</td>
          <td><ShareBar salary={row.salary} value={row.marketValue} compact/></td>
          <td>{yearsInput(row)}</td>
          <td>{renewControls(row)}</td>
          <td>{row.sold ? 'VENDIDO' : gp(row.salary * row.years)}</td>
        </tr>)}</tbody>
      </table></div>}

    <section className="sim-timeline">
      <h3>PRÓXIMOS TORNEOS</h3>
      <div className="sim-charts">
        <figure><figcaption>NÓMINA POR TORNEO{cap !== null ? ' Y TOPE' : ''}</figcaption><PayrollBars rows={timeline} cap={cap} labelOf={labelOf}/></figure>
        <figure><figcaption>SALDO PROYECTADO</figcaption><BalanceLine rows={timeline} start={typeof balance === 'number' ? balance : 0} labelOf={labelOf}/></figure>
      </div>
      <div className="ptable-wrap"><table className="ptable sim-timeline-table">
        <thead><tr><th>TORNEO</th><th>PUESTO</th><th>PLAYOFFS</th><th>NÓMINA</th><th>PREMIOS</th><th>NETO</th><th>SALDO</th><th>CONTRATOS QUE VENCEN</th></tr></thead>
        <tbody>{timeline.map(row => <tr key={row.torneo} className={row.overCap || row.balance < 0 ? 'over' : ''}>
          <td><b>{labelOf(row.torneo - 1)}</b></td>
          <td><select aria-label={`Puesto en el torneo ${row.torneo}`} value={row.position} disabled={!canEdit} onChange={event => setTorneo('positions', row.torneo - 1, Number(event.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}.º</option>)}</select></td>
          <td><select aria-label={`Playoffs del torneo ${row.torneo}`} value={row.playoff} disabled={!canEdit} onChange={event => setTorneo('playoffs', row.torneo - 1, event.target.value)}>{Object.keys(PLAYOFF_PRIZES).map(key => <option key={key} value={key}>{PLAYOFF_SHORT[key]}</option>)}</select></td>
          <td>{gp(row.payroll)}{row.overCap ? ' ⚠️' : ''}</td><td>{gp(row.prize)}</td>
          <td className={row.net < 0 ? 'neg' : ''}>{row.net >= 0 ? '+' : '−'}{gp(Math.abs(row.net))}</td><td className={row.balance < 0 ? 'neg' : ''}>{gp(row.balance)}</td>
          <td>{row.expiring ? `${row.expiring} · ${row.renewed ? `${row.renewed} RENUEVA(N)` : ''}${row.renewed && row.leaving ? ' · ' : ''}${row.leaving ? `${row.leaving} SALE(N)` : ''}` : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="payroll-note">{upcoming[0] ? `El primer torneo que se cobra es el ${upper(upcoming[0])}.` : 'T1 es el primer torneo con contratos.'}</p>
      <HowItWorks><p>Los premios son los de la tabla de la liga según el puesto y los playoffs que elijas en cada fila (parten de tu puesto de hoy). No incluye fichajes nuevos.</p></HowItWorks>
    </section>
  </div>;
}

/** Nómina del club: la real (contratos firmados) y la simulación (qué pasaría con otros sueldos, años y premios). */
export function PayrollTab({ team, balance, onChanged, onTab = null, currentPosition = null, forcedView = null }) {
  const { canEditTeam } = useAuth();
  const canEdit = canEditTeam(team.id);
  const query = useApiQuery(signal => endpoints.teamContracts(team.id, signal), [team.id]);
  // Cambiar años, renovar y negociar contratos solo se puede con el mercado abierto.
  const market = useApiQuery(signal => endpoints.marketStatus(signal).catch(() => ({ data: { open: false } })), []);
  const marketOpen = Boolean(market.data?.open);
  const [view, setView] = useState(null);
  const [layout, setLayout] = useLayout();
  const refresh = () => { query.retry(); onChanged?.(); };
  const projection = query.data?.projection;
  // Con `forcedView` quien la usa decide la vista (Finanzas: contratos / simulador); sin ella, el presi alterna y el visitante solo ve lo real.
  const noContracts = projection && !projection.enabled; // antes del v11 solo hay simulación
  const current = (forcedView === 'actual' && noContracts ? 'proyeccion' : forcedView) ?? (canEdit ? view : 'actual') ?? (projection?.enabled ? 'actual' : 'proyeccion');

  return <section className={`payroll-tab ${current === 'proyeccion' ? 'is-sim' : 'is-real'}`}>
    <header className="payroll-head">
      {forcedView !== 'proyeccion' && <h2>CONTRATOS Y NÓMINA</h2>}
      <div className="payroll-head-tools">
        <LayoutToggle layout={layout} onChange={setLayout}/>
        {!forcedView && canEdit && <nav className="payroll-views" role="tablist" aria-label="Vista de la nómina">
          <button type="button" role="tab" aria-selected={current === 'actual'} className={current === 'actual' ? 'on' : ''} onClick={() => setView('actual')}>📄 NÓMINA ACTUAL</button>
          <button type="button" role="tab" aria-selected={current === 'proyeccion'} className={`sim-tab ${current === 'proyeccion' ? 'on' : ''}`} onClick={() => setView('proyeccion')}>🧪 SIMULACIÓN</button>
        </nav>}
      </div>
    </header>
    <DataState query={query}/>
    {projection && current === 'actual' && <RealView team={team} query={query} balance={balance} marketOpen={marketOpen} canEdit={canEdit} layout={layout} refresh={refresh}/>}
    {projection && current === 'proyeccion' && <SimView team={team} projection={projection} balance={balance} canEdit={canEdit} layout={layout} currentPosition={currentPosition} upcoming={query.data?.upcoming ?? []} onTab={onTab}/>}
  </section>;
}
