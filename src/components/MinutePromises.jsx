import { useEffect, useState } from 'react';
import { endpoints } from '../api/endpoints.js';
import { useAuth } from '../app/AuthGate.jsx';
import { useApiQuery } from '../features/public/useApiQuery.js';
import { Button, Modal } from '../ui/index.js';

/**
 * Promesas de minutos ("juega el próximo partido") de un partido. Quien maneja la ficha (puede ser un espectador) ve un
 * recordatorio al iniciar y, al terminar, responde si se cumplió. Se habla del jugador en tercera persona.
 * `moment`: 'start' abre el recordatorio; 'finish' abre la pregunta. Sin respuesta, a las 24 horas se da por NO cumplida.
 * Antes del partido el presi DECLARA que lo va a poner (lo ve el rival); al terminar, el rival puede DISPUTARLO y entonces
 * no se resuelve sola: la zanja un admin.
 */
export function MinutePromises({ match, moment = null, onMomentSeen }) {
  const { canEditTeam, isAdmin } = useAuth();
  const query = useApiQuery(signal => endpoints.matchMinutePromises(match.id, signal).catch(() => ({ data: [] })), [match.id, match.status]);
  const promises = Array.isArray(query.data) ? query.data : [];
  const toAnswer = promises.filter(item => item.status === 'attached');
  const [open, setOpen] = useState(null);
  const [answering, setAnswering] = useState('');
  const [error, setError] = useState('');
  // Se abre sola justo después de iniciar o finalizar (no cada vez que alguien mira la ficha).
  useEffect(() => {
    if (!moment || query.loading) return;
    if (moment === 'start' && promises.length) setOpen('start');
    if (moment === 'finish' && toAnswer.length) setOpen('finish');
    onMomentSeen?.();
  }, [moment, query.loading, promises.length, toAnswer.length]);
  const act = async (promise, request) => {
    setAnswering(promise.id); setError('');
    try {
      await request();
      query.retry();
    } catch (failure) { setError(failure.message); } finally { setAnswering(''); }
  };
  const answer = (promise, kept) => act(promise, () => endpoints.resolveMinutePromise(match.id, promise.id, { kept }));
  const declare = (promise, declared) => act(promise, () => endpoints.declareMinutePromise(match.id, promise.id, { declared }));
  const dispute = promise => {
    if (window.confirm(`¿Disputar que ${promise.playerName} jugó ${promise.minutesLabel}? Lo decidirá un admin.`)) act(promise, () => endpoints.disputeMinutePromise(match.id, promise.id));
  };
  const rivalOf = promise => (promise.teamId === match.homeTeam?.id ? match.awayTeam?.id : match.homeTeam?.id);
  const beforeEnd = match.status === 'pending' || match.status === 'live';
  useEffect(() => { if (open === 'finish' && !query.loading && toAnswer.length === 0) setOpen(null); }, [open, query.loading, toAnswer.length]);
  if (!promises.length) return null;

  const list = <ul className="minute-promises-list">{promises.map(item => <li key={item.id} className={`is-${item.status}`}>
    <b>{item.playerName}</b> <small>{item.teamName}</small>
    <span>{item.status === 'kept' ? `✅ jugó ${item.minutesLabel}` : item.status === 'broken' ? `❌ no jugó ${item.minutesLabel}` : `tiene que jugar ${item.minutesLabel}`}</span>
    {item.declared && <span className="minute-promises-badge">✋ EL PRESI DECLARÓ QUE LO PONE</span>}
    {item.disputed && <span className="minute-promises-badge is-disputed">⚖ EN DISPUTA · LO ZANJA UN ADMIN</span>}
    {beforeEnd && canEditTeam(item.teamId) && <Button size="sm" variant={item.declared ? 'ghost' : 'positive'} disabled={answering === item.id} onClick={() => declare(item, !item.declared)}>
      {item.declared ? 'RETIRAR DECLARACIÓN' : 'LO VOY A PONER'}</Button>}
    {match.status === 'finished' && item.status === 'attached' && !item.disputed && canEditTeam(rivalOf(item)) && !canEditTeam(item.teamId) &&
      <Button size="sm" variant="danger" disabled={answering === item.id} onClick={() => dispute(item)}>DISPUTAR</Button>}
  </li>)}</ul>;

  return <>
    <div className="minute-promises-strip">
      <span>📋 {match.status === 'finished' && toAnswer.length ? `${toAnswer.length} PROMESA${toAnswer.length === 1 ? '' : 'S'} DE MINUTOS POR CONFIRMAR` : 'PROMESAS DE MINUTOS EN ESTE PARTIDO'}</span>
      <button type="button" className="scoreboard-btn-text" onClick={() => setOpen(match.status === 'finished' && toAnswer.length ? 'finish' : 'start')}>VER</button>
    </div>
    {open === 'start' && <Modal title="RECORDATORIO ANTES DE JUGAR" onClose={() => setOpen(null)}>
      <p className="minute-promises-lead">Estos jugadores tienen una promesa de su presi para este partido:</p>
      {list}
      <p className="minute-promises-note">Si lo vas a poner, márcalo aquí: queda registrado y lo ve el rival. Al terminar se pregunta si se cumplió. No cumplir enoja al jugador (−16 de ánimo).</p>
      {error && <p className="form-feedback error" role="alert">{error}</p>}
      <Button variant="positive" onClick={() => setOpen(null)}>ENTENDIDO</Button>
    </Modal>}
    {open === 'finish' && <Modal title="¿SE CUMPLIERON LAS PROMESAS?" onClose={() => setOpen(null)}>
      <p className="minute-promises-lead">Responde quien manejó el partido. Si nadie responde, a las 24 horas se dan por NO cumplidas (−16 de ánimo).</p>
      <ul className="minute-promises-list">{toAnswer.map(item => <li key={item.id}>
        <span className="minute-promises-question">{item.question} <small>({item.teamName})</small>
          {item.declared && <span className="minute-promises-badge">✋ DECLARADO ANTES DEL PARTIDO</span>}
          {item.disputed && <span className="minute-promises-badge is-disputed">⚖ EN DISPUTA</span>}</span>
        {(!item.disputed || isAdmin) && <span className="mini-actions">
          <Button size="sm" variant="positive" disabled={answering === item.id} onClick={() => answer(item, true)}>SÍ, JUGÓ</Button>
          <Button size="sm" variant="danger" disabled={answering === item.id} onClick={() => answer(item, false)}>NO</Button>
          {!item.disputed && canEditTeam(rivalOf(item)) && !canEditTeam(item.teamId) && <Button size="sm" variant="ghost" disabled={answering === item.id} onClick={() => dispute(item)}>DISPUTAR</Button>}
        </span>}
      </li>)}</ul>
      {error && <p className="form-feedback error" role="alert">{error}</p>}
      <Button variant="ghost" onClick={() => setOpen(null)}>RESPONDER DESPUÉS</Button>
    </Modal>}
  </>;
}
