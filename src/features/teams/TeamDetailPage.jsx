import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { TeamMark } from '../../components/TeamMark.jsx';
import { seasonTag } from '../../components/TrophyCase.jsx';
import { Button, Screen } from '../../ui/index.js';
import { SanctionBadge } from '../../components/SanctionBadge.jsx';
import { SimulatedBadge } from '../../components/SimulatedBadge.jsx';
import { DerbyBadge } from '../../components/DerbyBadge.jsx';
import { EntityLink } from '../../components/EntityLink.jsx';
import { LiveMovement, LivePosition, LiveTableStatus, PlayoffLegend, liveRowClass, playoffZone } from '../../components/LiveStandings.jsx';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { teamBalance, teamCoachName, teamCoachPhoto } from '../../utils/teamPresentation.js';
import { readPersonProfile } from '../../utils/personProfile.js';
import { matchRoundLabel } from '../../utils/matchPresentation.js';
import { CoachForm, PresidentForm, ProfileForm, SquadEditor } from '../admin/TeamAdminPanel.jsx';
import { ManagerSummary } from './ManagerCard.jsx';
import { ReputationModal, ReputationSummary } from './Reputation.jsx';
import { hasCoachBoost, overallText } from '../../utils/managerBoosters.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { useApiQuery } from '../public/useApiQuery.js';
import { useLiveStandings } from '../public/useLiveStandings.js';
import { useNotifications } from '../notifications/NotificationsProvider.jsx';
import { MessagesTab } from './MessagesTab.jsx';
import { EventsTab, FansTab, TvRightsTab, VenueTab } from './ClubLife.jsx';
import { DirectivaTab } from './DirectivaTab.jsx';
import { PendingMovesCard, leavingMarks, pendingSummary, projectedRoster } from './PendingMoves.jsx';
import { RivalryTab } from './RivalryTab.jsx';
import { ClubNicknames, nicknameTitle } from './ClubNicknames.jsx';
import { ClubKit } from './ClubKit.jsx';
import { ClubInvestments } from './ClubInvestments.jsx';
import { HeadToHeadTable } from './HeadToHeadTable.jsx';
import { LedgerTab } from './LedgerTab.jsx';
import { PayrollTab } from './PayrollTab.jsx';
import { RolesPanel } from './RolesPanel.jsx';
import { gpNumber } from '../../utils/money.js';
import { roundStep } from '../../utils/payrollSim.js';
import { PitchBoard } from './PitchBoard.jsx';
import { SimulationTools } from './SimulationTools.jsx';
import { bandFor, defaultFormationPositions, pitchPositionFor } from '../../utils/formationPositions.js';

const gp = value => typeof value === 'number' ? gpNumber(value) : '—';
const FLAG_REGEX = /^(\p{Regional_Indicator}{2})\s*/u;
const SIMULATOR_SEARCH_DELAY = 250;
const SIMULATOR_SEARCH_MIN_LENGTH = 2;

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debouncedValue;
}

function splitPlayerName(name) {
  const match = name?.match(FLAG_REGEX);
  const flag = match ? match[1] : '';
  const rest = (match ? name.slice(match[0].length) : (name ?? '')).trim();
  return { flag, rest };
}

function PlayerRow({ player, mark = null, incoming = null }) {
  const { rest: name } = splitPlayerName(player.name);
  return <button type="button" className={`roster-row roster-player-link ${mark ? 'is-leaving' : ''} ${incoming ? 'is-arriving' : ''}`} title={mark?.title ?? (incoming ? `Llega ${incoming.when} desde ${incoming.club}` : undefined)} onClick={() => { window.location.hash = `/jugadores/${encodeURIComponent(player.id)}`; }}><b>{player.jerseyNumber ?? '—'}</b><span><PlayerFace src={player.faceUrl} name={name} className="roster-player-face"/><i>{player.flag && <em className="player-flag">{player.flag}</em>}{name}{player.loan?.status === 'active' && <em className="roster-tag loan" title={`A préstamo de ${player.loan.ownerName}: vuelve al terminar la ventana (2 torneos)`}>PRÉSTAMO ← {player.loan.ownerName}</em>}{mark && <em className="roster-tag leaving">SALE → {mark.club}</em>}{incoming && <em className="roster-tag arriving">LLEGA ← {incoming.club}</em>}</i></span><small className={hasCoachBoost(player) ? 'ovr-coach' : ''} title={hasCoachBoost(player) ? 'Media base → media con los potenciadores del DT' : undefined}>{player.position ?? '—'}{player.overall != null || player.overallWithCoach != null ? <> · {overallText(player)}</> : null}</small><strong>{gp(player.gpValue)} GP</strong></button>;
}

function RosterHeader() {
  return <div className="roster-columns" aria-hidden="true"><b>NÚMERO</b><b>NOMBRE</b><b>POS. / OVR</b><b>VALOR MERCADO</b></div>;
}

// Resultado desde el marcador; winnerTeamId solo decide empates definidos por penales.
const resultFor = (match, teamId) => {
  if (match.status !== 'finished') return null;
  const own = match.homeTeam?.id === teamId ? match.homeScore : match.awayScore;
  const rival = match.homeTeam?.id === teamId ? match.awayScore : match.homeScore;
  if (own !== rival) return own > rival ? 'G' : 'P';
  if (!match.winnerTeamId) return 'E';
  return match.winnerTeamId === teamId ? 'G' : 'P';
};

