import { useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { Button, Chip, ConfirmStep, Icon, Modal, Notice, useToast } from '../../ui/index.js';
import { gpLabel } from '../../utils/money.js';
import { teamBalance } from '../../utils/teamPresentation.js';
import { useApiMutation } from '../admin/useApiMutation.js';
import { DataState } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { StadiumSectors } from './StadiumSectors.jsx';

const upper = text => String(text ?? '').toUpperCase();
const people = value => Number(value ?? 0).toLocaleString('es-CL');
const FILTERS = [['todos', 'TODOS'], ['libres', 'EN VENTA'], ['ocupados', 'CON DUEÑO']];

/** Foto del estadio: la sube un admin o el presi del club dueño (va a la mediateca y queda en el catálogo). */
function PhotoControl({ stadium, onChanged }) {
  const input = useRef(null);
  const toast = useToast();
  const upload = useApiMutation(async (file, signal) => {
    const asset = await endpoints.uploadImage(file, { entityType: 'stadium', entityId: stadium.id }, signal);
    return endpoints.setStadiumImage(stadium.id, asset?.data?.secureUrl ?? asset?.secureUrl, signal);
  }, { onSuccess: () => { toast({ tone: 'success', title: 'FOTO ACTUALIZADA' }); onChanged(); } });
  const remove = useApiMutation((_, signal) => endpoints.setStadiumImage(stadium.id, null, signal), { onSuccess: onChanged });
  return <div className="stadium-photo-actions">
    <input ref={input} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload.execute(file); }}/>
    <Button size="sm" variant="ghost" icon="camera" disabled={upload.loading} onClick={() => input.current?.click()}>{upload.loading ? 'SUBIENDO…' : stadium.imageUrl ? 'CAMBIAR FOTO' : 'SUBIR FOTO'}</Button>
    {stadium.imageUrl && <Button size="sm" variant="ghost" disabled={remove.loading} onClick={() => remove.execute()}>QUITAR</Button>}
    {(upload.error || remove.error) && <Notice tone="error">{(upload.error ?? remove.error).message}</Notice>}
  </div>;
}

/** Botón de la ficha que abre el plano y la tabla de sectores en un modal (en la tarjeta no caben). */
function SectorsButton({ stadium }) {
  const [open, setOpen] = useState(false);
  const standing = stadium.sectors.find(sector => sector.type === 'standing');
  return <>
    <Button className="stadium-sectors-button" variant="ghost" size="sm" icon="stadium" onClick={() => setOpen(true)}>VER SECTORES</Button>
    {open && <Modal wide className="stadium-sectors-modal" title={stadium.displayName ?? stadium.name} onClose={() => setOpen(false)}>
      <div className="stadium-sectors-summary">
        <Chip tone="navy">CAT. {stadium.category}</Chip>
        <Chip>{people(stadium.capacity)} ESPECTADORES</Chip>
        <Chip>{stadium.sectors.length} SECTORES</Chip>
        {standing ? <Chip tone="yellow">TRIBUNA DE PIE: {people(standing.capacity)}</Chip> : <Chip>TODO CON ASIENTOS</Chip>}
        {stadium.kind === 'Ficticio' && <Chip>EFOOTBALL</Chip>}
      </div>
      <StadiumSectors sectors={stadium.sectors}/>
    </Modal>}
  </>;
}

function StadiumCard({ stadium, myTeamId, mine, balance, canBuy, canPhoto, confirming, setConfirming, busy, onBuy, onSell, onChanged }) {
  const owned = Boolean(myTeamId) && stadium.teamId === myTeamId;
  const free = !stadium.teamId;
  const cost = stadium.price - (mine?.price ?? 0);
  const affordable = balance === null || cost <= balance;
  return <article className={`stadium-card ${owned ? 'is-mine' : ''} ${free ? 'is-free' : 'is-taken'}`}>
    <div className="stadium-photo" style={stadium.imageUrl ? { backgroundImage: `url("${stadium.imageUrl}")` } : undefined}>
      {!stadium.imageUrl && <Icon name="stadium" size={40}/>}
      <Chip tone="navy">CAT. {stadium.category}</Chip>
      {stadium.kind === 'Ficticio' && <Chip>EFOOTBALL</Chip>}
    </div>
    <div className="stadium-body">
      <b>{stadium.displayName ?? stadium.name}</b>{stadium.customName && <small className="stadium-base-name">{stadium.name}</small>}
      <small>{people(stadium.capacity)} ESPECTADORES · {gpLabel(stadium.price)}</small>
      {stadium.sectors?.length > 0 && <SectorsButton stadium={stadium}/>}
      <div className="stadium-owner">
        {owned ? <Chip tone="green" icon="check">ES TUYO</Chip>
          : free ? <Chip tone="yellow" icon="coin">EN VENTA</Chip>
            : <a href={`#/equipos/${encodeURIComponent(stadium.teamId)}?tab=estadio`} className="stadium-owner-link"><TeamMark team={{ id: stadium.teamId, name: stadium.teamName, emoji: stadium.teamEmoji, imageUrl: stadium.teamImageUrl }}/>{upper(stadium.teamName)}</a>}
      </div>
      {owned && canBuy && (confirming === 'sell'
        ? <ConfirmStep message={`¿Venderlo y recuperar ${gpLabel(stadium.price)}? Vuelves a tu cancha de 12.000.`} confirmLabel="SÍ, VENDER" danger busy={busy} onConfirm={onSell} onCancel={() => setConfirming(null)}/>
        : <Button variant="ghost" size="sm" onClick={() => setConfirming('sell')}>VENDER</Button>)}
      {free && canBuy && (confirming === stadium.id
        ? <ConfirmStep message={mine ? `¿CAMBIARTE? ${cost >= 0 ? `PAGAS ${gpLabel(cost)}` : `RECIBES ${gpLabel(-cost)}`} (TE DEVUELVEN ${upper(mine.name)}).` : `¿COMPRAR POR ${gpLabel(stadium.price)}?`} busy={busy} onConfirm={() => onBuy(stadium)} onCancel={() => setConfirming(null)}/>
        : <Button size="sm" icon={affordable ? 'coin' : 'lock'} disabled={!affordable} title={affordable ? undefined : 'No te alcanza el saldo'} onClick={() => setConfirming(stadium.id)}>{mine ? `CAMBIAR · ${cost >= 0 ? gpLabel(cost) : `+${gpLabel(-cost)}`}` : 'COMPRAR'}</Button>)}
      {canPhoto && <PhotoControl stadium={stadium} onChanged={onChanged}/>}
    </div>
  </article>;
}

