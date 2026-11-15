import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { TeamMark } from '../../components/TeamMark.jsx';
import { compareRecent, compareUpcoming, competitionTag, matchRoundLabel } from '../../utils/matchPresentation.js';
import { teamBalance } from '../../utils/teamPresentation.js';
import { Card, Icon, Screen, Tile } from '../../ui/index.js';
import { gp } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { useMarketClock } from '../public/market/MarketClock.jsx';
import { useNotifications } from '../notifications/NotificationsProvider.jsx';
import { BoardPanel } from '../teams/BoardPanel.jsx';
import { NewsArtwork } from '../../components/NewsArtwork.jsx';
import { NewsModal } from '../news/NewsModal.jsx';
import { useAutomaticNews } from '../news/useAutomaticNews.js';
import { NewsHighlights } from './HomePage.jsx';
import { HighlightsRow } from './Highlights.jsx';

const list = value => (Array.isArray(value) ? value : []);
const when = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : null;
};

const sideOf = (match, teamId) => (match.homeTeam?.id === teamId ? 'home' : 'away');
const rivalOf = (match, teamId) => (sideOf(match, teamId) === 'home' ? match.awayTeam : match.homeTeam);
const scoreFor = (match, teamId) => (sideOf(match, teamId) === 'home' ? `${match.homeScore}-${match.awayScore}` : `${match.awayScore}-${match.homeScore}`);
function resultOf(match, teamId) {
  const mine = sideOf(match, teamId) === 'home' ? match.homeScore : match.awayScore;
  const theirs = sideOf(match, teamId) === 'home' ? match.awayScore : match.homeScore;
  return mine > theirs ? 'G' : mine < theirs ? 'P' : 'E';
}

/** Lo que espera una decisión tuya, cada cosa con su enlace exacto. */
function useTodo(teamId, base) {
  const contracts = useApiQuery(signal => endpoints.teamContracts(teamId, signal).catch(() => ({ data: null })), [teamId]);
  const offers = useApiQuery(signal => endpoints.marketOffers(signal).catch(() => ({ data: [] })), []);
  const watch = useApiQuery(signal => endpoints.teamWatchlist(teamId, signal).catch(() => ({ data: [] })), [teamId]);
  const { summary, version } = useNotifications();
  const first = useRef(version);
  useEffect(() => { if (version !== first.current) { offers.retry(); watch.retry(); contracts.retry(); } }, [version]);
  const rows = list(contracts.data?.contracts);
  const expiring = rows.filter(row => row.status === 'expired' || (row.status === 'active' && (row.endsWith || row.seasonsLeft === 1))).length;
  const incoming = list(offers.data).filter(offer => offer.direction === 'incoming').length;
  const alerts = list(watch.data).filter(row => row.alerts?.length).length;
  const requests = summary.byCategory.requests ?? 0;
  const velada = base?.velada;
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  return [
    incoming > 0 && { icon: 'gavel', text: `${plural(incoming, 'oferta', 'ofertas')} por responder`, href: '#/transferencias?tab=ofertas' },
    requests > 0 && { icon: 'chat', text: `${plural(requests, 'jugador quiere', 'jugadores quieren')} hablar contigo`, href: `#/equipos/${teamId}?tab=mensajes` },
    expiring > 0 && { icon: 'contract', text: `${plural(expiring, 'contrato', 'contratos')} por renovar`, href: `#/equipos/${teamId}?tab=finanzas` },
    alerts > 0 && { icon: 'star', text: `${plural(alerts, 'jugador que sigues tiene', 'jugadores que sigues tienen')} novedades`, href: '#/transferencias?tab=seguidos' },
    velada?.round?.status === 'open' && velada.eligibility?.eligible && velada.myBid === null && { icon: 'mic', text: 'Ibai busca estadio para La Velada: puedes ofrecer el tuyo', href: `#/equipos/${teamId}?tab=estadio&ver=velada` },
    base?.enabled && !base.sponsor && { icon: 'handshake', text: 'Tres canales quieren transmitir tus partidos', href: `#/equipos/${teamId}?tab=estadio&ver=tv` },
  ].filter(Boolean);
}

