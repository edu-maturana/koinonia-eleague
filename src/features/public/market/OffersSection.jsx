import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { useAuth } from '../../../app/AuthGate.jsx';
import { PlayerFace } from '../../../components/PlayerFace.jsx';
import { useApiMutation } from '../../admin/useApiMutation.js';
import { DataState, gp } from '../DataStates.jsx';
import { useApiQuery } from '../useApiQuery.js';
import { useAutoRefresh } from './PollsSection.jsx';
import { GpInput } from '../../../components/GpInput.jsx';
import { ArrivalPanel } from './ArrivalPanel.jsx';
import { Button, HowItWorks } from '../../../ui/index.js';

// La misma banda que valida el servidor: todo precio queda entre 0,7× y 1,25× el valor de Transfermarkt del jugador.
const PRICE_MIN = 0.7;
const PRICE_MAX = 1.25;
const priceBand = value => ({ min: Math.ceil(value * PRICE_MIN - 1e-9), max: Math.floor(value * PRICE_MAX + 1e-9) });
// La banda se mide sobre el valor de Transfermarkt, no sobre el valor que dejaron las últimas ventas (igual que el servidor).
const referenceOf = player => player?.tmValue ?? player?.gpValue ?? 0;
const asList = value => Array.isArray(value) ? value : [];
const teamLabel = team => team ? `${team.emoji ?? '⚽'} ${team.name}` : 'CLUB';
const upper = text => String(text ?? '').toUpperCase();

/** Qué falla del precio (o null si está bien). */
function bandProblem(player, price) {
  if (!player || !Number.isFinite(price)) return null;
  const { min, max } = priceBand(referenceOf(player));
  if (price < min) return `${upper(player.name)} no puede salir por menos de ${gp(min)} (0,7× su valor de Transfermarkt).`;
  if (price > max) return `${upper(player.name)} no puede salir por más de ${gp(max)} (1,25× su valor de Transfermarkt).`;
  return null;
}

/** Trueque: se valida el precio implícito del jugador que se revaloriza, igual que en el servidor. */
function tradeProblem(offered, requested, gpFrom, gpTo) {
  if (!offered || !requested) return null;
  const net = gpFrom - gpTo;
  if (net > 0 || (net === 0 && (requested.gpValue ?? 0) >= (offered.gpValue ?? 0))) return bandProblem(requested, (offered.gpValue ?? 0) + net);
  return bandProblem(offered, (requested.gpValue ?? 0) - net);
}

function PlayerChip({ player, note }) {
  if (!player) return <span className="offer-player">JUGADOR</span>;
  return <span className="offer-player">
    <PlayerFace src={player.faceUrl} name={player.name}/>
    <span><b>{player.name}</b><small>{player.position} · VALE {gp(player.gpValue)}{referenceOf(player) !== player.gpValue ? ` (TM ${gp(referenceOf(player))})` : ''}{note ? ` · ${note}` : ''}</small></span>
  </span>;
}

/** Responder con otra oferta: se arma el trato entero, sin quedar atado a los jugadores de la original. Entregar y pedir a la vez
 *  es un trueque (con GP de cada lado); solo uno de los dos es un traspaso con precio. La original queda rechazada. */
function CounterForm({ offer, me, other, onDone, onCancel }) {
  const isTrade = offer.kind === 'trade';
  const iAmSeller = !isTrade && me?.id === offer.fromTeam?.id;
  const mySquad = useSquad(me?.id);
  const theirSquad = useSquad(other?.id);
  // Se parte de lo mismo que la oferta original (lo que ya entregabas / pedías) y se cambia lo que haga falta.
  const [give, setGive] = useState(isTrade ? offer.toPlayer?.id ?? '' : iAmSeller ? offer.player?.id ?? '' : '');
  const [ask, setAsk] = useState(isTrade ? offer.fromPlayer?.id ?? '' : iAmSeller ? '' : offer.player?.id ?? '');
  const [price, setPrice] = useState(isTrade ? 0 : offer.gpAmount ?? 0);
  const [myGp, setMyGp] = useState(0);
  const [theirGp, setTheirGp] = useState(0);
  const both = Boolean(give && ask);
  const known = [offer.player, offer.fromPlayer, offer.toPlayer].filter(Boolean);
  const pick = (squad, id) => asList(squad.squad).find(player => player.id === id) ?? known.find(player => player.id === id);
  const given = give ? pick(mySquad, give) : null;
  const wanted = ask ? pick(theirSquad, ask) : null;
  const problem = both ? tradeProblem(given, wanted, Number(myGp) || 0, Number(theirGp) || 0) : (give || ask) ? bandProblem(given ?? wanted, Number(price)) : null;
  const counter = useApiMutation((body, signal) => endpoints.counterDeal(offer.kind, offer.id, body, signal), { onSuccess: onDone });
  const send = () => counter.execute({ givePlayerId: give || null, askPlayerId: ask || null, gpAmount: both ? null : Number(price), gpFrom: Number(myGp) || 0, gpTo: Number(theirGp) || 0 });
  const option = player => <option key={player.id} value={player.id}>{player.name} · {player.position} · {gp(player.gpValue)}</option>;
  return <div className="offer-counter" role="group" aria-label="CONTRAOFERTA">
    <b>🔁 CONTRAOFERTA</b>
    <label>QUÉ ENTREGAS TÚ ({upper(me?.name)})
      <select value={give} onChange={event => setGive(event.target.value)}><option value="">NADIE: SOLO COMPRO</option>{asList(mySquad.squad).map(option)}</select>
    </label>
    <label>QUÉ PIDES A {upper(other?.name)}
      <select value={ask} onChange={event => setAsk(event.target.value)}><option value="">NADIE: SOLO VENDO</option>{asList(theirSquad.squad).map(option)}</select>
    </label>
    {!both && (give || ask) && <label>{give ? `PRECIO QUE PIDES POR ${upper(given?.name)}` : `PRECIO QUE OFRECES POR ${upper(wanted?.name)}`}
      <GpInput value={price} onChange={event => setPrice(event.target.value)} aria-label="Precio de la contraoferta"/>
    </label>}
    {both && <div className="offer-counter-gp">
      <label>GP QUE PONES TÚ<GpInput value={myGp} onChange={event => setMyGp(event.target.value)} aria-label="GP que pones"/></label>
      <label>GP QUE PONE {upper(other?.name)}<GpInput value={theirGp} onChange={event => setTheirGp(event.target.value)} aria-label="GP que pone el otro club"/></label>
    </div>}
    <p className="offer-counter-kind">{both ? 'Será un TRUEQUE.' : give ? 'Será un TRASPASO: le vendes a ese jugador.' : ask ? 'Será un TRASPASO: le compras a ese jugador.' : 'Elige a quién entregas, a quién pides o las dos cosas.'}</p>
    {problem && <p className="form-feedback error" role="alert">{problem}</p>}
    <div className="mini-actions">
      <button type="button" disabled={counter.loading || Boolean(problem) || (!give && !ask)} onClick={send}>{counter.loading ? 'ENVIANDO…' : 'ENVIAR CONTRAOFERTA'}</button>
      <button type="button" className="ghost" disabled={counter.loading} onClick={onCancel}>VOLVER</button>
    </div>
    {counter.error && <p className="form-feedback error" role="alert">{counter.error.message}</p>}
  </div>;
}