/** Estadios de la liga: todos los del catálogo con su foto, dueño y precio. El presi compra, cambia o vende el suyo desde aquí. */
export function StadiumsPage() {
  const { teamId: myTeamId, isAdmin, isPresidentOf } = useAuth();
  const toast = useToast();
  const query = useApiQuery(signal => endpoints.stadiums(signal), []);
  const myTeam = useApiQuery(signal => (myTeamId ? endpoints.team(myTeamId, signal) : Promise.resolve({ data: null })), [myTeamId]);
  const [filter, setFilter] = useState('todos');
  const [confirming, setConfirming] = useState(null);
  const message = useRef('');
  const refresh = () => { query.retry(); myTeam.retry(); };
  const act = useApiMutation((operation, signal) => operation(signal), { onSuccess: () => { setConfirming(null); toast({ tone: 'money', title: message.current }); refresh(); } });
  const run = (operation, text) => { message.current = text; act.execute(operation); };
  const rows = Array.isArray(query.data) ? query.data : [];
  const mine = myTeamId ? rows.find(row => row.teamId === myTeamId) ?? null : null;
  const balance = myTeam.data ? teamBalance(myTeam.data) : null;
  const canBuy = Boolean(myTeamId) && isPresidentOf(myTeamId);
  // Del más caro al más barato; a igual precio, por nombre.
  const shown = rows.filter(row => filter === 'todos' || (filter === 'libres' ? !row.teamId : Boolean(row.teamId)))
    .sort((left, right) => right.price - left.price || String(left.name).localeCompare(String(right.name)));
  return <main className="newspaper stadiums-page"><section className="team-list-paper">
    <header className="team-page-header"><p>CATÁLOGO DE LA LIGA</p><h1>ESTADIOS</h1><span>{rows.filter(row => !row.teamId).length} EN VENTA · {rows.filter(row => row.teamId).length} CON DUEÑO</span></header>
    {canBuy && <div className="stadiums-mine">
      <Icon name="stadium" size={18}/>
      <span>{mine ? <>TU ESTADIO: <b>{upper(mine.displayName ?? mine.name)}</b> · {people(mine.capacity)} PERSONAS</> : <>JUEGAS EN TU <b>CANCHA PROPIA</b> DE 12.000 PERSONAS</>}</span>
      {balance !== null && <small>SALDO {gpLabel(balance)}</small>}
      <p>Cada estadio tiene un solo dueño. Si te cambias, te devuelven el que tenías a precio de catálogo. Más aforo = más taquilla y conciertos más grandes. Cada estadio tiene sus sectores reales: una tribuna de pie es barata y se llena sola; los palcos dejan mucha plata si tu club es grande.</p>
    </div>}
    <nav className="stadiums-filter" role="tablist" aria-label="Filtrar estadios">{FILTERS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    <DataState query={query}/>
    {act.error && <Notice tone="error">{act.error.message}</Notice>}
    <div className="stadiums-grid">{shown.map(stadium => <StadiumCard key={stadium.id} stadium={stadium} myTeamId={myTeamId} mine={mine} balance={balance} canBuy={canBuy}
      canPhoto={isAdmin || (Boolean(stadium.teamId) && isPresidentOf(stadium.teamId))} confirming={confirming} setConfirming={setConfirming} busy={act.loading}
      onBuy={target => run(signal => endpoints.buyStadium(myTeamId, target.id, signal), `${mine ? 'TE CAMBIASTE A' : 'COMPRASTE'} ${upper(target.name)}`)}
      onSell={() => run(signal => endpoints.sellStadium(myTeamId, signal), `VENDISTE ${upper(mine?.name)}`)} onChanged={refresh}/>)}</div>
  </section></main>;
}
