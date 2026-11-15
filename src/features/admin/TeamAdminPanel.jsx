import { useEffect, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { teamBalance, teamCoachName, teamCoachPhoto } from '../../utils/teamPresentation.js';
import { readPersonProfile, savePersonProfile } from '../../utils/personProfile.js';
import { fallbackKitColors } from '../news/newsSceneRenderer.js';
import { FormFeedback } from './FormFeedback.jsx';
import { useApiMutation } from './useApiMutation.js';
import { ManagerPicker, PlayStyleSelect } from '../teams/ManagerCard.jsx';
import { gpLabel } from '../../utils/money.js';
import { GpInput } from '../../components/GpInput.jsx';
import { Button } from '../../ui/index.js';

const numberOrUndefined = value => value === '' ? undefined : Number(value);

function MediaImageField({ label, entityType, entityId, onUploaded }) {
  const upload = useApiMutation((file, signal) => endpoints.uploadImage(file, { entityType, entityId }, signal), {
    onSuccess: response => onUploaded(response?.data?.secureUrl ?? response?.secureUrl ?? ''),
  });
  return <div className="media-image-field"><label>{label}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={upload.loading} onChange={event => { const file = event.target.files?.[0]; if (file) upload.execute(file); }}/></label><small>JPG, PNG, WEBP, GIF O AVIF · MÁXIMO 5 MB</small><FormFeedback mutation={upload}/></div>;
}

function ColorPickerField({ label, value, onChange }) {
  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pickFromScreen = async () => {
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) onChange(result.sRGBHex.toUpperCase());
    } catch {
      // usuario canceló la pipeta
    }
  };
  return <label className="color-picker-field">
    {label}
    <span className="color-picker-controls">
      <input type="color" value={value} onChange={event => onChange(event.target.value.toUpperCase())}/>
      <input type="text" value={value} maxLength={7} onChange={event => onChange(event.target.value.toUpperCase())}/>
      {supportsEyeDropper && <button type="button" className="color-eyedropper-button" onClick={pickFromScreen} aria-label={`Elegir ${label.toLowerCase()} con pipeta`} title="Elegir color con pipeta">💧</button>}
    </span>
  </label>;
}

// Ficha de imagen: la vista previa es el propio botón de subida (ocupa una sola fila con las otras dos y no alarga el modal).
// El fondo es blanco a propósito: el emblema se ve a color real, sin el fondo oscuro del modal, y sirve para la pipeta.
function ImageTile({ label, hint, value, fallbackNote, entityId, onChange }) {
  const upload = useApiMutation((file, signal) => endpoints.uploadImage(file, { entityType: 'team', entityId }, signal), {
    onSuccess: response => onChange(response?.data?.secureUrl ?? response?.secureUrl ?? ''),
  });
  return <div className="image-tile">
    <span className="image-tile-label">{label}</span>
    <label className={`image-tile-drop${value ? ' has-image' : ''}${upload.loading ? ' is-loading' : ''}`} title={hint}>
      {value ? <img src={value} alt={label}/> : <span className="image-tile-empty">{fallbackNote}</span>}
      <span className="image-tile-action">{upload.loading ? 'SUBIENDO…' : value ? 'CAMBIAR' : 'SUBIR'}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={upload.loading} onChange={event => { const file = event.target.files?.[0]; if (file) upload.execute(file); event.target.value = ''; }}/>
    </label>
    {value && fallbackNote && <button type="button" className="image-tile-clear" onClick={() => onChange('')}>QUITAR</button>}
    <FormFeedback mutation={upload}/>
  </div>;
}

