import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamMark } from '../../components/TeamMark.jsx';

// "Momento de la temporada": el puesto de cada club al cerrar cada fecha (gráfico de posiciones). El 1.º arriba.
// Los colores de los clubes no son una paleta pensada para distinguirse (hay varios rojos), así que la identidad la
// llevan las etiquetas: el escudo al final de cada línea, los botones de club y la tabla. El color acompaña.

// El servidor manda las fechas cerradas y, si hay fechas a medio jugar (se adelantan y se atrasan), un último punto 'hoy'.
const roundLabel = round => (round === 'hoy' ? 'HOY' : `F${round}`);
const roundName = round => (round === 'hoy' ? 'HOY' : `FECHA ${round}`);

const SURFACE = '#f3ead5';
const MUTED_LINE = '#c9bea4';
const INK = '#4d4839';
const ROW = 28;
const TOP = 12;
const BOTTOM = 30;
const LEFT = 30;

const hexToRgb = hex => {
  const value = String(hex ?? '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
};
const luminance = rgb => {
  const [r, g, b] = rgb.map(channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const surfaceRgb = hexToRgb(SURFACE);

/** El color del club que se ve sobre el papel (contraste 3:1 para líneas): primario, secundario o terciario; si ninguno, tinta. */
export function readableTeamColor(team) {
  const options = [team?.primaryColor, team?.secondaryColor, team?.tertiaryColor, team?.colors?.primary, team?.colors?.secondary];
  for (const option of options) {
    const rgb = hexToRgb(option);
    if (rgb && contrast(rgb, surfaceRgb) >= 3) return option;
  }
  // Ninguno se ve (p. ej. celeste claro): el primario oscurecido hasta que se vea, así conserva su tono; sin color, tinta.
  const base = options.map(hexToRgb).find(Boolean);
  if (!base || Math.max(...base) - Math.min(...base) < 40) return INK;
  for (let factor = 0.9; factor > 0.2; factor -= 0.05) {
    const darker = base.map(channel => Math.round(channel * factor));
    if (contrast(darker, surfaceRgb) >= 3) return `#${darker.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return INK;
}

/** Colores del club que se leen sobre el papel, en orden de preferencia (primario, secundario, terciario). */
function readableOptions(team) {
  const options = [team?.primaryColor, team?.secondaryColor, team?.tertiaryColor, team?.colors?.primary, team?.colors?.secondary, team?.colors?.tertiary];
  return [...new Set(options.filter(option => { const rgb = hexToRgb(option); return rgb && contrast(rgb, surfaceRgb) >= 3; }))];
}
// Respaldo para cuando dos clubes comparten color (hay tres rojos y varios azul marino): tonos que se distinguen entre sí sobre el papel.
const SPARE = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#ff7f0e', '#393b79', '#637939', '#7b4173'];
// Distancia "redmean" entre dos colores: barata y bastante fiel a cómo se perciben.
const distance = (a, b) => { const r = (a[0] + b[0]) / 2; const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db); };
const MIN_GAP = 120;

/**
 * Un color por club que no se confunda con los demás: cada uno (de arriba hacia abajo en la tabla) se queda con su primer color
 * legible que esté lejos de los ya tomados; si ninguno sirve, toma uno del respaldo. Así el puntero conserva su color propio.
 */
export function distinctTeamColors(teams) {
  const taken = [];
  const far = hex => { const rgb = hexToRgb(hex); return rgb && taken.every(other => distance(rgb, other) >= MIN_GAP); };
  return teams.map(team => {
    const pick = readableOptions(team).find(far) ?? (far(readableTeamColor(team)) ? readableTeamColor(team) : null) ?? SPARE.find(far) ?? readableTeamColor(team);
    taken.push(hexToRgb(pick) ?? hexToRgb(INK));
    return pick;
  });
}

const ordinal = position => `${position}.º`;

function useWidth(enabled) {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return [ref, width];
}

export function SeasonBumpChart({ progression, resolveTeam, title = 'MOMENTO DE LA TEMPORADA' }) {
  const rounds = progression?.rounds ?? [];
  const teams = useMemo(() => {
    const rows = (progression?.teams ?? []).filter(team => team.positions?.length === rounds.length)
      .map(team => ({ ...team, full: resolveTeam({ id: team.teamId, name: team.name }) }))
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const colors = distinctTeamColors(rows.map(row => row.full));
    return rows.map((row, index) => ({ ...row, color: colors[index] }));
  }, [progression, resolveTeam, rounds.length]);
  const [pinned, setPinned] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [column, setColumn] = useState(null);
  const [ref, width] = useWidth(rounds.length >= 2);
  const active = hovered ?? pinned;

  if (rounds.length < 2) {
    return <section className="workspace-panel season-chart-panel"><h3>{title}</h3>
      <p className="empty-copy">{rounds.length ? 'CON UNA SOLA FECHA JUGADA TODAVÍA NO HAY EVOLUCIÓN: EL GRÁFICO APARECE DESDE LA FECHA 2.' : 'TODAVÍA NO SE JUEGA NINGUNA FECHA DE LA LIGA.'}</p></section>;
  }

  // En el celular las etiquetas del final son solo escudo y puesto; el nombre queda en los botones de abajo.
  const narrow = width < 520;
  const right = narrow ? 52 : 168;
  const minStep = 24;
  const step = Math.max(minStep, (width - LEFT - right) / (rounds.length - 1));
  const svgWidth = Math.max(width, LEFT + right + step * (rounds.length - 1));
  const count = teams.length;
  const height = TOP + ROW * (count - 1) + BOTTOM + 8;
  const x = index => LEFT + step * index;
  const y = position => TOP + 8 + ROW * (position - 1);
  const labelEvery = step < 34 ? Math.ceil(34 / step) : 1;
  const zones = progression?.zones ?? [];
  const pathOf = team => team.positions.map((position, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(position)}`).join(' ');
  const toggle = teamId => setPinned(current => (current === teamId ? null : teamId));
  const ordered = column == null ? [] : [...teams].sort((a, b) => a.positions[column] - b.positions[column]);
  const onMove = event => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = svgWidth / box.width;
    const px = (event.clientX - box.left) * scale;
    setColumn(Math.min(rounds.length - 1, Math.max(0, Math.round((px - LEFT) / step))));
  };
  const lineState = team => (!active ? 'is-idle' : active === team.teamId ? 'is-active' : 'is-faded');
  const activeTeam = teams.find(team => team.teamId === active);

  return <section className="workspace-panel season-chart-panel"><h3>{title} <small>PUESTO AL CERRAR CADA FECHA{rounds.at(-1) === 'hoy' ? ' Y HOY' : ''}</small></h3>
    <p className="season-chart-hint">Toca o pasa el mouse por un club para seguir su camino; toca de nuevo para soltarlo.</p>
    <div className="season-chart-scroll" ref={ref}>
      <div className="season-chart-canvas" style={{ width: svgWidth }}>
        <svg className="season-chart" width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} role="img"
          aria-label={`Puesto de cada club fecha a fecha, de la fecha ${rounds[0]} ${rounds.at(-1) === 'hoy' ? 'a hoy' : `a la ${rounds.at(-1)}`}. El detalle está en la tabla de abajo.`}
          onMouseMove={onMove} onMouseLeave={() => { setColumn(null); setHovered(null); }}>
          {/* Zonas de clasificación del formato del torneo, de fondo. */}
          {zones.map(zone => zone.from <= count && <rect key={zone.kind} className={`season-zone zone-${zone.kind}`} x={LEFT - 14} width={step * (rounds.length - 1) + 28}
            y={y(zone.from) - ROW / 2} height={ROW * (Math.min(zone.to, count) - zone.from + 1)}/>)}
          {teams.map((team, index) => <text key={`rank-${team.teamId}`} className="season-axis" x={LEFT - 20} y={y(index + 1) + 4} textAnchor="end">{index + 1}</text>)}
          {rounds.map((round, index) => <g key={round}>
            <line className="season-grid" x1={x(index)} x2={x(index)} y1={TOP} y2={height - BOTTOM + 4}/>
            {(index % labelEvery === 0 || index === rounds.length - 1) && <text className="season-axis" x={x(index)} y={height - 10} textAnchor="middle">{roundLabel(round)}</text>}
          </g>)}
          {column != null && <line className="season-crosshair" x1={x(column)} x2={x(column)} y1={TOP} y2={height - BOTTOM + 4}/>}
          {/* Primero las líneas apagadas y al final la elegida, para que quede encima. */}
          {[...teams].sort((a, b) => (a.teamId === active) - (b.teamId === active)).map(team => <g key={team.teamId} className={`season-line ${lineState(team)}`}
            onMouseEnter={() => setHovered(team.teamId)} onMouseLeave={() => setHovered(null)} onClick={() => toggle(team.teamId)}>
            <path className="season-hit" d={pathOf(team)}/>
            <path className="season-path" d={pathOf(team)} style={{ stroke: lineState(team) === 'is-faded' ? MUTED_LINE : team.color }}/>
            {team.teamId === active && team.positions.map((position, index) => <g key={index}>
              <circle className="season-dot" cx={x(index)} cy={y(position)} r="9" style={{ fill: team.color }}/>
              <text className="season-dot-label" x={x(index)} y={y(position) + 3.5} textAnchor="middle">{position}</text>
            </g>)}
            <circle className="season-end" cx={x(rounds.length - 1)} cy={y(team.position)} r="4" style={{ fill: lineState(team) === 'is-faded' ? MUTED_LINE : team.color }}/>
          </g>)}
        </svg>
        {/* Etiquetas del final en HTML, para usar el mismo escudo que el resto del sitio. */}
        <ol className={`season-end-labels${narrow ? ' is-narrow' : ''}`} style={{ left: x(rounds.length - 1) + 10 }} aria-hidden="true">
          {teams.map(team => <li key={team.teamId} className={!active ? '' : active === team.teamId ? 'is-active' : 'is-faded'} style={{ top: y(team.position) - 10 }}
            onMouseEnter={() => setHovered(team.teamId)} onMouseLeave={() => setHovered(null)} onClick={() => toggle(team.teamId)}>
            <TeamMark team={team.full}/><b>{ordinal(team.position)}</b>{!narrow && <span>{team.name}</span>}
          </li>)}
        </ol>
        {column != null && <div className="season-tooltip" role="status" style={{ left: Math.min(x(column) + 12, svgWidth - 190), top: 4 }}>
          <b>{roundName(rounds[column])}</b>
          {activeTeam
            ? <span><TeamMark team={activeTeam.full}/>{activeTeam.name}: <b>{ordinal(activeTeam.positions[column])}</b></span>
            : <ol>{ordered.map(team => <li key={team.teamId}><b>{team.positions[column]}</b>{team.name}</li>)}</ol>}
        </div>}
      </div>
    </div>
    <div className="season-chart-clubs" role="group" aria-label="Seguir a un club en el gráfico">
      {teams.map(team => <button type="button" key={team.teamId} aria-pressed={pinned === team.teamId} className={pinned === team.teamId ? 'active' : ''}
        onMouseEnter={() => setHovered(team.teamId)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(team.teamId)} onBlur={() => setHovered(null)} onClick={() => toggle(team.teamId)}>
        <i style={{ background: team.color }} aria-hidden="true"/><TeamMark team={team.full}/><span>{team.name}</span>
      </button>)}
    </div>
    <details className="season-chart-table">
      <summary>VER COMO TABLA</summary>
      <div className="table-scroll"><table className="season-table">
        <thead><tr><th>CLUB</th>{rounds.map(round => <th key={round}>{roundLabel(round)}</th>)}</tr></thead>
        <tbody>{teams.map(team => <tr key={team.teamId}><td>{team.name}</td>{team.positions.map((position, index) => <td key={index}>{position}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}