const ROLE_TEXT = { crucial: 'CRUCIAL', importante: 'IMPORTANTE', rotacion: 'DE ROTACIÓN', esporadico: 'ESPORÁDICO' };
/** Lo pactado con un jugador en las ofertas de antes del contrato de llegada (prima, rol): solo para ofertas viejas. */
function playerTerms(terms, payer) {
  if (!terms) return null;
  return [terms.seasons && `${terms.seasons} TORNEOS, +${terms.raisePercent}%`, terms.signingBonus > 0 && `PRIMA DE FICHAJE ${gp(terms.signingBonus)} (LA PAGA ${upper(payer)})`, terms.promisedRole && `SERÁ ${ROLE_TEXT[terms.promisedRole] ?? upper(terms.promisedRole)}`].filter(Boolean).join(', ') || null;
}
function termsText(offer) {
  const terms = offer.contractTerms;
  if (!terms) return null;
  if (offer.kind !== 'trade') return playerTerms(terms, offer.toTeam?.name);
  return [terms.fromPlayer && playerTerms(terms.fromPlayer, offer.toTeam?.name) && `${upper(offer.fromPlayer?.name)} → ${playerTerms(terms.fromPlayer, offer.toTeam?.name)}`,
    terms.toPlayer && playerTerms(terms.toPlayer, offer.fromTeam?.name) && `${upper(offer.toPlayer?.name)} → ${playerTerms(terms.toPlayer, offer.fromTeam?.name)}`].filter(Boolean).join(' · ') || null;
}

