import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { formatDate } from '../public/DataStates.jsx';
import { DataState } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { MoodMeter, roleLabel } from './SigningSheet.jsx';
import { RoleSelect, useMarketOpen } from './RolesPanel.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { Button } from '../../ui/index.js';
import { useNotifications } from '../notifications/NotificationsProvider.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';

// Cuánto se ve el "está escribiendo…" antes de que llegue la respuesta del jugador.
const TYPING_MS = 1400;

/** Botones de respuesta con su efecto a la vista (en el celular no hay tooltip): lo mismo para peticiones y cartas. */
function ReplyChoices({ options, locked, busy, onPick }) {
  return <div className="reply-choices">{options.map(option => <button type="button" key={option.key} disabled={locked || busy} className={option.key === 'ignore' ? 'danger' : ''} onClick={() => onPick(option.key)}>
    <b>{option.label.toUpperCase()}</b>
    {option.effect && <small>{option.effect.replace(/^efecto: /i, 'Efecto: ')}</small>}
  </button>)}</div>;
}

/** Opciones para responderle a un jugador que pide algo (mismas que los botones de Discord). */
function RequestActions({ team, request, locked, onDone }) {
  const [summary, setSummary] = useState(null);
  const resolve = useApiMutation((option, signal) => endpoints.resolveRequest(team.id, request.id, { option }, signal));
  // Si lo ignoras no te contesta nada: no hay "escribiendo…".
  const pick = async option => {
    const response = await resolve.execute(option);
    if (!response) return;
    setSummary(response?.data?.summary ?? null);
    onDone?.(option !== 'ignore');
  };
  if (request.status === 'closed') return <p className="request-note">YA NO ESTÁ EN TU CLUB.</p>;
  if (request.kind === 'leave') return <p className="request-note leave">Pidió salir: ya no se le puede renovar. Sale libre al pasar a transacciones; solo puedes canjearlo (con o sin plata de por medio).</p>;
  if (request.status !== 'open') return <p className="request-note">{summary ?? (request.resolution === 'escalated' ? 'NO LE RESPONDISTE A TIEMPO: PIDIÓ SALIR.' : 'RESPONDIDA.')}</p>;
  const options = request.options.map(option => ({ ...option, effect: option.effect ? `efecto: ${option.effect}` : null }));
  return <div className="request-actions">
    <span>¿QUÉ LE RESPONDES? <small>SI NO LE RESPONDES A TIEMPO, PIDE SALIR.</small></span>
    <ReplyChoices options={options} locked={locked} busy={resolve.loading} onPick={pick}/>
    {locked && <small>🔒 Mercado abierto: se responde mientras se juega el torneo.</small>}
    {summary && <small>{summary}</small>}
    <FormFeedback mutation={resolve}/>
  </div>;
}

/** Respuesta a una carta de evento (hat-trick, sequía, competencia, préstamo, mala racha). */
function LetterActions({ team, message, locked, onDone }) {
  const [summary, setSummary] = useState(null);
  const letter = message.letter;
  const answer = useApiMutation((option, signal) => endpoints.answerLetter(team.id, message.id, { option }, signal), {
    onSuccess: response => { setSummary(response?.data?.summary ?? null); onDone?.(true); },
  });
  if (!letter) return null;
  if (letter.autoEffect && !letter.options?.length && !letter.answered) return <p className="letter-effect">{letter.autoEffect.replace(/^efecto: /i, 'Efecto: ')} (hasta que termine el torneo)</p>;
  if (letter.answered) return <p className="letter-effect">LE RESPONDISTE: {String(letter.answered.label).toUpperCase()}{typeof letter.answered.delta === 'number' ? ` · ÁNIMO ${letter.answered.delta > 0 ? '+' : ''}${letter.answered.delta}` : ''}{letter.answered.squad ? ` · ${letter.answered.squad} JUGADORES` : ''}</p>;
  if (letter.left) return <p className="request-note">YA NO ESTÁ EN TU CLUB.</p>;
  if (letter.expired) return <p className="request-note">QUEDÓ SIN RESPUESTA (SIN EFECTO).</p>;
  if (!letter.answerable) return null;
  return <div className="request-actions letter-actions">
    <span>¿QUÉ LE RESPONDES? <small>OPCIONAL · VENCE EL {formatDate(letter.expiresAt).toUpperCase()}</small></span>
    <ReplyChoices options={letter.options} locked={locked} busy={answer.loading} onPick={option => answer.execute(option)}/>
    {locked && <small>🔒 Mercado abierto: se responde mientras se juega el torneo.</small>}
    {summary && <small>{summary}</small>}
    <FormFeedback mutation={answer}/>
  </div>;
}

