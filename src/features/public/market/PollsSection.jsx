import { useEffect, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { useAuth } from '../../../app/AuthGate.jsx';
import { PlayerFace } from '../../../components/PlayerFace.jsx';
import { FormFeedback } from '../../admin/FormFeedback.jsx';
import { useApiMutation } from '../../admin/useApiMutation.js';
import { DataState, formatDate, gp } from '../DataStates.jsx';
import { useApiQuery } from '../useApiQuery.js';
import { Button } from '../../../ui/index.js';

const ACTIVE = ['open', 'awaiting', 'disputed'];
const STATUS_LABEL = {
  open: 'ABIERTA', awaiting: 'ESPERA CONFIRMACIÓN', disputed: 'VA A SUBASTA',
  bought: 'COMPRADO', auctioned: 'SUBASTADO', declined: 'DESCARTADA', cancelled: 'CANCELADA',
};

/* Vuelve a pedir los datos cada `ms` mientras la pestaña esté visible. */
export function useAutoRefresh(retry, ms = 10000) {
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') retry(); }, ms);
    return () => window.clearInterval(timer);
  }, [retry, ms]);
}

function Voters({ title, votes, tone }) {
  return <div className={`poll-voters ${tone}`}><b>{title} · {votes.length}</b>{votes.length
    ? <ul>{votes.map(vote => <li key={`${vote.teamId}-${vote.votedAt}`}>{vote.teamEmoji ?? '⚽'} {vote.teamName ?? 'CLUB'}{vote.presidentName ? <small> · {vote.presidentName}</small> : null}</li>)}</ul>
    : <span>NADIE TODAVÍA</span>}</div>;
}

/** Alguien pidió subasta: la encuesta queda bloqueada y un admin abre la subasta sellada eligiendo al moderador. */
function SendToAuction({ poll, onChanged }) {
  const { isAdmin } = useAuth();
  const [moderatorId, setModeratorId] = useState('');
  const presidents = useApiQuery(signal => isAdmin ? endpoints.presidents({}, signal) : Promise.resolve({ data: [] }), [isAdmin]);
  // El moderador también puede ofertar (solo no puede cerrar antes de hora mientras falten clubes listos).
  const moderators = (Array.isArray(presidents.data) ? presidents.data : []).filter(item => item.discordUserId && item.teamId);
  const open = useApiMutation((body, signal) => endpoints.openSealedAuction(body, signal), { onSuccess: onChanged });
  // Abrir la subasta es tarea del admin: a los demás no se les muestra este bloque.
  if (!isAdmin) return null;
  return <div className="poll-auction">
    <p><b>⚖️ VA A SUBASTA SELLADA.</b> Otro club también lo quiere: la compra queda bloqueada hasta que un admin abra la subasta. Ahí todos ofertan en secreto y el jugador elige.</p>
    {<form className="poll-auction-form" onSubmit={event => { event.preventDefault(); if (moderatorId) open.execute({ playerId: poll.player.id, moderatorPresidentId: moderatorId }); }}>
      <label>PRESI MODERADOR<select required value={moderatorId} onChange={event => setModeratorId(event.target.value)}>
        <option value="">ELEGIR MODERADOR</option>
        {moderators.map(item => <option key={item.id} value={item.id}>{String(item.name).toUpperCase()} · {String(item.teamName ?? '').toUpperCase()}</option>)}
      </select></label>
      <Button type="submit" disabled={!moderatorId || open.loading}>{open.loading ? 'ABRIENDO…' : '🔨 ABRIR SUBASTA SELLADA'}</Button>
      {open.error && <p className="form-feedback error" role="alert">{open.error.message}</p>}
    </form>}
  </div>;
}