export function ProfileForm({ team, onChanged, onSaved }) {
  const buildForm = source => ({
    name: source.name ?? '',
    imageUrl: source.imageUrl ?? '',
    championImageUrl: source.championImageUrl ?? '',
    cupChampionImageUrl: source.cupChampionImageUrl ?? '',
    colors: {
      primary: source.colors?.primary ?? fallbackKitColors.team.shirt,
      secondary: source.colors?.secondary ?? fallbackKitColors.team.shorts,
      tertiary: source.colors?.tertiary ?? fallbackKitColors.team.socks,
    },
  });
  const [form, setForm] = useState(() => buildForm(team));
  useEffect(() => setForm(buildForm(team)), [team]);
  const mutation = useApiMutation((body, signal) => endpoints.updateTeam(team.id, body, signal), { onSuccess: result => { onChanged?.(result); onSaved?.(); } });
  const submit = event => { event.preventDefault(); mutation.execute(form); };
  const setColor = (key, color) => setForm(current => ({ ...current, colors: { ...current.colors, [key]: color } }));
  const setField = key => value => setForm(current => ({ ...current, [key]: value }));
  return <form className="admin-form" onSubmit={submit}>
    <label>NOMBRE<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></label>
    <fieldset className="crest-images">
      <legend>IMÁGENES DEL CLUB</legend>
      <ImageTile label="EMBLEMA" hint="Escudo del club" value={form.imageUrl} entityId={team.id} onChange={setField('imageUrl')}/>
      <ImageTile label="CAMPEÓN E-LEAGUE" hint="Imagen de la noticia cuando el equipo gana la Koinonia E-League" fallbackNote="USA EL EMBLEMA" value={form.championImageUrl} entityId={team.id} onChange={setField('championImageUrl')}/>
      <ImageTile label="CAMPEÓN COPA GG" hint="Imagen de la noticia cuando el equipo gana la Copa Grande Giocatore" fallbackNote="USA LA DE E-LEAGUE" value={form.cupChampionImageUrl} entityId={team.id} onChange={setField('cupChampionImageUrl')}/>
      <small>JPG, PNG, WEBP, GIF O AVIF · MÁXIMO 5 MB. Si no subes una imagen de campeón, la noticia usa la de más arriba. La pipeta de los colores sirve sobre el emblema.</small>
    </fieldset>
    <ColorPickerField label="COLOR PRIMARIO" value={form.colors.primary} onChange={color => setColor('primary', color)}/>
    <ColorPickerField label="COLOR SECUNDARIO" value={form.colors.secondary} onChange={color => setColor('secondary', color)}/>
    <ColorPickerField label="COLOR TERCIARIO" value={form.colors.tertiary} onChange={color => setColor('tertiary', color)}/>
    <Button type="submit" disabled={mutation.loading}>GUARDAR PERFIL</Button>
    <FormFeedback mutation={mutation}/>
  </form>;
}

function CustomFieldsEditor({ fields, onChange }) {
  const update = (index, key, value) => onChange(fields.map((field, current) => current === index ? { ...field, [key]: value } : field));
  return <fieldset className="custom-fields-editor"><legend>CAMPOS PERSONALIZADOS</legend>{fields.map((field, index) => <div className="custom-field-row" key={field.key || index}><input value={field.label} onChange={event => update(index, 'label', event.target.value)} placeholder="Etiqueta (ej: Apodo)"/><input value={field.value} onChange={event => update(index, 'value', event.target.value)} placeholder="Valor"/><button type="button" onClick={() => onChange(fields.filter((_, current) => current !== index))} aria-label="Quitar campo">×</button></div>)}<Button onClick={() => onChange([...fields, { key: '', label: '', value: '' }])}>+ AGREGAR CAMPO</Button></fieldset>;
}

// La API persiste los tres datos del campo. Los campos nuevos aún no tienen
// key, por eso usamos su etiqueta como clave hasta que la API la normalice.
const customFieldsPayload = fields => fields.map(({ key, label, value }) => ({
  key: key || label,
  label,
  value,
}));