/** Lo que el jugador contestó, como hilo debajo de la carta (y el "escribiendo…" mientras llega). */
function Thread({ message, typing }) {
  if (!message.replies?.length && !typing) return null;
  return <ol className="inbox-thread" aria-label={`Respuestas de ${message.playerName}`}>
    {(message.replies ?? []).map(reply => <li key={reply.id}><b>{message.playerName}</b><p>{reply.body}</p><small>{formatDate(reply.createdAt)}</small></li>)}
    {typing && <li className="is-typing" aria-live="polite"><b>{message.playerName}</b><p>está escribiendo<span className="typing-dots" aria-hidden="true"><i/><i/><i/></span></p></li>}
  </ol>;
}

const KIND = {
  arrival: ['🧳', 'LLEGÓ: CONTRATO POR FIRMAR'], raise: ['💸', 'PIDE UN SUELDO ACORDE'], leave: ['🚪', 'PIDE SALIR'], expiring: ['📄', 'CONTRATO POR VENCER'],
  expired: ['✍️', 'QUIERE RENOVAR'], unhappy: ['😠', 'DESCONTENTO'], renewal: ['💬', 'RENOVACIÓN'],
  // Cartas de eventos de la liga.
  hat_trick: ['⚽', 'HAT-TRICK'], milestone: ['🎯', 'HITO DE GOLES'], award: ['🏅', 'PREMIO'], title: ['🏆', 'CAMPEONES'], drought: ['🥶', 'SEQUÍA DE GOLES'],
  competition: ['🆚', 'COMPETENCIA EN SU PUESTO'], loan_ask: ['🔁', 'PIDE PRÉSTAMO'], captain: ['©️', 'HABLA POR EL CAMARÍN'], friend_in: ['🤝', 'LLEGÓ UN AMIGO'],
  friend_out: ['👋', 'SE FUE UN AMIGO'], suspension: ['🟥', 'SUSPENDIDO'],
};
const RECENT_MS = 3 * 86_400_000;

