import { gp } from '../public/DataStates.jsx';

const upper = text => String(text ?? '').toUpperCase();
const people = value => Number(value ?? 0).toLocaleString('es-CL');
const percent = (part, whole) => (whole ? Math.min(100, Math.round(part / whole * 100)) : 0);

// Precio Normal de cada tipo de sector (el servidor los manda en `sectorTypes`; estos son los de respaldo).
const FALLBACK_PRICES = { standing: 18, popular: 35, lateral: 65, premium: 140, boxes: 320, away: 35 };
const TYPE_LABEL = { standing: 'De pie', popular: 'Cabecera', lateral: 'Platea', premium: 'Preferencial', boxes: 'Palcos', away: 'Visita' };

/**
 * Dónde va cada sector en el plano (visto desde arriba): la tribuna de pie detrás de un arco, las cabeceras detrás del otro
 * (o de los dos si no hay de pie), la platea a los costados, la preferencial y los palcos en la tribuna principal (izquierda)
 * y la visita en una esquina. Devuelve los bloques a dibujar con su sector.
 */
function layout(sectors) {
  const byType = type => sectors.filter(sector => sector.type === type);
  const standing = byType('standing')[0];
  const popular = byType('popular')[0];
  const lateral = byType('lateral')[0];
  const premium = byType('premium')[0];
  const boxes = byType('boxes')[0];
  const away = byType('away')[0];
  const blocks = [];
  // Arriba: cabecera (o de pie si no hay cabecera) con la visita en la esquina derecha.
  const north = popular ?? standing;
  if (north) blocks.push({ sector: north, x: 22, y: 2, w: away ? 40 : 56, h: 14 });
  if (away) blocks.push({ sector: away, x: 64, y: 2, w: 14, h: 14 });
  // Abajo: la de pie (o cabecera si no hay).
  const south = standing && popular ? standing : north;
  if (south) blocks.push({ sector: south, x: 22, y: 84, w: 56, h: 14 });
  // Costados: platea a la derecha completa; a la izquierda la tribuna principal con la preferencial al centro y los palcos atrás.
  if (lateral) blocks.push({ sector: lateral, x: 82, y: 20, w: 14, h: 60 });
  if (lateral) blocks.push({ sector: lateral, x: 4 + (boxes ? 5 : 0), y: 20, w: boxes ? 13 : 18, h: premium ? 14 : 60 });
  if (lateral && premium) blocks.push({ sector: lateral, x: 4 + (boxes ? 5 : 0), y: 66, w: boxes ? 13 : 18, h: 14 });
  if (premium) blocks.push({ sector: premium, x: 4 + (boxes ? 5 : 0), y: 36, w: boxes ? 13 : 18, h: 28 });
  if (boxes) blocks.push({ sector: boxes, x: 3, y: 30, w: 5, h: 40 });
  return blocks;
}

/** Plano del estadio visto desde arriba: cada sector con su color; si hay partido, cada bloque se llena según su ocupación. */
export function StadiumPlan({ sectors, attendance = null, label }) {
  const fill = sector => (attendance ? percent(attendance[sector.key] ?? 0, sector.capacity) : null);
  return <svg className="stadium-plan" viewBox="0 0 100 100" role="img" aria-label={label ?? `Plano del estadio: ${sectors.map(sector => `${sector.name} ${people(sector.capacity)}`).join(', ')}`}>
    <rect className="plan-ground" x="0" y="0" width="100" height="100" rx="10"/>
    {layout(sectors).map((block, index) => {
      const level = fill(block.sector);
      return <g key={index} className={`plan-block t-${block.sector.type}`}>
        <rect x={block.x} y={block.y} width={block.w} height={block.h}/>
        {level !== null && <rect className="plan-empty" x={block.x} y={block.y} width={block.w} height={block.h * (1 - level / 100)}/>}
        <title>{`${block.sector.name}: ${people(block.sector.capacity)} lugares${level !== null ? ` · ${level}% ocupado` : ''}`}</title>
      </g>;
    })}
    <g className="plan-pitch" aria-hidden="true">
      <rect x="24" y="20" width="52" height="60"/>
      <line x1="24" y1="50" x2="76" y2="50"/>
      <circle cx="50" cy="50" r="7"/>
      <rect x="38" y="20" width="24" height="9"/>
      <rect x="38" y="71" width="24" height="9"/>
    </g>
  </svg>;
}

/**
 * Tabla de sectores. Sin partido (`rows` del estadio): lugares, precio Normal, abono y abonados del torneo. Con partido
 * (`rows` de la taquilla): abonados, venta general, ocupación, precio del día y plata de cada sector.
 */
export function SectorTable({ rows, prices = FALLBACK_PRICES, seasonPrices = null, seasonTickets = null, match = false }) {
  const capacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  return <ul className={`sector-table ${match ? 'is-match' : ''}`}>
    {rows.map(row => {
      const holders = match ? row.seasonTickets : seasonTickets?.[row.key] ?? 0;
      return <li key={row.key} className={`t-${row.type}`}>
        <i className="sector-swatch" aria-hidden="true"/>
        <span className="sector-name"><b>{upper(row.name)}</b><small>{upper(row.label ?? TYPE_LABEL[row.type])} · {people(row.capacity)} LUGARES · {percent(row.capacity, capacity)}%</small></span>
        {match ? <>
          <span className="gate-bar" aria-label={`${percent(row.attendance, row.capacity)}% ocupado`}><span style={{ width: `${percent(row.attendance, row.capacity)}%` }}/><em>{people(row.attendance)}</em></span>
          <span className="sector-money"><b>{gp(row.revenue)}</b><small>{row.private ? 'DE DUEÑOS PRIVADOS · EL CLUB COBRA UNA CUOTA' : <>{row.seasonTickets ? `${people(row.seasonTickets)} ABONADOS · ` : ''}{row.type === 'away' ? 'VISITA' : 'GENERAL'} {row.price} €{row.released ? ` · ${people(row.released)} LIBERADOS AL LOCAL` : ''}</>}</small></span>
        </> : row.private ? <span className="sector-money"><b>{Math.round(prices[row.type] * 0.25)} €</b><small>DE DUEÑOS PRIVADOS · CUOTA POR PARTIDO</small></span>
          : <span className="sector-money"><b>{row.type === 'away' ? `${prices.away ?? 35} € TOPE` : `${prices[row.type]} €`}</b>
          <small>{row.type === 'away' ? 'NO SUBE CON EL PREMIUM' : `ABONO ${seasonPrices?.[row.type] ?? Math.round(prices[row.type] * 0.8)} € POR PARTIDO${holders ? ` · ${people(holders)} ABONADOS` : ''}`}</small></span>}
      </li>;
    })}
  </ul>;
}

/** Plano + tabla, para la ficha del estadio y el catálogo. */
export function StadiumSectors({ sectors, sectorTypes = null, seasonTickets = null }) {
  if (!sectors?.length) return null;
  const prices = sectorTypes ? Object.fromEntries(sectorTypes.map(type => [type.key, type.price])) : FALLBACK_PRICES;
  const seasonPrices = sectorTypes ? Object.fromEntries(sectorTypes.map(type => [type.key, type.seasonPrice])) : null;
  return <div className="stadium-sectors">
    <StadiumPlan sectors={sectors}/>
    <SectorTable rows={sectors} prices={prices} seasonPrices={seasonPrices} seasonTickets={seasonTickets}/>
  </div>;
}
