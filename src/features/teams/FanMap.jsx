import { useMemo, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { useAuth } from '../../app/AuthGate.jsx';
import { Button, Card, Chip, HowItWorks, useToast } from '../../ui/index.js';
import { useApiMutation } from '../admin/useApiMutation.js';
import { CHILE_MASK } from './chileMask.js';
import { WORLD_MASK } from './worldMask.js';
import { COMUNAS } from './comunas.js';

const upper = text => String(text ?? '').toUpperCase();
const people = value => Number(value ?? 0).toLocaleString('es-CL');
const compact = value => {
  const number = Number(value ?? 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: number >= 10_000_000 ? 1 : 2 })} M`;
  if (number >= 10_000) return `${Math.round(number / 1000).toLocaleString('es-CL')} MIL`;
  return people(number);
};
const percent = (part, total) => (total ? Math.round(part / total * 100) : 0);

// Bandera con emoji (Inglaterra tiene la suya; si el sistema no la dibuja, se ven las letras).
const SUBDIVISION = { ENG: 'gbeng', SCO: 'gbsct' };
const flag = code => (SUBDIVISION[code]
  ? `\u{1F3F4}${[...SUBDIVISION[code]].map(char => String.fromCodePoint(0xE0000 + char.charCodeAt(0))).join('')}\u{E007F}`
  : [...code].map(char => String.fromCodePoint(0x1F1E6 + char.charCodeAt(0) - 65)).join(''));

// Celdas de tierra de Chile (una vez): columna, fila y su centro en grados.
const LAND = (() => {
  const { step, top, left, rows } = CHILE_MASK;
  const cells = [];
  rows.forEach((hex, y) => [...hex].forEach((digit, nibble) => {
    const bits = parseInt(digit, 16);
    for (let bit = 0; bit < 4; bit += 1) {
      if (!(bits & (8 >> bit))) continue;
      const x = nibble * 4 + bit;
      cells.push({ x, y, lon: left + (x + 0.5) * step, lat: top - (y + 0.5) * step });
    }
  }));
  return cells;
})();
const WIDTH = CHILE_MASK.cols;
const HEIGHT = CHILE_MASK.rows.length;
const toX = lon => (lon - CHILE_MASK.left) / CHILE_MASK.step;
const toY = lat => (CHILE_MASK.top - lat) / CHILE_MASK.step;

// Dónde vive la gente en Chile (población aproximada, en millones): los hinchas se reparten en torno a las ciudades.
const CITIES = [
  [-33.45, -70.65, 7.1], [-33.05, -71.6, 1.0], [-36.83, -73.05, 0.95], [-29.9, -71.25, 0.45], [-23.65, -70.4, 0.4], [-38.74, -72.6, 0.35],
  [-34.17, -70.74, 0.3], [-35.43, -71.65, 0.25], [-18.48, -70.31, 0.22], [-20.21, -70.15, 0.25], [-41.47, -72.94, 0.25], [-53.16, -70.91, 0.13],
  [-39.82, -73.24, 0.2], [-36.6, -72.1, 0.2], [-22.46, -68.93, 0.18], [-27.37, -70.33, 0.16], [-40.57, -73.13, 0.15],
];

/** Calor de cada celda: las ciudades irradian gente y cada casa marcada suma un foco. Escala por raíz para que se vean también las zonas chicas. */
function heatLevels(homes) {
  const sources = [
    ...CITIES.map(([lat, lon, weight]) => ({ lat, lon, weight, sigma: Math.max(0.35, 0.3 + weight * 0.12) })),
    ...homes.map(home => ({ lat: home.lat, lon: home.lon, weight: 1.2, sigma: 0.3 })),
  ];
  const heat = LAND.map(cell => sources.reduce((sum, source) => {
    const dx = (cell.lon - source.lon) * Math.cos(cell.lat * Math.PI / 180);
    const dy = cell.lat - source.lat;
    return sum + source.weight * Math.exp(-(dx * dx + dy * dy) / (2 * source.sigma * source.sigma));
  }, 0));
  const max = Math.max(1e-6, ...heat);
  return heat.map(value => {
    const share = Math.sqrt(value / max);
    return share < 0.05 ? 0 : share < 0.22 ? 1 : share < 0.45 ? 2 : share < 0.7 ? 3 : 4;
  });
}

// Mapa mundial en puntos (una vez): sirve para ver dónde está tu país de origen frente a Chile.
const WORLD_LAND = (() => {
  const { step, top, rows } = WORLD_MASK;
  const cells = [];
  rows.forEach((hex, y) => [...hex].forEach((digit, nibble) => {
    const bits = parseInt(digit, 16);
    for (let bit = 0; bit < 4; bit += 1) {
      if (!(bits & (8 >> bit))) continue;
      const x = nibble * 4 + bit;
      cells.push({ x, y, i: cells.length, lon: -180 + (x + 0.5) * step, lat: top - (y + 0.5) * step });
    }
  }));
  return cells;
})();
const worldX = lon => (lon + 180) / WORLD_MASK.step;
const worldY = lat => (WORLD_MASK.top - lat) / WORLD_MASK.step;
// Del mapa mundial solo se recorta lo que sirve (sin la Antártida ni el Ártico profundo).
const WORLD_VIEW = { y: worldY(75), height: worldY(-58) - worldY(75) };

/** Dónde queda tu país frente a Chile: dos focos de calor (cada uno con su cantidad de hinchas) y las casas marcadas afuera. */
function WorldMini({ fans, countryHomes }) {
  const rows = fans.map ?? [];
  const sources = rows.map(row => ({ ...row, sigma: 6 }));
  const heat = useMemo(() => {
    const values = WORLD_LAND.map(cell => sources.reduce((sum, source) => {
      const dx = (cell.lon - source.lon) * Math.cos(cell.lat * Math.PI / 180);
      const dy = cell.lat - source.lat;
      return sum + source.fans * Math.exp(-(dx * dx + dy * dy) / (2 * source.sigma * source.sigma));
    }, 0));
    const max = Math.max(1, ...values);
    return values.map(value => { const share = value / max; return share < 0.01 ? 0 : share < 0.06 ? 1 : share < 0.2 ? 2 : share < 0.5 ? 3 : 4; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(row => `${row.code}:${row.fans}`).join('|')]);
  return <div className="fan-world">
    <svg viewBox={`0 ${WORLD_VIEW.y} ${WORLD_MASK.cols} ${WORLD_VIEW.height}`} role="img" aria-label={`Mapa mundial: ${rows.map(row => `${row.name} ${compact(row.fans)}`).join(' y ')}`}>
      {WORLD_LAND.filter(cell => cell.y >= WORLD_VIEW.y && cell.y <= WORLD_VIEW.y + WORLD_VIEW.height).map(cell => <rect key={`${cell.x}-${cell.y}`} x={cell.x + 0.12} y={cell.y + 0.12} width="0.76" height="0.76" className={`l${heat[cell.i]}`}/>)}
      {rows.map(row => <g key={row.code} className={`fan-pin ${row.home ? 'is-home' : ''}`} transform={`translate(${worldX(row.lon)} ${worldY(row.lat)})`}><rect x="-1.3" y="-1.3" width="2.6" height="2.6"/><title>{`${row.name}: ${people(row.fans)} hinchas`}</title></g>)}
      {countryHomes.map(home => <g key={home.id} className="fan-pin is-house" transform={`translate(${worldX(home.lon)} ${worldY(home.lat)})`}><rect x="-0.9" y="-0.9" width="1.8" height="1.8"/><title>{`${home.label}`}</title></g>)}
    </svg>
  </div>;
}

// La ciudad o comuna más cercana a un punto, para ponerle nombre a "mi ubicación" sin consultar a nadie (solo en Chile).
const nearestComuna = (lat, lon) => COMUNAS.reduce((best, [name, la, lo]) => {
  const distance = (la - lat) ** 2 + ((lo - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  return distance < best.distance ? { name, distance } : best;
}, { name: 'Chile', distance: Infinity }).name;

function AddHome({ fans, onChanged }) {
  const toast = useToast();
  const abroad = fans.country !== 'CL';
  const [place, setPlace] = useState('CL');
  const [comuna, setComuna] = useState('');
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const inChile = place === 'CL';
  const placeName = inChile ? 'Chile' : fans.countryName;
  const add = useApiMutation((body, signal) => endpoints.addFanHome(fans.teamId, { ...body, country: place }, signal), {
    onSuccess: () => { toast({ tone: 'success', title: 'Lugar marcado en el mapa' }); setComuna(''); setAddress(''); onChanged?.(); },
  });
  const byComuna = event => {
    event.preventDefault();
    const found = COMUNAS.find(([name]) => name === comuna);
    if (found) add.execute({ label: found[0], lat: found[1], lon: found[2] });
  };
  const byAddress = event => {
    event.preventDefault();
    if (address.trim().length >= 5) add.execute({ address: address.trim() });
  };
  const byLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) { setGeoError('Tu navegador no entrega la ubicación. Escribe la dirección.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        add.execute({ label: inChile ? nearestComuna(latitude, longitude) : fans.countryName, lat: latitude, lon: longitude });
      },
      () => { setLocating(false); setGeoError('No pude leer tu ubicación. Escribe la dirección.'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };
  return <div className="fan-home-add">
    {abroad && <div className="fan-place-switch" role="group" aria-label="Dónde marcar">
      <span>MARCAR EN</span>
      <button type="button" className={inChile ? 'on' : ''} aria-pressed={inChile} onClick={() => setPlace('CL')}>{flag('CL')} CHILE</button>
      <button type="button" className={!inChile ? 'on' : ''} aria-pressed={!inChile} onClick={() => setPlace(fans.country)}>{flag(fans.country)} {upper(fans.countryName)}</button>
    </div>}
    <Button type="button" onClick={byLocation} disabled={locating || add.loading}>{locating ? 'BUSCANDO…' : '📍 USAR MI UBICACIÓN'}</Button>
    <form className="fan-home-form" onSubmit={byAddress}>
      <label>O ESCRIBE UNA DIRECCIÓN EN {upper(placeName)}
        <input type="text" value={address} onChange={event => setAddress(event.target.value)} placeholder={inChile ? 'Calle, número y comuna' : 'Calle, número y ciudad'} maxLength={200} autoComplete="street-address"/>
      </label>
      <Button type="submit" disabled={address.trim().length < 5 || add.loading}>BUSCAR</Button>
    </form>
    {inChile && <form className="fan-home-form" onSubmit={byComuna}>
      <label>O ELIGE SOLO LA COMUNA
        <select value={comuna} onChange={event => setComuna(event.target.value)}>
          <option value="">ELIGE LA COMUNA…</option>
          {COMUNAS.map(([name]) => <option key={name} value={name}>{upper(name)}</option>)}
        </select>
      </label>
      <Button type="submit" disabled={!comuna || add.loading}>MARCAR</Button>
    </form>}
    {geoError && <p className="fan-note" role="alert">{geoError}</p>}
    {add.error && <p className="fan-note is-error" role="alert">{String(add.error.message ?? add.error)}</p>}
    <p className="fan-note">TU DIRECCIÓN SOLO SE USA PARA ENCONTRAR LA ZONA: NO SE GUARDA, Y EL MAPA MUESTRA UN PUNTO REDONDEADO (~2 KM).</p>
  </div>;
}

/** Hinchas: el total manda; abajo, cuántos viven en Chile y cuántos en el país del club, y los lugares marcados en cada uno. */
export function FanMap({ fans, title = 'HINCHAS', onChanged }) {
  const { canEditTeam } = useAuth();
  const homes = fans.homes ?? [];
  const chileHomes = homes.filter(home => (home.country ?? 'CL') === 'CL');
  const countryHomes = homes.filter(home => (home.country ?? 'CL') !== 'CL');
  const levels = useMemo(() => heatLevels(chileHomes), [chileHomes]);
  const toast = useToast();
  const remove = useApiMutation((homeId, signal) => endpoints.removeFanHome(fans.teamId, homeId, signal), { onSuccess: () => { toast({ tone: 'success', title: 'Lugar sacado del mapa' }); onChanged?.(); } });
  const chileRow = (fans.map ?? []).find(row => row.code === 'CL');
  const countryRow = (fans.map ?? []).find(row => row.code === fans.country);
  const restRow = (fans.map ?? []).find(row => row.code === 'REST');
  const abroad = fans.country !== 'CL';
  const origin = fans.origin;
  const formula = origin?.formula;
  const chileShare = percent(chileRow?.fans ?? 0, fans.followers);
  const restShare = percent(restRow?.fans ?? 0, fans.followers);
  const homeShare = abroad ? Math.max(0, 100 - chileShare - restShare) : 0;
  const editable = canEditTeam?.(fans.teamId);
  return <Card id="ver-hinchas" title={title} className="fan-map-card" aside={fans.rank ? <Chip icon="people">{fans.rank}.º DE {fans.clubs}</Chip> : null}>
    <div className="fan-map fan-map-chile">
      <div className="fan-map-canvas">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Mapa de Chile con ${compact(chileRow?.fans ?? 0)} hinchas${chileHomes.length ? ` y ${chileHomes.length} lugar${chileHomes.length === 1 ? '' : 'es'} marcado${chileHomes.length === 1 ? '' : 's'}` : ''}`}>
          {LAND.map((cell, index) => <rect key={index} x={cell.x + 0.14} y={cell.y + 0.14} width="0.72" height="0.72" className={`l${levels[index]}`}/>)}
          {chileHomes.map(home => <g key={home.id} className="fan-pin is-home" transform={`translate(${toX(home.lon)} ${toY(home.lat)})`}>
            <rect x="-1.4" y="-1.4" width="2.8" height="2.8"/>
            <title>{`Casa de un hincha · ${home.label}`}</title>
          </g>)}
        </svg>
        <div className="fan-map-legend" aria-hidden="true"><span>POCOS</span>{[1, 2, 3, 4].map(level => <i key={level} className={`l${level}`}/>)}<span>MUCHOS</span></div>
      </div>
      <div className="fan-map-side">
        <div className="fan-total">
          <b>{compact(fans.followers)}</b>
          <span>HINCHAS EN TOTAL</span>
        </div>
        <div className="fan-share" aria-label={`${chileShare}% en Chile${abroad ? `, ${homeShare}% en ${fans.countryName}` : ''}${restShare ? `, ${restShare}% en el resto del mundo` : ''}`}>
          {abroad || restRow ? <>
            <span className="fan-share-bar">
              {abroad && <i className="home" style={{ flexGrow: Math.max(homeShare, 4) }}/>}
              <i className="chile" style={{ flexGrow: Math.max(chileShare, 4) }}/>
              {restRow && <i className="rest" style={{ flexGrow: Math.max(restShare, 4) }}/>}
            </span>
            <span className="fan-share-legend">
              {abroad && <em>{flag(fans.country)} {upper(fans.countryName)} <b>{compact(countryRow?.fans ?? fans.homeFans)}</b> · {homeShare}%</em>}
              <em>{flag('CL')} CHILE <b>{compact(chileRow?.fans ?? 0)}</b> · {chileShare}%</em>
              {restRow && <em>🌍 RESTO DEL MUNDO <b>{compact(restRow.fans)}</b> · {restShare}%</em>}
            </span>
          </> : <span className="fan-share-legend"><em>{flag('CL')} TODOS EN CHILE</em></span>}
        </div>
        {abroad && <WorldMini fans={fans} countryHomes={countryHomes}/>}
        <section className="fan-homes">
          <h4>LUGARES MARCADOS <small>{homes.length}</small></h4>
          {homes.length === 0 && <p className="fan-note">NINGUNO TODAVÍA. EL MAPA DE CHILE REPARTE A LOS HINCHAS POR LAS CIUDADES, SEGÚN LA GENTE QUE VIVE EN CADA UNA.</p>}
          <ul>{homes.map(home => <li key={home.id}><span>{flag(home.country ?? 'CL')} {upper(home.label)}</span>{editable && <button type="button" onClick={() => remove.execute(home.id)} disabled={remove.loading} aria-label={`Sacar ${home.label}`}>×</button>}</li>)}</ul>
          {editable && <AddHome fans={fans} onChanged={onChanged}/>}
        </section>
      </div>
    </div>
    {formula && <HowItWorks title="¿De dónde salen estos números?">
      <p>Son personas que se declaran hinchas, no seguidores de redes. Viven en Chile, donde se juega la liga, y {abroad ? `en el país de tu club (${formula.countryName})` : 'repartidos por el mundo'}.</p>
      <ul>
        <li><b>Cuántos son: la grandeza del club.</b> Tu club está en {Math.round((formula.greatness ?? 0) * 100)} de 100 entre los clubes de la liga (títulos, finales, playoffs y plantel). Los más grandes tienen más hinchas.</li>
        <li><b>Chile se reparte entre todos.</b> Casi todos los chilenos (8 de cada 10) son hinchas de alguno de los clubes de la liga, y se los reparten según la grandeza de cada uno y qué tan vista es su liga por acá. {abroad ? `Los de afuera vienen de ${formula.countryName}, donde el club tiene su gente.` : 'Un club chileno parte con ventaja de local y suma hinchas en el resto del mundo.'}</li>
      </ul>
      <p>Partiste con <b>{compact(origin.start)}</b> y {origin.change >= 0 ? 'ganaste' : 'perdiste'} <b>{compact(Math.abs(origin.change))}</b> jugando: partidos, clásicos, títulos, posición final y conciertos.</p>
      {fans.ceiling && <p><b>Techo y piso.</b> Cada triunfo, título o concierto suma una parte de tu punto de partida de hoy ({compact(fans.ceiling.base)}), no de los hinchas que ya tienes, y cuesta más crecer cuanto más cerca del techo estás: puedes llegar hasta <b>{compact(fans.ceiling.max)}</b> y no bajar de <b>{compact(fans.ceiling.min)}</b>. Ningún club tiene más hinchas que la gente que vive en su país: si sigue creciendo, lo nuevo son hinchas en el resto del mundo.</p>}
      <p>Los de Chile y los de tu país pueden ir al estadio; de los del resto del mundo, algunos van de turistas. Un club grande llena aunque no sea día de clásico; uno chico depende más del rival. Los derechos de TV miran a todos tus hinchas.</p>
    </HowItWorks>}
  </Card>;
}