function ClubMatchRow({ match, resolveTeam, teamId }) {
  const finished = match.status === 'finished';
  const result = resultFor(match, teamId);
  return <EntityLink to="match" id={match.id} className={`club-match-row ${{ G: 'won', P: 'lost', E: 'drawn' }[result] ?? ''}`}>
    <small><DerbyBadge match={match}/><SanctionBadge match={match} compact/><SimulatedBadge match={match}/>{match.stage === 'preseason' && <em className="tour-tag">GIRA</em>}{match.tournament?.name ?? 'TORNEO'} · {matchRoundLabel(match, { leagueRound: match.stage === 'preseason' ? 'RONDA' : 'JORNADA' })}{match.homeTeam?.stadium ? <span className="match-venue compact"> · 🏟️ {match.homeTeam.stadium}</span> : null}</small>
    <div><span><TeamMark team={resolveTeam(match.homeTeam)}/><b>{match.homeTeam?.name ?? 'LOCAL'}</b></span><strong>{finished ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}` : 'VS'}</strong><span><b>{match.awayTeam?.name ?? 'VISITA'}</b><TeamMark team={resolveTeam(match.awayTeam)}/></span></div>
  </EntityLink>;
}

const CLUB_MATCH_LIMIT = 5;

function ClubMatches({ matches, teams, teamId }) {
  const [showAll, setShowAll] = useState(false);
  const teamIndex = new Map(teams.map(team => [team.id, team]));
  const resolveTeam = matchTeam => matchTeam
    ? { ...matchTeam, ...(teamIndex.get(matchTeam.id ?? matchTeam.team_id) ?? {}) }
    : matchTeam;
  const upcoming = matches
    .filter(match => match.status === 'pending' || match.status === 'live')
    .sort((left, right) => (left.roundNumber ?? Number.MAX_SAFE_INTEGER) - (right.roundNumber ?? Number.MAX_SAFE_INTEGER) || (left.tournament?.name ?? '').localeCompare(right.tournament?.name ?? '', 'es'));
  const played = matches
    .filter(match => match.status === 'finished')
    .sort((left, right) => String(right.finishedAt ?? '').localeCompare(String(left.finishedAt ?? '')));
  const visibleUpcoming = showAll ? upcoming : upcoming.slice(0, CLUB_MATCH_LIMIT);
  const visiblePlayed = showAll ? played : played.slice(0, CLUB_MATCH_LIMIT);
  return <div className="club-matches">
    <section><h3>PRÓXIMOS <small>{upcoming.length}</small></h3>{visibleUpcoming.length ? visibleUpcoming.map(match => <ClubMatchRow match={match} resolveTeam={resolveTeam} teamId={teamId} key={match.id}/>) : <p className="empty-copy">SIN PARTIDOS PROGRAMADOS.</p>}</section>
    <section><h3>ÚLTIMOS RESULTADOS <small>{played.length}</small></h3>{visiblePlayed.length ? visiblePlayed.map(match => <ClubMatchRow match={match} resolveTeam={resolveTeam} teamId={teamId} key={match.id}/>) : <p className="empty-copy">AÚN NO JUEGA PARTIDOS.</p>}</section>
    {(upcoming.length > CLUB_MATCH_LIMIT || played.length > CLUB_MATCH_LIMIT) && <button type="button" className="club-more-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'MOSTRAR MENOS' : 'VER TODOS LOS PARTIDOS'}</button>}
  </div>;
}

const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim());

function presidentPhoto(team) {
  return firstText(team.president?.imageUrl, team.president?.photoUrl, team.president?.avatarUrl, team.president?.pictureUrl, team.presidentImageUrl, team.presidentPhotoUrl);
}

function PersonPhoto({ photo, name }) {
  return photo ? <img src={photo} alt={`Foto de ${name}`}/> : <div className="president-photo-placeholder" aria-label={`Foto de ${name} no publicada`}><b>{name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '—'}</b><small>FOTO NO PUBLICADA</small></div>;
}

// Foto a sangre con nombre, edad y país sobre un degradado inferior; la edición queda junto al cargo.
function LeaderCard({ photo, name, age, country, customFields = [], role, onEdit, manager, reputation, onReputation }) {
  const details = [age ? `${age} AÑOS` : null, country, ...customFields.map(field => field.value ? `${field.label}: ${field.value}` : null)].filter(Boolean);
  const hover = manager ? `${name}: estilos y potenciadores de ${manager.name}` : reputation ? `${name}: reputación ${reputation.score}` : undefined;
  return <div className="club-person-entry"><h3 className="club-person-role">{role}{onEdit && <button type="button" className="club-inline-edit club-leader-edit" onClick={onEdit} aria-label={`Editar ${role.toLowerCase()}`} title={`Editar ${role.toLowerCase()}`}>✎</button>}</h3><article className="club-person-card" tabIndex={hover ? 0 : undefined} aria-label={hover}><PersonPhoto photo={photo} name={name}/><div className="club-person-overlay"><h3>{name}</h3>{details.length > 0 && <p>{details.join(' · ')}</p>}</div></article>{manager && <div className="manager-popover" role="tooltip"><ManagerSummary manager={manager}/></div>}{!manager && reputation && <div className="manager-popover" role="tooltip"><ReputationSummary reputation={reputation} clubCount={reputation.clubCount}/></div>}{reputation && <button type="button" className="reputation-chip" aria-label={`Reputación ${reputation.score}: ver cómo se calcula y el ranking`} onClick={onReputation} title="Ver cómo se calcula y el ranking de presidentes">REP <b>{reputation.score}</b> <span aria-hidden="true">ⓘ</span></button>}</div>;
}

/** Presidente o DT en chico, para el encabezado del club: foto, cargo, nombre y (si hay) reputación. Se edita con el lápiz. */
function LeaderChip({ photo, name, role, onEdit, manager, reputation, onReputation }) {
  return <div className="leader-chip" tabIndex={manager ? 0 : undefined}>
    <span className="leader-chip-photo">{photo ? <img src={photo} alt=""/> : <b>{name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '—'}</b>}</span>
    <span className="leader-chip-copy"><small>{role}</small><b>{name}</b></span>
    {reputation && <button type="button" className="reputation-chip" aria-label={`Reputación ${reputation.score}: ver cómo se calcula y el ranking`} onClick={onReputation} title="Ver cómo se calcula y el ranking de presidentes">REP <b>{reputation.score}</b></button>}
    {onEdit && <button type="button" className="leader-chip-edit" onClick={onEdit} aria-label={`Editar ${role.toLowerCase()}`} title={`Editar ${role.toLowerCase()}`}>✎</button>}
    {manager && <div className="manager-popover" role="tooltip"><ManagerSummary manager={manager}/></div>}
  </div>;
}

function ClubPeople({ president: { key: presidentKey, ...president }, coach: { key: coachKey, ...coach }, onEditPresident, onEditCoach }) {
  return <section className="club-card club-people"><div className="club-people-grid"><LeaderCard key={presidentKey} {...president} onEdit={onEditPresident}/><LeaderCard key={coachKey} {...coach} onEdit={onEditCoach}/></div></section>;
}

// Tabla acotada al equipo: el de arriba y el de abajo; en los extremos, los dos siguientes.
function ClubStandingSnippet({ standings, teamId, teams, onMore }) {
  const index = standings.findIndex(row => row.team_id === teamId);
  if (index < 0) return null;
  const start = Math.max(0, Math.min(index - 1, standings.length - 3));
  const rows = standings.slice(start, start + 3);
  const teamIndex = new Map(teams.map(team => [team.id, team]));
  return <section className="club-card club-standing-snippet"><h3>TABLA <button type="button" className="club-link-button" onClick={onMore}>VER COMPLETA →</button></h3><LiveTableStatus rows={standings}/>
    <table><thead><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>DG</th><th>PTS</th></tr></thead><tbody>{rows.map(row => { const position = standings.indexOf(row) + 1; return <tr key={row.team_id} className={liveRowClass(row, `${row.team_id === teamId ? 'current-team' : ''} ${playoffZone(position - 1, standings.length)}`.trim())}><td><LivePosition position={position}/></td><td><EntityLink to="team" id={row.team_id} className="table-team-link"><LiveMovement row={row}/><TeamMark team={{ ...row, ...(teamIndex.get(row.team_id) ?? {}) }}/><span>{row.name}</span>{row.isPlayingLive && <em className="live-team-tag">EN VIVO</em>}</EntityLink></td><td>{row.played}</td><td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td><b>{row.points}</b></td></tr>; })}</tbody></table>
  </section>;
}

function ClubRecentResults({ matches, resolveTeam, teamId, onMore }) {
  const played = finishedMatches(matches, teamId).slice(0, 3);
  return <section className="club-card club-recent"><h3>ÚLTIMOS RESULTADOS {played.length > 0 && <button type="button" className="club-link-button" onClick={onMore}>VER TODOS →</button>}</h3>
    {played.length ? <div className="club-match-list">{played.map(match => <ClubMatchRow match={match} resolveTeam={resolveTeam} teamId={teamId} key={match.id}/>)}</div> : <p className="empty-copy">AÚN NO JUEGA PARTIDOS.</p>}
  </section>;
}


function PersonEditorModal({ title, onClose, children }) {
  useEffect(() => {
    const closeWithEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);
  return <div className="person-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="person-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar editor">×</button></header>{children}</section></div>;
}

function clubHonours(team, history) {
  const direct = (team.titles ?? []).filter(item => item?.sourceType ?? item?.source_type);
  return direct.map((item, index) => {
    return {
      id: item.id ?? `${item.name ?? item.title ?? 'title'}-${index}`,
      name: item.name ?? item.title ?? item.tournament?.name ?? item.competition?.name ?? item.message ?? 'Título oficial',
      season: item.season ?? item.year ?? item.edition ?? item.wonAt?.slice?.(0, 4) ?? '',
      sourceType: item.sourceType ?? item.source_type ?? null,
    };
  }).filter((item, index, rows) => rows.findIndex(candidate => `${candidate.name}-${candidate.season}` === `${item.name}-${item.season}`) === index);
}

function publishedHistoryFor(team) {
  return {
    review: team?.review?.trim() || 'Reseña histórica pendiente de publicación.',
    anthemLyrics: team?.anthemLyrics?.trim() || 'Letra del himno pendiente de publicación.',
    anthemUrl: team?.anthemUrl?.trim() || '',
  };
}

function TeamCoversModal({ team, squad = [], teams = [], onClose, onChanged }) {
  const covers = useApiQuery(signal => endpoints.teamCovers(team.id, signal), [team.id]);
  const upload = useApiMutation(async (file, signal) => {
    const asset = await endpoints.uploadImage(file, { entityType: 'team', entityId: team.id }, signal);
    return endpoints.addTeamCover(team.id, { imageUrl: asset?.data?.secureUrl ?? asset?.secureUrl, assetId: asset?.data?.id ?? asset?.id }, signal);
  }, { onSuccess: () => { covers.retry(); onChanged?.(); } });
  const tag = useApiMutation(({ coverId, ...body }, signal) => endpoints.updateTeamCover(team.id, coverId, body, signal), { onSuccess: () => covers.retry() });
  const remove = useApiMutation((coverId, signal) => endpoints.removeTeamCover(team.id, coverId, signal), { onSuccess: () => { covers.retry(); onChanged?.(); } });
  const rows = covers.data ?? [];
  const players = [...squad].sort((a, b) => a.name.localeCompare(b.name));
  const rivals = teams.filter(item => item.id !== team.id && !item.hidden).sort((a, b) => a.name.localeCompare(b.name));
  // Una portada puede apuntar a alguien que ya dejó el club: se conserva como opción para no perderla.
  const playerOptions = cover => cover.playerId && !players.some(player => player.id === cover.playerId) ? [{ id: cover.playerId, name: cover.playerName ?? 'Jugador anterior' }, ...players] : players;
  const rivalOptions = cover => cover.rivalTeamId && !rivals.some(rival => rival.id === cover.rivalTeamId) ? [{ id: cover.rivalTeamId, name: cover.rivalName ?? 'Rival anterior' }, ...rivals] : rivals;
  return <PersonEditorModal title={`PORTADAS · ${team.name}`} onClose={onClose}><div className="team-covers-manager"><label>SUBIR PORTADA<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={upload.loading} onChange={event => { const file = event.target.files?.[0]; if (file) upload.execute(file); }}/></label><small>Al ganar manda el rival: primero las fotos dedicadas al equipo vencido y después las de cualquier rival. En cada grupo va primero la foto de la figura (quien más goles hizo), luego la de otro goleador y al final una genérica; a igualdad, gana la marcada para la localía con que se ganó (de local o de visita). Una foto con rival o localía solo sale si se cumple. Las marcadas "solo si hace hat trick" exigen 3 goles o más del jugador elegido (o de cualquiera, si es genérica) y, dentro de cada grupo de rival, van antes que las comunes. Quitarla evita que se elija en noticias futuras; las ya publicadas conservan su imagen.</small><FormFeedback mutation={upload}/>{covers.loading ? <p>CARGANDO PORTADAS…</p> : <div className="team-covers-grid">{rows.length ? rows.map(cover => <figure key={cover.id}><img src={cover.imageUrl} alt="Portada del equipo"/><select aria-label="Jugador de la portada" value={cover.playerId ?? ''} disabled={tag.loading} onChange={event => tag.execute({ coverId: cover.id, playerId: event.target.value || null })}><option value="">GENÉRICA</option>{playerOptions(cover).map(player => <option key={player.id} value={player.id}>SI MARCA {player.name}</option>)}</select><select aria-label="Rival de la portada" value={cover.rivalTeamId ?? ''} disabled={tag.loading} onChange={event => tag.execute({ coverId: cover.id, rivalTeamId: event.target.value || null })}><option value="">CUALQUIER RIVAL</option>{rivalOptions(cover).map(rival => <option key={rival.id} value={rival.id}>VS {rival.name}</option>)}</select><select aria-label="Localía de la portada" value={cover.venue ?? ''} disabled={tag.loading} onChange={event => tag.execute({ coverId: cover.id, venue: event.target.value || null })}><option value="">DE LOCAL O VISITA</option><option value="home">GANANDO DE LOCAL</option><option value="away">GANANDO DE VISITA</option></select><label className="cover-hat-trick"><input type="checkbox" checked={Boolean(cover.hatTrick)} disabled={tag.loading} onChange={event => tag.execute({ coverId: cover.id, hatTrick: event.target.checked })}/> SOLO SI HACE HAT TRICK</label><button type="button" disabled={remove.loading} onClick={() => remove.execute(cover.id)}>QUITAR</button></figure>) : <p>SIN PORTADAS.</p>}</div>}<FormFeedback mutation={tag}/><FormFeedback mutation={remove}/></div></PersonEditorModal>;
}

function ClubHistory({ team, onEdit }) {
  const content = publishedHistoryFor(team);
  const stanzas = content.anthemLyrics.split(/\n{2,}/);
  const [expanded, setExpanded] = useState(false);
  const longReview = content.review.length > 900;
  return <div className="club-history">
    <article className="club-history-review"><header><h3>RESEÑA HISTÓRICA</h3>{onEdit && <button type="button" className="club-inline-edit" onClick={() => onEdit('review')}>✎ EDITAR</button>}</header><p className={longReview && !expanded ? 'clamped' : ''}>{content.review}</p>{longReview && <button type="button" className="club-more-button" onClick={() => setExpanded(value => !value)}>{expanded ? 'MOSTRAR MENOS' : 'LEER RESEÑA COMPLETA'}</button>}</article>
    <aside className="club-history-anthem"><header><h3>HIMNO DEL CLUB</h3>{onEdit && <button type="button" className="club-inline-edit" onClick={() => onEdit('anthem')}>✎ EDITAR</button>}</header>{content.anthemUrl ? <audio controls preload="metadata" src={content.anthemUrl}/> : <p className="empty-copy">Audio pendiente de publicación.</p>}<details><summary>VER LETRA</summary><div className="anthem-lyrics">{stanzas.map((stanza, index) => <p key={index}>{stanza}</p>)}</div></details></aside>
  </div>;
}

function ReviewEditor({ team, onChanged, onSaved }) {
  const initialReview = team?.review ?? '';
  const [review, setReview] = useState(initialReview);
  useEffect(() => setReview(initialReview), [team?.id, initialReview]);
  const mutation = useApiMutation((body, signal) => endpoints.updateTeamHistory(team.id, body, signal), { onSuccess: () => { onChanged(); onSaved?.(); } });
  const submit = event => { event.preventDefault(); mutation.execute({ review }); };
  return <form className="club-review-editor" onSubmit={submit}>
    <label>RESEÑA HISTÓRICA<textarea value={review} onChange={event => setReview(event.target.value)} placeholder="Describe la fundación, identidad, hitos y evolución histórica del club."/></label>
    <Button type="submit" disabled={mutation.loading}>GUARDAR RESEÑA</Button>
    <FormFeedback mutation={mutation}/>
  </form>;
}

function AnthemEditor({ team, onChanged, onSaved }) {
  const initialLyrics = team?.anthemLyrics ?? '';
  const initialUrl = team?.anthemUrl ?? '';
  const [anthemLyrics, setAnthemLyrics] = useState(initialLyrics);
  const [anthemUrl, setAnthemUrl] = useState(initialUrl);
  const [preview, setPreview] = useState('');
  useEffect(() => { setAnthemLyrics(initialLyrics); setAnthemUrl(initialUrl); setPreview(''); }, [team?.id, initialLyrics, initialUrl]);
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  const upload = useApiMutation((file, signal) => endpoints.uploadAudio(file, { entityType: 'team', entityId: team.id }, signal), {
    onSuccess: response => setAnthemUrl(response?.data?.secureUrl ?? response?.secureUrl ?? ''),
  });
  const mutation = useApiMutation((body, signal) => endpoints.updateTeamHistory(team.id, body, signal), { onSuccess: () => { onChanged(); onSaved?.(); } });

  const selectAnthem = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(current => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    upload.execute(file);
  };
  const submit = event => { event.preventDefault(); mutation.execute({ anthemLyrics, anthemUrl }); };

  return <form className="club-anthem-editor" onSubmit={submit}>
    <div className="club-anthem-audio">
      <label>ARCHIVO DEL HIMNO<input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4" disabled={upload.loading} onChange={selectAnthem}/></label>
      {(preview || anthemUrl) ? <audio controls preload="metadata" src={preview || anthemUrl}/> : <p className="empty-copy">Selecciona un archivo para escuchar la vista previa.</p>}
      <FormFeedback mutation={upload}/>
    </div>
    <label>LETRA DEL HIMNO<textarea value={anthemLyrics} onChange={event => setAnthemLyrics(event.target.value)} placeholder="Escribe aquí la letra completa del himno."/></label>
    <Button type="submit" disabled={mutation.loading || upload.loading}>GUARDAR HIMNO Y LETRA</Button>
    <FormFeedback mutation={mutation}/>
  </form>;
}

const simulatorPlayerId = player => String(player?.id ?? player?.playerId ?? '');
const idOfPlayer = simulatorPlayerId;
const SIMULATOR_STARTERS = 11;
const simulatorPlayerTeamId = player => String(player?.team?.id ?? player?.teamId ?? player?.team_id ?? '');
const simulatorPlayerTeamName = player => player?.team?.name ?? player?.teamName ?? player?.team_name ?? '';
const simulatorOriginalValue = player => Number(player?.gpValue ?? player?.price ?? 0) || 0;
// simPrice es el precio editado a mano en la simulación; nunca se guarda en el plantel real.
const hasEditedPrice = player => player?.simPrice !== undefined && player.simPrice !== null;
const simulatorValue = player => hasEditedPrice(player) ? player.simPrice : simulatorOriginalValue(player);
const simulatorLayoutSignature = roster => roster.map(player => `${simulatorPlayerId(player)}:${player.section}:${player.pitchX ?? ''}:${player.pitchY ?? ''}:${player.simPrice ?? ''}`).join('|');
const SPOT_CLEARANCE = 8;
const signedGp = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${gp(Math.abs(value))} GP`;

function normalizeSimulatorRoster(players) {
  return [...players]
    .sort((a, b) => (a.squadOrder ?? 999) - (b.squadOrder ?? 999))
    .map((player, index) => ({
      ...player,
      id: player.id ?? player.playerId,
      squadOrder: player.squadOrder ?? index + 1,
      section: player.section ?? ((player.squadOrder ?? index + 1) <= SIMULATOR_STARTERS ? 'starters' : 'substitutes'),
    }))
    .filter(player => simulatorPlayerId(player));
}

// Buscador propio (no <datalist>): muestra foto, media, club y precio, y añade con un clic o Enter.
function SimulatorPlayerSearch({ teamId, excludedIds, onAdd }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const term = useDebouncedValue(search.trim(), SIMULATOR_SEARCH_DELAY);
  const query = useApiQuery(signal => term.length >= SIMULATOR_SEARCH_MIN_LENGTH
    ? endpoints.players({ q: term, page: 1, pageSize: 25 }, signal)
    : Promise.resolve({ data: [] }), [term]);
  const results = (Array.isArray(query.data) ? query.data : [])
    .filter(player => simulatorPlayerId(player) && !excludedIds.has(simulatorPlayerId(player)))
    .slice(0, 8);
  useEffect(() => setHighlighted(0), [term]);
  const typed = search.trim();
  const waiting = typed.length >= SIMULATOR_SEARCH_MIN_LENGTH && (typed !== term || query.loading);
  const pick = player => {
    if (!player) return;
    onAdd(player);
    setSearch('');
    setOpen(false);
  };
  const onKeyDown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setHighlighted(index => Math.min(index + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted(index => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (!waiting) pick(results[highlighted]); }
    else if (event.key === 'Escape') setOpen(false);
  };
  const status = typed.length < SIMULATOR_SEARCH_MIN_LENGTH ? 'Escribe al menos 2 letras para buscar.'
    : waiting ? 'BUSCANDO JUGADORES…'
      : query.error ? 'No se pudieron cargar los jugadores.'
        : results.length ? '' : 'Sin resultados para esa búsqueda.';
  return <div className="squad-sim-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor="squad-sim-search-input">Añadir jugador a la simulación</label>
    <input id="squad-sim-search-input" type="search" autoComplete="off" role="combobox" aria-expanded={open} aria-controls="squad-sim-search-results" value={search} placeholder="Busca por nombre: Mbappé, Rodri, Saka…" onChange={event => { setSearch(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}/>
    {open && typed.length > 0 && <div className="squad-sim-results" id="squad-sim-search-results" role="listbox">
      {status && <p className="squad-sim-results-status">{status}</p>}
      {!waiting && results.map((player, index) => {
        const { rest: name } = splitPlayerName(player.name);
        const ownerId = simulatorPlayerTeamId(player);
        const owner = simulatorPlayerTeamName(player);
        return <button type="button" role="option" aria-selected={index === highlighted} key={simulatorPlayerId(player)} className={index === highlighted ? 'highlighted' : ''} onMouseEnter={() => setHighlighted(index)} onClick={() => pick(player)}>
          <PlayerFace src={player.faceUrl} name={name} className="squad-simulator-face"/>
          <span><b>{name}</b><small className={ownerId && ownerId !== String(teamId) ? 'taken' : ''}>{player.position ?? '—'} · OVR {player.overall ?? '—'} · {owner || 'AGENTE LIBRE'}</small></span>
          <strong>{gp(simulatorValue(player))} GP</strong>
          <i aria-hidden="true">+</i>
        </button>;
      })}
    </div>}
  </div>;
}

function SimulatorMeter({ label, value, detail, ratio, over }) {
  return <div className={`squad-sim-meter ${over ? 'over-budget' : ''}`}>
    <small>{label}</small>
    <b>{value}</b>
    {ratio !== undefined && <span className="squad-sim-meter-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}/></span>}
    <em>{detail}</em>
  </div>;
}

const SIMULATOR_VIEW_KEY = 'koinonia-simulador-vista';
const SIMULATOR_VIEWS = [['pitch', 'VISTA CANCHA'], ['table', 'VISTA TABLA']];

const simulatorDraftKey = teamId => `koinonia-simulador-plantel:${teamId}`;

// Copia del borrador en este navegador (la de la cuenta manda si es más nueva). Se acomoda al plantel real con rebaseSimulatorDraft.
function loadSimulatorDraft(teamId) {
  try {
    return JSON.parse(window.localStorage.getItem(simulatorDraftKey(teamId)) ?? 'null');
  } catch {
    return null;
  }
}

function saveSimulatorDraft(teamId, draft) {
  try {
    if (draft) window.localStorage.setItem(simulatorDraftKey(teamId), JSON.stringify(draft));
    else window.localStorage.removeItem(simulatorDraftKey(teamId));
  } catch {
    // el navegador no permite guardar preferencias locales; no es crítico.
  }
}

const SIMULATOR_SYNC_DELAY = 700;
const SYNC_LABELS = { saving: 'GUARDANDO…', saved: 'GUARDADO EN TU CUENTA', error: 'Sin conexión · solo en este dispositivo' };

/**
 * El plantel real cambia seguido (precios que se mueven con las ventas, orden, llegadas y salidas): en vez de botar el borrador, se
 * acomoda al plantel de hoy. Los jugadores del club toman sus datos reales y conservan lo simulado (titular o banca, lugar en la
 * cancha, precio editado); los que ya no están en el club salen del borrador; los fichajes simulados siguen; los que llegaron de
 * verdad y no estaban en el borrador entran a la banca. Las salidas simuladas siguen si el jugador todavía está en el club.
 */
function rebaseSimulatorDraft(draft, baseRoster, signature, teamId) {
  if (!draft || !Array.isArray(draft.roster) || !Array.isArray(draft.removed)) return null;
  const baseIds = baseRoster.map(simulatorPlayerId);
  if (draft.signature === signature) return { ...draft, baseIds };
  const base = new Map(baseRoster.map(player => [simulatorPlayerId(player), player]));
  // Quién era del club cuando se guardó: los borradores viejos no lo anotaban y se deduce del club del jugador.
  const wasOurs = new Set(draft.baseIds ?? []);
  const fromClub = player => wasOurs.has(simulatorPlayerId(player)) || simulatorPlayerTeamId(player) === String(teamId);
  const simulated = ({ section, pitchX, pitchY, simPrice }) => ({ section, pitchX, pitchY, ...(simPrice !== undefined ? { simPrice } : {}) });
  const removed = draft.removed.filter(player => base.has(simulatorPlayerId(player)))
    .map(player => ({ ...base.get(simulatorPlayerId(player)), ...(player.simPrice !== undefined ? { simPrice: player.simPrice } : {}) }));
  const removedIds = new Set(removed.map(simulatorPlayerId));
  const roster = draft.roster
    .filter(player => !removedIds.has(simulatorPlayerId(player)) && (base.has(simulatorPlayerId(player)) || !fromClub(player)))
    .map(player => (base.has(simulatorPlayerId(player)) ? { ...base.get(simulatorPlayerId(player)), ...simulated(player) } : player));
  const listed = new Set(roster.map(simulatorPlayerId));
  for (const player of baseRoster) {
    if (!listed.has(simulatorPlayerId(player)) && !removedIds.has(simulatorPlayerId(player))) roster.push({ ...player, section: 'substitutes', pitchX: undefined, pitchY: undefined });
  }
  return { ...draft, signature, baseIds, roster, removed };
}

function loadSimulatorView() {
  try {
    const stored = window.localStorage.getItem(SIMULATOR_VIEW_KEY);
    return SIMULATOR_VIEWS.some(([id]) => id === stored) ? stored : 'pitch';
  } catch {
    return 'pitch';
  }
}

function saveSimulatorView(view) {
  try {
    window.localStorage.setItem(SIMULATOR_VIEW_KEY, view);
  } catch {
    // el navegador no permite guardar preferencias locales; no es crítico.
  }
}

const BAND_ORDER = { gk: 0, def: 1, mid: 2, att: 3 };
const BAND_LABELS = { gk: 'ARQ', def: 'DEF', mid: 'MED', att: 'DEL' };

// Mismo plantel simulado que la cancha, en filas: el precio se edita igual (clic, Enter, Esc).
// Los titulares se ordenan por línea (arquero a delantero); cada sección muestra su subtotal.
function SimulatorTable({ starters, substitutes, simulation }) {
  const byLine = players => [...players].sort((left, right) => BAND_ORDER[bandFor(left.position)] - BAND_ORDER[bandFor(right.position)]);
  const startersFull = starters.length >= SIMULATOR_STARTERS;
  // Con 11 titulares, "↑ TITULAR" pide a quién reemplaza (los de su misma línea primero).
  const [choosing, setChoosing] = useState(null);
  const promote = player => {
    if (!startersFull) { simulation.onToggleSection(player); return; }
    setChoosing(current => current === simulatorPlayerId(player) ? null : simulatorPlayerId(player));
  };
  const replacementsFor = player => [...starters].sort((left, right) => Number(bandFor(right.position) === bandFor(player.position)) - Number(bandFor(left.position) === bandFor(player.position)) || BAND_ORDER[bandFor(left.position)] - BAND_ORDER[bandFor(right.position)]);
  const section = (title, players, isStarters) => <section className="squad-sim-group" key={title}>
    <header><h4>{title} <small>{players.length}</small></h4><span>{gp(players.reduce((total, player) => total + simulation.priceOf(player), 0))} GP</span></header>
    {players.length ? players.map(player => {
      const { rest: name } = splitPlayerName(player.name);
      const real = simulatorOriginalValue(player);
      const price = simulation.priceOf(player);
      const delta = price - real;
      const band = bandFor(player.position);
      const asking = !isStarters && startersFull && choosing === simulatorPlayerId(player);
      return <Fragment key={simulatorPlayerId(player)}><div className={`squad-sim-row ${simulation.isNew(player) ? 'is-new' : ''} ${simulation.isHighlighted(player) ? 'just-added' : ''}`}>
        <span className="squad-sim-player"><PlayerFace src={player.faceUrl} name={name} className="squad-simulator-face"/><span><b>{name || 'JUGADOR'}</b><small>{simulation.isNew(player) && <em className="squad-sim-tag new">NUEVO</em>}{simulation.isEdited(player) && <em className="squad-sim-tag edited">EDITADO</em>}</small></span></span>
        <i className={`squad-sim-pos band-${band}`} title={BAND_LABELS[band]}>{player.position ?? '—'}</i>
        <b className="squad-sim-ovr">{player.overall ?? '—'}</b>
        <span className="squad-sim-real"><small>REAL</small>{gp(real)}</span>
        <span className="squad-sim-price">
          <SimulationTools name={name} value={price} edited={simulation.isEdited(player)} onPrice={value => simulation.onPrice(player, value)} onReset={() => simulation.onResetPrice(player)} onRemove={() => simulation.onRemove(player)}/>
          {delta !== 0 && <small className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'} {gp(Math.abs(delta))}</small>}
        </span>
        <button type="button" className={`squad-sim-move ${isStarters ? 'to-bench' : 'to-pitch'}`} aria-expanded={isStarters ? undefined : asking} onClick={() => isStarters ? simulation.onToggleSection(player) : promote(player)} title={isStarters ? `Mandar a ${name} a la banca` : startersFull ? `Elegir a quién reemplaza ${name}` : `Hacer titular a ${name}`} aria-label={isStarters ? `Mandar a ${name} a la banca` : `Hacer titular a ${name}`}>{isStarters ? '↓ BANCA' : '↑ TITULAR'}</button>
      </div>
      {asking && <div className="squad-sim-replace" role="group" aria-label={`Elegir a quién reemplaza ${name}`}>
        <p>¿A QUIÉN REEMPLAZA <b>{name}</b>? <button type="button" onClick={() => setChoosing(null)}>CANCELAR</button></p>
        <div>{replacementsFor(player).map(starter => <button type="button" key={simulatorPlayerId(starter)} onClick={() => { simulation.onReplace(starter, player); setChoosing(null); }}><i className={`squad-sim-pos band-${bandFor(starter.position)}`}>{starter.position ?? '—'}</i><span>{splitPlayerName(starter.name).rest}</span></button>)}</div>
      </div>}
      </Fragment>;
    }) : <p className="empty-copy">SIN JUGADORES.</p>}
  </section>;
  return <div className="squad-sim-table" role="table" aria-label="Plantel simulado">
    <div className="squad-sim-table-head" aria-hidden="true"><span>JUGADOR</span><span>POS.</span><span>OVR</span><span>PRECIO REAL</span><span>PRECIO SIMULADO</span><span>ACCIÓN</span></div>
    {section('TITULARES', byLine(starters), true)}{section('SUPLENTES', byLine(substitutes), false)}
  </div>;
}

function SquadValueSimulator({ team, squad, balance }) {
  const baseRoster = normalizeSimulatorRoster(squad);
  const baseSignature = baseRoster.map(player => `${simulatorPlayerId(player)}:${player.gpValue ?? player.price ?? ''}:${player.section ?? ''}:${player.squadOrder ?? ''}:${player.pitchX ?? ''}:${player.pitchY ?? ''}`).join('|');
  const [simulatedRoster, setSimulatedRoster] = useState(baseRoster);
  const [removedPlayers, setRemovedPlayers] = useState([]);
  const [lastAdded, setLastAdded] = useState(null);
  const rostersRef = useRef(null);
  const [view, setView] = useState(loadSimulatorView);
  const changeView = next => { setView(next); saveSimulatorView(next); };

  // El borrador vive en la cuenta (se ve igual desde cualquier dispositivo); localStorage queda como copia
  // inmediata y respaldo si no hay conexión. Gana el más reciente (savedAt).
  const [syncState, setSyncState] = useState('idle');
  const syncTimer = useRef(null);
  const pendingSync = useRef(null);
  const editedSinceLoad = useRef(false);
  const flushSync = useCallback(async () => {
    window.clearTimeout(syncTimer.current);
    const job = pendingSync.current;
    if (!job) return;
    pendingSync.current = null;
    try {
      if (job.draft) await endpoints.saveSimulatorDraft(job.teamId, job.draft);
      else await endpoints.clearSimulatorDraft(job.teamId);
      setSyncState(pendingSync.current ? 'saving' : 'saved');
    } catch {
      setSyncState('error');
    }
  }, []);
  useEffect(() => () => { flushSync(); }, [flushSync]);

  // Tras cargar otro equipo o plantel, el efecto de guardado del mismo render se salta para no pisar su borrador.
  const skipSave = useRef(true);
  useEffect(() => {
    flushSync();
    const local = team?.id ? rebaseSimulatorDraft(loadSimulatorDraft(team.id), baseRoster, baseSignature, team.id) : null;
    skipSave.current = true;
    editedSinceLoad.current = false;
    setSyncState('idle');
    setSimulatedRoster(local?.roster ?? baseRoster);
    setRemovedPlayers(local?.removed ?? []);
    setLastAdded(null);
    if (!team?.id) return undefined;
    const controller = new AbortController();
    endpoints.simulatorDraft(team.id, controller.signal).then(response => {
      // Si ya empezó a editar mientras cargaba, manda lo que está haciendo.
      if (editedSinceLoad.current) return;
      const stored = response?.data?.draft ?? null;
      const remote = rebaseSimulatorDraft(stored, baseRoster, baseSignature, team.id);
      if (remote && (!local || (remote.savedAt ?? 0) > (local.savedAt ?? 0))) {
        skipSave.current = true;
        setSimulatedRoster(remote.roster);
        setRemovedPlayers(remote.removed);
        saveSimulatorDraft(team.id, remote);
      } else if (local) {
        // Solo vivía en este navegador (o es más nuevo): se sube a la cuenta.
        if (!remote || (local.savedAt ?? 0) > (remote.savedAt ?? 0)) {
          pendingSync.current = { teamId: team.id, draft: local.savedAt ? local : { ...local, savedAt: Date.now() } };
          flushSync();
        }
      } else if (stored && !remote) {
        // El borrador de la cuenta está dañado (no tiene plantel): se limpia.
        pendingSync.current = { teamId: team.id, draft: null };
        flushSync();
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [team?.id, baseSignature]);

  useEffect(() => {
    if (!lastAdded) return undefined;
    rostersRef.current?.querySelector('.just-added')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timeout = window.setTimeout(() => setLastAdded(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [lastAdded]);

  const baseIds = new Set(baseRoster.map(simulatorPlayerId));
  const simulatedIds = new Set(simulatedRoster.map(simulatorPlayerId));
  const simulatedValue = simulatedRoster.reduce((total, player) => total + simulatorValue(player), 0);
  const signings = simulatedRoster.filter(player => !baseIds.has(simulatorPlayerId(player)));
  const signingsCost = signings.reduce((total, player) => total + simulatorValue(player), 0);
  // Las salidas se valoran con el precio con que se venden (el editado, si lo hay).
  const departuresValue = removedPlayers.reduce((total, player) => total + simulatorValue(player), 0);
  const editedCount = simulatedRoster.filter(hasEditedPrice).length;
  // Cambiar el precio de alguien que ya está en el plantel mueve el valor del plantel, no el saldo.
  const movement = signingsCost - departuresValue;
  const projectedBalance = balance === null ? null : balance - movement;
  // El tope lo publica el servidor (squadValueLimit en la ficha del equipo); sin él no se valida.
  const budgetLimit = Number(team?.squadValueLimit) > 0 ? Number(team.squadValueLimit) : null;
  const capRoom = budgetLimit === null ? null : budgetLimit - simulatedValue;
  const exceedsLimit = capRoom !== null && capRoom < 0;
  const exceedsBalance = projectedBalance !== null && projectedBalance < 0;
  // Nómina simulada: la real + el sueldo de cada fichaje (10% de lo que cuesta) − el sueldo real de cada salida. No bloquea el mercado, pero pasado del tope el club no puede jugar.
  const contractsQuery = useApiQuery(signal => team?.id ? endpoints.teamContracts(team.id, signal).catch(() => ({ data: null })) : Promise.resolve({ data: null }), [team?.id]);
  const payrollInfo = contractsQuery.data?.projection?.enabled ? contractsQuery.data.projection : null;
  const realSalaries = new Map((contractsQuery.data?.contracts ?? []).filter(contract => contract.status === 'active').map(contract => [String(contract.playerId), contract.salary]));
  const signingsPayroll = signings.reduce((total, player) => total + roundStep(simulatorValue(player) * 0.1), 0);
  const departuresPayroll = removedPlayers.reduce((total, player) => total + (realSalaries.get(idOfPlayer(player)) ?? 0), 0);
  const simulatedPayroll = payrollInfo ? payrollInfo.payroll + signingsPayroll - departuresPayroll : null;
  const payrollCapValue = payrollInfo?.cap ?? null;
  const exceedsPayroll = simulatedPayroll !== null && payrollCapValue !== null && simulatedPayroll > payrollCapValue;
  const changed = simulatorLayoutSignature(simulatedRoster) !== simulatorLayoutSignature(baseRoster) || removedPlayers.length > 0;
  const starters = simulatedRoster.filter(player => player.section === 'starters');
  const substitutes = simulatedRoster.filter(player => player.section !== 'starters');
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return; }
    if (!team?.id) return;
    const draft = changed ? { signature: baseSignature, baseIds: baseRoster.map(simulatorPlayerId), roster: simulatedRoster, removed: removedPlayers, savedAt: Date.now() } : null;
    editedSinceLoad.current = true;
    saveSimulatorDraft(team.id, draft);
    pendingSync.current = { teamId: team.id, draft };
    setSyncState('saving');
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(flushSync, SIMULATOR_SYNC_DELAY);
  }, [simulatedRoster, removedPlayers]);
  const idOf = simulatorPlayerId;

  // Dónde ubica la cancha a alguien que entra como titular: su lugar previo si está libre,
  // el de un titular quitado (mejor si es de su misma línea) o el que le toca por posición.
  const startingSpot = (player, current) => {
    const defaults = defaultFormationPositions(current);
    const taken = current.map(item => pitchPositionFor(item, defaults));
    const free = spot => taken.every(other => Math.hypot(other.x - spot.x, other.y - spot.y) > SPOT_CLEARANCE);
    if (player.pitchX != null && player.pitchY != null && free({ x: player.pitchX, y: player.pitchY })) return { x: player.pitchX, y: player.pitchY };
    const sameBand = item => Number(bandFor(item.position) === bandFor(player.position));
    const vacated = removedPlayers
      .filter(item => item.section === 'starters' && item.pitchX != null && idOf(item) !== idOf(player))
      .sort((left, right) => sameBand(right) - sameBand(left))
      .map(item => ({ x: item.pitchX, y: item.pitchY }))
      .find(free);
    return vacated ?? pitchPositionFor({ ...player, pitchX: null, pitchY: null }, defaultFormationPositions([...current, { ...player, pitchX: null, pitchY: null }]));
  };

  const addPlayerToSimulation = player => {
    if (!player) return;
    setSimulatedRoster(current => {
      if (current.some(item => idOf(item) === idOf(player))) return current;
      const currentStarters = current.filter(item => item.section === 'starters');
      if (currentStarters.length >= SIMULATOR_STARTERS) return [...current, { ...player, section: 'substitutes', pitchX: null, pitchY: null }];
      const spot = startingSpot(player, currentStarters);
      return [...current, { ...player, section: 'starters', pitchX: spot.x, pitchY: spot.y }];
    });
    setRemovedPlayers(current => current.filter(item => idOf(item) !== idOf(player)));
    setLastAdded(idOf(player));
  };
  const swapPlayers = ({ starterId, substituteId, position }) => setSimulatedRoster(current => {
    const from = current.findIndex(item => idOf(item) === String(starterId));
    const to = current.findIndex(item => idOf(item) === String(substituteId));
    if (from < 0 || to < 0) return current;
    const next = [...current];
    next[from] = { ...current[to], section: 'starters', pitchX: position.x, pitchY: position.y };
    next[to] = { ...current[from], section: 'substitutes', pitchX: null, pitchY: null };
    return next;
  });
  // Titular ↔ banca sin tocar el resto: al volver a titular recupera su lugar si sigue libre.
  const toggleSection = player => setSimulatedRoster(current => {
    const target = current.find(item => idOf(item) === idOf(player));
    if (!target) return current;
    if (target.section === 'starters') return current.map(item => item === target ? { ...item, section: 'substitutes' } : item);
    const currentStarters = current.filter(item => item.section === 'starters');
    if (currentStarters.length >= SIMULATOR_STARTERS) return current;
    const spot = startingSpot(target, currentStarters);
    return current.map(item => item === target ? { ...item, section: 'starters', pitchX: spot.x, pitchY: spot.y } : item);
  });
  const moveOnPitch = updates => setSimulatedRoster(current => current.map(item => {
    const update = updates.find(candidate => String(candidate.id) === idOf(item));
    return update ? { ...item, pitchX: update.x, pitchY: update.y } : item;
  }));
  const reorderBench = bench => setSimulatedRoster(current => [...current.filter(item => item.section === 'starters'), ...bench]);
  const setPrice = (player, value) => setSimulatedRoster(current => current.map(item => idOf(item) === idOf(player)
    ? { ...item, simPrice: value === simulatorOriginalValue(item) ? undefined : value }
    : item));
  const removePlayer = player => {
    const position = player.section === 'starters' ? pitchPositionFor(player, defaultFormationPositions(starters)) : null;
    setSimulatedRoster(current => current.filter(item => idOf(item) !== idOf(player)));
    if (baseIds.has(idOf(player))) setRemovedPlayers(current => current.some(item => idOf(item) === idOf(player)) ? current : [...current, position ? { ...player, pitchX: position.x, pitchY: position.y } : player]);
  };
  const reset = () => { setSimulatedRoster(baseRoster); setRemovedPlayers([]); setLastAdded(null); };
  const lastAddedPlayer = simulatedRoster.find(player => idOf(player) === lastAdded);
  const statusMessage = exceedsLimit && exceedsBalance ? `Supera el tope de plantel por ${gp(-capRoom)} GP y el saldo por ${gp(-projectedBalance)} GP.`
    : exceedsLimit ? `Supera el tope de plantel por ${gp(-capRoom)} GP.`
      : exceedsBalance ? `Faltan ${gp(-projectedBalance)} GP de saldo para estos fichajes.`
        : projectedBalance === null ? 'El club no tiene saldo publicado: solo se valida el tope de plantel.'
          : 'Plantel válido: dentro del tope y del saldo disponible.';
  const changesDetail = [
    signings.length || removedPlayers.length ? `Fichajes ${gp(signingsCost)} GP · salidas ${gp(departuresValue)} GP` : '',
    editedCount ? `${editedCount} precio${editedCount === 1 ? '' : 's'} editado${editedCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ') || 'Sin cambios respecto del plantel real';
  const simulation = {
    priceOf: simulatorValue,
    isEdited: hasEditedPrice,
    isNew: player => !baseIds.has(idOf(player)),
    isHighlighted: player => idOf(player) === lastAdded,
    onSwap: swapPlayers,
    onMove: moveOnPitch,
    onReorder: reorderBench,
    onPrice: setPrice,
    onResetPrice: player => setPrice(player, simulatorOriginalValue(player)),
    onRemove: removePlayer,
    onToggleSection: toggleSection,
    onReplace: (starter, substitute) => swapPlayers({ starterId: idOf(starter), substituteId: idOf(substitute), position: pitchPositionFor(starter, defaultFormationPositions(starters)) }),
  };

  return <section className="club-card squad-value-simulator">
    <header className="squad-simulator-header"><div><p>Prueba fichajes y salidas sobre tu alineación. No cambia el plantel real y se guarda en tu cuenta.</p>{syncState !== 'idle' && <small className={`squad-sim-sync ${syncState}`} role="status">{SYNC_LABELS[syncState]}</small>}</div><button type="button" className="club-link-button" onClick={reset} disabled={!changed}>↺ RESTABLECER</button></header>
    <div className="squad-sim-summary"><div className="squad-sim-meters" aria-label="Resumen del presupuesto simulado">
      <SimulatorMeter label="VALOR DEL PLANTEL" value={`${gp(simulatedValue)} GP`} ratio={budgetLimit === null ? undefined : simulatedValue / budgetLimit} over={exceedsLimit} detail={budgetLimit === null ? 'Tope no publicado' : exceedsLimit ? `Excede el tope de ${gp(budgetLimit)} GP en ${gp(-capRoom)} GP` : `Tope ${gp(budgetLimit)} GP · quedan ${gp(capRoom)} GP`}/>
      {simulatedPayroll !== null && <SimulatorMeter label="NÓMINA ANUAL SIMULADA" value={`${gp(simulatedPayroll)} GP`} ratio={payrollCapValue ? simulatedPayroll / payrollCapValue : undefined} over={exceedsPayroll} detail={`${payrollCapValue ? `Tope ${gp(payrollCapValue)} GP (solo avisa) · ` : ''}Hoy ${gp(payrollInfo.payroll)} GP · altas +${gp(signingsPayroll)} · bajas −${gp(departuresPayroll)}`}/>}
      <SimulatorMeter label="SALDO TRAS LOS CAMBIOS" value={projectedBalance === null ? '—' : `${gp(projectedBalance)} GP`} over={exceedsBalance} detail={balance === null ? 'Saldo no publicado' : `Saldo actual ${gp(balance)} GP · movimiento ${signedGp(-movement)}`}/>
      <SimulatorMeter label="CAMBIOS" value={`${signings.length} ALTA${signings.length === 1 ? '' : 'S'} · ${removedPlayers.length} BAJA${removedPlayers.length === 1 ? '' : 'S'}`} detail={changesDetail}/>
    </div>
    {/* Un solo aviso: el estado del presupuesto y, debajo, lo que conviene revisar. */}
    <div className={`squad-simulator-status ${exceedsLimit || exceedsBalance || exceedsPayroll || starters.length !== SIMULATOR_STARTERS ? 'over-budget' : ''}`} role="status">
      <p>{statusMessage}</p>
      {(exceedsPayroll || starters.length !== SIMULATOR_STARTERS) && <ul>
        {exceedsPayroll && <li>LA NÓMINA PASA EL TOPE POR {gp(simulatedPayroll - payrollCapValue)} GP (NO PODRÍAS JUGAR HASTA ORDENARTE). EL SUELDO DE UN FICHAJE ES EL 10% DE LO QUE CUESTA.</li>}
        {starters.length !== SIMULATOR_STARTERS && <li>TITULARES: {starters.length} DE {SIMULATOR_STARTERS}.</li>}
      </ul>}
    </div></div>
    <SimulatorPlayerSearch teamId={team?.id} excludedIds={simulatedIds} onAdd={addPlayerToSimulation}/>
    {lastAddedPlayer && <p className="squad-simulator-player-note" role="status">✓ {splitPlayerName(lastAddedPlayer.name).rest} AÑADIDO A {lastAddedPlayer.section === 'starters' ? 'TITULARES' : 'SUPLENTES'}{simulatorPlayerTeamId(lastAddedPlayer) && simulatorPlayerTeamId(lastAddedPlayer) !== String(team?.id) ? ` · HOY JUEGA EN ${simulatorPlayerTeamName(lastAddedPlayer)}` : ''}.</p>}
    <nav className="club-squad-modes squad-sim-views" aria-label="Vista del simulador">{SIMULATOR_VIEWS.map(([id, label]) => <button type="button" key={id} className={view === id ? 'active' : ''} aria-pressed={view === id} onClick={() => changeView(id)}>{label}</button>)}</nav>
    <div className="squad-simulator-board" ref={rostersRef}>{view === 'table' ? <SimulatorTable starters={starters} substitutes={substitutes} simulation={simulation}/> : <PitchBoard team={team} starters={starters} substitutes={substitutes} simulation={simulation}/>}</div>
    {removedPlayers.length > 0 && <section className="squad-simulator-removed"><h4>SALIDAS SIMULADAS <small>{removedPlayers.length}</small></h4><ul>{removedPlayers.map(player => { const { rest: name } = splitPlayerName(player.name); return <li key={idOf(player)}><span><PlayerFace src={player.faceUrl} name={name} className="squad-simulator-face"/><b>{name || 'JUGADOR'}</b></span><small>{player.position ?? '—'}</small><strong>{gp(simulatorValue(player))} GP</strong><button type="button" className="squad-simulator-restore" onClick={() => addPlayerToSimulation(player)}>↩ DEVOLVER</button></li>; })}</ul></section>}
  </section>;
}

// Dos fichas con la misma forma (sin subpestañas): la del presidente (Mi club) y la pública de otro club. Cada cosa en la
// pestaña donde uno la buscaría: la plata en Nómina y Caja, el recinto en Estadio, la gente en Hinchada (con el clásico) y
// lo que se vende (TV, conciertos, La Velada) en Negocios.
// Pestañas por importancia: lo del día a día primero (plantel, mensajes, directiva, plata), después rivales, estadio con su
// hinchada, negocios e historia. Nómina y caja van juntas en Finanzas; el clásico y el cara a cara, en Rivales.
const OWNER_TABS = [
  { id: 'plantel', label: 'Plantel' }, { id: 'mensajes', label: 'Mensajes' }, { id: 'directiva', label: 'Directiva' },
  { id: 'nomina', label: 'Finanzas' }, { id: 'rivales', label: 'Rivales' }, { id: 'estadio', label: 'Estadio' },
  { id: 'negocios', label: 'Negocios' }, { id: 'historia', label: 'Historia' },
];
const VISITOR_TABS = [
  { id: 'plantel', label: 'Plantel' }, { id: 'partidos', label: 'Partidos' }, { id: 'rivales', label: 'Rivales' },
  { id: 'estadio', label: 'Estadio' }, { id: 'nomina', label: 'Nómina' }, { id: 'historia', label: 'Historia' },
];
// Enlaces viejos (avisos, marcadores): a qué pestaña (y a qué parte de ella) caen ahora.
const BUSINESS = new Set(['eventos', 'velada', 'tv', 'conciertos']);
const OWNER_MOVED = { resumen: ['plantel'], bandeja: ['mensajes'], central: ['directiva'], movimientos: ['nomina', 'caja'], caja: ['nomina', 'caja'], eventos: ['negocios', 'eventos'], tv: ['negocios', 'tv'], auspicio: ['negocios', 'tv'], catalogo: ['estadio'], fichajes: ['historia'], clasico: ['rivales'], hinchada: ['estadio', 'hinchada'] };
const OWNER_ELSEWHERE = { seguimiento: '/transferencias?tab=seguidos', partidos: '/partidos', tabla: '/torneos' };
const VISITOR_MOVED = { resumen: ['plantel'], tabla: ['partidos'], finanzas: ['nomina'], movimientos: ['nomina'], caja: ['nomina'], directiva: ['plantel'], negocios: ['estadio'], eventos: ['estadio'], tv: ['estadio'], auspicio: ['estadio'], catalogo: ['estadio'], fichajes: ['historia'], clasico: ['rivales'], hinchada: ['estadio', 'hinchada'] };
/** Pestaña (y sección) a la que cae un enlace, contando los que dependen de `ver` (finanzas y estadio se partieron). */
function movedFor(tab, ver, ownerMode) {
  if (ownerMode && tab === 'finanzas') return ['nomina', ver === 'simulador' || ver === 'caja' ? ver : null];
  if (ownerMode && tab === 'estadio' && BUSINESS.has(ver)) return ['negocios', ver];
  return (ownerMode ? OWNER_MOVED : VISITOR_MOVED)[tab] ?? [tab, null];
}

/** Simulador de finanzas: un solo lugar con dos modos (fichajes y salidas del plantel, o contratos y nómina). */
function FinanceSimulator({ team, squad, balance, onChanged, onTab, currentPosition }) {
  const [mode, setMode] = useState('plantel');
  return <section className="finance-sim">
    <nav className="finance-sim-modes" role="tablist" aria-label="Qué quieres simular">
      <button type="button" role="tab" aria-selected={mode === 'plantel'} className={mode === 'plantel' ? 'on' : ''} onClick={() => setMode('plantel')}>SIMULAR FICHAJES</button>
      <button type="button" role="tab" aria-selected={mode === 'contratos'} className={mode === 'contratos' ? 'on' : ''} onClick={() => setMode('contratos')}>SIMULAR CONTRATOS</button>
    </nav>
    {mode === 'plantel'
      ? <div className="club-budget-tab"><SquadValueSimulator team={team} squad={squad} balance={balance}/></div>
      : <PayrollTab team={team} balance={balance} onChanged={onChanged} forcedView="proyeccion" currentPosition={currentPosition} onTab={id => (id === 'finanzas' ? setMode('plantel') : onTab?.(id))}/>}
  </section>;
}

const finishedMatches = (matches, teamId, { leagueOnly = false } = {}) => matches
  .filter(match => match.status === 'finished' && !(leagueOnly && match.stage === 'preseason') && (match.homeTeam?.id === teamId || match.awayTeam?.id === teamId))
  .sort((left, right) => String(right.finishedAt ?? '').localeCompare(String(left.finishedAt ?? '')));

function FormPills({ matches, teamId }) {
  const recent = finishedMatches(matches, teamId, { leagueOnly: true }).slice(0, 5).reverse();
  if (!recent.length) return null;
  return <div className="club-form" aria-label="Racha de los últimos partidos">{recent.map(match => {
    const result = resultFor(match, teamId);
    return <EntityLink to="match" id={match.id} key={match.id} className={`club-form-pill form-${result}`} title={`${match.homeTeam?.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam?.name}`}>{result}</EntityLink>;
  })}</div>;
}

function ClubTable({ standings, teamId, teams }) {
  const teamIndex = new Map(teams.map(team => [team.id, team]));
  if (!standings.length) return <p className="empty-copy">SIN TABLA PUBLICADA.</p>;
  return <><LiveTableStatus rows={standings}/><div className="table-scroll"><table className="league-table club-league-table"><thead><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>PTS</th></tr></thead><tbody>{standings.map((row, index) => <tr key={row.team_id} className={liveRowClass(row, `${row.team_id === teamId ? 'current-team' : ''} ${playoffZone(index, standings.length)}`.trim())}><td><LivePosition position={index + 1}/></td><td><EntityLink to="team" id={row.team_id} className="table-team-link"><LiveMovement row={row}/><TeamMark team={{ ...row, ...(teamIndex.get(row.team_id) ?? {}) }}/>{row.name}{row.isPlayingLive && <em className="live-team-tag">EN VIVO</em>}</EntityLink></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td><td><b>{row.points}</b></td></tr>)}</tbody></table></div><PlayoffLegend total={standings.length}/></>;
}

const MOVE_LABELS = { purchase: 'COMPRA', assignment: 'ASIGNADO', transfer: 'TRASPASO', release: 'LIBERADO', trade: 'TRUEQUE' };

function moveDetail(move) {
  const other = move.otherTeam ? <EntityLink to="team" id={move.otherTeam.id}>{move.otherTeam.name}</EntityLink> : null;
  if (move.type === 'purchase') return move.origin === 'new' ? 'INSCRITO DESDE eFOOTBALLDB' : 'AGENTE LIBRE DE LA LIGA';
  if (move.type === 'assignment') return 'ASIGNADO SIN COSTO';
  if (move.type === 'release') return 'QUEDA COMO AGENTE LIBRE';
  if (move.type === 'trade') return <>A CAMBIO DE <EntityLink to="player" id={move.givenPlayer?.id}>{move.givenPlayer?.name}</EntityLink> · CON {other}</>;
  return <>{move.direction === 'in' ? 'DESDE' : 'HACIA'} {other}</>;
}

function moveAmount(move) {
  if (move.type === 'trade') return move.gpPaid ? `PAGA ${gp(move.gpPaid)} GP` : move.gpReceived ? `RECIBE ${gp(move.gpReceived)} GP` : 'SIN GP';
  if (move.type === 'release') return `RECIBE ${gp(move.gpAmount)} GP`;
  if (move.type === 'assignment') return 'SIN COSTO';
  return `${gp(move.gpAmount)} GP`;
}

function ClubTransfers({ teamId }) {
  const moves = useApiQuery(signal => endpoints.teamMoves(teamId, signal), [teamId]);
  const rows = Array.isArray(moves.data) ? moves.data : [];
  if (moves.loading) return <p className="empty-copy">CARGANDO FICHAJES…</p>;
  if (moves.error) return <p className="empty-copy">No se pudieron cargar los fichajes.</p>;
  if (!rows.length) return <p className="empty-copy">Este club aún no registra movimientos.</p>;
  const spent = rows.reduce((sum, move) => sum + (move.direction === 'in' && move.type !== 'trade' ? move.gpAmount ?? 0 : 0) + (move.type === 'trade' ? move.gpPaid ?? 0 : 0), 0);
  const earned = rows.reduce((sum, move) => sum + (move.direction === 'out' ? move.gpAmount ?? 0 : 0) + (move.type === 'trade' ? move.gpReceived ?? 0 : 0), 0);
  return <>
    <p className="club-transfer-balance">INVERTIDO <b>{gp(spent)} GP</b> · RECIBIDO <b>{gp(earned)} GP</b></p>
    <div className="club-transfers">{rows.map(move => <article key={move.id} className={`move-${move.type} move-${move.direction}`}>
      <b className="club-transfer-kind">{move.type === 'transfer' ? (move.direction === 'in' ? 'LLEGA' : 'SALE') : MOVE_LABELS[move.type]}</b>
      <span><EntityLink to="player" id={move.player?.id}>{move.player?.name ?? 'JUGADOR'}</EntityLink><small>{moveDetail(move)}{move.date ? ` · ${formatMoveDate(move.date)}` : ''}</small></span>
      <strong>{moveAmount(move)}</strong>
    </article>)}</div>
  </>;
}

const formatMoveDate = value => {
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
};

function ClubScorers({ teamId, limit = 5, tournaments = [] }) {
  const scorers = useApiQuery(signal => endpoints.teamScorers(teamId, {}, signal), [teamId]);
  const rows = (Array.isArray(scorers.data) ? scorers.data : []).slice(0, limit);
  return <section className="club-card"><h3>GOLEADORES <small>{tournaments.length === 1 ? tournaments[0].name : 'TORNEOS ACTIVOS'}</small></h3>
    {scorers.loading ? <p className="empty-copy">CARGANDO…</p> : scorers.error ? <p className="empty-copy">NO DISPONIBLE.</p> : rows.length ? <ol className="club-scorers">{rows.map((row, index) => <li key={row.playerId}><b>{index + 1}</b><PlayerFace src={row.faceUrl} name={row.name}/><EntityLink to="player" id={row.playerId}>{row.name}</EntityLink><strong>{row.goals} <small>GOL{row.goals === 1 ? '' : 'ES'}</small></strong></li>)}</ol> : <p className="empty-copy">Aún sin goles en torneos activos.</p>}
  </section>;
}

function HonoursList({ honours, tours = [], historyError }) {
  return <section className="club-card"><h3>PALMARÉS <small>{honours.length} TÍTULO{honours.length === 1 ? '' : 'S'}</small></h3>{honours.length ? <div className="honours-list">{honours.map(item => <article key={item.id}><span aria-hidden="true">★</span><b>{item.name}</b>{item.season && <small>{item.season}</small>}</article>)}</div> : !tours.length && <p className="empty-copy">Aún no hay títulos registrados.</p>}
    {tours.length > 0 && <><h4 className="honours-subtitle">GIRAS <small>{tours.length}</small></h4>
      <div className="honours-list honours-list-tours">{tours.map(tour => <article key={tour.id}><span aria-hidden="true">🏆</span><b>{tour.name}</b>{tour.season && <small title={tour.season}>EN {seasonTag(tour.season).toUpperCase()}</small>}</article>)}</div></>}{historyError && <p className="honours-api-note">No fue posible consultar el historial del club.</p>}</section>;
}

const ovrAverage = value => value === null ? '—' : value.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function averagesOf(players) {
  const rated = players.filter(player => player.overall != null);
  const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  return { count: rated.length, base: mean(rated.map(player => player.overall)), withCoach: mean(rated.map(player => player.overallWithCoach ?? player.overall)) };
}

/** La media en chico, para la esquina de la cancha: XI, banca y todos (con DT, si suma). */
function SquadAveragesBadge({ starters, substitutes }) {
  const groups = [['XI', starters], ['Banca', substitutes], ['Todos', [...starters, ...substitutes]]].map(([label, players]) => ({ label, ...averagesOf(players) }));
  const coachHelps = [...starters, ...substitutes].some(hasCoachBoost);
  return <dl className="ovr-badge" title={coachHelps ? 'Media eFootball (entre paréntesis, con los potenciadores del DT)' : 'Media eFootball'}>
    <dt>OVR</dt>
    {groups.map(group => <div key={group.label}><dt>{group.label}</dt><dd>{ovrAverage(group.base)}{coachHelps && group.withCoach !== null && <small> ({ovrAverage(group.withCoach)})</small>}</dd></div>)}
  </dl>;
}

// Media de la plantilla separando el 11 inicial: dos clubes con el mismo promedio total pueden tener titulares muy distintos.
function SquadAverages({ starters, substitutes }) {
  const groups = [['XI INICIAL', starters], ['BANCA', substitutes], ['PLANTILLA COMPLETA', [...starters, ...substitutes]]].map(([label, players]) => ({ label, ...averagesOf(players) }));
  const coachHelps = [...starters, ...substitutes].some(hasCoachBoost);
  return <section className="club-card squad-averages"><h3>MEDIA DE LA PLANTILLA <small>OVR</small></h3>
    <div className="squad-averages-grid">{groups.map(group => <div className="squad-average" key={group.label}>
      <small>{group.label}</small>
      <b>{ovrAverage(group.base)}</b>
      {coachHelps && <em title="Media contando los potenciadores del DT"><span>CON DT</span> {ovrAverage(group.withCoach)}</em>}
      <i>{group.count} JUGADOR{group.count === 1 ? '' : 'ES'}</i>
    </div>)}</div>
    {!coachHelps && <p className="squad-averages-note">El DT no suma potenciadores a esta plantilla: la media es la base.</p>}
  </section>;
}

/** Plantel: la cancha con el once, la media y la lista. El presi además ve roles y ánimo, y edita el plantel en una ventana. */
// Vistas del plantel: la cancha (con presi, DT y goleadores), la tabla de titulares y suplentes, y (para el presi) los roles
// y el ánimo. La que elegiste se recuerda en este navegador.
const SQUAD_VIEW_KEY = 'koinonia:plantel-vista';
function useSquadView(ownerMode) {
  const [view, setView] = useState(() => {
    try { return window.localStorage.getItem(SQUAD_VIEW_KEY) ?? 'cancha'; } catch { return 'cancha'; }
  });
  const choose = next => {
    setView(next);
    try { window.localStorage.setItem(SQUAD_VIEW_KEY, next); } catch { /* sin almacenamiento: solo por esta vez */ }
  };
  return [view === 'roles' && !ownerMode ? 'cancha' : view, choose];
}

function RosterTable({ starters, substitutes, marks = null, incoming = [] }) {
  return <div className="roster-panel club-roster"><h3>TITULARES <small>{starters.length} / 11</small></h3><div className="roster-table-scroll"><RosterHeader/><div className="roster-list">{starters.length ? starters.map(player => <PlayerRow player={player} mark={marks?.get(player.id)} key={player.id}/>) : <p className="empty-copy">No hay titulares definidos.</p>}</div></div><h3>SUPLENTES <small>{substitutes.length}</small></h3><div className="roster-table-scroll"><RosterHeader/><div className="roster-list substitutes">{substitutes.length ? substitutes.map(player => <PlayerRow player={player} mark={marks?.get(player.id)} key={player.id}/>) : <p className="empty-copy">No hay suplentes registrados.</p>}</div></div>{incoming.length > 0 && <><h3>POR LLEGAR <small>{incoming.length}</small></h3><div className="roster-table-scroll"><RosterHeader/><div className="roster-list incoming">{incoming.map(player => <PlayerRow player={player} incoming={player.incoming} key={player.id}/>)}</div></div></>}</div>;
}

function SquadTab({ team, squad, starters, substitutes, onChanged, ownerMode, tournaments, president, coach }) {
  const { canEditTeam } = useAuth();
  const canEdit = canEditTeam(team.id);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useSquadView(ownerMode);
  const views = [['cancha', 'Cancha'], ['tabla', 'Tabla'], ...(ownerMode ? [['roles', 'Roles y ánimo']] : [])];
  const pending = useApiQuery(signal => endpoints.teamPendingMoves(team.id, signal).catch(() => ({ data: null })), [team.id]);
  const [timing, setTiming] = useState('ahora');
  const marks = leavingMarks(pending.data);
  const hasPending = pendingSummary(pending.data).any;
  const projected = hasPending && timing === 'despues' ? projectedRoster([...starters, ...substitutes], pending.data) : null;
  const showTable = projected && view !== 'roles';
  return <div className="club-squad-tab">
    <PendingMovesCard data={pending.data} mode={hasPending ? timing : 'ahora'} onMode={setTiming}/>
    <nav className="squad-views" aria-label="Vista del plantel">
      {views.map(([id, label]) => <button type="button" key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
      {canEdit && <Button size="sm" variant="ghost" icon="shirt" onClick={() => setEditing(true)}>Editar dorsales</Button>}
    </nav>
    {showTable && <RosterTable starters={projected.stay.filter(player => starters.includes(player))} substitutes={projected.stay.filter(player => !starters.includes(player))} incoming={projected.incoming}/>}
    {!showTable && view === 'cancha' && <div className="squad-top">
      <PitchBoard team={team} starters={starters} substitutes={substitutes} marks={marks} onChanged={onChanged} readOnly={!canEdit} aside={<SquadAveragesBadge starters={starters} substitutes={substitutes}/>}/>
      <div className="squad-side">
        <div className="squad-leaders"><LeaderCard {...president}/><LeaderCard {...coach}/></div>
        <ClubScorers teamId={team.id} limit={5} tournaments={tournaments}/>
      </div>
    </div>}
    {!showTable && view === 'tabla' && <RosterTable starters={starters} substitutes={substitutes} marks={marks}/>}
    {view === 'roles' && <RolesPanel team={team}/>}
    {editing && <PersonEditorModal title="EDITAR DORSALES" onClose={() => setEditing(false)}><div className="club-squad-editor"><SquadEditor team={team} squad={squad} onChanged={onChanged}/></div></PersonEditorModal>}
  </div>;
}

/** Lleva a la parte pedida de una pestaña larga (#…&ver=velada) cuando ya está dibujada. */
function useScrollTo(anchor, ready) {
  useEffect(() => {
    if (!anchor || !ready) return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      const node = document.getElementById(`ver-${anchor}`);
      tries += 1;
      if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.clearInterval(timer); }
      if (tries > 40) window.clearInterval(timer);
    }, 150);
    return () => window.clearInterval(timer);
  }, [anchor, ready]);
}

export function TeamDetailPage({ team, teams = [], tournaments = [], squad, standings, standingsTournamentId = null, matches = [], recentMatches = [], history = [], historyError, loading, tab = null, msg = null, ver = null, navigate, onTab, onChanged, onProjection = null }) {
  const { canEditTeam, isPresidentOf, isAdmin } = useAuth();
  const canEdit = canEditTeam(team?.id);
  // Un admin ve en cada club lo mismo que su presidente (mensajes, nómina…) para poder ayudarlo.
  const ownerMode = isPresidentOf(team?.id) || isAdmin;
  const [historyEditor, setHistoryEditor] = useState('');
  const [personEditor, setPersonEditor] = useState('');
  const [personRevision, setPersonRevision] = useState(0);
  const [crestEditorOpen, setCrestEditorOpen] = useState(false);
  const [coversOpen, setCoversOpen] = useState(false);
  // Finanzas: contratos (nómina), caja (movimientos) o simulador.
  const [financeView, setFinanceView] = useState('contratos');
  const inbox = useApiQuery(signal => ownerMode && team?.id ? endpoints.teamInbox(team.id, signal).catch(() => ({ data: null })) : Promise.resolve({ data: null }), [team?.id, ownerMode]);
  const { version: notificationsVersion } = useNotifications();
  const firstVersion = useRef(notificationsVersion);
  useEffect(() => { if (notificationsVersion !== firstVersion.current) inbox.retry(); }, [notificationsVersion]);
  const unread = inbox.data?.unread ?? 0;
  const tabs = (ownerMode ? OWNER_TABS : VISITOR_TABS).map(item => (item.id === 'mensajes' ? { ...item, badge: unread } : item));
  const elsewhere = ownerMode ? OWNER_ELSEWHERE[tab] : null;
  const [movedTab, movedAnchor] = movedFor(tab, ver, ownerMode);
  const activeTab = tabs.some(item => item.id === movedTab) ? movedTab : tabs[0].id;
  const anchor = movedAnchor ?? (movedTab === tab ? ver : null);
  useEffect(() => { if (elsewhere && navigate) navigate(elsewhere); }, [elsewhere]);
  useEffect(() => { if (ownerMode && activeTab === 'nomina' && ['simulador', 'caja'].includes(anchor)) setFinanceView(anchor); }, [activeTab, anchor, ownerMode]);
  useEffect(() => { if (activeTab !== 'nomina') setFinanceView('contratos'); }, [activeTab]);
  useScrollTo(anchor, !loading && Boolean(team));
  const liveStandings = useLiveStandings(standingsTournamentId);
  const displayStandings = Array.isArray(liveStandings.data) && liveStandings.data.length ? liveStandings.data : standings;
  const roster = [...squad].sort((a, b) => (a.squadOrder ?? 999) - (b.squadOrder ?? 999));
  const starters = roster.filter(player => player.section === 'starters' || (!player.section && player.squadOrder <= 11));
  const substitutes = roster.filter(player => player.section === 'substitutes' || (!player.section && player.squadOrder > 11));
  const rank = displayStandings.findIndex(row => row.team_id === team?.id) + 1;
  const standing = displayStandings.find(row => row.team_id === team?.id);
  const photo = team ? presidentPhoto(team) : '';
  const presidentName = team?.president?.name ?? team?.presidentName ?? 'Sin asignar';
  const coachName = teamCoachName(team);
  const managerPhoto = team ? teamCoachPhoto(team) : '';
  const presidentProfile = readPersonProfile('president', team?.president);
  const coachEntity = team?.coach ?? team?.manager ?? ((team?.coachId ?? team?.managerId) ? { id: team.coachId ?? team.managerId } : null);
  const coachProfile = readPersonProfile('coach', coachEntity);
  const honours = team ? clubHonours(team, history) : [];
  const balance = teamBalance(team);
  const teamIndex = new Map(teams.map(item => [item.id, item]));
  const resolveTeam = matchTeam => matchTeam ? { ...matchTeam, ...(teamIndex.get(matchTeam.id ?? matchTeam.team_id) ?? {}) } : matchTeam;
  const colors = team?.colors ?? {};
  const position = (displayStandings ?? []).findIndex(row => (row.team_id ?? row.teamId) === team?.id) + 1 || null;

  if (loading || !team) return <main className="screen"><div className="arcade-state">Cargando el club…</div></main>;
  const hero = <div className="club-crest-wrap screen-crest" style={{ '--club-primary': colors.primary ?? '#062764' }}><TeamMark team={team} className="club-crest"/>{canEdit && <button type="button" className="club-crest-edit" onClick={() => setCrestEditorOpen(true)} aria-label="Editar escudo y nombre del club" title="Editar escudo y nombre">✎</button>}</div>;
  const isMine = isPresidentOf(team.id);
  // La franja del banner alterna los tres colores del club: primario, secundario y terciario (si no los tiene, los de la liga).
  const stripe = { '--stripe-a': colors.primary ?? 'var(--c-red)', '--stripe-b': colors.secondary ?? colors.primary ?? 'var(--c-yellow)', '--stripe-c': colors.tertiary ?? colors.secondary ?? 'var(--c-red)' };
  return <Screen className="club-screen" style={stripe} corner={canEdit ? <Button size="sm" variant="ghost" icon="camera" onClick={() => setCoversOpen(true)}>Portadas</Button> : null} kicker={isMine ? 'Mi club' : team.kind === 'national_team' ? 'Selección' : 'Club'} title={team.name} hero={hero}
    intro={[nicknameTitle((team.nicknames ?? []).find(item => item.primary)?.label), rank > 0 ? `${rank}.º en la liga${standing ? ` con ${standing.points} puntos` : ''}.` : null].filter(Boolean).join(' · ') || null}
    actions={<div className="club-strip">
      <div><small>Valor del plantel</small><b>{gp(team.squadValue)}</b></div>
      {ownerMode && <div><small>En caja</small><b>{balance === null ? '—' : gp(balance)}</b></div>}
      <FormPills matches={matches} teamId={team.id}/>
      {onProjection && <Button size="sm" variant="ghost" className="club-projection-button" onClick={onProjection}>¿Qué necesita para clasificar?</Button>}
    </div>}
    tabs={tabs} active={activeTab} onTab={id => onTab?.(id)}>
    {isAdmin && !isMine && <p className="club-actas-banner" role="status">Modo admin: ves todo de {team.name} y puedes actuar por su presidente. Lo que hagas queda registrado a tu nombre.</p>}

    {activeTab === 'plantel' && <SquadTab team={team} squad={squad} starters={starters} substitutes={substitutes} onChanged={onChanged} ownerMode={ownerMode} tournaments={tournaments}
      president={{ key: `president-${personRevision}`, photo, name: presidentName, age: presidentProfile.age, country: presidentProfile.country, customFields: team.president?.customFields, role: 'PRESIDENTE', reputation: team.president?.reputation ?? null, onReputation: () => setPersonEditor('reputation'), onEdit: canEdit ? () => setPersonEditor('president') : undefined }}
      coach={{ key: `coach-${personRevision}`, photo: managerPhoto, name: coachName, age: coachProfile.age, country: coachProfile.country, customFields: team.coach?.customFields, role: 'DT', manager: team.coach?.manager, onEdit: canEdit ? () => setPersonEditor('coach') : undefined }}/>}
    {activeTab === 'mensajes' && <MessagesTab team={team} onTab={onTab} onRead={inbox.retry} highlightId={msg}/>}
    {activeTab === 'directiva' && <DirectivaTab team={team} balance={balance} onReputation={() => setPersonEditor('reputation')}/>}
    {activeTab === 'nomina' && (!ownerMode
      ? <PayrollTab team={team} balance={balance} onChanged={onChanged} onTab={onTab} forcedView="actual" currentPosition={position}/>
      : <div className="finance-page">
        <div className="screen-toolbar finance-views" role="tablist" aria-label="Finanzas">
          {[['contratos', 'Contratos'], ['caja', 'Caja'], ['simulador', 'Simulador']].map(([id, label]) => <Button key={id} size="sm" variant={financeView === id ? 'primary' : 'ghost'} role="tab" aria-selected={financeView === id} onClick={() => setFinanceView(id)}>{label}</Button>)}
        </div>
        {financeView === 'contratos' && <PayrollTab team={team} balance={balance} onChanged={onChanged} onTab={id => (id === 'finanzas' ? setFinanceView('simulador') : onTab?.(id))} forcedView="actual" currentPosition={position}/>}
        {financeView === 'caja' && <LedgerTab team={team} balance={balance}/>}
        {financeView === 'simulador' && <FinanceSimulator team={team} squad={squad} balance={balance} onChanged={onChanged} onTab={onTab} currentPosition={position}/>}
      </div>)}
    {activeTab === 'partidos' && <div className="club-matches-page"><ClubStandingSnippet standings={displayStandings} teamId={team.id} teams={teams} onMore={() => navigate?.('/torneos')}/><ClubMatches matches={matches} teams={teams} teamId={team.id}/></div>}
    {activeTab === 'estadio' && <div className="stadium-page">
      <VenueTab team={team}/>
      <section id="ver-hinchada"><FansTab team={team}/></section>
      {!ownerMode && <ClubKit team={team}/>}
    </div>}
    {activeTab === 'rivales' && <div className="stadium-page">
      <RivalryTab team={team} teams={teams}/>
      <HeadToHeadTable team={team} teams={teams}/>
    </div>}
    {activeTab === 'negocios' && <div className="stadium-page">
      <section id="ver-camiseta"><ClubKit team={team} onChanged={onChanged}/></section>
      <section id="ver-inversiones"><ClubInvestments team={team} onChanged={onChanged}/></section>
      <section id="ver-tv"><TvRightsTab team={team} onChanged={onChanged}/></section>
      <section id="ver-eventos"><EventsTab team={team} onChanged={onChanged}/></section>
    </div>}
    {activeTab === 'historia' && <div className="club-history-tab-content">
      <HonoursList honours={honours} tours={team?.tourTitles ?? []} historyError={historyError}/>
      <ClubNicknames team={team} canEdit={canEdit} onChanged={onChanged}/>
      <ClubHistory team={team} onEdit={canEdit ? setHistoryEditor : undefined}/>
      <ClubTransfers teamId={team.id}/>
    </div>}

    {personEditor === 'president' && <PersonEditorModal title="EDITAR PRESIDENTE" onClose={() => setPersonEditor('')}><PresidentForm team={team} onChanged={onChanged} onSaved={() => { setPersonRevision(value => value + 1); setPersonEditor(''); }}/></PersonEditorModal>}
    {personEditor === 'reputation' && <ReputationModal teamId={team.id} onClose={() => setPersonEditor('')}/>}
    {personEditor === 'coach' && <PersonEditorModal title="EDITAR DIRECTOR TÉCNICO" onClose={() => setPersonEditor('')}><CoachForm team={team} onChanged={onChanged} onSaved={() => { setPersonRevision(value => value + 1); setPersonEditor(''); }}/></PersonEditorModal>}
    {crestEditorOpen && <PersonEditorModal title="EDITAR ESCUDO Y NOMBRE" onClose={() => setCrestEditorOpen(false)}><ProfileForm team={team} onChanged={onChanged} onSaved={() => setCrestEditorOpen(false)}/></PersonEditorModal>}
    {coversOpen && <TeamCoversModal team={team} squad={squad} teams={teams} onClose={() => setCoversOpen(false)} onChanged={onChanged}/>}
    {historyEditor === 'review' && <PersonEditorModal title="EDITAR RESEÑA HISTÓRICA" onClose={() => setHistoryEditor('')}><ReviewEditor team={team} onChanged={onChanged} onSaved={() => setHistoryEditor('')}/></PersonEditorModal>}
    {historyEditor === 'anthem' && <PersonEditorModal title="EDITAR HIMNO Y LETRA" onClose={() => setHistoryEditor('')}><AnthemEditor team={team} onChanged={onChanged} onSaved={() => setHistoryEditor('')}/></PersonEditorModal>}
  </Screen>;
}