/** Bandeja de entrada del presi: lo que le escriben sus jugadores. Al abrirla, los mensajes se marcan como leídos. */
export function InboxTab({ team, onTab, onRead, highlightId = null }) {
  const query = useApiQuery(signal => endpoints.teamInbox(team.id, signal), [team.id]);
  const messages = query.data?.messages ?? [];
  // Rol actual de cada jugador (el del mensaje puede estar desactualizado) para cambiarlo desde la propia bandeja.
  const rolesQuery = useApiQuery(signal => endpoints.teamRoles(team.id, signal), [team.id]);
  const roleOf = new Map((Array.isArray(rolesQuery.data) ? rolesQuery.data : []).map(row => [row.playerId, row]));
  const marketOpen = useMarketOpen();
  const { refresh: refreshNotifications } = useNotifications();
  const [readNow, setReadNow] = useState(() => new Set());
  const [typing, setTyping] = useState(null);
  const [opened, setOpened] = useState(() => new Set());
  const scrolledTo = useRef(null);
  const typingTimer = useRef(null);
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  // Cada carta se marca leída al tocarla (o al llegar por un aviso); ya no se marcan todas solo por abrir la bandeja.
  const markRead = async ids => {
    // Se ve leída al instante; el servidor la confirma en segundo plano.
    setReadNow(current => new Set([...current, ...(ids ?? messages.filter(message => !message.read).map(message => message.id))]));
    await endpoints.markInboxRead(team.id, ids).catch(() => {});
    onRead?.();
    refreshNotifications();
  };
  const isRead = message => message.read || readNow.has(message.id);
  const unread = messages.filter(message => !isRead(message)).length;
  useEffect(() => {
    if (!highlightId || !query.data || scrolledTo.current === highlightId) return;
    scrolledTo.current = highlightId;
    document.getElementById(`msg-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (messages.some(message => String(message.id) === String(highlightId) && !isRead(message))) markRead([highlightId]);
  }, [highlightId, query.data]);
  // Después de responder: el jugador "escribe" un momento y llega su respuesta (la trae el servidor al recargar).
  const answered = (message, replies = true) => {
    rolesQuery.retry();
    if (!replies) { query.retry(); return; }
    setTyping(message.id);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { setTyping(null); query.retry(); }, TYPING_MS);
  };
  // Solo lo último de cada jugador puede pedir algo; lo demás (y todo lo ya respondido) es historial, sin botones.
  const latest = new Map();
  for (const message of messages) {
    if (message.meta?.event) continue; // las cartas de eventos no tapan un contrato o una petición de antes
    const current = latest.get(message.playerId);
    if (!current || String(message.createdAt) > String(current.createdAt)) latest.set(message.playerId, message);
  }
  const staleOf = message => {
    const nowRow = roleOf.get(message.playerId);
    return message.kind === 'unhappy' && nowRow && message.meta?.role && nowRow.role !== message.meta.role;
  };
  // El servidor dice qué carta todavía pide algo (`needsAnswer`); lo de abajo queda para respuestas viejas sin ese dato.
  const needsYou = message => {
    if (typing === message.id) return true; // se queda donde está mientras el jugador escribe
    if (typeof message.needsAnswer === 'boolean') return message.needsAnswer;
    if (message.request) return message.request.status === 'open';
    if (latest.get(message.playerId)?.id !== message.id) return false;
    if (message.kind === 'unhappy') return !staleOf(message);
    return ['expired', 'expiring'].includes(message.kind);
  };
  // Novedades: cartas de eventos y conversaciones de los últimos 3 días, enteras (no se esconden en el historial).
  const lastActivity = message => Math.max(Date.parse(message.createdAt) || 0, ...(message.replies ?? []).map(reply => Date.parse(reply.createdAt) || 0));
  const isRecent = message => Date.now() - lastActivity(message) < RECENT_MS && (message.meta?.event || message.replies?.length > 0);
  const pending = messages.filter(needsYou);
  const recent = messages.filter(message => !needsYou(message) && isRecent(message));
  const history = messages.filter(message => !needsYou(message) && !isRecent(message));
  const outcome = message => {
    if (message.request?.status === 'closed') return 'Ya no está en tu club.';
    if (message.request?.kind === 'leave') return 'Pidió salir.';
    if (message.request?.resolution === 'role_given') return 'Le diste el rol que pedía.';
    if (message.request?.resolution === 'raised') return 'Le subiste el sueldo.';
    if (message.request?.resolution === 'minutes') return 'Le prometiste minutos en el próximo partido.';
    if (message.request) return message.request.resolution === 'escalated' ? 'No le respondiste a tiempo: pidió salir.' : 'Respondida.';
    if (message.letter?.answered) return `Le respondiste: ${String(message.letter.answered.label).toLowerCase()}.`;
    if (message.letter?.expired) return 'Quedó sin respuesta.';
    if (staleOf(message)) return `Le cambiaste el rol a ${roleLabel(roleOf.get(message.playerId).role).toLowerCase()}.`;
    if (message.kind === 'unhappy') return 'Ya está más tranquilo.';
    if (message.kind === 'expiring' || message.kind === 'expired') return 'Contrato resuelto.';
    if (message.kind === 'arrival') return 'Contrato firmado.';
    return 'Leída.';
  };
  const open = message => { if (!isRead(message)) markRead([message.id]); };
  const toggle = message => { open(message); setOpened(current => { const next = new Set(current); next.has(message.id) ? next.delete(message.id) : next.add(message.id); return next; }); };
  const card = (message, { actions = true } = {}) => {
    const [icon, label] = KIND[message.kind] ?? ['✉️', 'MENSAJE'];
    const nowRow = roleOf.get(message.playerId);
    const event = Boolean(message.meta?.event);
    return <li key={message.id} id={`msg-${message.id}`} className={`inbox-item kind-${message.kind} ${event ? 'is-event' : ''} ${isRead(message) ? '' : 'unread'} ${String(message.id) === String(highlightId) ? 'is-highlighted' : ''}`} onClick={() => open(message)}>
      <PlayerFace src={message.faceUrl} name={message.playerName}/>
      <div className="inbox-body">
        <div className="inbox-meta"><b>{message.playerName}</b><small><span aria-hidden="true">{icon}</span> {label} · {formatDate(message.createdAt)}</small></div>
        <h4>{message.subject}</h4>
        <p>{message.body}</p>
        {message.meta?.moodLabel && !['renewal', 'arrival'].includes(message.kind) && <div className="inbox-mood"><MoodMeter mood={message.meta.mood} label={message.meta.moodLabel}/>{message.meta.role && <small>ROL: {roleLabel(message.meta.role)}</small>}</div>}
        {actions && ['expired', 'expiring', 'arrival'].includes(message.kind) && <Button onClick={() => onTab?.('nomina')}>{message.kind === 'expiring' ? 'Ver contrato' : 'Ir a la hoja de firma'}</Button>}
        {actions && message.request && <RequestActions team={team} request={message.request} locked={marketOpen} onDone={replies => answered(message, replies)}/>}
        {event && <LetterActions team={team} message={message} locked={marketOpen} onDone={() => answered(message)}/>}
        {actions && message.kind === 'unhappy' && nowRow && <div className="inbox-role">
          <span>ROL AHORA:</span><RoleSelect team={team} row={nowRow} locked={nowRow.roleLocked ?? marketOpen} showWanted onDone={() => { rolesQuery.retry(); }}/>
          <small>{marketOpen ? '🔒 Mercado abierto: los roles están bloqueados.' : `ÁNIMO HOY: ${String(nowRow.moodLabel).toUpperCase()} (${nowRow.mood}/100)`}</small>
        </div>}
        <Thread message={message} typing={typing === message.id}/>
      </div>
    </li>;
  };
  return <section className="inbox-tab">
    <header><h2>MENSAJES DE TUS JUGADORES</h2>{unread > 0 && <Button variant="ghost" size="sm" onClick={() => markRead(null)}>MARCAR TODO COMO LEÍDO ({unread})</Button>}<p>Lo que te piden y te cuentan tus jugadores. Lo que ya respondiste queda abajo, en el historial.</p></header>
    <DataState query={query} empty={null}/>
    {query.data && messages.length === 0 && <p className="empty-copy data-empty">Todavía no te han escrito. Los mensajes aparecen cuando el sistema de contratos está activo.</p>}
    {query.data && messages.length > 0 && pending.length === 0 && <p className="inbox-clear">✅ No tienes nada por responder.</p>}
    <ul className="inbox-list">{pending.map(message => card(message))}</ul>
    {recent.length > 0 && <>
      <h3 className="inbox-section">NOVEDADES DEL CAMARÍN</h3>
      <ul className="inbox-list">{recent.map(message => card(message, { actions: false }))}</ul>
    </>}
    {history.length > 0 && <details className="inbox-history" open={history.some(message => String(message.id) === String(highlightId))}>
      <summary>Historial · {history.length} mensaje{history.length === 1 ? '' : 's'}</summary>
      <ul>{history.map(message => <li key={message.id} id={`msg-${message.id}`} className={`${isRead(message) ? '' : 'unread'} ${String(message.id) === String(highlightId) ? 'is-highlighted' : ''} ${opened.has(message.id) ? 'is-open' : ''}`}>
        <PlayerFace src={message.faceUrl} name={message.playerName}/>
        <button type="button" className="inbox-history-row" aria-expanded={opened.has(message.id)} onClick={() => toggle(message)}>
          <span><b>{message.playerName}</b> · {(KIND[message.kind] ?? ['✉️'])[0]} {message.subject}{message.replies?.length ? ` · 💬 ${message.replies.length}` : ''}<small>{formatDate(message.createdAt)} · {outcome(message)}</small></span>
        </button>
        {opened.has(message.id) && <div className="inbox-history-body"><p>{message.body}</p><Thread message={message} typing={false}/></div>}
      </li>)}</ul>
    </details>}
  </section>;
}
