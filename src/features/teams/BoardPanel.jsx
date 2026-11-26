import { endpoints } from '../../api/endpoints.js';
import { gpLabel } from '../../utils/money.js';
import { useApiQuery } from '../public/useApiQuery.js';
import { HowItWorks } from '../../ui/index.js';

const STATUS = { pending: ['⏳', 'EN CURSO'], met: ['✅', 'CUMPLIDO'], failed: ['❌', 'FALLADO'] };
const upper = text => String(text ?? '').toUpperCase();

/** Lo que la directiva le exige al club en el torneo en curso, y cómo le fue en los anteriores. */
export function BoardPanel({ team }) {
  const query = useApiQuery(signal => endpoints.teamObjectives(team.id, signal), [team.id]);
  const rows = Array.isArray(query.data) ? query.data : [];
  if (!rows.length) return null;
  const tournaments = [...new Set(rows.map(row => row.tournamentId))];
  const [current, ...past] = tournaments;
  const of = id => rows.filter(row => row.tournamentId === id);
  const block = id => <div className="board-block" key={id}>
    <h4>{upper(of(id)[0].tournamentName)}</h4>
    <ul>{of(id).map(row => {
      const [icon, label] = STATUS[row.status];
      return <li key={row.id} className={`board-${row.status}`}>
        <span>{icon}</span>
        <span><b>{upper(row.text)}</b><small>{label}{row.status !== 'pending' && row.kind !== 'payroll' ? (row.result != null ? ` · TERMINASTE ${row.result}º` : row.status === 'met' ? ' · YA ASEGURADO, TORNEO EN CURSO' : ' · YA IMPOSIBLE, TORNEO EN CURSO') : ''}</small></span>
        <em>{row.status === 'failed' ? `ÁNIMO ${row.moodEffect}` : `PREMIO ${gpLabel(row.reward)}${row.status === 'met' ? ` · ÁNIMO +${row.moodEffect}` : ''}`}</em>
      </li>;
    })}</ul>
  </div>;
  return <section className="board-panel">
    <header><h3>Objetivos de la directiva</h3><p>Se evalúan al terminar el torneo, o antes si el puesto ya quedó asegurado o perdido.</p><HowItWorks><p>La directiva te exige esto según tus resultados de las dos últimas ligas y la historia del club. Si cumples, el dueño pone plata (aporte del dueño) y los jugadores se animan; si fallas, se desaniman.</p></HowItWorks></header>
    {block(current)}
    {past.length > 0 && <details><summary>TORNEOS ANTERIORES</summary>{past.map(block)}</details>}
  </section>;
}
