import { ControlRoomPage } from '../features/admin/ControlRoomPage.jsx';
import { NotificationsPage } from '../features/notifications/NotificationsPage.jsx';
import { useEffect, useMemo } from 'react';
import { SiteLayout } from '../components/SiteLayout.jsx';
import { MatchSidebar } from '../components/MatchSidebar.jsx';
import { HomePage } from '../features/home/HomePage.jsx';
import { useLeagueData } from '../features/league/useLeagueData.js';
import { leaguePlaylist } from './playlist.js';
import { SectionPage } from '../features/shared/SectionPage.jsx';
import { TeamDetailPage } from '../features/teams/TeamDetailPage.jsx';
import { MarketPage } from '../features/public/MarketPage.jsx';
import { playersReturnQuery } from '../features/public/PlayersPage.jsx';
import { PlayerProfilePage } from '../features/public/PlayerProfilePage.jsx';
import { EfootballCardPage } from '../features/public/EfootballCard.jsx';
import { projectionLink } from '../features/public/ProjectionPanel.jsx';
import { MatchScoreboardPage } from '../features/public/MatchScoreboardPage.jsx';
import { MatchCenterPage } from '../features/public/MatchCenterPage.jsx';
import { ClubsScreen, MatchesScreen, NewsScreen, PlayersScreen, RulesScreen, TournamentsScreen } from '../features/league/LeaguePage.jsx';
import { CareerHub } from '../features/home/CareerHub.jsx';
import { useAuth } from './AuthGate.jsx';
import { useRoute } from './useRoute.js';

const list = value => Array.isArray(value) ? value : [];
const tournamentPriority = tournament => tournament.format === 'league' || /liga/i.test(tournament.name ?? '') ? 0 : 1;
const playerDirectoryBackPath = query => {
  const params = playersReturnQuery({
    q: query.q ?? '',
    status: query.status ?? '',
    teamId: query.teamId ?? '',
    positions: query.position ? query.position.split(',').filter(Boolean) : [],
    minGp: query.minGp ?? '',
    maxGp: query.maxGp ?? '',
    nationality: query.nationality ?? '',
    sort: query.sort ?? 'price_desc',
    page: Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1),
  });
  return `/equipos/jugadores${params ? `?${params}` : ''}`;
};

