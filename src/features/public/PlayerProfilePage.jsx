import { useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { boosterText, hasCoachBoost } from '../../utils/managerBoosters.js';
import { EntityLink } from '../../components/EntityLink.jsx';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { DataState, OverallBadge, gp } from './DataStates.jsx';
import { PlayerActions, PlayerAdmin } from './PlayersPage.jsx';
import { useAuth } from '../../app/AuthGate.jsx';
import { LinkedCardDetails } from './EfootballCard.jsx';
import { useApiQuery } from './useApiQuery.js';
import { useApiMutation } from '../admin/useApiMutation.js';
import { addToComparison, comparisonCandidate, readComparison, writeComparison } from '../../utils/playerComparison.js';
import { Button, Icon, Screen } from '../../ui/index.js';
import { TalkModal } from '../teams/TalkModal.jsx';

/** En la ficha de un agente libre, un presi le abre una encuesta de compra a su valor. */
function OpenPollFromProfile({ player }) {
  const { teamId: myTeamId } = useAuth();
  const [done, setDone] = useState(false);
  const open = useApiMutation((body, signal) => endpoints.openPoll(body, signal), { onSuccess: () => setDone(true) });
  if (!myTeamId || player.team) return null;
  if (done) return <p className="profile-poll done" role="status">✅ Pediste ficharlo por {gp(player.gpValue)}: los demás presis lo confirman en Mercado › Fichar libres y en Discord. <a href="#/transferencias?tab=libres">Ver →</a></p>;
  return <div className="profile-poll">
    <Button variant="positive" disabled={open.loading} onClick={() => { try { window.sessionStorage.setItem('mercado-pestana', 'libres'); } catch { /* sin almacenamiento */ } open.execute({ playerId: player.id, teamId: myTeamId }); }}>
      {open.loading ? 'Abriendo…' : `Fichar · ${gp(player.gpValue)}`}
    </Button>
    {open.error && <p className="form-feedback error" role="alert">{open.error.message}</p>}
  </div>;
}

const COURTING_TONE = { entusiasmado: 'hot', 'con dudas': 'mid', 'no lo convencieron': 'cold', hablando: 'mid' };

/** Para el dueño: qué clubes le están hablando a su jugador y cómo quedó cada charla (nunca qué se dijeron). */
function CourtingLine({ teamId, playerId, name }) {
  const query = useApiQuery(signal => endpoints.teamCourting(teamId, signal).catch(() => ({ data: {} })), [teamId]);
  const rows = query.data?.[playerId] ?? [];
  if (!rows.length) return null;
  return <p className="courting-line"><Icon name="chat" size={14}/><b>Le están hablando a {name.split(' ').at(-1)}:</b>
    {rows.map(row => <span key={row.teamId} className={`courting-${COURTING_TONE[row.status] ?? 'mid'}`}>{row.name} ({row.status})</span>)}
  </p>;
}

/**
 * Lo que puedes hacer con el jugador, en botones grandes. De otro club o libre: hacer oferta (o fichar si está libre),
 * hablarle (aunque el mercado esté cerrado) y seguirlo. Tuyo: su contrato y sus mensajes.
 */
function ProfileActions({ player, onTalk }) {
  const { teamId: myTeamId } = useAuth();
  const watchlist = useApiQuery(signal => (myTeamId ? endpoints.teamWatchlist(myTeamId, signal).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })), [myTeamId]);
  const watching = (Array.isArray(watchlist.data) ? watchlist.data : []).some(row => (row.playerId ?? row.id) === player.id);
  const toggle = useApiMutation((_, signal) => (watching ? endpoints.unwatchPlayer(myTeamId, player.id, signal) : endpoints.watchPlayer(myTeamId, player.id, signal)), { onSuccess: () => watchlist.retry() });
  // Un jugador dado de baja de la liga no se puede fichar ni hablar.
  if (!myTeamId || player.active === 0 || player.active === false) return null;
  if (player.team?.id === myTeamId) {
    return <><CourtingLine teamId={myTeamId} playerId={player.id} name={player.name}/><div className="profile-actions">
      <a className="ui-btn ui-btn--primary ui-btn--md" href={`#/equipos/${myTeamId}?tab=finanzas&ver=nomina`}><Icon name="contract" size={14}/>Su contrato</a>
      <a className="ui-btn ui-btn--ghost ui-btn--md" href={`#/equipos/${myTeamId}?tab=mensajes`}><Icon name="chat" size={14}/>Sus mensajes</a>
    </div></>;
  }
  return <div className="profile-actions">
    {player.team
      ? <a className="ui-btn ui-btn--positive ui-btn--md" href={`#/transferencias?tab=ofertas&jugador=${encodeURIComponent(player.id)}&club=${encodeURIComponent(player.team.id)}`}><Icon name="handshake" size={14}/>Hacer oferta</a>
      : <OpenPollFromProfile player={player}/>}
    <Button icon="chat" onClick={onTalk}>Hablarle</Button>
    <Button variant="ghost" icon="star" disabled={toggle.loading || watchlist.loading} aria-pressed={watching} onClick={() => toggle.execute()}>{watching ? 'Siguiendo' : 'Seguir'}</Button>
  </div>;
}

