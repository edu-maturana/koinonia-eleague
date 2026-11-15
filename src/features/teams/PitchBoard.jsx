import { Fragment, useEffect, useRef, useState } from 'react';
import { hasCoachBoost } from '../../utils/managerBoosters.js';
import { endpoints } from '../../api/endpoints.js';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { applyFormation, defaultFormationPositions, detectFormation, FORMATIONS, pitchPositionFor, playerAtPosition, fieldPositionAt, ZONE_SPOTS } from '../../utils/formationPositions.js';
import { shortPlayerName } from '../../utils/playerNames.js';
import { FormFeedback } from '../admin/FormFeedback.jsx';
import { useApiMutation } from '../admin/useApiMutation.js';
import { SimulationTools } from './SimulationTools.jsx';

// Perspectiva de la cancha (solo escritorio). La cancha se guarda en coordenadas
// "reales" 0–100; project() las lleva a pantalla: más estrecha y comprimida arriba.
const FLAT = { top: 1, depth: 0, inset: 0 };
const PERSPECTIVE = { top: 0.74, depth: 0.28, inset: 7 };
const PERSPECTIVE_QUERY = '(min-width: 901px)';
// En el simulador cada carta lleva su precio debajo: más margen para que no se corte.
const SIM_INSET = { flat: 8, perspective: 10 };

function makeProjection({ top, depth, inset }) {
  // inset: margen vertical (en %) para que las cartas de los extremos no se corten.
  const span = 100 - inset * 2;
  const widthAt = t => top + (1 - top) * t;
  const project = (x, y) => {
    const t = y / 100;
    return { x: 50 + (x - 50) * widthAt(t), y: inset + (span * (t + depth * t * t)) / (1 + depth), scale: 0.86 + 0.14 * t };
  };
  const unproject = (sx, sy) => {
    const v = ((sy - inset) / span) * (1 + depth);
    const t = depth ? (-1 + Math.sqrt(1 + 4 * depth * v)) / (2 * depth) : v;
    return { x: 50 + (sx - 50) / widthAt(t), y: t * 100 };
  };
  return { project, unproject, flat: top === 1 };
}

