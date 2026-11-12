import { PlayerFace } from '../../components/PlayerFace.jsx';
import { gpNumber } from '../../utils/money.js';
const FLAG_REGEX = /^(\p{Regional_Indicator}{2})\s*/u;
const splitPlayerName = name => ({ rest: (name ?? '').replace(FLAG_REGEX, '').trim() });

/** Qué se mueve y cuándo: lo ya cerrado (traspasos y trueques aprobados) que todavía no se ejecuta. */
export function pendingSummary(data) {
  const moves = data?.moves ?? [];
  const leaving = data?.leaving ?? [];
  const arriving = data?.arriving ?? [];
  const when = [...new Set(moves.map(move => move.executes.label))];
  return { moves, leaving, arriving, when, any: moves.length > 0, cash: data?.alreadySettledGp ?? 0 };
}

/** Jugador que sale → etiqueta para la cancha y la tabla. */
export function leavingMarks(data) {
  const marks = new Map();
  for (const move of data?.moves ?? []) {
    if (move.direction === 'in') continue;
    const swap = move.swapPlayer ? ` por ${splitPlayerName(move.swapPlayer.name).rest}` : '';
    marks.set(move.player.id, { title: `Sale${move.type === 'loan' ? ' a préstamo' : ''} ${move.executes.label} → ${move.counterpart.name}${swap}`, club: move.counterpart.name, swap: move.swapPlayer ?? null, when: move.executes.label });
  }
  return marks;
}

/** Plantel como quedará: sin los que salen y con los que llegan (marcados). */
export function projectedRoster(roster, data) {
  const marks = leavingMarks(data);
  const stay = roster.filter(player => !marks.has(player.id));
  const incoming = (data?.moves ?? []).flatMap(move => {
    const arriving = move.type !== 'trade' ? (move.direction === 'in' ? move.player : null) : move.swapPlayer;
    return arriving ? [{ ...arriving, incoming: { club: move.counterpart.name, when: move.executes.label } }] : [];
  });
  return { stay, incoming };
}

const money = value => `${value > 0 ? '+' : '−'}${gpNumber(Math.abs(value))} GP`;

function MoveLine({ move }) {
  const { rest: name } = splitPlayerName(move.player.name);
  const swapName = move.swapPlayer ? splitPlayerName(move.swapPlayer.name).rest : null;
  const text = move.type === 'trade'
    ? <><b>{name}</b> ⇄ <b>{swapName}</b> con {move.counterpart.name}</>
    : move.type === 'loan'
      ? (move.direction === 'out' ? <>Sale a préstamo <b>{name}</b> a {move.counterpart.name}</> : <>Llega a préstamo <b>{name}</b> desde {move.counterpart.name}</>)
      : move.direction === 'out' ? <>Sale <b>{name}</b> a {move.counterpart.name}</> : <>Llega <b>{name}</b> desde {move.counterpart.name}</>;
  return <li className={`pending-move ${move.direction}`}>
    <PlayerFace src={move.player.faceUrl} name={name} className="roster-player-face"/>
    <span>{text}<small>{move.executes.label}</small></span>
    {move.gp !== 0 && <em title="Ya se movió al aceptar el acuerdo" className={move.gp > 0 ? 'gain' : 'cost'}>{money(move.gp)}</em>}
  </li>;
}

/** Tarjeta de arriba del plantel: resumen de lo comprometido y el selector Ahora / Después. */
export function PendingMovesCard({ data, mode = 'ahora', onMode = null }) {
  const { moves, leaving, arriving, when, any, cash } = pendingSummary(data);
  if (!any) return null;
  const after = when.length === 1 ? when[0] : 'cuando se ejecuten';
  return <section className="club-card pending-moves" aria-label="Movimientos ya cerrados">
    <header>
      <div>
        <h3>YA CERRADO, SE EJECUTA {when.length === 1 ? when[0].toUpperCase() : 'MÁS ADELANTE'}</h3>
        <p><b>{leaving.length}</b> {leaving.length === 1 ? 'salida' : 'salidas'} · <b>{arriving.length}</b> {arriving.length === 1 ? 'llegada' : 'llegadas'}{cash !== 0 && <> · plata de estos acuerdos {money(cash)} <small>(ya está en la caja)</small></>}</p>
      </div>
      {onMode && <nav className="squad-views" aria-label="Qué plantel ver">
        <button type="button" className={mode === 'ahora' ? 'on' : ''} aria-pressed={mode === 'ahora'} onClick={() => onMode('ahora')}>Ahora</button>
        <button type="button" className={mode === 'despues' ? 'on' : ''} aria-pressed={mode === 'despues'} onClick={() => onMode('despues')}>Después ({after})</button>
      </nav>}
    </header>
    <ul>{moves.map(move => <MoveLine key={`${move.type}-${move.id}`} move={move}/>)}</ul>
  </section>;
}

/** Mercado: «Mis preacuerdos», lo que mi club ya cerró y todavía no se ejecuta. */
export function MyPreagreements({ data }) {
  return <PendingMovesCard data={data}/>;
}
