import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { PlayerFace } from '../../../components/PlayerFace.jsx';
import { Button, Icon } from '../../../ui/index.js';
import { useApiMutation } from '../../admin/useApiMutation.js';
import { playIncoming } from './chatSound.js';

const upper = text => String(text ?? '').toUpperCase();
const KIND_TAG = { dato: 'DATO DE TU CLUB', argumento: 'ARGUMENTO', negativa: 'HONESTA', promesa: 'PROMESA · OBLIGA SI LLEGA' };
const KIND_HINT = { dato: 'Vale lo que tu club supera al suyo en este tema.', argumento: 'Suma poco; si choca con la realidad, lo enfría.', negativa: 'Si el tema es flojo, la honestidad se agradece.', promesa: 'Convence más. Si el jugador llega a tu club y no la cumples antes del cierre del mercado siguiente, baja tu reputación.' };
const AGENT_ICON = { superagente: 'star', tiburon: 'gavel', papa: 'people', amigo: 'ball' };
// Lo que provocó cada respuesta, en palabras (los puntos exactos van arriba, en el marcador de la charla).
const effectOf = points => (points >= 3 ? 'LO CONVENCISTE' : points > 0 ? 'LE SUMÓ' : points <= -3 ? 'LO ENFRIASTE' : points < 0 ? 'LE RESTÓ' : 'NI FU NI FA');
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(Math.round(value))}`;

function Who({ message, player, agent }) {
  if (message.role === 'club') return null;
  if (message.role === 'agent') return <span className="tc-agent" title={agent?.name} aria-hidden="true"><Icon name={AGENT_ICON[agent?.style] ?? 'mic'} size={16}/></span>;
  return <PlayerFace src={player.faceUrl} name={player.name}/>;
}

function Row({ message, player, agent }) {
  const mine = message.role === 'club';
  return <div className={`pc-row ${mine ? 'mine' : 'theirs'}`}>
    <Who message={message} player={player} agent={agent}/>
    <div className="pc-stack">
      {message.role === 'agent' && <small className="tc-from">{upper(agent?.label)} · {upper(agent?.name)}</small>}
      <div className={`pc-bubble kind-${message.kind}`}><p>{message.text}</p></div>
      {mine && typeof message.points === 'number' && <small className={`tc-points ${message.points > 0 ? 'up' : message.points < 0 ? 'down' : ''}`}>
        {message.points > 0 ? '▲' : message.points < 0 ? '▼' : '·'} {effectOf(message.points)}
      </small>}
    </div>
  </div>;
}

/**
 * Charla con un jugador de otro club antes de ofertar. Él pregunta por lo que le preocupa de tu club; tú respondes con
 * datos reales. Cada respuesta mueve su visto bueno (con tope) y `onChanged` avisa para recalcularlo.
 */
export function TransferChat({ player, teamId, onChanged, onPromiseRole, onClose }) {
  const [chat, setChat] = useState(null);
  const [error, setError] = useState(null);
  const [picks, setPicks] = useState([]);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const log = useRef(null);
  const keep = result => { if (result?.data) setChat(result.data); };
  const answer = useApiMutation((body, signal) => endpoints.playerChatAction(player.id, 'answer', { teamId, ...body }, signal), { onSuccess: result => { keep(result); setPicks([]); onChanged?.(); } });
  const rewind = useApiMutation((_, signal) => endpoints.playerChatAction(player.id, 'rewind', { teamId }, signal), { onSuccess: result => { keep(result); setPicks([]); setConfirmUndo(false); onChanged?.(); } });

  const fetchChat = signal => endpoints.playerChat(player.id, teamId, signal).then(keep);
  useEffect(() => {
    const controller = new AbortController();
    setChat(null); setError(null);
    fetchChat(controller.signal).catch(failure => { if (failure?.code !== 'REQUEST_ABORTED') setError(failure); });
    return () => controller.abort();
  }, [player.id, teamId]);

  // Mientras escribe, se vuelve a pedir la conversación hasta que no quede ningún mensaje oculto. El reloj del navegador puede ir
  // adelantado respecto al servidor (el mensaje aún no se revela), así que se reintenta cada vez, también si falla la petición.
  const hasHidden = (chat?.messages ?? []).some(item => item.pending && !item.text);
  const nextReveal = (chat?.messages ?? []).filter(item => item.pending && item.revealAt).map(item => Date.parse(item.revealAt)).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!hasHidden) return undefined;
    const controller = new AbortController();
    const wait = nextReveal == null ? 1500 : Math.min(4000, Math.max(700, nextReveal - Date.now() + 150));
    const timer = window.setTimeout(() => {
      fetchChat(controller.signal).catch(() => {}).finally(() => { if (!controller.signal.aborted) setRetry(count => count + 1); });
    }, wait);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [hasHidden, nextReveal, retry]);

  const visible = (() => {
    const messages = chat?.messages ?? [];
    const hidden = messages.findIndex(item => item.pending && !item.text);
    return hidden === -1 ? messages : messages.slice(0, hidden);
  })();
  const typing = answer.loading || visible.length < (chat?.messages?.length ?? 0);
  const theirCount = visible.filter(item => item.role !== 'club').length;
  const seen = useRef(null);
  useEffect(() => { if (seen.current !== null && theirCount > seen.current) playIncoming(); seen.current = theirCount; }, [theirCount]);
  useEffect(() => { const node = log.current; if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' }); }, [visible.length, typing, chat?.pending?.topic]);

  const pending = chat?.pending;
  const options = pending?.options ?? [];
  const max = pending?.maxCombined ?? 2;
  const blockedBy = option => options.find(other => picks.includes(other.code) && (option.conflicts ?? []).includes(other.code));
  const toggle = option => setPicks(current => (current.includes(option.code) ? current.filter(code => code !== option.code)
    : current.length >= max || blockedBy(option) ? current : [...current, option.code]));
  const answered = (chat?.messages ?? []).filter(item => item.kind === 'answer').length;
  // Cuántas preguntas hace depende de él (la plata, si te pide a cuenta algo): viene del servidor.
  const total = Math.max(chat?.questions?.total ?? 3, answered);
  const refused = Boolean(chat?.refused);

  return <section className="pc tc" aria-label={`Conversación con ${player.name}`}>
    <header className="pc-head">
      <PlayerFace src={player.faceUrl} name={player.name}/>
      <div className="pc-who"><b>{upper(player.name)}</b><small>{typing ? 'ESCRIBIENDO…' : 'PRIVADO · SOLO TU CLUB'}</small></div>
      {onClose && <button type="button" className="pc-close" onClick={onClose}>CERRAR</button>}
    </header>
    {chat && <div className="tc-score" aria-live="polite">
      <span>LA CHARLA {chat.points === 0 ? 'NO HA MOVIDO NADA' : chat.points > 0 ? 'SUMA' : 'RESTA'}</span>
      <b className={chat.points > 0 ? 'up' : chat.points < 0 ? 'down' : ''}>{chat.points === 0 ? '±0' : signed(chat.points)}</b>
      <small>DE ±{chat.limit} POSIBLES · {refused ? 'NO QUISO CONVERSAR' : chat.finished ? 'CONVERSACIÓN TERMINADA' : `PREGUNTA ${Math.min(answered + 1, total)} DE ${total}`}</small>
      {!refused && <span className="tc-steps" aria-hidden="true">{Array.from({ length: total }, (_, index) => <i key={index} className={index < answered ? 'done' : index === answered && pending ? 'now' : ''}/>)}</span>}
    </div>}
    {chat?.openness && !refused && <p className={`tc-openness is-${chat.openness.level}`}><Icon name="people" size={12}/> DE ENTRADA: {chat.openness.text}</p>}
    {!chat && !error && <p className="pc-note">Llamando a su representante…</p>}
    {error && <p className="form-feedback error" role="alert">{error.message}</p>}
    {chat && <>
      <div className="pc-log" ref={log}>
        {visible.map(item => <Row key={item.id} message={item} player={player} agent={chat.agent}/>)}
        {typing && <div className="pc-row theirs"><PlayerFace src={player.faceUrl} name={player.name}/><div className="pc-bubble pc-typing" aria-label="Escribiendo"><i/><i/><i/></div></div>}
      </div>
      <div className="pc-composer">
        {pending && !typing && <>
          <p className="pc-ask">RESPONDE SOBRE <b>{upper(pending.label)}</b> · ELIGE UNA {max > 1 ? `O COMBINA ${max} QUE CALCEN` : ''}</p>
          <div className="pc-chips" role="group" aria-label="Respuestas">
            {options.map(option => {
              const on = picks.includes(option.code);
              const blocked = !on && Boolean(blockedBy(option));
              return <button type="button" key={option.code} role="checkbox" aria-checked={on} disabled={answer.loading || blocked || (!on && picks.length >= max)}
                title={blocked ? 'No calza con lo que elegiste' : KIND_HINT[option.kind]} className={`pc-chip ${option.kind} ${on ? 'on' : ''}`} onClick={() => toggle(option)}>
                <em>{KIND_TAG[option.kind] ?? 'DATO'}</em><span>{option.text}</span>
              </button>;
            })}
          </div>
          {pending.roleHint && onPromiseRole && <p className="tc-role-hint"><Icon name="contract" size={12}/> ¿Quieres asegurarle minutos? Prométeselo en la oferta y queda en su contrato. <button type="button" onClick={() => onPromiseRole('importante')}>PROMETERLE SER IMPORTANTE</button></p>}
          <div className="pc-send-row">
            <small>{picks.length ? (KIND_HINT[options.find(option => option.code === picks[0])?.kind] ?? '') : 'Los datos son reales: salen de tu club.'}</small>
            <Button variant="positive" disabled={answer.loading || !picks.length} onClick={() => answer.execute({ topic: pending.topic, optionCodes: picks })}>RESPONDER</Button>
          </div>
        </>}
        {chat.finished && !typing && (refused
          ? <p className="tc-done is-refused"><Icon name="cross" size={14}/> Su representante no quiere conversar con tu club en este mercado. Igual puedes ofertar, pero no llega convencido.</p>
          : <p className="tc-done"><Icon name="check" size={14}/> Conversación terminada. Ahora arma la oferta: la prima y el rol hacen el resto.</p>)}
        {chat.rewind?.available && !typing && (confirmUndo
          ? <p className="pc-confirm">¿Cambiar tu última respuesta? <button type="button" disabled={rewind.loading} onClick={() => rewind.execute()}>SÍ</button><button type="button" onClick={() => setConfirmUndo(false)}>NO</button></p>
          : <button type="button" className="pc-undo" onClick={() => setConfirmUndo(true)}>↩ CAMBIAR MI ÚLTIMA RESPUESTA (QUEDAN {chat.rewind.limit - chat.rewind.used})</button>)}
        {(answer.error || rewind.error) && <p className="form-feedback error" role="alert">{(answer.error ?? rewind.error).message}</p>}
      </div>
    </>}
  </section>;
}