export function PresidentForm({ team, onChanged, onSaved }) {
  const president = team.president;
  const metadata = readPersonProfile('president', president);
  const [form, setForm] = useState({ name: president?.name ?? team.presidentName ?? '', imageUrl: president?.imageUrl ?? '', age: metadata.age, country: metadata.country, customFields: president?.customFields ?? [] });
  useEffect(() => {
    const nextMetadata = readPersonProfile('president', president);
    setForm({ name: president?.name ?? team.presidentName ?? '', imageUrl: president?.imageUrl ?? '', age: nextMetadata.age, country: nextMetadata.country, customFields: president?.customFields ?? [] });
  }, [president?.id, president?.name, president?.imageUrl, team.presidentName]);
  const mutation = useApiMutation((body, signal) => endpoints.updatePresident(president.id, body, signal), { onSuccess: result => {
    savePersonProfile('president', president.id, form);
    onChanged?.(result);
    onSaved?.();
  } });
  if (!president?.id) return <p className="admin-empty">Este equipo no tiene un presidente editable asignado.</p>;
  return <form className="admin-form person-editor-form" onSubmit={event => { event.preventDefault(); mutation.execute({ name: form.name, imageUrl: form.imageUrl, age: form.age === '' ? null : Number(form.age), nationality: form.country, customFields: customFieldsPayload(form.customFields) }); }}><label>NOMBRE DEL PRESIDENTE<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></label><label>EDAD<input type="number" min="1" max="120" value={form.age} onChange={event => setForm(current => ({ ...current, age: event.target.value }))}/></label><label>PAÍS<input value={form.country} onChange={event => setForm(current => ({ ...current, country: event.target.value }))} placeholder="PAÍS"/></label><CustomFieldsEditor fields={form.customFields} onChange={customFields => setForm(current => ({ ...current, customFields }))}/><MediaImageField label="SUBIR FOTO DEL PRESIDENTE" entityType="president" entityId={president.id} onUploaded={imageUrl => setForm(current => ({ ...current, imageUrl }))}/><Button type="submit" disabled={mutation.loading}>GUARDAR PRESIDENTE</Button><FormFeedback mutation={mutation}/></form>;
}

export function CoachForm({ team, onChanged, onSaved }) {
  const coachId = team.coach?.id ?? team.manager?.id ?? team.coachId ?? team.managerId;
  const coach = team.coach ?? team.manager ?? (coachId ? { id: coachId } : null);
  const presentedName = teamCoachName(team);
  const presentedPhoto = teamCoachPhoto(team);
  const metadata = readPersonProfile('coach', coach);
  const [form, setForm] = useState({
    name: presentedName === 'No informado' ? '' : presentedName,
    imageUrl: presentedPhoto,
    age: metadata.age,
    country: metadata.country, customFields: coach?.customFields ?? [],
    manager: coach?.manager ?? null, playStyle: coach?.playStyle ?? null,
  });
  useEffect(() => {
    const nextMetadata = readPersonProfile('coach', coach);
    setForm({
      name: presentedName === 'No informado' ? '' : presentedName,
      imageUrl: presentedPhoto,
      age: nextMetadata.age,
      country: nextMetadata.country, customFields: coach?.customFields ?? [],
      manager: coach?.manager ?? null, playStyle: coach?.playStyle ?? null,
    });
  }, [coachId, presentedName, presentedPhoto]);
  const mutation = useApiMutation((body, signal) => coachId
    ? endpoints.updateCoach(coachId, body, signal)
    : endpoints.createCoach({ ...body, teamId: team.id }, signal), { onSuccess: result => {
      savePersonProfile('coach', coachId ?? result?.data?.id ?? result?.id, form);
      onChanged?.(result);
      onSaved?.();
    } });
  return <form className="admin-form person-editor-form" onSubmit={event => { event.preventDefault(); mutation.execute({ name: form.name.trim(), imageUrl: form.imageUrl, age: form.age === '' ? null : Number(form.age), nationality: form.country, efootballManagerPesId: form.manager?.pesId ?? null, efootballPlayStyle: form.manager ? form.playStyle : null, customFields: customFieldsPayload(form.customFields) }); }}><ManagerPicker value={form.manager} onChange={manager => setForm(current => ({ ...current, manager, name: current.name.trim() || !manager ? current.name : manager.name, age: current.age === '' && manager?.age ? manager.age : current.age, country: current.country || manager?.country || '', playStyle: manager?.pesId === current.manager?.pesId ? current.playStyle : null }))}/><PlayStyleSelect manager={form.manager} value={form.playStyle} onChange={playStyle => setForm(current => ({ ...current, playStyle }))}/><label>NOMBRE DEL DT<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="DIRECTOR TÉCNICO"/></label><label>EDAD<input type="number" min="1" max="120" value={form.age} onChange={event => setForm(current => ({ ...current, age: event.target.value }))}/></label><label>PAÍS<input value={form.country} onChange={event => setForm(current => ({ ...current, country: event.target.value }))} placeholder="PAÍS"/></label><CustomFieldsEditor fields={form.customFields} onChange={customFields => setForm(current => ({ ...current, customFields }))}/><MediaImageField label="SUBIR FOTO DEL DT" entityType="coach" entityId={coachId} onUploaded={imageUrl => setForm(current => ({ ...current, imageUrl }))}/><Button type="submit" disabled={!form.name.trim() || mutation.loading}>GUARDAR DT</Button><FormFeedback mutation={mutation}/></form>;
}