function OfferCard({ offer, onChanged, highlighted = false, timing = null }) {
  const { isAdmin } = useAuth();
  const card = useRef(null);
  useEffect(() => { if (highlighted) card.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlighted]);
  const kind = offer.kind === 'trade' ? 'Trade' : offer.kind === 'loan' ? 'Loan' : 'Transfer';
  const mutation = useApiMutation((operation, signal) => endpoints[`${operation}${kind}`](offer.id, signal), { onSuccess: onChanged });
  const [confirming, setConfirming] = useState('');
  const [countering, setCountering] = useState(false);
  const incoming = offer.direction === 'incoming';
  const outgoing = offer.direction === 'outgoing';
  const counterpart = offer.proposerTeamId === offer.fromTeam?.id ? offer.toTeam : offer.fromTeam;
  const proposer = offer.proposerTeamId === offer.fromTeam?.id ? offer.fromTeam : offer.toTeam;
  // Acepta la contraparte; un admin puede hacerlo en su nombre. Quien la lanzó solo puede retirarla.
  const canAccept = offer.canAccept && !outgoing;
  const acceptLabel = incoming ? 'ACEPTAR' : `ACEPTAR POR ${upper(counterpart?.name)}`;
  const rejectLabel = incoming ? 'RECHAZAR' : outgoing ? 'RETIRAR OFERTA' : 'ANULAR';
  const canReject = incoming ? offer.canReject : outgoing ? offer.canWithdraw : isAdmin;
  const later = timing?.kind && timing.kind !== 'now' ? timing.label : null;
  const loanNote = offer.kind === 'loan' ? `¿Aceptas ${offer.swapPlayer ? 'el canje a préstamo' : 'el préstamo'}? ${offer.feeGp ? `${offer.swapPlayer ? 'La compensación' : 'La tarifa'} (${gp(offer.feeGp)}) se paga ahora. ` : ''}${offer.swapPlayer ? 'Los jugadores parten' : 'El jugador parte'} ${later ?? 'de inmediato'} y duran la ventana (2 torneos); cada club paga el sueldo de quien recibe y no se puede deshacer.` : null;
  const acceptNote = loanNote ?? later ? `¿Aceptas? Los GP se pagan ahora y el acuerdo queda cerrado, sin vuelta atrás; los jugadores cambian de club ${later}. (Si uno de los jugadores se va libre, el canje es al tiro.)` : '¿Aceptas? Se mueven los jugadores y los GP al tiro.';
  const ask = { approve: incoming ? acceptNote : `¿ACEPTAR EN NOMBRE DE ${upper(counterpart?.name)}?`,
    reject: incoming ? '¿RECHAZAS ESTA OFERTA?' : outgoing ? '¿RETIRAS TU OFERTA?' : '¿ANULAR ESTA OFERTA?' };

  return <article ref={card} className={`offer-card ${incoming ? 'is-incoming' : ''} ${highlighted ? 'is-highlighted' : ''}`}>
    <header>
      <span className="offer-kind">{offer.kind === 'trade' ? '🔁 TRUEQUE' : offer.kind === 'loan' ? '⏱️ PRÉSTAMO' : '🤝 TRASPASO'}</span>
      <small>LA LANZÓ {upper(teamLabel(proposer))}</small>
    </header>
    {offer.kind === 'trade'
      ? <div className="offer-sides">
        <div><small>{upper(teamLabel(offer.fromTeam))} ENTREGA</small><PlayerChip player={offer.fromPlayer}/>{offer.gpFrom ? <b className="offer-gp">+ {gp(offer.gpFrom)}</b> : null}</div>
        <span className="offer-swap" aria-hidden="true">⇄</span>
        <div><small>{upper(teamLabel(offer.toTeam))} ENTREGA</small><PlayerChip player={offer.toPlayer}/>{offer.gpTo ? <b className="offer-gp">+ {gp(offer.gpTo)}</b> : null}</div>
      </div>
      : offer.kind === 'loan'
        ? (offer.swapPlayer
          ? <div className="offer-sides">
            <div><small>{upper(teamLabel(offer.fromTeam))} PRESTA</small><PlayerChip player={offer.player}/>{offer.buyPrice ? <small>OPCIÓN DE COMPRA: {gp(offer.buyPrice)}</small> : null}</div>
            <span className="offer-swap" aria-hidden="true">⇄</span>
            <div><small>{upper(teamLabel(offer.toTeam))} PRESTA</small><PlayerChip player={offer.swapPlayer}/>{offer.swapBuyPrice ? <small>OPCIÓN DE COMPRA: {gp(offer.swapBuyPrice)}</small> : null}
              <b className="offer-price">{offer.feeGp ? `COMPENSA ${upper(teamLabel(offer.feePayerTeamId === offer.fromTeam?.id ? offer.fromTeam : offer.toTeam))}: ${gp(offer.feeGp)}` : 'SIN COMPENSACIÓN'}</b>
              <small>CADA CLUB PAGA EL SUELDO DE QUIEN RECIBE · LA VENTANA (2 TORNEOS)</small></div>
          </div>
          : <div className="offer-sides">
            <div><small>{upper(teamLabel(offer.fromTeam))} PRESTA</small><PlayerChip player={offer.player}/></div>
            <span className="offer-swap" aria-hidden="true">→</span>
            <div><small>{upper(teamLabel(offer.toTeam))} RECIBE</small><b className="offer-price">{offer.feeGp ? `TARIFA ${gp(offer.feeGp)}` : 'SIN TARIFA'}</b>
              <small>{offer.buyPrice ? `OPCIÓN DE COMPRA: ${gp(offer.buyPrice)}` : 'SIN OPCIÓN DE COMPRA'} · EL SUELDO LO PAGA QUIEN RECIBE · LA VENTANA (2 TORNEOS)</small></div>
          </div>)
      : <div className="offer-sides">
        <div><small>{upper(teamLabel(offer.fromTeam))} VENDE</small><PlayerChip player={offer.player}/></div>
        <span className="offer-swap" aria-hidden="true">→</span>
        <div><small>{upper(teamLabel(offer.toTeam))} PAGA</small><b className="offer-price">{gp(offer.gpAmount)}</b></div>
      </div>}
    {termsText(offer) && <p className="offer-terms">📄 ACORDADO CON {offer.kind === 'trade' ? 'LOS JUGADORES' : 'EL JUGADOR'}: {termsText(offer)}.</p>}
    <p className="offer-status">{incoming ? '👉 Te toca responder. También puedes hacerlo desde Discord.' : `⏳ ESPERANDO A ${upper(teamLabel(counterpart))}.`}</p>
    {confirming
      ? <div className="offer-confirm" role="group" aria-label="CONFIRMAR">
        <span>{ask[confirming]}</span>
        <div className="mini-actions">
          <button type="button" className={confirming === 'reject' ? 'danger' : ''} disabled={mutation.loading} onClick={() => mutation.execute(confirming)}>SÍ</button>
          <button type="button" className="ghost" disabled={mutation.loading} onClick={() => setConfirming('')}>VOLVER</button>
        </div>
      </div>
      : countering ? <CounterForm offer={offer} me={counterpart} other={proposer} onDone={() => { setCountering(false); onChanged?.(); }} onCancel={() => setCountering(false)}/>
      : (canAccept || canReject) && <div className="mini-actions">
        {canAccept && <button type="button" onClick={() => setConfirming('approve')}>{acceptLabel}</button>}
        {canAccept && offer.kind !== 'loan' && <button type="button" className="ghost" onClick={() => setCountering(true)}>{incoming ? 'CONTRAOFERTAR' : `CONTRAOFERTAR POR ${upper(counterpart?.name)}`}</button>}
        {canReject && <button type="button" className="danger" onClick={() => setConfirming('reject')}>{rejectLabel}</button>}
      </div>}
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </article>;
}

