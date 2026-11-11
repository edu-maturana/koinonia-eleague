import { useState } from 'react';
import { endpoints } from '../api/endpoints.js';
import { useApiQuery } from '../features/public/useApiQuery.js';
import { EntityLink } from './EntityLink.jsx';
import { TeamMark } from './TeamMark.jsx';

// "Koinonia E-League v6" -> "v6"; "Liga de Transición" -> "LT"; "Copa Grande Jogatore 2" -> "GC2" (va con copa dorada); otro torneo -> iniciales.
export function starLabel(name = '') {
  const cup = /grande\s+jogatore\s*(\d+)/i.exec(name);
  if (cup) return { text: `GC${cup[1]}`, order: 2000 + Number(cup[1]), cup: true };
  const edition = /\bv\s*(\d+)\s*$/i.exec(name);
  if (edition) return { text: `v${edition[1]}`, order: Number(edition[1]) };
  if (/transici[oó]n/i.test(name)) return { text: 'LT', order: 0 };
  const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  return { text: initials || '★', order: 1000 };
}

// "Koinonia E-League v11" -> "v11" (la temporada en que se jugó una gira); "Gira por Yokohama" -> "Yokohama".
export const seasonTag = name => (name ? starLabel(name).text : '');
export const tourShortName = name => String(name ?? '').replace(/^gira\s+(por|de|a|en)\s+/i, '').trim() || String(name ?? '');

const latest = row => Math.max(...row.stars.map(star => star.order >= 1000 ? -1 : star.order));

/** Campeones de gira por club: más giras primero; a igual cantidad, la más reciente (las giras llegan de la más nueva a la más vieja). */
export function buildTourShowcase(clubs, titles) {
  const byClub = new Map(clubs.map(club => [club.id, { club, cups: [], recent: Infinity }]));
  titles.forEach((title, index) => {
    const row = byClub.get(title.teamId);
    if (!row) return;
    row.cups.push({ id: title.id, name: title.name, season: title.season });
    row.recent = Math.min(row.recent, index);
  });
  return [...byClub.values()].filter(row => row.cups.length)
    .map(row => ({ ...row, cups: [...row.cups].reverse() }))
    .sort((a, b) => b.cups.length - a.cups.length || a.recent - b.recent || a.club.name.localeCompare(b.club.name));
}

export function buildShowcase(clubs, titleLists) {
  return clubs.map((club, index) => ({
    club,
    stars: (titleLists[index] ?? []).map(title => ({ id: title.id, name: title.name, ...starLabel(title.name) }))
      .sort((a, b) => a.order - b.order || String(a.name).localeCompare(b.name)),
  })).filter(row => row.stars.length)
    // Más títulos primero; a igual cantidad, gana el campeón más reciente (mayor edición).
    .sort((a, b) => b.stars.length - a.stars.length || latest(b) - latest(a) || a.club.name.localeCompare(b.club.name));
}

const CUP_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v4a6 6 0 0 1-12 0V3zM6 5H3v2a4 4 0 0 0 4 4M18 5h3v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z"/></svg>;

// Vitrina del inicio: cada campeón con una estrella por título de liga (LT, v1, v2…) y una copa dorada por Copa Grande Jogatore (GC1, GC2…).
export function TrophyCase({ teams = [] }) {
  const clubs = teams.filter(team => team.kind === 'club' || team.kind == null);
  const key = clubs.map(team => team.id).join(',');
  const titles = useApiQuery(signal => Promise.all(clubs.map(club =>
    endpoints.teamTitles(club.id, signal).then(response => response?.data ?? []).catch(() => []),
  )).then(data => ({ data })), [key]);
  const tours = useApiQuery(signal => endpoints.tourTitles(signal), []);
  const [tab, setTab] = useState('leagues');
  const rows = Array.isArray(titles.data) ? buildShowcase(clubs, titles.data) : [];
  const tourRows = buildTourShowcase(clubs, Array.isArray(tours.data) ? tours.data : []);
  if (!rows.length && !tourRows.length) return null;
  const shown = tab === 'tours' ? tourRows : rows;
  return <section className="score-panel trophy-panel"><h2>VITRINA <span className="trophy-tabs" role="tablist" aria-label="Qué campeones ver">
      <button type="button" role="tab" aria-selected={tab === 'leagues'} className={tab === 'leagues' ? 'active' : ''} onClick={() => setTab('leagues')}>LIGAS</button>
      <button type="button" role="tab" aria-selected={tab === 'tours'} className={tab === 'tours' ? 'active' : ''} onClick={() => setTab('tours')}>GIRAS</button>
    </span></h2>
    {tab === 'tours' && !tourRows.length && <p className="trophy-empty">AÚN NO HAY CAMPEONES DE GIRA.</p>}
    <ul className="trophy-list">{tab === 'tours' ? tourRows.map(({ club, cups }) => <li key={club.id}>
      <EntityLink to="team" id={club.id} className="trophy-team"><TeamMark team={club}/><span>{club.name}</span></EntityLink>
      <span className="trophy-stars" aria-label={`${cups.length} gira${cups.length === 1 ? '' : 's'} ganada${cups.length === 1 ? '' : 's'}`}>{cups.map(cup =>
        <span key={cup.id} className="trophy-star trophy-cup" title={`${cup.name}${cup.season ? ` · ${cup.season}` : ''}`}>
          {CUP_ICON}
          <small>{tourShortName(cup.name)}</small></span>)}</span>
    </li>) : shown.map(({ club, stars }) => <li key={club.id}>
      <EntityLink to="team" id={club.id} className="trophy-team"><TeamMark team={club}/><span>{club.name}</span></EntityLink>
      <span className="trophy-stars" aria-label={`${stars.length} título${stars.length === 1 ? '' : 's'}`}>{stars.map(star =>
        <span key={star.id} className={`trophy-star${star.cup ? ' trophy-cup' : ''}`} title={star.name}>
          {star.cup ? CUP_ICON : <svg viewBox="-6 -6 112 108" aria-hidden="true"><polygon points="50,2 62,36 98,37 69,59 80,94 50,73 20,94 31,59 2,37 38,36" /></svg>}
          <small>{star.text}</small></span>)}</span>
    </li>)}</ul>
  </section>;
}
