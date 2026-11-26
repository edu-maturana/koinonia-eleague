import { useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { GpInput } from '../../components/GpInput.jsx';
import { EntityLink } from '../../components/EntityLink.jsx';
import { Button, Card, Chip, ConfirmStep, EmptyState, HowItWorks, Icon, Notice, Stat, useToast } from '../../ui/index.js';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState, gp } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { FanMap } from './FanMap.jsx';
import { StadiumSectors } from './StadiumSectors.jsx';

const upper = text => String(text ?? '').toUpperCase();
const people = value => Number(value ?? 0).toLocaleString('es-CL');
const compact = value => {
  const number = Number(value ?? 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: number >= 100_000_000 ? 0 : number >= 10_000_000 ? 1 : 2 })} M`;
  if (number >= 10_000) return `${Math.round(number / 1000).toLocaleString('es-CL')} MIL`;
  return people(number);
};
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${people(Math.abs(value))}`;
const MOOD_TONE = value => (value >= 70 ? 'good' : value < 50 ? 'bad' : 'default');
const when = value => {
  const date = new Date(`${String(value).replace(' ', 'T')}${/Z|\+/.test(String(value)) ? '' : 'Z'}`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' }).toUpperCase();
};

function OffNotice() {
  return <EmptyState icon="stadium" title="LA VIDA DE CLUB AÚN NO PARTE">Cuando la administración la active, cada partido de local cobrará entradas según tu hinchada y podrás hacer conciertos, vender tus derechos de TV y pelear por la Velada de Ibai.</EmptyState>;
}

// Estadio visto desde arriba, en pixel art: la cancha al centro y cuatro tribunas que se llenan de hinchas (con los
// colores del club) según la ocupación promedio. Cada asiento se llena en un orden fijo pseudoaleatorio.
const seatHash = index => ((index * 2654435761) >>> 0) % 1000;
function Stand({ rows, seats, offset, filled, colors, side }) {
  return <div className={`stadium-stand stand-${side}`} style={{ gridTemplateColumns: `repeat(${seats}, 1fr)` }}>
    {Array.from({ length: rows * seats }, (_, index) => {
      const order = seatHash(index + offset);
      const on = order < filled;
      return <i key={index} className={on ? 'on' : ''} style={on ? { '--shirt': order % 7 === 0 ? colors.secondary : colors.primary } : undefined}/>;
    })}
  </div>;
}

function Stadium({ occupancy = 0, matches = 0, colors }) {
  const filled = Math.round(Math.max(0, Math.min(100, occupancy)) * 10);
  const palette = { primary: colors?.primary ?? '#d10020', secondary: colors?.secondary ?? '#ffffff' };
  // Con perspectiva (como mirando desde la tribuna): las tribunas de los lados más gruesas y la del fondo más alta.
  return <div className="pixel-stadium" role="img" aria-label={matches ? `Ocupación promedio ${occupancy}%` : 'Todavía sin partidos de local'}>
    <div className="stadium-bowl">
      <Stand side="n" rows={5} seats={26} offset={0} filled={filled} colors={palette}/>
      <Stand side="w" rows={7} seats={5} offset={200} filled={filled} colors={palette}/>
      <div className="stadium-pitch" aria-hidden="true"><i className="pitch-half"/><i className="pitch-circle"/><i className="pitch-box left"/><i className="pitch-box right"/></div>
      <Stand side="e" rows={7} seats={5} offset={400} filled={filled} colors={palette}/>
      <Stand side="s" rows={3} seats={26} offset={600} filled={filled} colors={palette}/>
    </div>
    <p className="stadium-label">{matches ? <><b>{occupancy}%</b> lleno en promedio · {matches} partido{matches === 1 ? '' : 's'} de local</> : 'Todavía no juegas de local'}</p>
  </div>;
}

function TierPicker({ fans, canEdit, onChanged }) {
  const toast = useToast();
  const save = useApiMutation((tier, signal) => endpoints.setTicketTier(fans.teamId, tier, signal), { onSuccess: () => { toast({ tone: 'success', title: 'Precio de la entrada actualizado' }); onChanged?.(); } });
  const effect = {
    popular: 'Todo 30% más barato en la venta general. Va más gente y la hinchada lo agradece.',
    normal: 'Los precios de siempre de cada sector.',
    premium: 'Todo 45% más caro en la venta general. Va menos gente y la hinchada refunfuña.',
  };
  return <Card title="PRECIO DE LA ENTRADA" aside={<Chip icon="ticket">Rige para tus partidos de local</Chip>}>
    <div className="tier-picker" role="radiogroup" aria-label="Precio de la entrada">
      {fans.tiers.map(tier => <button type="button" role="radio" key={tier.key} aria-checked={fans.ticketTier === tier.key} className={fans.ticketTier === tier.key ? 'on' : ''}
        disabled={!canEdit || save.loading} onClick={() => fans.ticketTier !== tier.key && save.execute(tier.key)}>
        <b>{upper(tier.label)}</b><strong>{tier.price} €</strong><small>PLATEA · {effect[tier.key]}</small>
      </button>)}
    </div>
    <p className="club-life-hint">LOS ABONADOS YA PAGARON SU ABONO Y LA ENTRADA VISITANTE TIENE TOPE DE {fans.awayTicketCap ?? 35} €: EL PRECIO DEL PARTIDO SOLO CAMBIA LA VENTA GENERAL.</p>
    {save.error && <Notice tone="error">{save.error.message}</Notice>}
  </Card>;
}

function GateRow({ gate }) {
  return <li className="gate-row">
    <EntityLink to="match" id={gate.matchId} className="gate-match"><b>{upper(gate.homeName)} {gate.homeScore}-{gate.awayScore} {upper(gate.awayName)}</b><small>{when(gate.createdAt)}</small></EntityLink>
    <span className="gate-bar" aria-label={`${gate.occupancy}% del aforo`}><span style={{ width: `${gate.occupancy}%` }}/><em>{people(gate.attendance)}</em></span>
    <span className="gate-tags">{gate.closedDoors && <Chip tone="red" icon="lock">PUERTAS CERRADAS</Chip>}{gate.derby && <Chip tone="red" icon="fire">CLÁSICO</Chip>}{gate.neutral && <Chip tone="navy">FINAL · MITAD</Chip>}{gate.occupancy >= 100 && <Chip tone="green" icon="check">LLENO</Chip>}</span>
    <strong>{gp(gate.revenue)}</strong>
  </li>;
}

/** Sectores del estadio con su precio y los abonados del torneo (la campaña queda fija cuando arranca el torneo). */
function SectorsCard({ fans }) {
  const season = fans.seasonTickets;
  const holders = season ? Object.fromEntries(season.sectors.map(sector => [sector.key, sector.seasonTickets])) : null;
  return <Card id="ver-sectores" title="SECTORES DEL ESTADIO" aside={season ? <Chip icon="ticket" tone={season.fixed ? 'navy' : 'yellow'}>{people(season.total)} ABONADOS · {Math.round(season.total / Math.max(1, season.capacity) * 100)}%</Chip> : null}>
    <StadiumSectors sectors={fans.venue.sectors} sectorTypes={fans.sectorTypes} seasonTickets={holders}/>
    {season && <p className="club-life-hint">{season.fixed
      ? <>ABONOS DEL {upper(season.tournamentName)}: <b>{people(season.total)}</b>. QUEDARON FIJOS AL ARRANCAR EL TORNEO: VAN A TODOS LOS PARTIDOS DE LIGA DE LOCAL AUNQUE EL EQUIPO ANDE MAL.</>
      : <>CAMPAÑA DE ABONOS DEL {upper(season.tournamentName)}: HOY SE ABONARÍAN <b>{people(season.total)}</b>. SE CIERRA CUANDO ARRANCA EL TORNEO: UNA HINCHADA CONTENTA SE ABONA MÁS.</>}</p>}
    <HowItWorks title="¿Qué es cada sector?">
      <ul>
        <li><b>De pie:</b> la tribuna sin asientos (la Südtribüne del Signal Iduna, las populares de la Bombonera). Es la más barata y la primera que se agota.</li>
        <li><b>Cabecera y platea:</b> los asientos de detrás de los arcos y de los costados.</li>
        <li><b>Preferencial y palcos:</b> los compran empresas. Son caros y casi siempre son abonos.</li>
        <li><b>Visita:</b> el sector de la hinchada rival. Su entrada tiene tope ({fans.awayTicketCap ?? 35} €, como en la Premier League). Si no lo llenan y a tu gente no le alcanzó, se libera para el local.</li>
      </ul>
      <p>Los sectores salen de cómo es el estadio real; las cifras son aproximadas. El abono cuesta {Math.round((fans.seasonTicketDiscount ?? 0.2) * 100)}% menos que comprar partido a partido y solo vale para la liga: playoffs y copa se venden aparte.</p>
    </HowItWorks>
  </Card>;
}

/** Estadio y taquilla: lo ve cualquiera; el presi además elige el precio de la entrada. La hinchada va en FansTab. */
/** El presi le pone nombre propio a su estadio: ese manda en toda la liga y el del catálogo queda como referencia. */
function StadiumNameEditor({ team, venue, onChanged }) {
  const [editing, setEditing] = useState(false);
  const custom = venue.baseName && venue.name !== venue.baseName ? venue.name : '';
  const [value, setValue] = useState(custom);
  const save = useApiMutation((name, signal) => endpoints.setStadiumName(team.id, name, signal), { onSuccess: () => { setEditing(false); onChanged?.(); } });
  if (!editing) return <button type="button" className="venue-rename" onClick={() => { setValue(custom); setEditing(true); }}><span aria-hidden="true">✎</span> {custom ? 'CAMBIAR EL NOMBRE' : 'PONERLE NOMBRE PROPIO'}</button>;
  return <form className="venue-rename-form" onSubmit={event => { event.preventDefault(); save.execute(value.trim() || null); }}>
    <input value={value} maxLength={60} placeholder={venue.baseName} aria-label="Nombre del estadio" onChange={event => setValue(event.target.value)} autoFocus/>
    <Button type="submit" size="sm" disabled={save.loading}>Guardar</Button>
    {custom && <Button type="button" size="sm" variant="ghost" disabled={save.loading} onClick={() => save.execute(null)}>Volver al real</Button>}
    <Button type="button" size="sm" variant="ghost" disabled={save.loading} onClick={() => setEditing(false)}>Cancelar</Button>
    {save.error && <small className="form-feedback error">{save.error.message}</small>}
  </form>;
}

export function VenueTab({ team, onTab: _onTab }) {
  const { canEditTeam } = useAuth();
  const canEdit = canEditTeam(team.id);
  const query = useApiQuery(signal => endpoints.teamFans(team.id, signal), [team.id]);
  const fans = query.data;
  if (!fans) return <DataState query={query}/>;
  const average = fans.gates.length ? Math.round(fans.gates.reduce((sum, gate) => sum + gate.occupancy, 0) / fans.gates.length) : 0;
  const full = fans.gates.filter(gate => gate.occupancy >= 100).length;
  return <section className="club-life venue-tab">
    <Card tone="navy" className={`venue-hero ${fans.venue.imageUrl ? 'has-photo' : ''}`} style={fans.venue.imageUrl ? { '--venue-photo': `url("${fans.venue.imageUrl}")` } : undefined}>
      <div className="venue-hero-copy">
        <small>{fans.venue.owned ? `ESTADIO · CATEGORÍA ${fans.venue.category}` : 'CANCHA PROPIA'}</small>
        <h2>{upper(fans.venue.name)}</h2>
        {fans.venue.owned && fans.venue.baseName && fans.venue.baseName !== fans.venue.name && <small className="venue-base-name">EN EL CATÁLOGO: {upper(fans.venue.baseName)}</small>}
        {fans.venue.owned && canEdit && <StadiumNameEditor team={team} venue={fans.venue} onChanged={query.retry}/>}
        <p>{people(fans.venue.capacity)} ESPECTADORES{fans.venue.owned && fans.venue.upkeep ? ` · MANTENCIÓN ${gp(fans.venue.upkeep)} POR TORNEO` : ''}</p>
        <a className="ui-btn ui-btn--primary ui-btn--sm" href="#/equipos/estadios"><Icon name="stadium" size={14}/>{canEdit ? (fans.venue.owned ? 'CAMBIAR DE ESTADIO' : 'COMPRAR ESTADIO') : 'VER TODOS LOS ESTADIOS'}</a>
      </div>
      <Stadium occupancy={average} matches={fans.gates.length} colors={team.colors}/>
    </Card>
    {!fans.enabled ? <OffNotice/> : <>
      <div className="club-life-stats">
        <Card><Stat label="TAQUILLA RECIENTE" value={gp(fans.seasonRevenue)} hint={`${fans.gates.length} PARTIDO${fans.gates.length === 1 ? '' : 'S'} DE LOCAL`}/></Card>
        <Card><Stat label="OCUPACIÓN" value={`${average}%`} hint={full ? `${full} ${full === 1 ? 'VEZ' : 'VECES'} CON ESTADIO LLENO` : 'SIN LLENOS TODAVÍA'} tone={average >= 90 ? 'good' : 'default'}/></Card>
      </div>
      <SectorsCard fans={fans}/>
      <TierPicker fans={fans} canEdit={canEdit} onChanged={query.retry}/>
      <Card title="PARTIDOS DE LOCAL" aside={<Chip icon="people">ASISTENCIA Y RECAUDACIÓN</Chip>}>
        {fans.gates.length ? <ul className="gate-list">{fans.gates.map(gate => <GateRow key={gate.matchId} gate={gate}/>)}</ul>
          : <EmptyState icon="ticket" title="SIN PARTIDOS DE LOCAL AÚN">Cuando juegues de local verás aquí cuánta gente fue y cuánto recaudaste.</EmptyState>}
        <HowItWorks title="¿De qué depende la asistencia?">
          <p>De tus hinchas que pueden ir (los que viven en Chile y en tu país, y algunos turistas del resto del mundo), el rival, si es clásico o playoffs, el ánimo de la hinchada y el precio de la entrada.</p>
          <p>La gente se reparte por sectores: la galería de pie y las cabeceras se agotan primero; la preferencial y los palcos los compran empresas, que pagan más en un club grande. Los abonados tienen su lugar asegurado y el resto se vende partido a partido. El aforo es el techo. El marcador no cambia: esto solo mueve plata, hinchas y ánimo.</p>
        </HowItWorks>
      </Card>
    </>}
  </section>;
}

/** Hinchada: cuántos son y dónde viven, cómo están de ánimo y qué los movió. Lo ve cualquiera. */
export function FansTab({ team }) {
  const query = useApiQuery(signal => endpoints.teamFans(team.id, signal), [team.id]);
  const fans = query.data;
  if (!fans) return <DataState query={query}/>;
  if (!fans.enabled) return <OffNotice/>;
  return <section className="club-life fans-tab">
    <div className="club-life-stats">
      <Card><Stat label="HINCHAS" value={compact(fans.followers)} hint={`${compact(fans.homeFans)} EN ${upper(fans.countryName)}${fans.rank ? ` · ${fans.rank}.º DE ${fans.clubs}` : ''}`}/></Card>
      <Card><Stat label="LA HINCHADA ESTÁ" value={upper(fans.moodLabel)} hint={`ÁNIMO ${fans.mood} / 100`} tone={MOOD_TONE(fans.mood)}/><span className={`mood-meter-bar ${fans.mood >= 70 ? 'good' : fans.mood >= 50 ? 'mid' : 'bad'}`} aria-hidden="true"><i style={{ width: `${fans.mood}%` }}/></span></Card>
    </div>
    {/* El mapa es grande: queda plegado. Adentro va también el país del club y los lugares marcados. */}
    <details className="fan-map-details">
      <summary><Icon name="people" size={14}/> MAPA DE HINCHAS{fans.homes?.length ? ` · ${fans.homes.length} LUGARES MARCADOS` : ''}</summary>
      <ClubCountry team={team} fans={fans} onChanged={query.retry}/>
      <FanMap fans={fans} onChanged={query.retry}/>
    </details>
    {fans.log.length > 0 && <Card title="LO QUE MOVIÓ A LA HINCHADA">
      <ul className="fan-log">{fans.log.slice(0, 5).map((row, index) => <FanLogRow key={index} row={row}/>)}</ul>
      {fans.log.length > 5 && <details className="fan-log-more"><summary>VER {fans.log.length - 5} MÁS</summary><ul className="fan-log">{fans.log.slice(5).map((row, index) => <FanLogRow key={index} row={row}/>)}</ul></details>}
    </Card>}
  </section>;
}

/** País del club (lo elige su presi): decide dónde viven sus hinchas. Cambiarlo recalcula la hinchada. */
function ClubCountry({ team, fans, onChanged }) {
  const { canEditTeam } = useAuth();
  const countries = useApiQuery(signal => (canEditTeam(team.id) ? endpoints.clubCountries(signal) : Promise.resolve({ data: null })), [team.id]);
  const [pending, setPending] = useState(null);
  const preview = useApiQuery(signal => (pending && pending !== fans.country ? endpoints.countryPreview(team.id, pending, signal) : Promise.resolve({ data: null })), [team.id, pending]);
  const change = useApiMutation((country, signal) => endpoints.setOwnClubCountry(team.id, country, signal), { onSuccess: () => { setPending(null); onChanged?.(); } });
  const delta = preview.data?.delta ?? null;
  if (!canEditTeam(team.id) || !countries.data) return null;
  return <Card title="PAÍS DEL CLUB" className="club-country">
    <p className="club-life-hint">De acá salen tus hinchas, además de los de Chile. Si lo cambias, ganas o pierdes hinchas según la población del país (lo que ganaste jugando se mantiene en proporción).</p>
    <select className="fan-country-select" aria-label="País del club" value={pending ?? fans.country} disabled={change.loading} onChange={event => setPending(event.target.value)}>
      {countries.data.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
    {pending && pending !== fans.country && delta !== null && <ConfirmStep message={`¿Cambiar el país del club a ${countries.data.find(country => country.code === pending)?.name}? Quedarías con ${compact(preview.data.followers)} hinchas (${delta >= 0 ? 'ganas' : 'pierdes'} ${compact(Math.abs(delta))}): un país más poblado da más hinchas.`} confirmLabel="SÍ, CAMBIAR" busy={change.loading}
      onConfirm={() => change.execute(pending)} onCancel={() => setPending(null)}/>}
    {change.error && <Notice tone="error">{change.error.message}</Notice>}
  </Card>;
}

function FanLogRow({ row }) {
  return <li>
          <span>{upper(row.reason)}</span>
          <b className={row.followers >= 0 ? 'up' : 'down'}>{signed(row.followers)} HINCHAS</b>
          <small className={row.mood >= 0 ? 'up' : 'down'}>{row.mood > 0 ? '▲' : row.mood < 0 ? '▼' : '·'} ÁNIMO {signed(row.mood)}</small>
        </li>;
}

const factorText = value => `${value >= 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;

/** Por qué tu club cobra lo que cobra de la TV: hinchas, más resultados, historia y estadio. */
function TvClubValue({ club }) {
  return <p className="tv-club-value"><Icon name="trophy" size={14}/> Además de tus hinchas, el canal paga por tu club: <b>resultados {factorText(club.results)}</b> · <b>historia {factorText(club.history)}</b> · <b>estadio {factorText(club.stadium)}</b> → en total <b className={club.factor >= 1 ? 'up' : 'down'}>{factorText(club.factor)}</b>.</p>;
}

function useBusiness(team) {
  const query = useApiQuery(signal => endpoints.teamBusiness(team.id, signal), [team.id]);
  return query;
}

function ArtistCard({ artist, team, busy, onBook }) {
  const blocked = !artist.fits || artist.bookedBy;
  return <Card as="article" className={`artist-card ${blocked ? 'is-locked' : ''}`}>
    <header><span className="artist-badge is-christian" aria-hidden="true"><Icon name="mic" size={18}/></span><div><b>{upper(artist.name)}</b><small>{upper(artist.genre)} · MUEVE ~{people(artist.draw)} PERSONAS</small></div></header>
    <dl>
      <div><dt>COBRA POR TOCAR</dt><dd>{gp(artist.fee)}</dd></div>
      <div><dt>TE QUEDARÍA</dt><dd className={artist.expectedProfit >= 0 ? 'up' : 'down'}>{artist.expectedProfit >= 0 ? '+' : ''}{gp(artist.expectedProfit)}</dd></div>
    </dl>
    {artist.bookedBy ? <Chip icon="lock">DE GIRA CON {upper(artist.bookedBy)}</Chip>
      : !artist.fits ? <Chip icon="lock">PIDE {people(artist.minCapacity)} DE AFORO</Chip>
        : onBook && <Button size="sm" icon="ticket" disabled={busy} onClick={() => onBook(artist)}>CONTRATAR</Button>}
  </Card>;
}

const timeLeft = iso => {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'CERRANDO';
  const hours = Math.floor(ms / 3600000);
  return hours >= 24 ? `QUEDAN ${Math.floor(hours / 24)} D ${hours % 24} H` : hours >= 1 ? `QUEDAN ${hours} H` : `QUEDAN ${Math.max(1, Math.round(ms / 60000))} MIN`;
};

/** Un paso de la guía de La Velada: hecho, en curso o pendiente. */
function Step({ n, state, title, children }) {
  return <li className={`velada-step is-${state}`}>
    <span className="velada-step-n" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14}/> : state === 'blocked' ? <Icon name="lock" size={12}/> : n}</span>
    <div><b>{title}</b>{children}</div>
  </li>;
}

/**
 * La Velada del Año en tres pasos: (1) Ibai abre la búsqueda de estadio, (2) tu club cumple los requisitos,
 * (3) mandas una oferta en sobre cerrado antes del cierre. Muestra cuánto ganarías si te elige.
 */
function VeladaCard({ team, velada, canEdit, onChanged }) {
  const toast = useToast();
  const [amount, setAmount] = useState(velada.myBid ?? '');
  const bid = useApiMutation((value, signal) => endpoints.bidVelada(team.id, value, signal), { onSuccess: () => { toast({ tone: 'success', title: 'OFERTA ENVIADA', body: 'Solo Ibai la ve. Si no te elige, no pagas nada.' }); onChanged(); } });
  const withdraw = useApiMutation((_, signal) => endpoints.withdrawVelada(team.id, signal), { onSuccess: onChanged });
  const round = velada.round;
  const open = round?.status === 'open';
  const req = velada.requirements;
  const me = velada.eligibility;
  const eligible = Boolean(me?.eligible);
  const offer = Number(amount) || 0;
  const closes = round?.closesAt ? new Date(round.closesAt).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : null;
  const capacityOk = (me?.capacity ?? 0) >= req.minCapacity;
  const fansOk = (me?.followers ?? 0) >= req.minFollowers;
  return <Card id="ver-velada" tone="gold" className="velada-card" title="LA VELADA DEL AÑO" aside={<Chip tone={open ? 'red' : 'navy'} icon="mic">{open ? timeLeft(round.closesAt) : round?.status === 'resolved' ? 'YA TIENE SEDE' : 'IBAI AÚN NO BUSCA'}</Chip>}>
    <p className="velada-lead">Ibai busca un estadio para su evento de boxeo. Funciona como una subasta: los clubes le ofrecen plata para que lo haga en su estadio, y el elegido paga lo que ofreció pero se queda con todas las entradas y la transmisión.</p>
    {round?.status === 'resolved' && <div className="velada-result">
      <blockquote>«{round.result?.line}»<cite>— IBAI</cite></blockquote>
      {round.winnerTeamId === team.id && <p className="velada-win">GANASTE {gp(round.result.profit)} NETOS Y TU HINCHADA CRECIÓ 5%.</p>}
      {round.result?.ranking?.length > 0 && <ol className="velada-ranking">{round.result.ranking.map(row => <li key={row.teamId}><b>{upper(row.name)}</b><span>{gp(row.amount)}</span><small>{row.score} PTS</small></li>)}</ol>}
    </div>}
    {round?.status !== 'resolved' && <ol className="velada-steps">
      <Step n={1} state={open ? 'done' : 'now'} title={open ? `Ibai está buscando estadio · cierra el ${upper(closes)}` : 'Espera a que Ibai abra la búsqueda'}>
        <small>{open ? (round.bidders.length ? `YA LE OFRECIERON: ${round.bidders.map(bidder => upper(bidder.name)).join(' · ')}` : 'Todavía nadie le ofrece su estadio.') : 'Se abre sola cuando arranca cada liga (cada v) y queda abierta 3 días. Te llega un aviso.'}</small>
      </Step>
      <Step n={2} state={eligible ? 'done' : 'blocked'} title={eligible ? 'Tu club cumple los requisitos' : 'Tu club todavía no cumple los requisitos'}>
        <ul className="velada-reqs">
          <li className={capacityOk ? 'ok' : 'no'}>{capacityOk ? '✓' : '✗'} ESTADIO DE {people(req.minCapacity)} PERSONAS · EL TUYO: {people(me?.capacity)}</li>
          <li className={fansOk ? 'ok' : 'no'}>{fansOk ? '✓' : '✗'} {compact(req.minFollowers)} HINCHAS · TIENES {compact(me?.followers)}</li>
        </ul>
        {!capacityOk && <a className="velada-link" href="#/equipos/estadios">Ver estadios de 50.000 o más →</a>}
      </Step>
      <Step n={3} state={!open || !eligible ? 'wait' : velada.myBid !== null ? 'done' : 'now'} title={velada.myBid !== null ? `Le ofreciste ${gp(velada.myBid)} · nadie más lo ve` : 'Ofrécele plata a Ibai para que la haga en tu estadio'}>
        <small>Al cierre Ibai elige uno solo, mirando la plata que le ofrecen (50%), el tamaño del estadio (30%) y los hinchas (20%). Ofrecer más te da más chance, pero te queda menos. Si no te elige, no pagas nada.</small>
        {open && eligible && canEdit && <div className="velada-bid">
          <label>CUÁNTO LE OFRECES<GpInput value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" aria-label="Oferta para La Velada"/></label>
          <Button icon="gavel" disabled={bid.loading || amount === ''} onClick={() => bid.execute(offer)}>{velada.myBid !== null ? 'CAMBIAR OFERTA' : 'OFRECER'}</Button>
          {velada.myBid !== null && <Button variant="ghost" size="sm" disabled={withdraw.loading} onClick={() => withdraw.execute()}>RETIRARME</Button>}
        </div>}
        {eligible && me?.prize > 0 && <dl className="velada-math">
          <div><dt>SI IBAI TE ELIGE, COBRAS</dt><dd>{gp(me.prize)}</dd><small>{people(me.capacity)} ENTRADAS A 80 € + TRANSMISIÓN</small></div>
          <div><dt>MENOS TU OFERTA</dt><dd>{offer ? `−${gp(offer)}` : '—'}</dd></div>
          <div className={me.prize - offer >= 0 ? 'up' : 'down'}><dt>TE QUEDA</dt><dd>{gp(me.prize - offer)}</dd><small>Y TU HINCHADA CRECE 5%</small></div>
        </dl>}
      </Step>
    </ol>}
    {(bid.error || withdraw.error) && <Notice tone="error">{(bid.error ?? withdraw.error).message}</Notice>}
  </Card>;
}

/** Conciertos y La Velada: lo privado del negocio del club. */
export function EventsTab({ team, onChanged }) {
  const { canEditTeam } = useAuth();
  const canEdit = canEditTeam(team.id);
  const toast = useToast();
  const query = useBusiness(team);
  const [confirm, setConfirm] = useState(null);
  const label = useRef('');
  const act = useApiMutation((operation, signal) => operation(signal), { onSuccess: () => { setConfirm(null); toast({ tone: 'money', title: label.current }); query.retry(); onChanged?.(); } });
  const data = query.data;
  if (!data) return <DataState query={query}/>;
  if (!data.enabled) return <section className="club-life"><OffNotice/></section>;
  const scheduled = data.events.find(event => event.status === 'scheduled');
  const past = data.events.filter(event => event.status !== 'scheduled');
  const catalog = data.concerts;
  return <section className="club-life events-tab">
    <VeladaCard team={team} velada={data.velada} canEdit={canEdit} onChanged={query.retry}/>
    {scheduled && <Card tone="navy" className="event-scheduled" title={`PRÓXIMO SHOW: ${upper(scheduled.artist?.name)}`} aside={<Chip tone="yellow" icon="clock">En tu próxima fecha de local</Chip>}>
      <p>YA LE PAGASTE AL ARTISTA ({gp(scheduled.cost)}). SE HACE AL TERMINAR TU PRÓXIMO PARTIDO DE LOCAL.</p>
      {canEdit && (confirm === scheduled.id
        ? <ConfirmStep message={`¿Cancelar? Te devuelven ${gp(Math.floor(scheduled.cost / 2))} (la mitad de lo que le pagaste).`} confirmLabel="SÍ, CANCELAR" danger busy={act.loading} onConfirm={() => { label.current = 'CONCIERTO CANCELADO'; act.execute(signal => endpoints.cancelConcert(team.id, scheduled.id, signal)); }} onCancel={() => setConfirm(null)}/>
        : <Button variant="ghost" size="sm" onClick={() => setConfirm(scheduled.id)}>CANCELAR SHOW</Button>)}
    </Card>}
    <Card title="CONCIERTOS DE MÚSICA CRISTIANA" aside={<Chip icon="music">{catalog.used} / {catalog.limit} ESTA TEMPORADA</Chip>}>
      <HowItWorks><p>Contratas al artista y le pagas por adelantado lo que cobra por tocar. El show se hace en tu próxima fecha de local y de cada entrada te quedan {catalog.sharePerHead} €. Si va mucha gente ganas plata e hinchas; si va poca, lo que recaudas puede no alcanzar a cubrir lo que le pagaste. «Te quedaría» es lo que ganarías con un show normal. Máximo {catalog.limit} por temporada.</p><p>Toda la cartelera es de música cristiana. La mayoría cabe en una cancha de 12.000 personas, así que cualquier club puede hacer eventos.</p></HowItWorks>
      {confirm && confirm !== scheduled?.id && <ConfirmStep message={`¿CONTRATAR A ${upper(confirm.name)} POR ${gp(confirm.fee)}? SE DESCUENTA AHORA.`} confirmLabel="SÍ, CONTRATAR" busy={act.loading}
        onConfirm={() => { label.current = `${upper(confirm.name)} TOCARÁ EN TU ESTADIO`; act.execute(signal => endpoints.bookConcert(team.id, confirm.key, signal)); }} onCancel={() => setConfirm(null)}/>}
      {act.error && <Notice tone="error">{act.error.message}</Notice>}
      <div className="artist-grid">{[...catalog.artists].sort((left, right) => Number(right.fits && !right.bookedBy) - Number(left.fits && !left.bookedBy) || right.draw - left.draw).map(artist => <ArtistCard key={artist.key} artist={artist} team={team} busy={act.loading || Boolean(scheduled) || catalog.used >= catalog.limit} onBook={canEdit ? setConfirm : null}/>)}</div>
    </Card>
    {past.length > 0 && <Card title="EVENTOS REALIZADOS">
      <ul className="event-history">{past.map(event => <li key={event.id}>
        <Icon name={event.kind === 'velada' ? 'mic' : 'music'} size={16}/>
        <b>{event.kind === 'velada' ? 'LA VELADA DEL AÑO' : upper(event.artist?.name)}</b>
        <small>{event.status === 'cancelled' ? 'CANCELADO' : `${people(event.attendance)} PERSONAS · ${when(event.resolvedAt)}`}</small>
        {event.status === 'done' && <strong className={(event.revenue - event.cost) >= 0 ? 'up' : 'down'}>{(event.revenue - event.cost) >= 0 ? '+' : ''}{gp(event.revenue - event.cost)}</strong>}
      </li>)}</ul>
    </Card>}
  </section>;
}

/** Tele pixel con el canal en pantalla. */
function TvSet({ channel, small = false }) {
  return <div className={`tv-set ${small ? 'small' : ''}`} aria-hidden="true"><i className="tv-antenna"/><div className="tv-screen"><span>{upper(channel)}</span><em>EN VIVO</em></div></div>;
}

/** Derechos de TV: tres canales ofrecen transmitir los partidos del club cada temporada; se cobra al cerrar el torneo de liga. */
// Lo que paga un contrato de TV, en el orden en que se gana: fijo, play-in, playoffs, campeón de la Koinonia y de la Copa GG.
const tvTerms = deal => [
  { key: 'fixed', label: 'FIJO POR TORNEO', amount: deal.fixed, fixed: true },
  { key: 'playin', label: 'SI TE QUEDAS EN EL PLAY-IN', amount: deal.playinBonus ?? 0 },
  { key: 'playoffs', label: 'SI LLEGAS A PLAYOFFS', amount: deal.playoffBonus ?? 0 },
  { key: 'title', label: 'CAMPEÓN KOINONIA', amount: deal.titleBonus ?? 0 },
  { key: 'cup', label: 'CAMPEÓN COPA GG', amount: deal.cupTitleBonus ?? 0 },
];

export function TvRightsTab({ team, onChanged }) {
  const { canEditTeam } = useAuth();
  const canEdit = canEditTeam(team.id);
  const toast = useToast();
  const query = useBusiness(team);
  const [confirm, setConfirm] = useState(null);
  const sign = useApiMutation((key, signal) => endpoints.signSponsor(team.id, key, signal), { onSuccess: () => { setConfirm(null); toast({ tone: 'money', title: 'CONTRATO DE TV FIRMADO' }); query.retry(); onChanged?.(); } });
  const data = query.data;
  if (!data) return <DataState query={query}/>;
  if (!data.enabled) return <section className="club-life"><OffNotice/></section>;
  const sponsor = data.sponsor;
  return <section className="club-life sponsor-tab tv-tab">
    {sponsor ? <Card tone="navy" className="sponsor-current">
      <TvSet channel={sponsor.brand}/>
      <div>
        <small>TRANSMITE TUS PARTIDOS{sponsor.reach ? ` · ${upper(sponsor.reach)}` : ''} · CONTRATO {upper(sponsor.styleLabel)}</small>
        <h2>{upper(sponsor.brand)}</h2>
        <p>TORNEO {Math.min(sponsor.seasonsPaid + 1, sponsor.seasons)} DE {sponsor.seasons} · YA PAGÓ {gp(sponsor.paid)}</p>
        <dl className="sponsor-terms">{tvTerms(sponsor).filter(term => term.fixed || term.amount > 0).map(term => <div key={term.key}><dt>{term.label}</dt><dd>{term.fixed ? '' : '+'}{gp(term.amount)}</dd></div>)}</dl>
      </div>
    </Card> : <Card title="DERECHOS DE TV" aside={<Chip icon="handshake">3 canales te quieren transmitir</Chip>}>
      <p className="club-life-hint">La TV de la liga ya se reparte entre todos los clubes al cerrar cada torneo (según puesto y audiencia). Esto es aparte: tu contrato propio con un canal, un extra que se cobra al cerrar cada torneo de liga. Los más grandes pagan más.</p>
      <HowItWorks><p>Cada canal paga según su tamaño y tus hinchas. Los gigantes globales (Prime Video, DAZN, ESPN) pagan más, pero solo llaman a clubes con mucha hinchada; la TV abierta paga menos y le transmite a cualquiera. La oferta <b>fija</b> es plata segura; la <b>arriesgada</b> paga poco fijo pero mucho si llegas lejos; la <b>mixta</b> va al medio.</p><p>Los bonos se pagan según hasta dónde llegas en la Koinonia: si te quedas en el <b>play-in</b> cobras ese bono; si llegas a <b>playoffs</b> (semis, directo o ganando el play-in) cobras el de playoffs en vez del otro. Salir <b>campeón de la Koinonia</b> paga su bono, y la <b>Copa GG</b>, que es media temporada, paga la mitad.</p><p>Es aparte de la camiseta: las marcas de la camiseta de tu equipo base pagan por su lado (más arriba).</p></HowItWorks>
      <div className="sponsor-offers">{data.sponsorOffers.map(offer => <article key={offer.key} className={`sponsor-offer style-${offer.style}`}>
        <TvSet channel={offer.brand} small/>
        <b>{upper(offer.brand)}</b>
        {offer.reach && <small className="tv-reach">{upper(offer.reach)}</small>}
        <Chip tone={offer.style === 'arriesgada' ? 'red' : offer.style === 'mixta' ? 'yellow' : 'green'}>{upper(offer.styleLabel)} · {offer.seasons} TORNEO{offer.seasons === 1 ? '' : 'S'}</Chip>
        <dl>{tvTerms(offer).map(term => <div key={term.key}><dt>{term.label}</dt><dd>{term.fixed ? gp(term.amount) : term.amount ? `+${gp(term.amount)}` : '—'}</dd></div>)}</dl>
        {canEdit && (confirm === offer.key
          ? <ConfirmStep message={`¿Firmar con ${upper(offer.brand)} por ${offer.seasons} torneo${offer.seasons === 1 ? '' : 'S'}? No se puede cambiar hasta que termine.`} confirmLabel="SÍ, FIRMAR" busy={sign.loading} onConfirm={() => sign.execute(offer.key)} onCancel={() => setConfirm(null)}/>
          : <Button size="sm" icon="contract" onClick={() => setConfirm(offer.key)}>FIRMAR</Button>)}
      </article>)}</div>
      {data.sponsorOffers[0]?.club && <TvClubValue club={data.sponsorOffers[0].club}/>}
      {data.tvNext && <p className="tv-next"><Icon name="people" size={14}/> CON {compact(data.tvNext.minFollowers)} HINCHAS TE LLAMARÍA <b>{upper(data.tvNext.name)}</b> ({upper(data.tvNext.reach)}): TE FALTAN {compact(data.tvNext.missing)}.</p>}
      {sign.error && <Notice tone="error">{sign.error.message}</Notice>}
    </Card>}
  </section>;
}
