import { useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { EntityLink } from '../../components/EntityLink.jsx';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, OverallBadge, gp } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';
import { addToComparison, comparisonCandidate, readComparison, writeComparison } from '../../utils/playerComparison.js';
import { GpInput } from '../../components/GpInput.jsx';
import { Button } from '../../ui/index.js';

// Medias agrupadas como en eFootballDB, con los nombres en español del juego.
export const STAT_GROUPS = [
  ['ATAQUE', [['attacking_prowess', 'Actitud ofensiva'], ['finishing', 'Finalización'], ['header', 'Cabeceo'], ['kicking_power', 'Potencia de tiro'], ['place_kicking', 'Balón parado'], ['swerve', 'Efecto']]],
  ['TÉCNICA', [['ball_control', 'Control de balón'], ['dribbling', 'Regate'], ['tight_possession', 'Posesión estrecha'], ['low_pass', 'Pase al ras'], ['lofted_pass', 'Pase bombeado']]],
  ['FÍSICO', [['speed', 'Velocidad'], ['explosive_power', 'Aceleración'], ['body_control', 'Equilibrio'], ['physical_contact', 'Contacto físico'], ['stamina', 'Resistencia'], ['jump', 'Salto']]],
  ['DEFENSA', [['defensive_prowess', 'Actitud defensiva'], ['defensive_engagement', 'Implicación defensiva'], ['ball_winning', 'Recuperación de balón'], ['aggression', 'Agresividad']]],
  ['PORTERO', [['goalkeeping', 'Actitud de portero'], ['catching', 'Atajar'], ['clearing', 'Despejar'], ['reflexes', 'Reflejos'], ['coverage', 'Alcance']]],
];

export const PLAYING_STYLES = { 1: 'Cazagoles', 2: 'Señuelo', 3: 'Hombre de área', 4: 'Extremo prolífico', 5: 'Clásico nº 10', 6: 'Jugador de huecos', 7: 'Box to box', 8: 'Ancla', 9: 'El destructor', 10: 'Atacante extra', 11: 'Lateral ofensivo', 12: 'Lateral defensivo', 13: 'Delantero retrasado', 14: 'Creador de jugadas', 15: 'Salida de balón', 16: 'Portero ofensivo', 17: 'Portero defensivo', 18: 'Extremo móvil', 19: 'Especialista en centros', 20: 'Orquestador', 21: 'Lateral finalizador', 22: 'Hombre objetivo' };

const SKILLS = { cross_over_turn: 'Giro cruzado', early_cross: 'Centro rápido', sombrero: 'Sombrero', pinpoint_crossing: 'Centro preciso', weighted_pass: 'Pase con peso', flip_flap: 'Elástica', fighting_spirit: 'Espíritu de lucha', through_passing: 'Pase al hueco', low_lofted_pass: 'Pase bombeado bajo', trickster: 'Truquista', low_punt_trajectory: 'Despeje bajo', gamesmanship: 'Picardía', captaincy: 'Capitanía', phenomenal_finishing: 'Definición fenomenal', fortress: 'Fortaleza', momentum_dribbling: 'Regate con impulso', edged_crossing: 'Centro con efecto', outside_curler: 'Tiro con exterior', dipping_shots: 'Tiro con caída', heading: 'Cabezazo', gk_high_punt: 'Despeje alto (PT)', marseille_turn: 'Marsellesa', rising_shots: 'Tiro ascendente', step_on_skill_control: 'Pisada', penalty_specialist: 'Especialista en penales', gk_penalty_saver: 'Parapenales', interception: 'Intercepción', man_marking: 'Marcaje al hombre', heel_trick: 'Taconazo', chip_shot_control: 'Vaselina', one_touch_pass: 'Pase al primer toque', incisive_run: 'Desmarque incisivo', first_time_shot: 'Tiro al primer toque', no_look_pass: 'Pase sin mirar', knuckle_shot: 'Tiro con empeine', rabona: 'Rabona', super_sub: 'Súper suplente', track_back: 'Repliegue', long_range_shooting: 'Tiro lejano', scissors_feint: 'Bicicleta', long_ranger: 'Tirador de lejos', long_throw: 'Saque largo de banda', gk_long_throw: 'Saque largo (PT)', double_touch: 'Doble toque', acrobatic_finishing: 'Remate acrobático', scotch_move: 'Amago escocés', speeding_bullet: 'Bala', long_range_drive: 'Disparo lejano', cut_behind_turn: 'Recorte por detrás', long_ball_expert: 'Experto en balones largos', amazing_run: 'Carrera asombrosa', mazing_run: 'Carrera asombrosa', aerial_superiority: 'Superioridad aérea', blocker: 'Bloqueador', sliding_tackle: 'Entrada deslizante', game_changing_pass: 'Pase decisivo', visionary_pass: 'Pase visionario', phenomenal_pass: 'Pase fenomenal', blitz_curler: 'Rosca relámpago', aerial_fort: 'Fortaleza aérea', acceleration_burst: 'Arranque explosivo', bullet_header: 'Cabezazo bala', long_reach_tackle: 'Entrada de largo alcance', gk_directing_defense: 'Dirección defensiva (PT)', low_screamer: 'Disparo raso potente', willpower: 'Fuerza de voluntad', gk_spirit_roar: 'Grito de espíritu (PT)', attack_trigger: 'Detonante ofensivo', magnetic_feet: 'Pies magnéticos', shadow_hunt: 'Caza sombra', attacking_surge: 'Oleada ofensiva', tap_trick: 'Toque de truco' };