export function OffersInbox({ revision, onChanged, highlightId = null }) {
  const offers = useApiQuery(signal => endpoints.marketOffers(signal), [revision]);
  const marketNow = useApiQuery(signal => endpoints.marketStatus(signal).catch(() => ({ data: null })), [revision]);
  useAutoRefresh(offers.retry, 15000);
  const rows = asList(offers.data);
  const unavailable = offers.error?.status === 404;
  const groups = [
    ['incoming', '👉 TE TOCA RESPONDER'],
    ['outgoing', '⏳ TUS OFERTAS, ESPERANDO RESPUESTA'],
    ['other', '🛡️ OTRAS OFERTAS (ADMIN)'],
  ].map(([direction, title]) => [title, rows.filter(row => row.direction === direction)]).filter(([, items]) => items.length);
  const refresh = () => { offers.retry(); onChanged?.(); };
  return <section className="market-section market-offers">
    <header><h2>OFERTAS <small>{rows.length}</small></h2><p>Traspasos, trueques y préstamos pendientes. Son los mismos que en Discord: responde donde quieras.</p></header>
    {unavailable && <p className="empty-copy">Las ofertas todavía no están disponibles en la api.</p>}
    {offers.error && !unavailable && <DataState query={offers}/>}
    {!offers.error && !offers.loading && !rows.length && <p className="empty-copy">NO HAY OFERTAS PENDIENTES.</p>}
    {groups.map(([title, items]) => <div className="offer-group" key={title}>
      <h3 className="market-subtitle">{title}</h3>
      <div className="offer-list">{items.map(offer => <OfferCard key={`${offer.kind}-${offer.id}`} timing={marketNow.data?.moveTiming ?? null} offer={offer} onChanged={refresh} highlighted={Boolean(highlightId) && String(offer.id) === String(highlightId)}/>)}</div>
    </div>)}
    <ActiveLoans revision={revision} onChanged={refresh}/>
  </section>;
}

const LOAN_STATUS = { agreed: 'CERRADO · PARTE AL TERMINAR EL TORNEO', active: 'EN CURSO' };
const leaguesText = loan => (loan.status === 'active' && loan.leagues ? ` · QUEDAN ${loan.leagues} ${loan.leagues === 1 ? 'TORNEO' : 'TORNEOS'}` : ' · LA VENTANA (2 TORNEOS)');

/** Préstamos cerrados y en curso (de la liga). El club que recibe marca la opción de compra; un admin puede anular. */
function ActiveLoans({ revision, onChanged }) {
  const { isAdmin, teamId: myTeamId } = useAuth();
  const loans = useApiQuery(signal => endpoints.loans(signal).catch(() => ({ data: [] })), [revision]);
  const mutation = useApiMutation((body, signal) => (body.cancel ? endpoints.cancelLoan(body.id, signal) : endpoints.markLoanBuy(body.id, body.buy, signal)), { onSuccess: () => { loans.retry(); onChanged?.(); } });
  const rows = asList(loans.data);
  if (!rows.length) return null;
  return <div className="offer-group loan-group">
    <h3 className="market-subtitle">⏱️ PRÉSTAMOS CERRADOS Y EN CURSO</h3>
    <ul className="loan-list">{rows.map(loan => {
      const borrowing = loan.borrowerTeamId === myTeamId;
      return <li key={loan.id} className={`loan-row ${loan.status}`}>
        <span><b>{loan.playerName}</b> · {loan.ownerName} → {loan.borrowerName}<small>{loan.swapGroup ? 'CANJE · ' : ''}{LOAN_STATUS[loan.status] ?? loan.status}{loan.startsAfter ? ` (${loan.startsAfter.label})` : ''}{leaguesText(loan)}{loan.feeGp ? ` · ${loan.swapGroup ? 'COMPENSACIÓN' : 'TARIFA'} ${gp(loan.feeGp)}` : ''}{loan.buyPrice ? ` · OPCIÓN DE COMPRA ${gp(loan.buyPrice)}` : ''}</small></span>
        {borrowing && loan.status === 'active' && loan.buyPrice
          ? <button type="button" className={loan.buyDecision ? '' : 'ghost'} disabled={mutation.loading} aria-pressed={Boolean(loan.buyDecision)} onClick={() => mutation.execute({ id: loan.id, buy: !loan.buyDecision })}>{loan.buyDecision ? '✔ COMPRARÉ AL TERMINAR LA VENTANA' : 'MARCAR COMPRA'}</button> : null}
        {isAdmin && <button type="button" className="danger" disabled={mutation.loading} onClick={() => mutation.execute({ id: loan.id, cancel: true })}>ANULAR</button>}
      </li>;
    })}</ul>
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </div>;
}

const playerOptions = squad => <><option value="">ELEGIR JUGADOR</option>{asList(squad).map(player => <option key={player.id} value={player.id}>{player.name} · {player.position} · {gp(player.gpValue)}</option>)}</>;

function useSquad(teamId) {
  const query = useApiQuery(signal => teamId ? endpoints.teamSquad(teamId, signal) : Promise.resolve({ data: [] }), [teamId]);
  return { squad: asList(query.data), loading: query.loading };
}

/** Lo que queda pactado, en una línea, antes de enviar. */
function Summary({ children, problem }) {
  return <div className={`offer-summary ${problem ? 'has-problem' : ''}`}>
    {problem ? <p role="alert">⚠️ {problem}</p> : <p>{children}</p>}
  </div>;
}

