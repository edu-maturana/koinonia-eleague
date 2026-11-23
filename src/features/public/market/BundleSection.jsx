import { useEffect, useMemo, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { useAuth } from '../../../app/AuthGate.jsx';
import { GpInput } from '../../../components/GpInput.jsx';
import { PlayerFace } from '../../../components/PlayerFace.jsx';
import { TeamMark } from '../../../components/TeamMark.jsx';
import { Button, HowItWorks } from '../../../ui/index.js';
import { useApiMutation } from '../../admin/useApiMutation.js';
import { DataState, OverallBadge, gp } from '../DataStates.jsx';
import { useApiQuery } from '../useApiQuery.js';
import { useAutoRefresh } from './PollsSection.jsx';

// Acuerdos compuestos: un presi arma traspasos y trueques entre 3+ clubes y todos los presis involucrados tienen que aceptar.

// Lista vacía estable: evita que los efectos que dependen del plantel se disparen en cada render.
const EMPTY = [];
const asList = value => (Array.isArray(value) ? value : EMPTY);
const upper = text => String(text ?? '').toUpperCase();
const PRICE_MIN = 0.7;
const PRICE_MAX = 1.25;
const referenceOf = player => player?.tmValue ?? player?.gpValue ?? 0;
const bandOf = player => ({ min: Math.ceil(referenceOf(player) * PRICE_MIN - 1e-9), max: Math.floor(referenceOf(player) * PRICE_MAX + 1e-9) });

function useSquad(teamId) {
  const query = useApiQuery(signal => (teamId ? endpoints.teamSquad(teamId, signal) : Promise.resolve({ data: [] })), [teamId]);
  return asList(query.data);
}

const playerOptions = squad => <><option value="">ELEGIR JUGADOR</option>{squad.map(player => <option key={player.id} value={player.id}>{player.name} · {player.position} · {gp(player.gpValue)}</option>)}</>;
const teamOptions = (teams, exclude = '') => <><option value="">ELEGIR CLUB</option>{teams.filter(team => team.id !== exclude).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</>;

const emptyTransfer = () => ({ key: Math.random().toString(36).slice(2), kind: 'transfer', fromTeamId: '', playerId: '', toTeamId: '', gpAmount: '' });
const emptyTrade = () => ({ key: Math.random().toString(36).slice(2), kind: 'trade', fromTeamId: '', fromPlayerId: '', toTeamId: '', toPlayerId: '', gpFrom: '', gpTo: '' });

/** Una pieza del paquete: traspaso (A le vende X a B) o trueque (A da X, B da Y, con GP opcional). */
function PieceEditor({ piece, index, teams, onChange, onRemove, onPlayers }) {
  const fromSquad = useSquad(piece.fromTeamId);
  const toSquad = useSquad(piece.toTeamId);
  // El resumen de abajo necesita los jugadores elegidos (cara y valor).
  useEffect(() => {
    if (piece.kind === 'transfer') onPlayers(piece.key, [fromSquad.find(item => item.id === piece.playerId)].filter(Boolean));
    else onPlayers(piece.key, [fromSquad.find(item => item.id === piece.fromPlayerId), toSquad.find(item => item.id === piece.toPlayerId)].filter(Boolean));
  }, [piece.key, piece.kind, piece.playerId, piece.fromPlayerId, piece.toPlayerId, fromSquad, toSquad]);
  const set = (name, value) => onChange({ ...piece, [name]: value,
    ...(name === 'fromTeamId' ? { playerId: '', fromPlayerId: '' } : {}),
    ...(name === 'toTeamId' ? { toPlayerId: '' } : {}),
    ...(name === 'playerId' ? { gpAmount: String(fromSquad.find(item => item.id === value)?.gpValue ?? '') } : {}) });
  const switchKind = kind => onChange({ ...(kind === 'transfer' ? emptyTransfer() : emptyTrade()), key: piece.key, fromTeamId: piece.fromTeamId, toTeamId: piece.toTeamId });
  const sold = fromSquad.find(item => item.id === piece.playerId);
  const band = sold ? bandOf(sold) : null;
  return <fieldset className="bundle-piece">
    <legend>PIEZA {index + 1}</legend>
    <div className="bundle-piece-head">
      <div className="offer-toggle" role="radiogroup" aria-label="Tipo de pieza">
        <button type="button" role="radio" aria-checked={piece.kind === 'transfer'} className={piece.kind === 'transfer' ? 'on' : ''} onClick={() => switchKind('transfer')}>TRASPASO</button>
        <button type="button" role="radio" aria-checked={piece.kind === 'trade'} className={piece.kind === 'trade' ? 'on' : ''} onClick={() => switchKind('trade')}>TRUEQUE</button>
      </div>
      <button type="button" className="bundle-remove" onClick={onRemove} aria-label={`Quitar pieza ${index + 1}`}>QUITAR</button>
    </div>
    {piece.kind === 'transfer' ? <div className="bundle-piece-grid">
      <label>CLUB QUE VENDE<select value={piece.fromTeamId} onChange={event => set('fromTeamId', event.target.value)}>{teamOptions(teams)}</select></label>
      <label>JUGADOR<select value={piece.playerId} disabled={!piece.fromTeamId} onChange={event => set('playerId', event.target.value)}>{playerOptions(fromSquad)}</select></label>
      <label>CLUB QUE COMPRA<select value={piece.toTeamId} onChange={event => set('toTeamId', event.target.value)}>{teamOptions(teams, piece.fromTeamId)}</select></label>
      <label>PRECIO{band ? ` · ${gp(band.min)} A ${gp(band.max)}` : ''}<GpInput value={piece.gpAmount} disabled={!sold} onChange={event => set('gpAmount', event.target.value)}/></label>
    </div> : <div className="bundle-piece-grid">
      <label>CLUB A<select value={piece.fromTeamId} onChange={event => set('fromTeamId', event.target.value)}>{teamOptions(teams, piece.toTeamId)}</select></label>
      <label>A ENTREGA<select value={piece.fromPlayerId} disabled={!piece.fromTeamId} onChange={event => set('fromPlayerId', event.target.value)}>{playerOptions(fromSquad)}</select></label>
      <label>CLUB B<select value={piece.toTeamId} onChange={event => set('toTeamId', event.target.value)}>{teamOptions(teams, piece.fromTeamId)}</select></label>
      <label>B ENTREGA<select value={piece.toPlayerId} disabled={!piece.toTeamId} onChange={event => set('toPlayerId', event.target.value)}>{playerOptions(toSquad)}</select></label>
      <label>GP QUE PONE A (OPCIONAL)<GpInput placeholder="0" value={piece.gpFrom} onChange={event => set('gpFrom', event.target.value)}/></label>
      <label>GP QUE PONE B (OPCIONAL)<GpInput placeholder="0" value={piece.gpTo} onChange={event => set('gpTo', event.target.value)}/></label>
    </div>}
  </fieldset>;
}

const complete = piece => (piece.kind === 'transfer'
  ? piece.fromTeamId && piece.toTeamId && piece.playerId && piece.gpAmount !== ''
  : piece.fromTeamId && piece.toTeamId && piece.fromPlayerId && piece.toPlayerId);
const payload = piece => (piece.kind === 'transfer'
  ? { kind: 'transfer', fromTeamId: piece.fromTeamId, toTeamId: piece.toTeamId, playerId: piece.playerId, gpAmount: Number(piece.gpAmount) }
  : { kind: 'trade', fromTeamId: piece.fromTeamId, toTeamId: piece.toTeamId, fromPlayerId: piece.fromPlayerId, toPlayerId: piece.toPlayerId, gpFrom: Number(piece.gpFrom || 0), gpTo: Number(piece.gpTo || 0) });

/** Qué da, recibe y paga neto cada club, calculado en el navegador mientras se arma. */
function ledgerOf(pieces, players) {
  const clubs = new Map();
  const club = teamId => { if (!clubs.has(teamId)) clubs.set(teamId, { gives: [], receives: [], net: 0 }); return clubs.get(teamId); };
  for (const piece of pieces.filter(complete)) {
    const [first, second] = players[piece.key] ?? [];
    if (piece.kind === 'transfer') {
      club(piece.fromTeamId).gives.push(first); club(piece.toTeamId).receives.push(first);
      club(piece.toTeamId).net -= Number(piece.gpAmount); club(piece.fromTeamId).net += Number(piece.gpAmount);
    } else {
      club(piece.fromTeamId).gives.push(first); club(piece.toTeamId).receives.push(first);
      club(piece.toTeamId).gives.push(second); club(piece.fromTeamId).receives.push(second);
      const net = Number(piece.gpFrom || 0) - Number(piece.gpTo || 0);
      club(piece.fromTeamId).net -= net; club(piece.toTeamId).net += net;
    }
  }
  return clubs;
}

const names = list => list.filter(Boolean).map(player => player.name).join(', ') || '—';
const netText = net => (net > 0 ? `RECIBE ${gp(net)}` : net < 0 ? `PONE ${gp(-net)}` : 'SIN GP');

export function BundleProposal({ myTeamId, teams, onDone }) {
  const clubs = teams.filter(team => (team.kind ?? 'club') === 'club' && !team.hidden);
  const [pieces, setPieces] = useState(() => [emptyTransfer(), emptyTrade()]);
  const [players, setPlayers] = useState({});
  const [check, setCheck] = useState({ problem: null, ok: false });
  const [sent, setSent] = useState(false);
  const ready = pieces.length >= 2 && pieces.every(complete);
  const body = useMemo(() => ({ proposerTeamId: myTeamId, pieces: pieces.map(payload) }), [pieces, myTeamId]);
  // Revisión del servidor con las mismas reglas que al enviar (banda, saldo neto, jugadores repetidos, 3+ clubes).
  useEffect(() => {
    if (!ready) { setCheck({ problem: null, ok: false }); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => endpoints.previewBundle(body, controller.signal)
      .then(() => setCheck({ problem: null, ok: true }))
      .catch(error => { if (error.name !== 'AbortError') setCheck({ problem: error.message, ok: false }); }), 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ready, body]);
  const mutation = useApiMutation((data, signal) => endpoints.createBundle(data, signal), { onSuccess: () => { setSent(true); onDone?.(); } });
  const ledger = ledgerOf(pieces, players);
  const teamOf = teamId => clubs.find(team => team.id === teamId) ?? { id: teamId, name: 'Club' };
  if (sent) return <div className="offer-sent" role="status">
    <p>✅ Acuerdo enviado: les llega a todos los presis. Se cierra cuando acepten todos; si uno lo rechaza, se cae entero.</p>
    <Button onClick={() => { setSent(false); setPieces([emptyTransfer(), emptyTrade()]); setPlayers({}); mutation.clear(); }}>ARMAR OTRO</Button>
  </div>;
  return <form className="admin-form market-form offer-form bundle-form" onSubmit={event => { event.preventDefault(); if (ready && check.ok) mutation.execute(body); }}>
    <HowItWorks title="¿Cómo funciona un acuerdo compuesto?">
      <p>Arma varios traspasos y trueques entre 3 o más clubes en un solo paquete. Tu club tiene que estar en él.</p>
      <p>Cada pieza cumple las reglas de siempre: precio entre 0,7× y 1,25× del valor de Transfermarkt, el que se va libre solo se canjea, nadie prometido. El saldo se mira por lo que cada club pone neto en todo el paquete.</p>
      <p>No se mueve nada hasta que acepten todos los presis. Si uno lo rechaza, se cae entero. Al cerrarse sigue las reglas de los preacuerdos.</p>
    </HowItWorks>
    {pieces.map((piece, index) => <PieceEditor key={piece.key} piece={piece} index={index} teams={clubs}
      onChange={next => setPieces(list => list.map(item => (item.key === piece.key ? next : item)))}
      onRemove={() => setPieces(list => list.filter(item => item.key !== piece.key))}
      onPlayers={(key, list) => setPlayers(current => ({ ...current, [key]: list }))}/>)}
    <div className="bundle-add">
      <button type="button" onClick={() => setPieces(list => [...list, emptyTransfer()])}>+ TRASPASO</button>
      <button type="button" onClick={() => setPieces(list => [...list, emptyTrade()])}>+ TRUEQUE</button>
    </div>
    {ledger.size > 0 && <div className="bundle-ledger" aria-label="Cómo queda cada club">
      {[...ledger.entries()].map(([teamId, row]) => <div key={teamId} className="bundle-ledger-row">
        <span className="lm-club"><TeamMark team={teamOf(teamId)}/><span>{teamOf(teamId).name}</span></span>
        <small>DA: {names(row.gives)}</small>
        <small>RECIBE: {names(row.receives)}</small>
        <b className={row.net < 0 ? 'pays' : ''}>{netText(row.net)}</b>
      </div>)}
    </div>}
    {ready && check.problem && <div className="offer-summary has-problem"><p role="alert">⚠️ {check.problem}</p></div>}
    {ready && check.ok && <div className="offer-summary"><p>{ledger.size} CLUBES · {pieces.length} PIEZAS. TIENEN QUE ACEPTARLO TODOS LOS PRESIS.</p></div>}
    <Button variant="positive" type="submit" disabled={mutation.loading || !ready || !check.ok}>{mutation.loading ? 'ENVIANDO…' : 'ENVIAR ACUERDO COMPUESTO'}</Button>
    {mutation.error && <p className="form-feedback error" role="alert">{mutation.error.message}</p>}
  </form>;
}

/** Una flecha: cara del jugador y de qué club a qué club va. */
function Move({ player, from, to }) {
  return <div className="bundle-move">
    <span className="bundle-face" title={player.name}>
      <PlayerFace src={player.faceUrl} name={player.name}/>
      <span><b>{player.name}</b><small>{player.position}{player.overall != null && <OverallBadge value={player.overall}/>}</small></span>
    </span>
    <span className="bundle-route">
      <span className="lm-club"><TeamMark team={from}/><span>{from.name}</span></span>
      <span className="lm-arrow" aria-label="pasa a">→</span>
      <span className="lm-club"><TeamMark team={to}/><span>{to.name}</span></span>
    </span>
  </div>;
}

const STATUS = { accepted: ['✅ ACEPTÓ', 'ok'], pending: ['⏳ FALTA', 'wait'], rejected: ['❌ RECHAZÓ', 'bad'] };
const BUNDLE_STATUS = { pending: 'ESPERANDO RESPUESTAS', approved: 'CERRADO', rejected: 'SE CAYÓ', cancelled: 'RETIRADO' };

function BundleCard({ bundle, onChanged, highlighted }) {
  const { isAdmin, isPresidentOf } = useAuth();
  const respond = useApiMutation(({ action, teamId }, signal) => (action === 'accept' ? endpoints.acceptBundle(bundle.id, { teamId }, signal) : endpoints.rejectBundle(bundle.id, { teamId }, signal)), { onSuccess: onChanged });
  const pending = bundle.status === 'pending';
  const mine = bundle.parties.filter(party => isPresidentOf(party.team.id));
  const myPending = mine.find(party => party.status === 'pending');
  const iProposed = mine.some(party => party.proposer);
  return <article className={`bundle-card status-${bundle.status} ${highlighted ? 'is-highlighted' : ''}`} id={`bundle-${bundle.id}`}>
    <header>
      <b>ACUERDO COMPUESTO</b>
      <small>ARMADO POR {upper(bundle.parties.find(party => party.proposer)?.team.name)} · {BUNDLE_STATUS[bundle.status] ?? upper(bundle.status)}</small>
    </header>
    {/* Los movimientos, uno por línea: quién, de dónde, a dónde y cuánta plata. */}
    <ol className="bundle-flow">
      {bundle.pieces.map((piece, index) => <li key={index} className={`bundle-flow-item kind-${piece.kind}`}>
        {piece.kind === 'transfer'
          ? <>
            <Move player={piece.player} from={piece.fromTeam} to={piece.toTeam}/>
            <p className="bundle-flow-money">{piece.gpAmount ? `${piece.toTeam.name} paga ${gp(piece.gpAmount)}` : 'Sin GP'}</p>
          </>
          : <>
            <Move player={piece.fromPlayer} from={piece.fromTeam} to={piece.toTeam}/>
            <span className="bundle-flow-swap" aria-label="a cambio de">⇄ A CAMBIO DE</span>
            <Move player={piece.toPlayer} from={piece.toTeam} to={piece.fromTeam}/>
            <p className="bundle-flow-money">{[piece.gpFrom ? `${piece.fromTeam.name} pone ${gp(piece.gpFrom)}` : null, piece.gpTo ? `${piece.toTeam.name} pone ${gp(piece.gpTo)}` : null].filter(Boolean).join(' · ') || 'Mano a mano'}</p>
          </>}
      </li>)}
    </ol>
    {/* La votación: cada club con su respuesta y cómo queda en plata. */}
    <div className="bundle-votes" aria-label="Respuesta de cada club">
      {bundle.parties.map(party => <div key={party.team.id} className={`bundle-vote vote-${party.status}`}>
        <span className="lm-club"><TeamMark team={party.team}/><span>{party.team.name}</span></span>
        <em className={`bundle-status ${STATUS[party.status]?.[1] ?? ''}`}>{party.proposer ? '✅ LO ARMÓ' : STATUS[party.status]?.[0] ?? upper(party.status)}</em>
        <small className={`bundle-net ${party.net < 0 ? 'pays' : ''}`}>{netText(party.net)}</small>
        {pending && isAdmin && !isPresidentOf(party.team.id) && party.status === 'pending' && <button type="button" className="bundle-admin" disabled={respond.loading} onClick={() => respond.execute({ action: 'accept', teamId: party.team.id })}>ACEPTAR POR ÉL</button>}
      </div>)}
    </div>
    {pending && bundle.blocker && <p className="signing-warning" role="alert">⚠️ HOY NO SE PUEDE CERRAR: {bundle.blocker}</p>}
    {pending && (myPending || iProposed) && <div className="mini-actions">
      {myPending && <button type="button" className="ok" disabled={respond.loading || Boolean(bundle.blocker)} onClick={() => respond.execute({ action: 'accept', teamId: myPending.team.id })}>ACEPTAR</button>}
      {myPending && <button type="button" className="danger" disabled={respond.loading} onClick={() => respond.execute({ action: 'reject', teamId: myPending.team.id })}>RECHAZAR (SE CAE PARA TODOS)</button>}
      {iProposed && <button type="button" className="ghost" disabled={respond.loading} onClick={() => respond.execute({ action: 'reject', teamId: mine.find(party => party.proposer).team.id })}>RETIRAR ACUERDO</button>}
    </div>}
    {respond.error && <p className="form-feedback error" role="alert">{respond.error.message}</p>}
  </article>;
}

/** Acuerdos compuestos donde está tu club (o todos, para un admin). */
export function BundlesInbox({ revision, onChanged, highlightId = null }) {
  const bundles = useApiQuery(signal => endpoints.marketBundles(signal).catch(() => ({ data: [] })), [revision]);
  useAutoRefresh(bundles.retry, 30000);
  const rows = asList(bundles.data);
  if (!rows.length) return bundles.error ? <DataState query={bundles}/> : null;
  const pending = rows.filter(row => row.status === 'pending').length;
  return <section className="market-section bundle-inbox">
    <header><h2>ACUERDOS COMPUESTOS <small>{pending ? `${pending} PENDIENTE${pending === 1 ? '' : 'S'}` : rows.length}</small></h2>
      <p>Paquetes entre 3 o más clubes: se cierran cuando aceptan todos los presis.</p></header>
    <div className="bundle-list">{rows.map(bundle => <BundleCard key={bundle.id} bundle={bundle} highlighted={bundle.id === highlightId} onChanged={() => { bundles.retry(); onChanged?.(); }}/>)}</div>
  </section>;
}