function MiniTable({ standings = [], teamId, teams }) {
  if (!standings.length) return null;
  const index = standings.findIndex(row => row.team_id === teamId);
  const byId = new Map(teams.map(team => [team.id, team]));
  return <Card title="Tabla" aside={<a className="card-link" href="#/torneos">Ver completa ›</a>}>
    <ol className="mini-table">{standings.map((row, position) => <li key={row.team_id} className={`${row.team_id === teamId ? 'mine' : ''} ${Math.abs(position - index) > 2 && position > 2 ? 'far' : ''}`}>
      <b>{position + 1}</b><TeamMark team={{ ...row, ...(byId.get(row.team_id) ?? {}) }}/><span>{row.name}</span><strong>{row.points}</strong>
    </li>)}</ol>
  </Card>;
}

function LatestNews({ teams }) {
  const { news } = useAutomaticNews();
  const [open, setOpen] = useState(null);
  const items = news.slice(0, 3);
  if (!items.length) return null;
  return <Card title="Últimas noticias" aside={<a className="card-link" href="#/noticias">Todas ›</a>}>
    <div className="hub-news">{items.map(item => <button type="button" key={item.id} onClick={() => setOpen(item)}><NewsArtwork item={item} teams={teams}/><span><small>{item.label}</small><b>{item.headline}</b></span></button>)}</div>
    {open && <NewsModal item={open} teams={teams} onClose={() => setOpen(null)}/>}
  </Card>;
}