function Sent({ text, onAgain }) {
  return <div className="offer-sent" role="status">
    <p>✅ {text}</p>
    <Button onClick={onAgain}>HACER OTRA OFERTA</Button>
  </div>;
}

function TransferProposal({ myTeamId, rivals, onDone, prefill = null }) {
  const empty = { side: 'buy', otherTeamId: '', playerId: '', gpAmount: '' };
  const [form, setForm] = useState(() => (prefill?.teamId ? { ...empty, otherTeamId: prefill.teamId, playerId: prefill.playerId } : empty));
  const [sent, setSent] = useState('');
  const buying = form.side === 'buy';
  const mySquad = useSquad(myTeamId);
  const otherSquad = useSquad(form.otherTeamId);
  const squad = buying ? otherSquad.squad : mySquad.squad;
  const player = squad.find(item => item.id === form.playerId);
  const other = rivals.find(team => team.id === form.otherTeamId);
  const price = form.gpAmount === '' ? NaN : Number(form.gpAmount);
  const band = player ? priceBand(referenceOf(player)) : null;
  const problem = bandProblem(player, price);
  const buyer = buying ? { id: myTeamId, name: 'tu club' } : other;
  // Jugador elegido desde su ficha: cuando llega el plantel se propone su valor como precio.
  useEffect(() => { if (player && form.gpAmount === '') setForm(current => ({ ...current, gpAmount: String(player.gpValue ?? '') })); }, [player?.id]);
  const mutation = useApiMutation((body, signal) => endpoints.createTransfer(body, signal), {
    onSuccess: () => { setSent(`Oferta enviada a ${upper(other?.name)}: le llega a su bandeja y a Discord. Se concreta cuando la acepte.`); setForm(empty); onDone?.(); },
  });
  const set = (name, value) => setForm(current => ({ ...current, [name]: value,
    ...(['side', 'otherTeamId'].includes(name) ? { playerId: '', gpAmount: '' } : {}),
    // Al elegir jugador se propone su valor: después se ajusta dentro de la banda.
    ...(name === 'playerId' ? { gpAmount: String(squad.find(item => item.id === value)?.gpValue ?? '') } : {}) }));
  const ready = form.otherTeamId && player && Number.isFinite(price) && !problem;
  const submit = event => {
    event.preventDefault();
    if (!ready) return;
    mutation.execute({ playerId: form.playerId, gpAmount: price, proposerTeamId: myTeamId,
      fromTeamId: buying ? form.otherTeamId : myTeamId, toTeamId: buying ? myTeamId : form.otherTeamId });
  };
  if (sent) return <Sent text={sent} onAgain={() => { setSent(''); mutation.clear(); }}/>;
  return <form className="admin-form market-form offer-form" onSubmit={submit}>
    <div className="offer-toggle" role="radiogroup" aria-label="QUÉ QUIERES HACER">
      <button type="button" role="radio" aria-checked={buying} className={buying ? 'on' : ''} onClick={() => set('side', 'buy')}>COMPRAR</button>
      <button type="button" role="radio" aria-checked={!buying} className={!buying ? 'on' : ''} onClick={() => set('side', 'sell')}>VENDER</button>
    </div>
    <label>{buying ? 'CLUB AL QUE LE COMPRAS' : 'CLUB AL QUE LE VENDES'}<select required value={form.otherTeamId} onChange={event => set('otherTeamId', event.target.value)}><option value="">ELEGIR CLUB</option>{rivals.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>{buying ? 'JUGADOR QUE QUIERES' : 'JUGADOR TUYO QUE VENDES'}<select required value={form.playerId} disabled={buying && !form.otherTeamId} onChange={event => set('playerId', event.target.value)}>{playerOptions(squad)}</select></label>
    <label>PRECIO EN GP{band ? ` · ENTRE ${gp(band.min)} Y ${gp(band.max)}` : ''}<GpInput required min={band?.min ?? 0} max={band?.max} value={form.gpAmount} disabled={!player} onChange={event => set('gpAmount', event.target.value)}/></label>
    {player && other && <ArrivalPanel player={player} toTeam={buyer} price={Number.isFinite(price) && !problem ? price : null}/>}
    {player && other && Number.isFinite(price) && <Summary problem={problem}>
      {buying ? `${upper(other.name)} TE VENDE A ${upper(player.name)} POR ${gp(price)}.` : `LE VENDES ${upper(player.name)} A ${upper(other.name)} POR ${gp(price)}.`} TIENE QUE ACEPTARLO SU PRESI (EN LA WEB O EN DISCORD).
    </Summary>}
    <Button variant="positive" type="submit" disabled={mutation.loading || !ready}>{mutation.loading ? 'ENVIANDO…' : 'ENVIAR OFERTA'}</Button>
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </form>;
}

function LoanProposal({ myTeamId, rivals, onDone, prefill = null }) {
  const empty = { side: 'borrow', otherTeamId: '', playerId: '', feeGp: '', withOption: false, buyPrice: '', withSwap: false, swapPlayerId: '', payer: '' };
  const [form, setForm] = useState(() => (prefill?.teamId ? { ...empty, otherTeamId: prefill.teamId, playerId: prefill.playerId } : empty));
  const [sent, setSent] = useState('');
  const borrowing = form.side === 'borrow';
  const mySquad = useSquad(myTeamId);
  const otherSquad = useSquad(form.otherTeamId);
  const squad = borrowing ? otherSquad.squad : mySquad.squad;
  const player = squad.find(item => item.id === form.playerId);
  // En un canje el otro jugador es del club que recibe al primero: si pides, es tuyo; si prestas, es del otro club.
  const swapSquad = borrowing ? mySquad.squad : otherSquad.squad;
  const swapPlayer = form.withSwap ? swapSquad.find(item => item.id === form.swapPlayerId) : null;
  const payerIsMe = (form.payer || (borrowing ? 'me' : 'other')) === 'me';
  const other = rivals.find(team => team.id === form.otherTeamId);
  const fee = form.feeGp === '' ? 0 : Number(form.feeGp);
  const buyPrice = form.withOption && form.buyPrice !== '' ? Number(form.buyPrice) : null;
  const band = player ? priceBand(referenceOf(player)) : null;
  const problem = player?.loan ? `${upper(player.name)} ya está en un préstamo.` : swapPlayer?.loan ? `${upper(swapPlayer.name)} ya está en un préstamo.` : form.withOption && player ? bandProblem(player, buyPrice) : null;
  const mutation = useApiMutation((body, signal) => endpoints.createLoan(body, signal), {
    onSuccess: () => { setSent(`${form.withSwap ? 'Canje a préstamo' : 'Préstamo'} enviado a ${upper(other?.name)}: le llega a su bandeja y a Discord. Se cierra cuando lo acepte.`); setForm(empty); onDone?.(); },
  });
  const set = (name, value) => setForm(current => ({ ...current, [name]: value, ...(['side', 'otherTeamId'].includes(name) ? { playerId: '', swapPlayerId: '', payer: '' } : {}) }));
  const ready = form.otherTeamId && player && (!form.withSwap || swapPlayer) && Number.isFinite(fee) && fee >= 0 && !problem && (!form.withOption || Number.isFinite(buyPrice));
  const submit = event => {
    event.preventDefault();
    if (!ready) return;
    mutation.execute({ playerId: form.playerId, proposerTeamId: myTeamId, feeGp: fee, buyPrice: form.withOption ? buyPrice : null,
      ...(swapPlayer ? { swapPlayerId: swapPlayer.id, feePayerTeamId: fee ? (payerIsMe ? myTeamId : form.otherTeamId) : null } : {}),
      ownerTeamId: borrowing ? form.otherTeamId : myTeamId, borrowerTeamId: borrowing ? myTeamId : form.otherTeamId });
  };
  if (sent) return <Sent text={sent} onAgain={() => { setSent(''); mutation.clear(); }}/>;
  return <form className="admin-form market-form offer-form" onSubmit={submit}>
    <div className="offer-toggle" role="radiogroup" aria-label="QUÉ QUIERES HACER">
      <button type="button" role="radio" aria-checked={borrowing} className={borrowing ? 'on' : ''} onClick={() => set('side', 'borrow')}>PEDIR A PRÉSTAMO</button>
      <button type="button" role="radio" aria-checked={!borrowing} className={!borrowing ? 'on' : ''} onClick={() => set('side', 'lend')}>PRESTAR</button>
    </div>
    <label>{borrowing ? 'CLUB QUE TE LO PRESTA' : 'CLUB AL QUE SE LO PRESTAS'}<select required value={form.otherTeamId} onChange={event => set('otherTeamId', event.target.value)}><option value="">ELEGIR CLUB</option>{rivals.map(team => <option key={team.id} value={team.id}>{teamLabel(team)}</option>)}</select></label>
    <label>{borrowing ? 'JUGADOR QUE QUIERES' : 'JUGADOR TUYO QUE PRESTAS'}<select required value={form.playerId} disabled={borrowing && !form.otherTeamId} onChange={event => set('playerId', event.target.value)}>{playerOptions(squad)}</select></label>
    <label>{form.withSwap ? 'COMPENSACIÓN EN GP (PUEDE SER 0)' : 'TARIFA EN GP (LA PAGA QUIEN RECIBE; PUEDE SER 0)'}<GpInput placeholder="0" value={form.feeGp} disabled={!player} onChange={event => set('feeGp', event.target.value)} aria-label={form.withSwap ? 'Compensación del canje' : 'Tarifa del préstamo'}/></label>
    {form.withSwap && fee > 0 && <label>QUIÉN PAGA LA COMPENSACIÓN<select value={payerIsMe ? 'me' : 'other'} onChange={event => set('payer', event.target.value)}><option value="me">YO (MI CLUB)</option><option value="other">{upper(other?.name ?? 'EL OTRO CLUB')}</option></select></label>}
    <label className="loan-option"><input type="checkbox" checked={form.withSwap} disabled={!player} onChange={event => setForm(current => ({ ...current, withSwap: event.target.checked, swapPlayerId: '' }))}/> CANJE: A CAMBIO DE OTRO JUGADOR</label>
    {form.withSwap && <label>{borrowing ? 'JUGADOR TUYO QUE ENTREGAS A PRÉSTAMO' : 'JUGADOR QUE TE PRESTA EL OTRO CLUB'}<select required value={form.swapPlayerId} onChange={event => set('swapPlayerId', event.target.value)}>{playerOptions(swapSquad)}</select></label>}
    <label className="loan-option"><input type="checkbox" checked={form.withOption} onChange={event => setForm(current => ({ ...current, withOption: event.target.checked, buyPrice: event.target.checked && player ? String(player.gpValue ?? '') : '' }))}/> INCLUIR OPCIÓN DE COMPRA</label>
    {form.withOption && <label>PRECIO DE LA OPCIÓN{band ? ` · ENTRE ${gp(band.min)} Y ${gp(band.max)}` : ''}<GpInput value={form.buyPrice} disabled={!player} onChange={event => set('buyPrice', event.target.value)} aria-label="Precio de la opción de compra"/></label>}
    {player && other && <Summary problem={problem}>
      {borrowing ? `${upper(other.name)} TE PRESTA A ${upper(player.name)}` : `LE PRESTAS ${upper(player.name)} A ${upper(other.name)}`}{swapPlayer ? ` Y ${borrowing ? `TÚ LE PRESTAS A ${upper(swapPlayer.name)}` : `${upper(other.name)} TE PRESTA A ${upper(swapPlayer.name)}`}` : ''} POR LA VENTANA (2 TORNEOS){fee ? ` (${form.withSwap ? `COMPENSA ${payerIsMe ? 'TU CLUB' : upper(other.name)}: ` : 'TARIFA '}${gp(fee)})` : form.withSwap ? '' : ' (SIN TARIFA)'}{form.withOption && Number.isFinite(buyPrice) ? `, CON OPCIÓN DE COMPRA A ${gp(buyPrice)}` : ''}. CADA CLUB PAGA EL SUELDO DEL JUGADOR QUE RECIBE. PARTE CUANDO TERMINA EL TORNEO EN CURSO (O AL PASAR A TRANSACCIONES) Y VUELVE AL TERMINAR LA VENTANA; SI PARTE ENTRE LOS DOS TORNEOS, CUBRE SOLO EL QUE QUEDA. NO ENTRA SI TIENE UN CONTRATO QUE VENCE. TOPE: 2 PRESTADOS ENTRANDO Y 2 SALIENDO POR CLUB.
    </Summary>}
    <Button variant="positive" type="submit" disabled={mutation.loading || !ready}>{mutation.loading ? 'ENVIANDO…' : 'ENVIAR PRÉSTAMO'}</Button>
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </form>;
}

function TradeProposal({ myTeamId, rivals, onDone }) {
  const empty = { otherTeamId: '', fromPlayerId: '', toPlayerId: '', gpFrom: '', gpTo: '' };
  const [form, setForm] = useState(empty);
  const [sent, setSent] = useState('');
  const mySquad = useSquad(myTeamId);
  const otherSquad = useSquad(form.otherTeamId);
  const other = rivals.find(team => team.id === form.otherTeamId);
  const offered = mySquad.squad.find(item => item.id === form.fromPlayerId);
  const requested = otherSquad.squad.find(item => item.id === form.toPlayerId);
  const gpFrom = Number(form.gpFrom || 0);
  const gpTo = Number(form.gpTo || 0);
  const problem = tradeProblem(offered, requested, gpFrom, gpTo);
  const mutation = useApiMutation((body, signal) => endpoints.createTrade(body, signal), {
    onSuccess: () => { setSent(`Trueque enviado a ${upper(other?.name)}: le llega a su bandeja y a Discord. Se concreta cuando lo acepte.`); setForm(empty); onDone?.(); },
  });
  const set = (name, value) => setForm(current => ({ ...current, [name]: value, ...(name === 'otherTeamId' ? { toPlayerId: '' } : {}) }));
  const ready = other && offered && requested && !problem;
  const submit = event => {
    event.preventDefault();
    if (!ready) return;
    mutation.execute({ fromTeamId: myTeamId, toTeamId: form.otherTeamId, fromPlayerId: form.fromPlayerId, toPlayerId: form.toPlayerId,
      ...(gpFrom ? { gpFrom } : {}), ...(gpTo ? { gpTo } : {}) });
  };
  if (sent) return <Sent text={sent} onAgain={() => { setSent(''); mutation.clear(); }}/>;
  return <form className="admin-form market-form offer-form" onSubmit={submit}>
    <label>CLUB CON EL QUE TRUECAS<select required value={form.otherTeamId} onChange={event => set('otherTeamId', event.target.value)}><option value="">ELEGIR CLUB</option>{rivals.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>ENTREGAS<select required value={form.fromPlayerId} onChange={event => set('fromPlayerId', event.target.value)}>{playerOptions(mySquad.squad)}</select></label>
    <label>PIDES<select required value={form.toPlayerId} disabled={!form.otherTeamId} onChange={event => set('toPlayerId', event.target.value)}>{playerOptions(otherSquad.squad)}</select></label>
    <label>GP QUE AGREGAS TÚ (OPCIONAL)<GpInput placeholder="0" value={form.gpFrom} onChange={event => set('gpFrom', event.target.value)}/></label>
    <label>GP QUE AGREGA {other ? upper(other.name) : 'EL OTRO CLUB'} (OPCIONAL)<GpInput placeholder="0" value={form.gpTo} onChange={event => set('gpTo', event.target.value)}/></label>
    {requested && other && offered && <ArrivalPanel player={requested} toTeam={{ id: myTeamId, name: 'tu club' }} leavingIds={[offered.id]}/>}
    {offered && requested && <Summary problem={problem}>
      ENTREGAS A {upper(offered.name)}{gpFrom ? ` + ${gp(gpFrom)}` : ''} Y RECIBES A {upper(requested.name)}{gpTo ? ` + ${gp(gpTo)}` : ''}. TIENE QUE ACEPTARLO EL PRESI DE {upper(other?.name)}.
    </Summary>}
    <Button variant="positive" type="submit" disabled={mutation.loading || !ready}>{mutation.loading ? 'ENVIANDO…' : 'ENVIAR TRUEQUE'}</Button>
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </form>;
}

function ReleaseForm({ myTeamId, onDone }) {
  const [playerId, setPlayerId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const mySquad = useSquad(myTeamId);
  const contracts = useApiQuery(signal => (myTeamId ? endpoints.teamContracts(myTeamId, signal) : Promise.resolve({ data: null })), [myTeamId]);
  const mutation = useApiMutation((body, signal) => endpoints.releasePlayer(playerId, body, signal), { onSuccess: () => { setPlayerId(''); setConfirming(false); contracts.retry(); onDone?.(); } });
  const player = mySquad.squad.find(item => item.id === playerId);
  // Liberar es rescindir (contrato vigente: indemnización) o dejarlo ir (contrato vencido: gratis y sin castigo).
  const contract = (contracts.data?.contracts ?? []).find(item => item.playerId === playerId) ?? null;
  const expired = contract && (contract.status === 'expired' || contract.endsWith);
  const cost = contract && !expired ? contract.terminationCost : 0;
  const outcome = !player ? null : !contract ? 'NO TIENE CONTRATO CON TU CLUB: NO SE PUEDE LIBERAR.'
    : expired ? 'SU CONTRATO VENCIÓ: SE VA GRATIS, SIN CASTIGO NI INDEMNIZACIÓN.'
      : `ES RESCINDIR: PAGAS ${gp(cost)} DE INDEMNIZACIÓN (50% DE LOS SUELDOS QUE LE FALTAN), NO RECIBES NADA Y SU VALOR BAJA.`;
  return <form className="admin-form market-form offer-form" onSubmit={event => { event.preventDefault(); if (player && contract) setConfirming(true); }}>
    <label>JUGADOR A LIBERAR<select value={playerId} required onChange={event => { setPlayerId(event.target.value); setConfirming(false); }}>{playerOptions(mySquad.squad)}</select></label>
    {outcome && <p className="poll-hint">{outcome}</p>}
    <HowItWorks><p>Con contrato vigente, liberar es rescindir: pagas el 50% de los sueldos que le faltan, no recibes nada, su valor baja (0,15× su valor de Transfermarkt, nunca bajo 0,7×) y baja tu reputación ante los agentes libres. No resta reputación si llevaba 4 torneos o más en el club; si lo acababas de fichar, resta más.</p><p>Si su contrato ya venció, se va gratis y sin castigo.</p></HowItWorks>
    {confirming
      ? <div className="offer-confirm" role="group" aria-label="CONFIRMAR">
        <span>¿LIBERAR A {upper(player?.name)}? {expired ? 'SE VA GRATIS.' : `PAGAS ${gp(cost)}.`} NO SE PUEDE DESHACER.</span>
        <div className="mini-actions">
          <button type="button" className="danger" disabled={mutation.loading} onClick={() => mutation.execute({ teamId: myTeamId })}>SÍ, LIBERAR</button>
          <button type="button" className="ghost" disabled={mutation.loading} onClick={() => setConfirming(false)}>VOLVER</button>
        </div>
      </div>
      : <Button variant="danger" type="submit" disabled={!playerId || !contract}>LIBERAR JUGADOR</Button>}
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </form>;
}

export function ProposeOffers({ teams, marketOpen, onChanged, prefill = null }) {
  const { teamId: myTeamId } = useAuth();
  const [tab, setTab] = useState(prefill?.op === 'prestamo' ? 'loan' : 'transfer');
  if (!myTeamId) return null;
  const rivals = teams.filter(team => team.id !== myTeamId && (team.kind ?? 'club') === 'club' && !team.hidden);
  // Traspasos y trueques solo con el mercado abierto; liberar se puede siempre.
  const closed = marketOpen === false && tab !== 'release';
  return <section className="market-section market-propose">
    <header><h2>PROPONER UNA OPERACIÓN</h2><p>Se concreta cuando el otro presi la acepta: el jugador no la frena. Al llegar firma un contrato nuevo con su club. Precio entre 0,7× y 1,25× su valor de Transfermarkt; el jugador queda valiendo lo que se pagó. Los trueques no mueven el valor.</p></header>
    <nav className="market-tabs offer-tabs" aria-label="TIPO DE OPERACIÓN">
      <button type="button" className={tab === 'transfer' ? 'active' : ''} onClick={() => setTab('transfer')}>TRASPASO</button>
      <button type="button" className={tab === 'trade' ? 'active' : ''} onClick={() => setTab('trade')}>TRUEQUE</button>
      <button type="button" className={tab === 'loan' ? 'active' : ''} onClick={() => setTab('loan')}>PRÉSTAMO</button>
      <button type="button" className={tab === 'release' ? 'active' : ''} onClick={() => setTab('release')}>LIBERAR</button>
    </nav>
    {closed && <p className="empty-copy">El mercado está cerrado: los traspasos y trueques se proponen cuando se abra.</p>}
    {!closed && tab === 'transfer' && <TransferProposal myTeamId={myTeamId} rivals={rivals} onDone={onChanged} prefill={prefill}/>}
    {!closed && tab === 'loan' && <LoanProposal myTeamId={myTeamId} rivals={rivals} onDone={onChanged} prefill={prefill?.op === 'prestamo' ? prefill : null}/>}
    {!closed && tab === 'trade' && <TradeProposal myTeamId={myTeamId} rivals={rivals} onDone={onChanged}/>}
    {tab === 'release' && <ReleaseForm myTeamId={myTeamId} onDone={onChanged}/>}
  </section>;
}