function usePerspective() {
  const [enabled, setEnabled] = useState(() => typeof window !== 'undefined' && window.matchMedia(PERSPECTIVE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(PERSPECTIVE_QUERY);
    const update = () => setEnabled(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return enabled;
}

// Líneas y franjas de la cancha dibujadas ya proyectadas (viewBox 0–100 estirado).
function PitchLines({ projection }) {
  const point = (x, y) => { const p = projection.project(x, y); return `${p.x},${p.y}`; };
  const polygon = points => points.map(([x, y]) => point(x, y)).join(' ');
  const stripes = Array.from({ length: 10 }, (_, index) => polygon([[0, index * 10], [100, index * 10], [100, index * 10 + 10], [0, index * 10 + 10]]));
  const circle = Array.from({ length: 48 }, (_, index) => { const angle = (Math.PI * 2 * index) / 48; return [50 + Math.cos(angle) * 13, 50 + Math.sin(angle) * 10.8]; });
  return <svg className="pitch-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {stripes.map((points, index) => <polygon key={index} points={points} className={index % 2 ? 'pitch-stripe-dark' : 'pitch-stripe-light'}/>)}
    <g className="pitch-svg-lines">
      <polygon points={polygon([[0, 0], [100, 0], [100, 100], [0, 100]])}/>
      <polyline points={polygon([[0, 50], [100, 50]])}/>
      <polygon points={polygon(circle)}/>
      <polyline points={polygon([[26, 0], [26, 13], [74, 13], [74, 0]])}/>
      <polyline points={polygon([[26, 100], [26, 87], [74, 87], [74, 100]])}/>
    </g>
  </svg>;
}

// Mientras se arrastra un titular, la cancha marca dónde rinde: cada puesto con su aptitud (natural / semi / ninguna)
// y la media que tendría ahí, como el mapa de la ficha del jugador. El puesto donde está parado se resalta.
function PitchZones({ player, at, projection }) {
  const current = fieldPositionAt(at, player.position);
  return <div className="pitch-zones" aria-hidden="true">{ZONE_SPOTS.map(([code, x, y]) => {
    const screen = projection.project(x, y);
    const level = player.positionLevels?.[code] ?? (code === player.position ? 2 : 0);
    const overall = player.overallByPosition?.[code];
    return <span key={code} className={`pitch-zone level-${level} ${code === current ? 'current' : ''}`} style={{ left: `${screen.x}%`, top: `${screen.y}%` }}>{code}{overall != null && <b>{overall}</b>}</span>;
  })}</div>;
}

const openPlayer = player => { window.location.hash = `/jugadores/${encodeURIComponent(player.id)}`; };

// Carta al estilo eFootballDB: media y posición a la izquierda, foto a la derecha
// sobre los colores del club y el nombre en una franja inferior.
function PitchCard({ player, selected, swappable, editing, style, onPointerDown, onPointerMove, onPointerUp, onClick, bench, isNew, highlighted, mark }) {
  const offPosition = player.fieldPosition && player.fieldPosition !== player.naturalPosition;
  return <button type="button" className={`pitch-card ${bench ? 'bench' : ''} ${offPosition ? 'off-position' : ''} ${selected ? 'selected' : ''} ${swappable ? 'swappable' : ''} ${editing ? 'editing' : ''} ${isNew ? 'sim-new' : ''} ${highlighted ? 'just-added' : ''} ${mark ? 'has-exit-mark' : ''}`} style={style} draggable={false} onDragStart={event => event.preventDefault()} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick} aria-pressed={editing ? selected : undefined} aria-label={`${player.name}${editing ? (selected ? ', seleccionado' : '') : ', ver ficha'}`}>
    <span className="pitch-card-stats">{hasCoachBoost(player)
      ? <><b className="pitch-card-ovr coach" title={`Media con DT: ${player.overallWithCoach} (base ${player.overall})`}>{player.overallWithCoach}</b><em className="pitch-card-base" title="Media base">{player.overall}</em></>
      : <b>{player.overall ?? '—'}</b>}<small title={offPosition ? `Juega de ${player.fieldPosition}; su puesto es ${player.naturalPosition}` : undefined}>{player.position ?? '—'}</small></span>
    <span className="pitch-card-photo"><PlayerFace src={player.faceUrl} name={player.name} className="pitch-card-face"/></span>
    <span className="pitch-card-name"><i>{player.jerseyNumber ?? '–'}</i>{shortPlayerName(player)}</span>
    {mark && <em className="pitch-card-exit" title={mark.title}>SALE</em>}
  </button>;
}

// Cancha estilo FIFA, editable de inmediato: se toca un titular y luego un suplente
// (cambio) u otro titular (intercambian posiciones); también se puede arrastrar.
// Con readOnly (ficha de partido) solo se muestra y cada carta abre la ficha del jugador.
// Con bare se omiten cabecera, ayuda y banca.
// Con simulation los cambios no van a la API: se delegan en sus callbacks (onSwap, onMove,
// onReorder, onPrice, onResetPrice, onRemove) y cada carta muestra su precio editable.
export function PitchBoard({ team, starters, substitutes = [], onChanged, readOnly = false, bare = false, simulation = null, className = '', aside = null, actions = null, marks = null }) {
  const editing = !readOnly;
  const [selectedId, setSelectedId] = useState(null);
  const [localPositions, setLocalPositions] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const pitchRef = useRef(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const signature = starters.map(player => `${player.id}:${player.pitchX}:${player.pitchY}`).join('|');
  useEffect(() => setLocalPositions({}), [signature]);
  const perspective = usePerspective();
  const base = perspective ? PERSPECTIVE : FLAT;
  const projection = makeProjection(simulation ? { ...base, inset: perspective ? SIM_INSET.perspective : SIM_INSET.flat } : base);
  const defaults = defaultFormationPositions(starters);
  const positionOf = player => localPositions[player.id] ?? pitchPositionFor(player, defaults);
  const done = () => { setSelectedId(null); onChanged?.(); };
  const apiSwap = useApiMutation(({ starterId, substituteId }, signal) => endpoints.swapSquadMembers(team.id, starterId, substituteId, signal), { onSuccess: done });
  // Reordena la banca intercambiando dos suplentes; los titulares mantienen su orden.
  const apiReorder = useApiMutation((bench, signal) => endpoints.updateSquadOrder(team.id, [...starters, ...bench].map((player, index) => ({ playerId: player.id, squadOrder: index + 1 })), signal), { onSuccess: done });
  const apiMove = useApiMutation((updates, signal) => Promise.all(updates.map(({ id, x, y }) => endpoints.updateSquadMember(team.id, id, { pitchX: x, pitchY: y }, signal))), { onSuccess: done });
  // En simulación el mismo flujo corre en local y al instante.
  const local = handler => ({ loading: false, execute: args => { handler(args); done(); } });
  const swap = simulation ? local(({ starterId, substituteId }) => simulation.onSwap({ starterId, substituteId, position: positionOf(starters.find(player => player.id === starterId)) })) : apiSwap;
  const reorder = simulation ? local(simulation.onReorder) : apiReorder;
  const move = simulation ? local(simulation.onMove) : apiMove;
  const busy = swap.loading || move.loading || reorder.loading;
  const dragged = starters.find(player => player.id === draggingId);
  const selected = starters.find(player => player.id === selectedId) ?? substitutes.find(player => player.id === selectedId);
  const selectedIsBench = substitutes.some(player => player.id === selectedId);
  const colors = team?.colors ?? {};
  const cardColors = { '--card-primary': colors.primary ?? '#062764', '--card-secondary': colors.secondary ?? '#a90020', '--card-tertiary': colors.tertiary ?? colors.secondary ?? '#ffd42a' };

  const pointFor = event => {
    const rect = pitchRef.current.getBoundingClientRect();
    const { x, y } = projection.unproject(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
    return { x: Math.min(95, Math.max(5, x)), y: Math.min(94, Math.max(6, y)) };
  };
  const onPointerDown = player => event => {
    if (!editing || busy) return;
    drag.current = { id: player.id, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = player => event => {
    const current = drag.current;
    if (!current || current.id !== player.id) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.moved = true;
    setDraggingId(player.id);
    setLocalPositions(positions => ({ ...positions, [player.id]: pointFor(event) }));
  };
  const onPointerUp = player => event => {
    const current = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (!current?.moved) return;
    justDragged.current = true;
    const { x, y } = pointFor(event);
    move.execute([{ id: player.id, x, y }]);
  };
  const onStarterClick = player => () => {
    if (justDragged.current) { justDragged.current = false; return; }
    if (!editing) { openPlayer(player); return; }
    if (busy) return;
    if (!selectedId) { setSelectedId(player.id); return; }
    if (selectedId === player.id) { setSelectedId(null); return; }
    if (selectedIsBench) { swap.execute({ starterId: player.id, substituteId: selectedId }); return; }
    // Dos titulares: intercambian su lugar en la cancha.
    const first = positionOf(selected);
    const second = positionOf(player);
    setLocalPositions(positions => ({ ...positions, [selected.id]: second, [player.id]: first }));
    move.execute([{ id: selected.id, ...second }, { id: player.id, ...first }]);
  };
  const onBenchClick = player => () => {
    if (!editing) { openPlayer(player); return; }
    if (busy) return;
    if (!selectedId) { setSelectedId(player.id); return; }
    if (selectedId === player.id) { setSelectedId(null); return; }
    if (!selectedIsBench) { swap.execute({ starterId: selectedId, substituteId: player.id }); return; }
    // Dos suplentes: intercambian su lugar en la banca.
    const bench = [...substitutes];
    const from = bench.findIndex(item => item.id === selectedId);
    const to = bench.findIndex(item => item.id === player.id);
    [bench[from], bench[to]] = [bench[to], bench[from]];
    reorder.execute(bench);
  };
  const currentFormation = detectFormation(starters, positionOf);
  const onFormation = event => {
    const formation = FORMATIONS.find(item => item.key === event.target.value);
    if (!formation || busy) return;
    const placed = applyFormation(starters, formation, positionOf);
    setLocalPositions(placed);
    setSelectedId(null);
    move.execute(Object.entries(placed).map(([id, { x, y }]) => ({ id: starters.find(player => String(player.id) === id).id, x, y })));
  };
  const formationPicker = editing && starters.length > 0 && <label className="pitch-board-formation">FORMACIÓN
    <select value={currentFormation ?? ''} onChange={onFormation} disabled={busy}>
      <option value="" disabled>Personalizada</option>
      {FORMATIONS.map(item => <option key={item.key} value={item.key}>{item.key}</option>)}
    </select>
  </label>;
  const hint = readOnly ? '' : selected
    ? <>{shortPlayerName(selected)} seleccionado: {selectedIsBench ? 'toca un titular para que entre, u otro suplente para cambiar el orden de la banca.' : 'toca un suplente para hacer el cambio u otro titular para intercambiar posiciones.'} {!simulation && <><button type="button" className="pitch-board-link" onClick={() => openPlayer(selected)}>Ver ficha →</button> </>}<button type="button" className="pitch-board-link" onClick={() => setSelectedId(null)}>Cancelar</button></>
    : simulation ? 'Arrastra las cartas para moverlas, toca dos para intercambiarlas y toca el precio para editarlo. Nada de esto modifica el plantel real.' : '';
  const tools = player => <SimulationTools name={shortPlayerName(player)} value={simulation.priceOf(player)} edited={simulation.isEdited(player)} onPrice={value => simulation.onPrice(player, value)} onReset={() => simulation.onResetPrice(player)} onRemove={() => simulation.onRemove(player)}/>;
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = event => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);
  const center = projection.project(50, 50);
  const field = starters.length ? <div className={`pitch-board-field ${projection.flat ? '' : 'in-perspective'}`} ref={pitchRef}>
    <PitchLines projection={projection}/>
    {team && <span className="pitch-watermark" style={{ top: `${center.y}%` }} aria-hidden="true"><TeamMark team={team}/></span>}
    {dragged && <PitchZones player={dragged} at={positionOf(dragged)} projection={projection}/>}
    {starters.map(player => {
      const position = positionOf(player);
      const shown = playerAtPosition(player, position);
      const screen = projection.project(position.x, position.y);
      const style = { left: `${screen.x}%`, top: `${screen.y}%`, '--depth-scale': screen.scale, zIndex: selectedId === player.id ? 30 : 1 + Math.round(position.y / 10) };
      const card = <PitchCard player={shown} editing={editing} selected={selectedId === player.id} style={simulation ? undefined : style} isNew={simulation?.isNew(player)} highlighted={simulation?.isHighlighted(player)} mark={marks?.get(player.id)} onPointerDown={onPointerDown(player)} onPointerMove={onPointerMove(player)} onPointerUp={onPointerUp(player)} onClick={onStarterClick(player)}/>;
      return simulation ? <div className="pitch-slot" key={player.id} style={style}>{card}{tools(player)}</div> : <Fragment key={player.id}>{card}</Fragment>;
    })}
  </div> : <p className="empty-copy">NO HAY TITULARES DEFINIDOS.</p>;

  if (bare) return <div className="pitch-board pitch-board-bare" style={cardColors}>{field}</div>;
  return <section className={`club-card pitch-board is-editing ${className}`} style={cardColors}>
    <header><h3>ALINEACIÓN <small>{starters.length} TITULARES · {substitutes.length} SUPLENTES</small></h3>{aside}</header>
    {/* La misma carta muestra hasta tres medias según dónde se mire: aquí manda el puesto en la cancha. */}
    <p className="pitch-legend"><b>84</b> media en el puesto donde juega, con los potenciadores del DT · <em>81</em> la misma sin DT. En la ficha del jugador y en contratos va la media de su puesto natural.</p>
    {(busy || hint) && <p className="pitch-board-hint" role="status">{busy ? 'GUARDANDO…' : hint}</p>}
    {(formationPicker || actions) && <div className="pitch-board-tools">{formationPicker}{actions}</div>}
    {field}
    <div className="pitch-board-bench"><h4>BANCA</h4>{substitutes.length ? <div>{substitutes.map(player => {
      const card = <PitchCard bench player={player} editing={editing} selected={selectedId === player.id} swappable={Boolean(selectedId) && selectedId !== player.id} isNew={simulation?.isNew(player)} highlighted={simulation?.isHighlighted(player)} mark={marks?.get(player.id)} onClick={onBenchClick(player)}/>;
      return simulation ? <div className="pitch-bench-slot" key={player.id}>{card}{tools(player)}</div> : <Fragment key={player.id}>{card}</Fragment>;
    })}</div> : <p className="empty-copy">SIN SUPLENTES.</p>}</div>
    {!simulation && <><FormFeedback mutation={swap}/><FormFeedback mutation={move}/><FormFeedback mutation={reorder}/></>}
  </section>;
}