/** Inicio = la central de tu club, como el menú del modo carrera: lo próximo, lo pendiente y los atajos. */
export function CareerHub({ teamId, teams = [], standings = [], navigate }) {
  const team = useApiQuery(signal => endpoints.team(teamId, signal), [teamId]);
  const matches = useApiQuery(signal => endpoints.teamUpcoming(teamId, signal), [teamId]);
  const recent = useApiQuery(signal => endpoints.teamRecent(teamId, signal), [teamId]);
  const rivalry = useApiQuery(signal => endpoints.teamRivalry(teamId, signal).catch(() => ({ data: null })), [teamId]);
  const market = useMarketClock();
  const business = useApiQuery(signal => endpoints.teamBusiness(teamId, signal).catch(() => ({ data: null })), [teamId]);
  const inbox = useApiQuery(signal => endpoints.teamInbox(teamId, signal).catch(() => ({ data: null })), [teamId]);
  const todo = useTodo(teamId, business.data);
  const club = team.data ? { ...team.data, ...(teams.find(item => item.id === teamId) ?? {}) } : teams.find(item => item.id === teamId);
  const all = list(matches.data);
  const next = all.filter(match => ['live', 'pending'].includes(match.status)).sort(compareUpcoming)[0] ?? null;
  // Los terminados vienen de su propia consulta (los más recientes primero): la de todos los partidos se corta en 100 y un club
  // ya pasa los 150, así que los de la liga en curso quedaban fuera y aparecían partidos de copa o de gira viejos.
  const finished = list(recent.data).filter(match => match.status === 'finished').sort(compareRecent);
  // Sin partido por jugar, el último va en la tarjeta grande y la lista sigue desde el anterior (no se repite).
  const last = next ? null : finished[0] ?? null;
  const played = finished.slice(last ? 1 : 0, last ? 6 : 5);
  const rival = rivalry.data?.rival ?? null;
  const nextRival = next ? rivalOf(next, teamId) : null;
  const derby = Boolean(next?.derby || (nextRival && rival && nextRival.id === rival.id));
  const position = standings.findIndex(row => row.team_id === teamId) + 1;
  const balance = teamBalance(club);
  const unread = inbox.data?.unread ?? 0;
  // Sin franja de título: Inicio parte con las noticias (la tabla va al costado) y debajo la central de tu club.
  return <Screen bare className="career-hub" title="Inicio">
    <NewsHighlights teams={teams} navigate={navigate}/>
    <Card title={todo.length ? `Esperando tu decisión (${todo.length})` : 'Esperando tu decisión'}>
      {todo.length
        ? <ul className="hub-todo">{todo.map(item => <li key={item.text}><a href={item.href}><Icon name={item.icon} size={20}/><span>{item.text}</span><i aria-hidden="true">›</i></a></li>)}</ul>
        : <p className="screen-lead">Nada pendiente. Buen momento para mirar el mercado o hablar con un jugador.</p>}
    </Card>

    {/* Solo lo que cambia: el partido (el próximo, o el último si no hay), la plata, el mercado y la entrada a tu club. */}
    <div className="tile-grid">
      {next
        ? <Tile tone={derby ? 'red' : 'navy'} href={`#/partidos/${next.id}`} icon={<Icon name={derby ? 'fire' : 'ball'} size={18}/>}
          title={next.status === 'live' ? 'Jugando ahora' : derby ? `Próximo partido · ¡${next?.rivalry?.label ?? 'Clásico'}!` : 'Próximo partido'}
          value={`${sideOf(next, teamId) === 'home' ? 'vs' : 'en casa de'} ${nextRival?.name ?? '—'}`} detail={`${competitionTag(next)} · ${sideOf(next, teamId) === 'home' ? 'de local' : 'de visita'}`}/>
        : last && <Tile tone="navy" href={`#/partidos/${last.id}`} icon={<Icon name="ball" size={18}/>} title="Último partido"
          value={`${{ G: 'Ganaste', E: 'Empataste', P: 'Perdiste' }[resultOf(last, teamId)]} ${scoreFor(last, teamId)}`}
          detail={`${sideOf(last, teamId) === 'home' ? 'Contra' : 'En casa de'} ${rivalOf(last, teamId)?.name ?? '—'} (${competitionTag(last)}). No tienes partidos por jugar.`}/>}
      <Tile href={`#/equipos/${teamId}?tab=finanzas&ver=caja`} icon={<Icon name="coin" size={18}/>} title="Caja" value={balance === null ? '—' : gp(balance)} detail="Sueldos, ingresos y gastos."/>
      <Tile tone={market.open ? 'gold' : 'paper'} href="#/transferencias" icon={<Icon name="handshake" size={18}/>} title="Mercado"
        value={market.open ? (market.left > 0 ? market.short : 'Abierto') : 'Cerrado'}
        detail={market.open ? `Cierra el ${when(market.closesAt) ?? 'pronto'}.` : `${market.target ? `${market.short}. ` : ''}Igual puedes buscar jugadores y hablarles.`}/>
      <Tile href={`#/equipos/${teamId}`} icon={<Icon name="shirt" size={18}/>} title="Mi club" badge={unread} value={club?.name ?? 'Tu club'}
        detail={unread ? `${unread} mensaje${unread === 1 ? '' : 's'} sin leer · plantel, finanzas y estadio.` : 'Plantel, mensajes, finanzas y estadio.'}/>
    </div>

    <HighlightsRow teams={teams}/>

    <div className="hub-columns hub-columns--single">
      <div className="hub-column">
        {played.length > 0 && <Card title="Últimos partidos" aside={<a className="card-link" href="#/partidos">Todos ›</a>}>
          <ul className="hub-results">{played.map(match => {
            const result = resultOf(match, teamId);
            const other = rivalOf(match, teamId);
            return <li key={match.id}><a href={`#/partidos/${match.id}`}><em className={`form-${result}`}>{result}</em><span>{sideOf(match, teamId) === 'home' ? 'vs' : 'en casa de'} {other?.name}<small className="hub-results-tag">{competitionTag(match)}</small></span>
              <b>{scoreFor(match, teamId)}</b>{(match.derby || (rival && other?.id === rival.id)) && <Icon name="fire" size={14}/>}</a></li>;
          })}</ul>
        </Card>}
        <BoardPanel team={{ id: teamId }}/>
      </div>
    </div>
  </Screen>;
}