export function App() {
  const { route, navigate } = useRoute();
  const { league, teamDetail, squad, teamMatches, teamRecent, teamHistory, teamHistoryError, state, refresh, dismissError } = useLeagueData(route.teamId);
  const indexedTeams = useMemo(() => new Map(league.teams.map(team => [team.id, team])), [league.teams]);
  const playlist = useMemo(() => {
    const anthems = league.teams
      .filter(team => team.anthemUrl?.trim())
      .map(team => ({ title: `Himno de ${team.name}`, artist: 'HIMNO OFICIAL', src: team.anthemUrl }));
    return [...leaguePlaylist, ...anthems];
  }, [league.teams]);
  const resolveTeam = team => ({ ...team, ...(indexedTeams.get(team?.id ?? team?.team_id) ?? {}) });
  const activeTournaments = [...list(league.home?.activeTournaments)].sort((a, b) => tournamentPriority(a) - tournamentPriority(b) || (a.name ?? '').localeCompare(b.name ?? '', 'es'));
  const tournament = activeTournaments.find(item => item.format === 'league') ?? activeTournaments[0];
  const { teamId: myTeamId } = useAuth();
  // Una pantalla nueva parte arriba (salvo que el enlace pida una parte: &ver=…).
  useEffect(() => { if (!route.query.ver) window.scrollTo(0, 0); }, [route.path]);
  // Cada ruta de Partidos, Torneos y Equipos es una pestaña de su pantalla. Los enlaces de la versión anterior
  // (#/liga?tab=…, que guardaron algunos avisos) se traducen aquí.
  const areaRoute = (() => {
    const path = route.path;
    if (path === '/liga') {
      const tab = route.query.tab ?? 'tabla';
      if (tab === 'partidos') return { area: 'matches', tab: 'todos' };
      if (tab === 'clubes' || tab === 'estadios') return { area: 'clubs', tab };
      if (tab === 'mas') {
        const ver = route.query.ver;
        if (['calendario', 'sanciones'].includes(ver)) return { area: 'matches', tab: ver };
        if (['calculadora', 'rankings'].includes(ver)) return { area: 'tournaments', tab: ver };
        if (ver === 'noticias') return { area: 'news' };
        if (ver === 'reglamento') return { area: 'rules' };
        return { area: 'clubs', tab: ver };
      }
      return { area: 'tournaments', tab };
    }
    if (['/partidos', '/partidos/jugados', '/partidos/pendientes'].includes(path)) return { area: 'matches', tab: 'todos', matchesMode: path.endsWith('jugados') ? 'played' : path.endsWith('pendientes') ? 'pending' : 'all' };
    if (path === '/partidos/calendario') return { area: 'matches', tab: 'calendario' };
    if (path === '/sanciones') return { area: 'matches', tab: 'sanciones' };
    if (path === '/torneos' || path === '/clasificacion') return { area: 'tournaments', tab: route.query.vista ?? 'tabla' };
    if (path === '/calculadora') return { area: 'tournaments', tab: 'calculadora' };
    if (path === '/equipos/rankings') return { area: 'tournaments', tab: 'rankings' };
    if (route.name === 'teams') return { area: 'clubs', tab: 'clubes' };
    if (path.startsWith('/equipos/') && route.name !== 'team' && !path.startsWith('/equipos/jugadores')) return { area: 'clubs', tab: path.split('/')[2] };
    if (path === '/noticias') return { area: 'news' };
    if (path === '/reglas') return { area: 'rules' };
    return null;
  })();

  // Pantalla completa del marcador: sin el sitio alrededor.
  if (route.name === 'scoreboard') {
    return <MatchScoreboardPage matchId={route.matchId} onBack={() => navigate(`/partidos/${encodeURIComponent(route.matchId)}`)}/>;
  }

  let page;
  if (areaRoute) {
    const calculatorTournament = activeTournaments.find(item => String(item.id) === String(route.query.torneo)) ?? tournament;
    if (areaRoute.area === 'matches') page = <MatchesScreen tab={areaRoute.tab} teams={league.teams} navigate={navigate} matchesMode={areaRoute.matchesMode}/>;
    else if (areaRoute.area === 'tournaments') page = <TournamentsScreen tab={areaRoute.tab} teams={league.teams} navigate={navigate} query={route.query} tournament={calculatorTournament}/>;
    else if (areaRoute.area === 'news') page = <NewsScreen teams={league.teams}/>;
    else if (areaRoute.area === 'rules') page = <RulesScreen/>;
    else page = <ClubsScreen tab={areaRoute.tab} teams={league.teams} navigate={navigate}/>;
  } else if (route.name === 'home') {
    // Todos son presis: el inicio es la central de tu club. Sin sesión (o sin club), las noticias de la liga.
    page = myTeamId ? <CareerHub teamId={myTeamId} teams={league.teams} navigate={navigate} tournament={tournament} standings={league.standings}/> : <HomePage teams={league.teams} navigate={navigate}/>;
  } else if (route.name === 'team') {
    // La liga activa que juega este club (para "¿qué necesita?").
    const projectionTournament = activeTournaments.find(item => item.format === 'league' && (league.standingsByTournament?.[item.id] ?? []).some(row => row.team_id === route.teamId));
    page = <TeamDetailPage key={route.teamId} team={teamDetail} teams={league.teams} tournaments={activeTournaments} squad={squad} standings={league.standings} standingsTournamentId={projectionTournament?.id ?? tournament?.id ?? null} matches={teamMatches} recentMatches={teamRecent} history={teamHistory} historyError={teamHistoryError} loading={state.loadingTeam} tab={route.query.tab} msg={route.query.msg} ver={route.query.ver ?? null} navigate={navigate} onTab={tab => navigate(`/equipos/${encodeURIComponent(route.teamId)}${tab ? `?tab=${tab}` : ''}`)} onBack={() => navigate('/equipos')} onChanged={refresh}
      onProjection={projectionTournament ? () => navigate(projectionLink(projectionTournament.id, route.teamId)) : null}/>;
  } else if (route.name === 'player') {
    page = <PlayerProfilePage playerId={route.playerId} teams={league.teams} backLabel={route.query.from === 'mercado' ? '← Volver al mercado' : '← Volver a jugadores'} onBack={() => navigate(route.query.from === 'mercado' ? '/transferencias' : playerDirectoryBackPath(route.query))}/>;
  } else if (route.name === 'match') {
    page = <MatchCenterPage key={route.matchId} matchId={route.matchId} teams={league.teams} navigate={navigate}/>;
  } else if (route.name === 'card') {
    page = <EfootballCardPage pesId={route.pesId} variation={Number(route.query.v ?? 0)} navigate={navigate} backLabel="← Volver a jugadores" onBack={() => navigate('/equipos/jugadores')}/>;
  } else if (route.path === '/equipos/jugadores' || route.path === '/equipos/jugadores/importar' || (route.path === '/transferencias' && ['buscar'].includes(route.query.tab))) {
    page = <PlayersScreen teams={league.teams} query={Object.fromEntries(Object.entries({ ...route.query, tab: route.query.vista === 'comparador' || route.query.tab === 'comparador' ? 'comparador' : undefined }).filter(([key, value]) => value !== undefined && key !== 'vista'))}/>;
  } else if (route.path === '/transferencias') {
    const tab = route.query.tab;
    page = <MarketPage key={`${route.query.jugador ?? ''}`} teams={league.teams} initialTab={tab} highlightId={route.query.id} query={route.query} importing={route.path.endsWith('/importar')} navigate={navigate} prefill={route.query.jugador ? { playerId: route.query.jugador, teamId: route.query.club ?? '', op: route.query.op ?? null } : null}/>;
  } else if (route.name === 'newsArticle') {
    page = <HomePage teams={league.teams} navigate={navigate} openNewsId={route.newsId} onCloseNews={() => navigate('/')}/>;
  } else if (route.path === '/notificaciones') {
    page = <NotificationsPage navigate={navigate} initialTab={route.query.tab}/>;
  } else if (route.path === '/admin' || route.path === '/personas') {
    page = <ControlRoomPage teams={league.teams} initialTab={route.path === '/personas' ? 'personas' : route.query.tab} tournamentId={route.query.id ?? null}/>;
  } else {
    page = <SectionPage path={route.path}/>;
  }

  const sidebar = route.name === 'home' || route.name === 'newsArticle' ? <MatchSidebar tournament={tournament} activeTournaments={activeTournaments} standings={league.standings} teams={league.teams} resolveTeam={resolveTeam} loading={state.loading} navigate={navigate}/> : null;
  return <SiteLayout route={route} navigate={navigate} sidebar={sidebar} error={state.error} dismissError={dismissError} playlist={playlist} teams={league.teams}>{page}</SiteLayout>;
}