const normalizeSkillKey = key => String(key ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
export const skillLabel = key => SKILLS[key] ?? SKILLS[normalizeSkillKey(key)] ?? String(key ?? '').replaceAll('_', ' ');

// Campo de posiciones: 2 = posición principal, 1 = puede jugar ahí.
const PITCH_POSITIONS = [['cf', 'DC', 50, 10], ['ss', 'SD', 50, 24], ['lwf', 'EXI', 16, 16], ['rwf', 'EXD', 84, 16], ['amf', 'MO', 50, 38], ['lmf', 'MDI', 16, 44], ['rmf', 'MDD', 84, 44], ['cmf', 'MC', 50, 52], ['dmf', 'MCD', 50, 66], ['lb', 'LI', 16, 74], ['rb', 'LD', 84, 74], ['cb', 'DEC', 50, 80], ['gk', 'PT', 50, 93]];

const statTier = value => value >= 90 ? 'elite' : value >= 80 ? 'great' : value >= 70 ? 'good' : 'low';

// eFootballDB guarda estos niveles corridos en uno (el más bajo llega como 2): uso y precisión del pie malo van de 1 a 4, forma
// y resistencia a lesiones de 1 a 3. Antes se mostraban crudos sobre otro máximo ("5/4", "4/3").
const PROFILE_LEVELS = {
  weakFootUsage: ['Casi nunca', 'Rara vez', 'Seguido', 'Muy seguido'],
  weakFootAccuracy: ['Muy baja', 'Baja', 'Media', 'Alta'],
  form: ['Irregular', 'Estable', 'Inquebrantable'],
  injuryResistance: ['Baja', 'Media', 'Alta'],
};
/** "Alta (4/4)" a partir del valor crudo de eFootballDB. */
export function profileLevel(key, raw) {
  const levels = PROFILE_LEVELS[key];
  if (raw == null || !levels) return '—';
  const level = Math.min(Math.max(Number(raw) - 1, 1), levels.length);
  return `${levels[level - 1]} (${level}/${levels.length})`;
}
/** El precio de la carta en el juego (GP de eFootball), que no tiene nada que ver con el GP de la liga. */
export const efootballPrice = value => value == null ? '—' : `${Number(value).toLocaleString('es-CL')} GP del juego`;

export function EfootballCardDetails({ card }) {
  const stats = card.stats ?? {};
  const profile = card.profile ?? {};
  const statCount = Object.keys(stats).length;
  const groups = STAT_GROUPS.map(([title, rows]) => [title, rows.filter(([key]) => stats[key] != null)]).filter(([, rows]) => rows.length);
  return <div className="card-details">
    {statCount < 10 && <p className="card-partial-note">FICHA RESUMIDA: EL ADMINISTRADOR DEBE CORRER <code>/efootball sync</code> Para cargar todas las medias y habilidades.</p>}
    <div className="card-stat-groups">{groups.map(([title, rows]) => <section className="card-stat-group" key={title}><h3>{title}</h3>{rows.map(([key, label]) => <div className="card-stat" key={key}><span>{label}</span><i><em className={`tier-${statTier(stats[key])}`} style={{ width: `${Math.min(100, stats[key])}%` }}/></i><b className={`tier-${statTier(stats[key])}`}>{stats[key]}</b></div>)}</section>)}</div>
    <div className="card-side">
      {profile.positions && <section className="card-positions"><h3>POSICIONES</h3><div className="card-mini-pitch">{PITCH_POSITIONS.map(([key, label, x, y]) => <span key={key} className={`card-pos level-${profile.positions[key] ?? 0}`} style={{ left: `${x}%`, top: `${y}%` }} title={card.overallByPosition?.[label] != null ? `Media de ${label}: ${card.overallByPosition[label]}` : undefined}>{label}{card.overallByPosition?.[label] != null && <b>{card.overallByPosition[label]}</b>}</span>)}</div></section>}
      <section className="card-profile"><h3>PERFIL</h3><dl>
        <div><dt>ESTILO DE JUEGO</dt><dd>{PLAYING_STYLES[card.playingStyle] ?? '—'}</dd></div>
        <div><dt>PIE HÁBIL</dt><dd>{card.strongFoot === 1 ? 'Izquierdo' : card.strongFoot === 0 ? 'Derecho' : '—'}</dd></div>
        <div><dt>USO PIE MALO</dt><dd>{profileLevel('weakFootUsage', profile.weakFootUsage)}</dd></div>
        <div><dt>PRECISIÓN PIE MALO</dt><dd>{profileLevel('weakFootAccuracy', profile.weakFootAccuracy)}</dd></div>
        <div><dt>FORMA</dt><dd>{profileLevel('form', profile.form)}</dd></div>
        <div><dt>RESIST. A LESIONES</dt><dd>{profileLevel('injuryResistance', profile.injuryResistance)}</dd></div>
      </dl></section>
      <section className="card-skills"><h3>HABILIDADES <small>{card.skills?.length ?? 0}</small></h3>{card.skills?.length ? <ul>{card.skills.map(key => <li key={key}>{skillLabel(key)}</li>)}</ul> : <p className="empty-copy">SIN HABILIDADES REGISTRADAS.</p>}</section>
    </div>
  </div>;
}

function RegisterCard({ card, onRegistered }) {
  const [value, setValue] = useState(String(card.gpPrice ?? ''));
  const register = useApiMutation((body, signal) => endpoints.createPlayer(body, signal), { onSuccess: result => onRegistered(result?.data?.id) });
  const submit = event => {
    event.preventDefault();
    register.execute({ name: card.name, position: card.position, gpValue: Number(value || 0), efootballPesId: card.pesId, efootballVariation: card.variation, faceUrl: card.faceUrl, nationality: card.nationality });
  };
  return <form className="card-register" onSubmit={submit}><p>Nadie lo tiene y aún no está inscrito en la liga.</p><label>VALOR GP EN LA LIGA<GpInput value={value} onChange={event => setValue(event.target.value)}/></label><Button variant="positive" type="submit" disabled={register.loading}>INSCRIBIR EN LA LIGA</Button><FormFeedback mutation={register}/></form>;
}

export function EfootballCardPage({ pesId, variation = 0, navigate, onBack, backLabel = '← VOLVER A JUGADORES' }) {
  const { isAdmin } = useAuth();
  const card = useApiQuery(signal => endpoints.efootballCard(pesId, variation, signal), [pesId, variation]);
  const data = card.data;
  return <main className="newspaper data-page"><section className="data-paper">
    <div className="player-profile-actions"><button className="back-button" onClick={onBack}>{backLabel}</button>{data && <Button onClick={() => { writeComparison(addToComparison(readComparison(), comparisonCandidate({ pesId: data.pesId ?? pesId, variation: data.variation ?? variation, name: data.name, faceUrl: data.faceUrl }))); window.location.hash = '/equipos/jugadores?tab=comparador'; }}>⇄ COMPARAR</Button>}</div><DataState query={card}/>
    {data && <article className="efootball-card-page">
      <header className="card-hero">
        <PlayerFace src={data.faceUrl} name={data.name} className="card-hero-face"/>
        <div className="card-hero-copy"><small>CARTA eFOOTBALL · {data.positionCode ?? data.position}</small><h1>{data.name}</h1><p>{[data.nationality, data.age ? `${data.age} AÑOS` : null, data.height ? `${data.height} CM` : null, data.clubName].filter(Boolean).join(' · ')}</p></div>
        <div className="card-hero-price"><OverallBadge value={data.overall} className="overall-badge-hero"/><small>PRECIO EN eFOOTBALL</small><b>{data.gpPrice != null ? data.gpPrice.toLocaleString('es-CL') : '—'}</b><span title="GP del juego eFootball, no de la liga">GP DEL JUEGO</span></div>
      </header>
      <div className="card-league-status">{data.league ? <>
        {data.league.team ? <span className="search-status owned">{data.league.team.imageUrl && <img src={data.league.team.imageUrl} alt=""/>}LO TIENE {data.league.team.name}</span> : <span className="search-status free">AGENTE LIBRE</span>}
        <span>VALOR EN LA LIGA <b>{gp(data.league.gpValue)}</b></span>
        <EntityLink to="player" id={data.league.playerId} className="club-link-button">VER FICHA EN LA LIGA →</EntityLink>
        {data.league.team && <EntityLink to="team" id={data.league.team.id} className="card-team-link"><TeamMark team={data.league.team}/></EntityLink>}
      </> : isAdmin ? <RegisterCard card={data} onRegistered={id => id && navigate(`/jugadores/${encodeURIComponent(id)}`)}/> : <p className="card-register">Nadie lo tiene y aún no está inscrito en la liga.</p>}</div>
      <EfootballCardDetails card={data}/>
    </article>}
  </section></main>;
}

// Bloque para la ficha de un jugador de la liga con carta vinculada.
export function LinkedCardDetails({ pesId, variation = 0 }) {
  const card = useApiQuery(signal => endpoints.efootballCard(pesId, variation, signal), [pesId, variation]);
  if (card.loading || card.error || !card.data) return null;
  return <section className="linked-card"><h2>MEDIAS eFOOTBALL <small>{PLAYING_STYLES[card.data.playingStyle] ?? ''}</small></h2><EfootballCardDetails card={card.data}/></section>;
}