const factorText = factor => `${factor.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
/** Premios individuales del jugador (Balón de Oro, Bota de Oro, portadas…), del más nuevo al más viejo. */
function PlayerAwards({ awards }) {
  return <section className="player-awards"><header><h2>Premios individuales</h2><small>{awards.length} EN SU CARRERA EN LA LIGA</small></header>
    <ul>{awards.map((award, index) => <li key={`${award.tournamentId}-${award.award}-${index}`} className={`award-${award.award}`}>
      <Icon name={award.award === 'guante_oro' ? 'shield' : award.award.startsWith('portada') ? 'camera' : 'trophy'} size={16}/>
      <b>{award.label.toUpperCase()}</b><small>{award.tournamentName} · {award.teamName ?? ''}</small>
    </li>)}</ul>
  </section>;
}

/** Trayectoria: cada club por el que pasó (con rangos de torneo) y los períodos en que estuvo libre, del más viejo al más nuevo. */
function PlayerCareer({ career }) {
  const stints = career.stints;
  const when = value => (value ? new Date(String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : null);
  return <section className="player-career"><header><h2>Trayectoria</h2><small>{career.clubs} CLUB{career.clubs === 1 ? '' : 'ES'} EN LA LIGA</small></header>
    <ol>{stints.map((stint, index) => <li key={`${stint.joinedAt}-${index}`} className={`${stint.kind === 'free' ? 'career-free' : ''}${stint.current ? ' career-current' : ''}`}
      title={`${when(stint.joinedAt)}${stint.leftAt ? ` – ${when(stint.leftAt)}` : ' – hoy'}`}>
      <b className="career-range">{stint.range}</b>
      <span className="career-club">{stint.kind === 'free'
        ? <em>Agente libre</em>
        : <EntityLink to="team" id={stint.teamId}>{stint.imageUrl && <img src={stint.imageUrl} alt="" onError={event => { event.currentTarget.hidden = true; }}/>} {stint.teamName}</EntityLink>}</span>
      <small>{stint.kind === 'free' ? (stint.current ? 'Sin club hoy' : `Lo fichó: ${stint.exit?.toLowerCase()}`) : `${stint.arrival}${stint.exit ? ` → ${stint.exit.toLowerCase()}` : ' · actual'}`}</small>
    </li>)}</ol>
  </section>;
}

const MOVE_LABELS = { transfer: 'Traspaso', auction: 'Subasta', poll: 'Fichaje por encuesta', free_agent: 'Fichaje de agente libre', dismissal: 'Despido', reverted: 'Operación revertida' };

/** Cómo se movió su valor: cada venta lo deja en lo pagado; un despido lo baja. Siempre entre 0,70× y 1,25× Transfermarkt. */
function ValueMoves({ moves }) {
  return <section className="player-value-moves"><header><h2>Movimientos de valor</h2><small>ENTRE 0,70× Y 1,25× SU VALOR DE TRANSFERMARKT</small></header>
    <ul>{moves.map(move => <li key={`${move.createdAt}-${move.kind}`}>
      <span>{MOVE_LABELS[move.kind] ?? move.kind}{move.price != null ? ` por ${gp(move.price)}` : ''}</span>
      <b className={move.valueAfter < move.valueBefore ? 'down' : 'up'}>{gp(move.valueBefore)} → {gp(move.valueAfter)}</b>
      <small>{factorText(move.factorBefore)} → {factorText(move.factorAfter)} · {new Date(move.createdAt).toLocaleDateString('es-CL')}</small>
    </li>)}</ul>
  </section>;
}

export function PlayerProfilePage({ playerId, teams = [], onBack, backLabel = '← VOLVER A JUGADORES' }) {
  const { isAdmin } = useAuth();
  const profile = useApiQuery(signal => endpoints.player(playerId, signal), [playerId]);
  const player = profile.data;
  const colors = player?.team?.colors ?? {};
  // Suma al jugador a la selección del comparador y abre la pestaña Comparador.
  const compare = current => {
    writeComparison(addToComparison(readComparison(), comparisonCandidate({ playerId: current.id, pesId: current.efootballPesId, variation: current.efootballVariation, name: current.name, faceUrl: current.faceUrl })));
    window.location.hash = '/equipos/jugadores?tab=comparador';
  };
  const cardStyle = { '--club-primary': colors.primary ?? '#062764', '--club-secondary': colors.secondary ?? '#10285b', '--club-tertiary': colors.tertiary ?? '#ffd42a' };
  const { teamId: myTeamId } = useAuth();
  const [talking, setTalking] = useState(false);
  return <Screen className="player-screen" kicker={player ? `Jugador · ${player.team?.name ?? 'agente libre'}` : 'Jugador'} title={player?.name ?? 'Jugador'}
    hero={player ? <div className="screen-face"><PlayerFace src={player.faceUrl} name={player.name}/></div> : null}
    intro={player ? `${player.position ?? ''}${player.external?.overall ? ` · media ${player.external.overall}` : ''} · vale ${gp(player.gpValue)}` : null}
    actions={<div className="screen-actions-stack"><button className="back-button" onClick={onBack}>{backLabel}</button>{player && <Button size="sm" variant="ghost" onClick={() => compare(player)}>⇄ Comparar</Button>}</div>}>
    {player && <ProfileActions player={player} onTalk={() => setTalking(true)}/>}
    <DataState query={profile}/>
    {talking && player && myTeamId && <TalkModal player={player} teamId={myTeamId} onClose={() => setTalking(false)}/>}
    {player && <article className="player-profile-card" style={cardStyle}>
      <dl className="player-profile-facts"><div><dt>EQUIPO</dt><dd className="player-team-value"><EntityLink to="team" id={player.team?.id}>{player.team?.imageUrl && <img src={player.team.imageUrl} alt="" onError={event => { event.currentTarget.hidden = true; }}/>} {player.team?.name ?? 'AGENTE LIBRE'}</EntityLink></dd></div><div><dt>POSICIÓN</dt><dd>{player.position ?? '—'}</dd></div><div><dt>MEDIA eFOOTBALL</dt><dd><OverallBadge value={player.external?.overall}/>{hasCoachBoost({ overall: player.external?.overall, overallWithCoach: player.external?.overallWithCoach }) && <span className="ovr-coach-note" title={`Potenciadores de ${player.coachManager?.name ?? 'su DT'}: ${(player.coachManager?.boosters ?? []).map(boosterText).join(', ')}`}> → <b>{player.external.overallWithCoach}</b> CON DT</span>}</dd></div><div><dt>NACIONALIDAD</dt><dd>{player.flag && <i className="player-flag">{player.flag}</i>} {player.nationality ?? player.external?.nationality ?? 'NO INFORMADA'}</dd></div><div><dt>VALOR LIGA</dt><dd>{gp(player.gpValue)}{player.market && player.market.factor !== 1 && <small className="player-value-factor"> · {factorText(player.market.factor)} TM</small>}</dd></div><div><dt>VALOR TRANSFERMARKT</dt><dd>{gp(player.market?.reference ?? player.gpValue)}</dd></div><div><dt>VALOR eFOOTBALLDB</dt><dd>{player.external ? gp(player.external.gpPrice) : '—'}</dd></div><div><dt>GOLES HISTÓRICOS</dt><dd>{player.goals ?? 0}</dd></div></dl>
      {player.awards?.length > 0 && <PlayerAwards awards={player.awards}/>}
      {player.career?.stints?.length > 0 && <PlayerCareer career={player.career}/>}
      {player.market?.moves?.length > 0 && <ValueMoves moves={player.market.moves}/>}
      <section className="player-tournament-form"><header><h2>Rendimiento en torneos activos</h2><small>GOLES REGISTRADOS</small></header>{player.activeGoals?.length ? <div>{player.activeGoals.map(tournament => <article key={tournament.name}><b>{tournament.name}</b><strong>{tournament.goals} GOL{tournament.goals === 1 ? '' : 'ES'}</strong></article>)}</div> : <p>Aún no registra goles en un torneo activo.</p>}</section>
      {player.efootballPesId && <p className="player-data-source-note">Ficha, foto y media se actualizan con el catálogo eFootballDB. El valor GP de la liga se mantiene sin cambios.</p>}
      {player.efootballPesId && <LinkedCardDetails pesId={player.efootballPesId} variation={player.efootballVariation ?? 0}/>}
      {isAdmin && <details className="player-management"><summary>GESTIÓN DEL JUGADOR</summary><div><PlayerActions key={`actions-${player.team?.id ?? 'free'}`} player={player} teams={teams} onChanged={() => profile.retry()}/><PlayerAdmin key={`admin-${player.id}-${player.gpValue}`} player={player} onChanged={() => profile.retry()}/></div></details>}
    </article>}
  </Screen>;
}
