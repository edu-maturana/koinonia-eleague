import { useEffect, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { OverallBadge } from '../public/DataStates.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { gpLabel } from '../../utils/money.js';
import { Button } from '../../ui/index.js';

export const ROLES = [['crucial', 'CRUCIAL'], ['importante', 'IMPORTANTE'], ['rotacion', 'ROTACIÓN'], ['esporadico', 'ESPORÁDICO']];
export const roleLabel = role => ROLES.find(([key]) => key === role)?.[1] ?? '—';
const SEASONS = [2, 4, 6];
const SALARY_STEP = 10_000;
const roundStep = amount => Math.max(SALARY_STEP, Math.round(amount / SALARY_STEP) * SALARY_STEP);
const MOOD_FACE = { feliz: '😄', contento: '🙂', dudoso: '😐', molesto: '😠', furioso: '🤬' };

export const moodTone = mood => (mood >= 70 ? 'good' : mood >= 50 ? 'mid' : 'bad');

export function MoodMeter({ mood, label }) {
  // Barra de 0 a 100 de un solo color: verde desde 70, amarillo de 50 a 69, rojo bajo 50.
  const tone = moodTone(mood);
  return <span className={`mood-meter ${tone}`} title={`Ánimo ${mood}/100`}>
    <span className="mood-face" aria-hidden="true">{MOOD_FACE[label] ?? '🙂'}</span>
    <span className="mood-meter-bar"><i style={{ width: `${Math.max(0, Math.min(100, mood))}%` }}/></span>
    <b>{String(label ?? '').toUpperCase()} <small>{mood}</small></b>
  </span>;
}

// Firma animada: un trazo que se dibuja solo (la del presi) y el nombre del jugador en letra cursiva.
function Signatures({ playerName }) {
  return <div className="sheet-signatures" aria-hidden="true">
    <div><svg viewBox="0 0 180 50" className="sig-draw"><path d="M6 36 C 20 4, 30 4, 34 26 S 48 44, 60 22 S 78 8, 84 30 S 104 40, 112 18 S 130 10, 138 30 S 160 36, 174 16" pathLength="1"/></svg><small>EL PRESIDENTE</small></div>
    <div><span className="sig-name">{playerName}</span><small>EL JUGADOR</small></div>
  </div>;
}

const INTEREST_STEPS = ['FRÍO', 'TIBIO', 'CERCA', 'LISTO PARA FIRMAR'];
/** Qué tan interesado está el jugador en la propuesta que armas (sin gastar rondas ni revelar su número). */
function InterestMeter({ level, label, overCap, cap }) {
  const lit = Math.max(0, level);
  return <div className={`interest-meter level-${level}`} role="status" aria-live="polite">
    <span className="interest-title">INTERÉS DEL JUGADOR</span>
    <span className="interest-bars" aria-hidden="true">{INTEREST_STEPS.map((step, index) => <i key={step} className={index < lit ? 'on' : ''}/>)}</span>
    <b>{level === 0 ? 'NO QUIERE NI HABLAR' : upperText(label)}</b>
    {overCap && <small>⚠️ SUPERA EL 20% DE SU VALOR ({gpLabel(cap)} MÁX.): NO SE PUEDE FIRMAR</small>}
  </div>;
}
const upperText = text => String(text ?? '').toUpperCase();

// Qué motivos del ánimo puede mover el presi antes de que cierre el mercado y cuáles no (resultados, fama y objetivos ya pasaron).
const FIXABLE = new Set(['rol', 'titular', 'sueldo', 'incentivo', 'promesa', 'salida', 'instalaciones']);
function refusalHint(info, contract) {
  const down = (info.reasons ?? []).filter(reason => reason.delta < 0).sort((a, b) => a.delta - b.delta);
  const worst = down[0];
  const fixable = down.filter(reason => FIXABLE.has(reason.key));
  const why = info.leave ? `Se quiere ir: ${info.leave.text}.` : `Su ánimo es ${info.mood}/100 y por debajo de 35 no se sienta a negociar.`;
  const reversible = info.leave?.reversible === false ? 'Es una decisión personal: no hay cómo convencerlo.' : 'No es definitivo: si su situación mejora, vuelve a negociar.';
  const lever = fixable.length ? `Lo que sí puedes mover: ${fixable.slice(0, 2).map(reason => reason.text.toLowerCase()).join('; ')}.` : worst ? `Lo que más lo hunde (${worst.text.toLowerCase()}) no se arregla antes de que cierre el mercado.` : '';
  const exit = contract.exitReason ? 'No se vende: sale libre al pasar a transacciones (sigue jugando hasta que termine el torneo). Solo puedes canjearlo (con o sin plata de por medio).' : '';
  return [why, reversible, lever, exit].filter(Boolean).join(' ');
}

/** Editar una renovación ya firmada en este mercado: se deshace (vuelve el contrato anterior y la prima) y se negocia de nuevo. */
export function ReopenRenewalButton({ team, playerId, playerName, onReopened }) {
  const [confirming, setConfirming] = useState(false);
  const reopen = useApiMutation((body, signal) => endpoints.reopenRenewal(team.id, body, signal), { onSuccess: response => { setConfirming(false); onReopened(response?.data ?? null); } });
  if (!confirming) return <button type="button" className="ghost" onClick={() => setConfirming(true)}>EDITAR</button>;
  return <span className="offer-confirm" role="group" aria-label="CONFIRMAR EDICIÓN DE LA RENOVACIÓN">
    <span>¿Editar la renovación de {String(playerName).toUpperCase()}? Se deshace la firma, se te devuelve la prima y vuelves a negociar años y condiciones (la firma deshecha no gasta propuesta).</span>
    <button type="button" disabled={reopen.loading} onClick={() => reopen.execute({ playerId })}>{reopen.loading ? 'ESPERA…' : 'SÍ, EDITAR'}</button>
    <button type="button" className="ghost" disabled={reopen.loading} onClick={() => setConfirming(false)}>VOLVER</button>
    <FormFeedback mutation={reopen}/>
  </span>;
}

/** La hoja de firma de una renovación: se negocia hasta en 3 propuestas y, si hay acuerdo, se firma. */
export function SigningSheet({ team, contract, args = [], maxRounds = 3, marketOpen = true, seasonOptions = SEASONS, onDone, onAccepted, onReopened }) {
  const info = contract.renewal;
  const talk = contract.talk;
  const [seasons, setSeasons] = useState(seasonOptions[0]);
  // Si ya hubo una contraoferta, el control parte en lo mínimo que el jugador acepta.
  const lastCounter = [...(talk?.log ?? [])].reverse().find(entry => entry.counter)?.counter;
  const [raise, setRaise] = useState(lastCounter?.raisePercent ?? 10);
  const [promisedRole, setPromisedRole] = useState('');
  const [argument, setArgument] = useState('');
  const [last, setLast] = useState(null);
  const negotiate = useApiMutation((body, signal) => endpoints.negotiateContract(team.id, body, signal), {
    onSuccess: response => {
      const result = response?.data ?? null;
      setLast(result);
      if (result?.counter?.raisePercent) setRaise(result.counter.raisePercent);
      // La hoja firmada tiene que seguir a la vista para ver la firma: el padre la mantiene aunque el contrato ya no esté vencido.
      if (result?.outcome === 'accepted') onAccepted?.(contract.id);
      onDone?.();
    },
  });
  const outcome = last?.outcome ?? (talk?.status === 'refused' ? 'refused' : null);
  const round = last?.round ?? talk?.rounds ?? 0;
  // Un "no" por ánimo bajo no cuenta como definitivo: solo lo es el de quien se negó tras agotar las propuestas.
  const finalRefusal = outcome === 'refused' && (last ? last.final === true : talk?.status === 'refused');
  const closed = outcome === 'accepted' || finalRefusal || info?.refuses;
  const locked = !marketOpen && !closed;
  const offered = roundStep(contract.salary * (1 + Number(raise || 0) / 100));
  const send = (override = {}) => negotiate.execute({
    playerId: contract.playerId, seasons, raisePercent: Number(override.raisePercent ?? raise),
    promisedRole: promisedRole || null, argument: argument || null,
  });
  // El medidor se actualiza solo mientras mueves los controles (no gasta propuestas).
  const [interest, setInterest] = useState(null);
  useEffect(() => {
    if (closed || locked) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      endpoints.contractInterest(team.id, { playerId: contract.playerId, seasons, raisePercent: Number(raise), promisedRole: promisedRole || null, argument: argument || null })
        .then(response => { if (active) setInterest(response?.data ?? null); }).catch(() => { if (active) setInterest(null); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [team.id, contract.playerId, seasons, raise, promisedRole, argument, closed, locked]);
  const log = [...(talk?.log ?? [])];
  if (last && !log.some(entry => entry.round === last.round)) log.push({ round: last.round, outcome: last.outcome, reply: last.reply, seasons, raisePercent: raise, offered });

  return <article className={`signing-sheet ${outcome ?? ''}`}>
    <header className="sheet-head">
      <small>CONTRATO DE JUGADOR · {team.name}</small>
      <div className="sheet-player">
        <PlayerFace src={contract.faceUrl} name={contract.playerName}/>
        <div><h3>{contract.playerName}</h3><span>{contract.position} · VALE {gpLabel(contract.marketValue)} · GANA {gpLabel(contract.salary)}/AÑO</span></div>
        <OverallBadge value={contract.overall}/>
        {info && <MoodMeter mood={info.mood} label={info.moodLabel}/>}
      </div>
    </header>

    {info?.reasons?.length > 0 && <ul className="sheet-reasons">{info.reasons.slice(0, 3).map(reason => <li key={reason.key} className={reason.delta < 0 ? 'down' : 'up'}><b>{reason.delta > 0 ? '+' : '−'}{Math.abs(reason.delta)}</b> {reason.text}</li>)}</ul>}

    {log.length > 0 && <div className="sheet-chat" aria-label="Conversación">{log.map(entry => <div key={entry.round} className={`sheet-turn ${entry.outcome}`}>
      <p className="turn-offer"><b>PROPUESTA {entry.round}</b> · {entry.seasons} TEMPORADAS · +{entry.raisePercent}% · {gpLabel(entry.offered)}/AÑO{entry.promisedRole ? ` · ROL ${roleLabel(entry.promisedRole)}` : ''}</p>
      <p className="turn-reply"><PlayerFace src={contract.faceUrl} name={contract.playerName} className="bubble-face"/><span>{entry.reply}</span></p>
    </div>)}</div>}

    {outcome === 'accepted' && <>
      {last?.contract && <p className="sheet-terms">NUEVO CONTRATO: <b>{last.contract.seasons} TEMPORADAS</b> · <b>{gpLabel(last.contract.salary)} AL AÑO</b>{last.contract.promised_role ? <> · ROL PROMETIDO: <b>{roleLabel(last.contract.promised_role)}</b></> : null}</p>}
      <Signatures playerName={contract.playerName}/>
      <div className="sheet-stamp good" role="status">FIRMADO ✔</div>
      {marketOpen && onReopened && <ReopenRenewalButton team={team} playerId={contract.playerId} playerName={contract.playerName} onReopened={onReopened}/>}
    </>}
    {finalRefusal && <div className="sheet-stamp bad" role="status">NO RENUEVA ✖</div>}
    {finalRefusal && <p className="poll-hint">Se negó tras escuchar tus propuestas: con este contrato no hay vuelta atrás. Puedes traspasarlo desde ya a otro club, o dejar que salga libre cuando venza.</p>}
    {info?.suitors > 0 && !info?.refuses && <p className="poll-hint">Otros clubes lo andan cortejando ({info.suitors}): pide más por quedarse.</p>}
    {info?.refuses && !finalRefusal && <p className="poll-hint">{refusalHint(info, contract)}</p>}
    {info?.grudging && !info?.refuses && <p className="poll-hint">Está muy molesto, pero afuera no lo espera nadie: renueva a regañadientes, pidiendo bastante más.</p>}

    {locked && <p className="poll-hint">🔒 Sin mercado abierto: la renovación se negocia en el próximo periodo de mercado.</p>}
    {!closed && !locked && <div className="sheet-form">
      <div className="sheet-row"><span>TEMPORADAS</span><div className="chips">{seasonOptions.map(n => <button type="button" key={n} className={seasons === n ? 'on' : ''} onClick={() => setSeasons(n)}>{n}</button>)}</div></div>
      <div className="sheet-row"><span>AUMENTO</span><div className="sheet-slider"><input type="range" min="1" max="100" value={raise} onChange={event => setRaise(Number(event.target.value))} aria-label="Aumento de sueldo en porcentaje"/><b>+{raise}%</b><em>{gpLabel(offered)} AL AÑO</em></div></div>
      {info?.roleWanted && <div className="sheet-row"><span>PROMETER ROL</span><div className="chips"><button type="button" className={!promisedRole ? 'on' : ''} onClick={() => setPromisedRole('')}>SIN PROMESA</button>{ROLES.map(([key, label]) => <button type="button" key={key} className={promisedRole === key ? 'on' : ''} onClick={() => setPromisedRole(key)}>{label}</button>)}</div></div>}
      <div className="sheet-row"><span>ARGUMENTO</span><div className="chips"><button type="button" className={!argument ? 'on' : ''} onClick={() => setArgument('')}>NINGUNO</button>{args.map(item => <button type="button" key={item.key} className={argument === item.key ? 'on' : ''} onClick={() => setArgument(item.key)}>{item.label.toUpperCase()}</button>)}</div></div>
      {interest && <InterestMeter level={interest.level} label={interest.label} overCap={interest.overCap} cap={interest.salaryCap}/>}
      <div className="sheet-actions">
        <Button variant="positive" disabled={negotiate.loading} onClick={() => send()}>{negotiate.loading ? 'ENVIANDO…' : `ENVIAR PROPUESTA (${round + 1}/${maxRounds})`}</Button>
        {last?.outcome === 'counter' && <Button disabled={negotiate.loading} onClick={() => { setRaise(last.counter.raisePercent); send({ raisePercent: last.counter.raisePercent }); }}>ACEPTAR SU CONTRAOFERTA ({gpLabel(last.counter.salary)})</Button>}
      </div>
      <FormFeedback mutation={negotiate}/>
    </div>}
  </article>;
}