function TeamProfileEditor({ team, onChanged }) {
  return <div className="team-profile-editor"><section><h2>PERFIL DEL CLUB</h2><ProfileForm team={team} onChanged={onChanged}/></section><section><h2>PRESIDENTE</h2><PresidentForm team={team} onChanged={onChanged}/></section><section><h2>DIRECTOR TÉCNICO</h2><CoachForm team={team} onChanged={onChanged}/></section><section><h2>PRESUPUESTO</h2><BudgetForm team={team} onChanged={onChanged}/></section></div>;
}

export function BudgetForm({ team, onChanged }) {
  const balance = teamBalance(team) ?? 0;
  const [form, setForm] = useState({ amount: '', reason: '' });
  const credit = useApiMutation((body, signal) => endpoints.creditTeam(team.id, body, signal), { onSuccess: onChanged });
  const debit = useApiMutation((body, signal) => endpoints.debitTeam(team.id, body, signal), { onSuccess: onChanged });
  const payload = () => ({ amount: Number(form.amount), reason: form.reason });
  const submitCredit = () => credit.execute(payload());
  const submitDebit = () => {
    if (window.confirm(`¿DEBITAR ${form.amount} GP DE ${team.name}?`)) debit.execute(payload());
  };
  return <div className="admin-form"><p className="balance-label">SALDO INFORMADO <b>{gpLabel(balance)}</b></p><label>MONTO<GpInput required value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))}/></label><label>MOTIVO<input value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}/></label><div className="button-row"><Button variant="positive" disabled={!form.amount || credit.loading || debit.loading} onClick={submitCredit}>ACREDITAR</Button><Button variant="danger" disabled={!form.amount || !form.reason || credit.loading || debit.loading} onClick={submitDebit}>DEBITAR</Button></div><FormFeedback mutation={credit.error || credit.success ? credit : debit}/></div>;
}