function PollCard({ poll, teams, onChanged }) {
  const { isAdmin, user, canEditTeam } = useAuth();
  const act = useApiMutation((action, body, signal) => endpoints.pollAction(poll.id, action, body, signal), { onSuccess: onChanged });
  const confirms = poll.votes.filter(vote => vote.vote === 'confirm');
  const objections = poll.votes.filter(vote => vote.vote === 'auction');
  const active = ACTIVE.includes(poll.status);
  const marketOpen = poll.window?.status === 'open';
  const marketRenewals = marketOpen && Boolean(poll.window?.inRenewals);
  const ownsBuyer = Boolean(user?.teamIds?.includes(poll.team.id));
  const canDecide = canEditTeam(poll.team.id);
  const isPresident = Boolean(user?.teamIds?.length) || isAdmin;
  const buyerPaid = poll.status === 'auctioned' && poll.auction ? poll.auction.price : poll.price;

  return <article className={`poll-card status-${poll.status}`}>
    <header>
      <PlayerFace src={poll.player.faceUrl} name={poll.player.name}/>
      <div>
        <b>{poll.player.name}</b>
        <small>{poll.player.position} · {poll.team.emoji ?? '⚽'} {poll.team.name} LO QUIERE POR {gp(buyerPaid)}</small>
      </div>
      <span className="poll-status">{poll.status === 'cancelled' && poll.decisionText === 'Pasó a subasta sellada' ? 'PASÓ A SUBASTA' : STATUS_LABEL[poll.status] ?? poll.status.toUpperCase()}</span>
    </header>
    <div className="poll-votes">
      <Voters title={`DELE NOMÁS (${confirms.length}/${poll.window?.minConfirmations ?? '?'})`} votes={confirms} tone="yes"/>
      <Voters title="VAMOS A SUBASTA" votes={objections} tone="no"/>
    </div>
    {poll.window && <p className="poll-meta">{marketOpen ? `EL MERCADO CIERRA ${formatDate(poll.window.closesAt).toUpperCase()}` : 'Mercado cerrado: los votos quedaron congelados.'}{poll.myVote ? ` · TU VOTO: ${poll.myVote === 'confirm' ? 'DELE NOMÁS' : 'VAMOS A SUBASTA'}` : ''}</p>}

    {active && marketOpen && isPresident && <div className="mini-actions poll-vote-actions">
      <button className={poll.myVote === 'confirm' ? 'chosen' : ''} disabled={act.loading} onClick={() => act.execute('vote', { choice: 'confirm' })}>🟢 DELE NOMÁS{poll.myVote === 'confirm' ? ' · RETIRAR' : ''}</button>
      {!ownsBuyer && <button className={`danger ${poll.myVote === 'auction' ? 'chosen' : ''}`} disabled={act.loading} onClick={() => act.execute('vote', { choice: 'auction' })}>🔴 VAMOS A SUBASTA{poll.myVote === 'auction' ? ' · RETIRAR' : ''}</button>}
    </div>}

    {poll.status === 'awaiting' && poll.preconfirmedAt && <p className="poll-hint">⏳ COMPRA CONFIRMADA: {poll.player.name.toUpperCase()} FIRMA POR {poll.team.name.toUpperCase()} ({gp(poll.price)}) CUANDO EL MERCADO PASE A TRANSACCIONES. TENDRÁS QUE TENER EL SALDO EN ESE MOMENTO.</p>}
    {poll.status === 'awaiting' && canDecide && !poll.preconfirmedAt && <div className="poll-confirm">
      <p>{poll.team.name.toUpperCase()}: ¿CONFIRMAS LA COMPRA POR {gp(poll.price)}?</p>
      <div className="mini-actions">
        <button disabled={act.loading} onClick={() => { if (window.confirm(`¿Confirmas la compra de ${poll.player.name} por ${gp(poll.price)}?${marketRenewals ? ' Se ejecuta (y se paga) cuando el mercado pase a transacciones.' : ''}`)) act.execute('confirm'); }}>✅ CONFIRMO LA COMPRA</button>
        <button className="danger" disabled={act.loading} onClick={() => act.execute('decline')}>AL FINAL NO</button>
      </div>
    </div>}
    {poll.status === 'awaiting' && !canDecide && !poll.preconfirmedAt && <p className="poll-hint">LUZ VERDE: FALTA QUE EL PRESI DE {poll.team.name.toUpperCase()} CONFIRME LA COMPRA.</p>}

    {poll.status === 'disputed' && <SendToAuction poll={poll} onChanged={onChanged}/>}

    {active && ownsBuyer && <button type="button" className="poll-cancel" disabled={act.loading} onClick={() => act.execute('cancel')}>CANCELAR ENCUESTA</button>}
    <FormFeedback mutation={act}/>
  </article>;
}

export function PollsSection({ teams, revision, onChanged, children = null }) {
  const [scope, setScope] = useState('market');
  const [teamFilter, setTeamFilter] = useState('');
  const polls = useApiQuery(signal => endpoints.marketPolls(scope === 'all' ? { scope: 'all' } : {}, signal), [revision, scope]);
  useAutoRefresh(polls.retry);
  const all = Array.isArray(polls.data) ? polls.data : [];
  const rows = teamFilter ? all.filter(poll => poll.team?.id === teamFilter) : all;
  const open = rows.filter(poll => ACTIVE.includes(poll.status));
  const closed = rows.filter(poll => !ACTIVE.includes(poll.status));
  const refresh = () => { polls.retry(); onChanged?.(); };
  const unavailable = polls.error?.status === 404;
  // En el filtro solo aparecen los clubes que tienen encuestas (con cuántas).
  const counts = all.reduce((map, poll) => map.set(poll.team?.id, (map.get(poll.team?.id) ?? 0) + 1), new Map());
  const filterTeams = teams.filter(team => counts.has(team.id));
  return <>
    {children}
    <section className="market-section market-polls">
      <header><h2>ENCUESTAS DE COMPRA <small>{rows.length}</small></h2><p>Vota si estás de acuerdo o pide subasta. Son las mismas que en Discord: vota donde quieras.</p></header>
      <div className="poll-filters">
        <div className="offer-toggle" role="radiogroup" aria-label="QUÉ ENCUESTAS VER">
          <button type="button" role="radio" aria-checked={scope === 'market'} className={scope === 'market' ? 'on' : ''} onClick={() => setScope('market')}>ESTE MERCADO</button>
          <button type="button" role="radio" aria-checked={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>TODOS LOS MERCADOS</button>
        </div>
        <label>EQUIPO<select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}>
          <option value="">TODOS LOS EQUIPOS ({all.length})</option>
          {filterTeams.map(team => <option key={team.id} value={team.id}>{team.name} ({counts.get(team.id)})</option>)}
        </select></label>
      </div>
      {polls.loading && polls.data === null && <div className="arcade-state compact">CARGANDO ENCUESTAS...</div>}
      {polls.error && !unavailable && <DataState query={polls}/>}
      {unavailable && <p className="empty-copy">Las encuestas todavía no están disponibles en la api.</p>}
      {!polls.error && !polls.loading && !rows.length && <p className="empty-copy">{teamFilter ? 'Ese equipo no tiene encuestas aquí.' : 'No hay encuestas. Abre una buscando al jugador arriba.'}</p>}
      {open.length > 0 && <><h3 className="market-subtitle">🗳️ ABIERTAS · {open.length}</h3><div className="poll-list">{open.map(poll => <PollCard key={poll.id} poll={poll} teams={teams} onChanged={refresh}/>)}</div></>}
      {closed.length > 0 && <><h3 className="market-subtitle">📁 CERRADAS · {closed.length}</h3><div className="poll-list">{closed.map(poll => <PollCard key={poll.id} poll={poll} teams={teams} onChanged={refresh}/>)}</div></>}
    </section>
  </>;
}