export function SquadEditor({ team, squad, onChanged }) {
  const [ordered, setOrdered] = useState([]);
  const [draggedId, setDraggedId] = useState('');
  useEffect(() => setOrdered([...squad].sort((a, b) => (a.squadOrder ?? 999) - (b.squadOrder ?? 999)).map(player => ({ ...player }))), [squad]);
  const mutation = useApiMutation(async (players, signal) => {
    await endpoints.updateSquadOrder(team.id, players.map((player, index) => ({ playerId: player.id, squadOrder: index + 1 })), signal);
    await Promise.all(players.map((player, index) => endpoints.updateSquadMember(team.id, player.id, {
      jerseyNumber: numberOrUndefined(player.jerseyNumber),
      isStarter: index < 11,
    }, signal)));
  }, { onSuccess: onChanged });
  const dropAt = (event, targetIndex) => {
    event.preventDefault();
    event.stopPropagation();
    const playerId = event.dataTransfer.getData('text/plain') || draggedId;
    setOrdered(current => {
      const sourceIndex = current.findIndex(player => player.id === playerId);
      if (sourceIndex < 0) return current;
      const next = [...current];
      if (targetIndex < next.length) [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      else next.push(...next.splice(sourceIndex, 1));
      return next;
    });
    setDraggedId('');
  };
  const startDrag = (event, playerId) => {
    setDraggedId(playerId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playerId);
  };
  // Dorsales usados por más de un jugador: se marcan en amarillo y no dejan guardar.
  const jerseyOf = player => { const number = Number(player.jerseyNumber); return player.jerseyNumber === null || player.jerseyNumber === '' || !Number.isInteger(number) || number < 1 ? null : number; };
  const jerseyCount = new Map();
  ordered.forEach(player => { const number = jerseyOf(player); if (number !== null) jerseyCount.set(number, (jerseyCount.get(number) ?? 0) + 1); });
  const clashes = [...jerseyCount].filter(([, count]) => count > 1).map(([number]) => number).sort((a, b) => a - b);
  const clashSet = new Set(clashes);
  const updateJersey = (playerId, jerseyNumber) => setOrdered(current => current.map(player => player.id === playerId ? { ...player, jerseyNumber } : player));
  const listHeader = <div className="squad-list-header"><b>N.º</b><small>POS.</small><span>NOMBRE</span><em>DORSAL</em></div>;
  const playerRow = (player, index) => <div className={`squad-drag-row${clashSet.has(jerseyOf(player)) ? ' jersey-clash' : ''}`} key={player.id} onDragOver={event => event.preventDefault()} onDrop={event => dropAt(event, index)}>
    <button type="button" className="squad-slot-number" draggable onDragStart={event => startDrag(event, player.id)} onDragEnd={() => setDraggedId('')} aria-label={`Mover a ${player.name}`} title="Arrastrar jugador">{index + 1}</button>
    <small>{player.position ?? '—'}</small><strong>{player.name}</strong>
    <label><span>DORSAL</span><input aria-label={`Dorsal de ${player.name}`} type="number" min="1" max="99" value={player.jerseyNumber ?? ''} onChange={event => updateJersey(player.id, event.target.value)}/></label>
  </div>;
  if (!squad.length) return <p className="admin-empty">No hay jugadores asignados a este equipo.</p>;
  return <div className="squad-board"><p className="squad-help">Arrastra desde el número de un jugador y suéltalo sobre otro para intercambiarlos. Los puestos 1 a 11 son titulares.</p><div className="squad-board-columns"><section><h3>TITULARES <small>11 PUESTOS</small></h3>{listHeader}{Array.from({ length: 11 }, (_, index) => ordered[index] ? playerRow(ordered[index], index) : <div className="squad-empty-slot" key={index} onDragOver={event => event.preventDefault()} onDrop={event => dropAt(event, index)}><b>{index + 1}</b><span>ARRASTRA UN JUGADOR AQUÍ</span></div>)}</section><section className="substitutes-drop-zone" onDragOver={event => event.preventDefault()} onDrop={event => dropAt(event, ordered.length)}><h3>SUPLENTES <small>{Math.max(ordered.length - 11, 0)}</small></h3>{listHeader}{ordered.slice(11).map((player, offset) => playerRow(player, offset + 11))}{ordered.length <= 11 && <div className="squad-empty-slot"><span>Arrastra aquí para mover a suplentes</span></div>}</section></div><Button className="squad-save-button" type="submit" disabled={!ordered.length || mutation.loading || clashes.length > 0} onClick={() => mutation.execute(ordered)}>GUARDAR PLANTEL COMPLETO</Button>{clashes.length > 0 && <p className="jersey-clash-note" role="alert">⚠ {clashes.length === 1 ? 'El dorsal' : 'Los dorsales'} {clashes.join(', ')} {clashes.length === 1 ? 'está' : 'están'} repetido{clashes.length === 1 ? '' : 's'}: cada jugador necesita uno distinto para poder guardar.</p>}<FormFeedback mutation={mutation}/></div>;
}


export function TeamAdminPanel({ team, squad, onChanged }) {
  const [tab, setTab] = useState('profile');
  const tabs = [['profile','PERFIL'],['squad','PLANTEL']];
  return <section className="team-admin"><header><p>Gestión pública del equipo</p><nav>{tabs.map(([value, label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}</nav></header>{tab === 'profile' && <TeamProfileEditor team={team} onChanged={onChanged}/>} {tab === 'squad' && <SquadEditor team={team} squad={squad} onChanged={onChanged}/>}</section>;
}
