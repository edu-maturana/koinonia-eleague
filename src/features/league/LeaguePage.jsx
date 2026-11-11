import { Screen } from '../../ui/index.js';
import { TournamentsPage, RankingsPage } from '../public/TournamentsPage.jsx';
import { MatchesPage } from '../public/MatchesPage.jsx';
import { CalendarPage } from '../public/CalendarPage.jsx';
import { CalculatorPage } from '../public/CalculatorPage.jsx';
import { TeamsDirectoryPage } from '../public/TeamsDirectoryPage.jsx';
import { ActivityPage } from '../public/ActivityPage.jsx';
import { NewsPage } from '../public/NewsPage.jsx';
import { RulesPage } from '../public/RulesPage.jsx';
import { StadiumsPage } from '../teams/StadiumsPage.jsx';
import { PlayersPage } from '../public/PlayersPage.jsx';
import { ClubsGrid } from './ClubsGrid.jsx';
import { PreseasonPanel } from '../public/PreseasonPanel.jsx';
import { CupPanel, CupPauseNotice } from '../public/CupPanel.jsx';
import { useAuth } from '../../app/AuthGate.jsx';

// Tres áreas del menú, cada una con una sola fila de pestañas: Partidos, Torneos y Equipos.

const MATCH_TABS = [{ id: 'todos', label: 'Partidos' }, { id: 'calendario', label: 'Calendario' }, { id: 'sanciones', label: 'Sanciones' }];
const MATCH_INTRO = {
  todos: 'En vivo, por jugar y jugados. Toca un partido para ver el acta.',
  calendario: 'Los partidos repartidos por día.',
  sanciones: 'Rojas y suspensiones de la liga.',
};

/** Partidos: el centro de partidos, el calendario y las sanciones. */
export function MatchesScreen({ tab, teams = [], navigate, matchesMode = 'all' }) {
  const active = MATCH_TABS.some(item => item.id === tab) ? tab : 'todos';
  const go = id => navigate(id === 'todos' ? '/partidos' : id === 'calendario' ? '/partidos/calendario' : '/sanciones');
  return <Screen kicker="Koinonia e-League" title="Partidos" intro={MATCH_INTRO[active]} tabs={MATCH_TABS} active={active} onTab={go}>
    {active !== 'sanciones' && <CupPauseNotice/>}
    {active === 'todos' && <MatchesPage key={matchesMode} mode={matchesMode} teams={teams} navigate={navigate}/>}
    {active === 'calendario' && <CalendarPage teams={teams} navigate={navigate}/>}
    {active === 'sanciones' && <ActivityPage sanctionsOnly/>}
  </Screen>;
}

const TOURNAMENT_TABS = [
  { id: 'tabla', label: 'Tabla' }, { id: 'goleadores', label: 'Goleadores' }, { id: 'playoffs', label: 'Playoffs' }, { id: 'premios', label: 'Premios' }, { id: 'copa', label: 'Copa GJ' }, { id: 'giras', label: 'Giras' },
  { id: 'calculadora', label: 'Calculadora' }, { id: 'rankings', label: 'Rankings' },
];
const TOURNAMENT_INTRO = {
  tabla: 'Cómo va cada club. Arriba eliges otro torneo o uno ya jugado.',
  goleadores: 'Quién lleva más goles en el torneo.',
  playoffs: 'Los cruces del play-in, semifinal y final.',
  premios: 'Balón de Oro, Bota, Guante, Golden Boy, DT y portadas. Aquí votan los presis.',
  copa: 'La Copa Grande Jogatore: a mitad de cada torneo, los 8 primeros del torneo anterior a partido único.',
  giras: 'Torneos de pretemporada entre clubes: se arman, se juegan y se cierran aparte de la liga.',
  calculadora: 'Qué necesita cada club para clasificar.',
  rankings: 'Los planteles más caros y las divisiones.',
};

/** Torneos: tabla, goleadores, playoffs, premios, calculadora y rankings. */
export function TournamentsScreen({ tab, teams = [], navigate, query = {}, tournament = null }) {
  const active = TOURNAMENT_TABS.some(item => item.id === tab) ? tab : 'tabla';
  const { teamId: myTeamId } = useAuth();
  const go = id => {
    if (id === 'calculadora') return navigate('/calculadora');
    if (id === 'rankings') return navigate('/equipos/rankings');
    const params = new URLSearchParams();
    if (id !== 'tabla') params.set('vista', id);
    if (query.torneo) params.set('torneo', query.torneo);
    return navigate(`/torneos${params.size ? `?${params}` : ''}`);
  };
  return <Screen kicker="Koinonia e-League" title="Torneos" intro={TOURNAMENT_INTRO[active]} tabs={TOURNAMENT_TABS} active={active} onTab={go}>
    {['tabla', 'goleadores', 'playoffs', 'premios'].includes(active) && <TournamentsPage teams={teams} initialId={query.torneo ?? null} initialView={active}/>}
    {active === 'giras' && <PreseasonPanel teams={teams} myTeamId={myTeamId}/>}
    {active === 'copa' && <CupPanel teams={teams}/>}
    {active === 'calculadora' && <CalculatorPage tournament={tournament} teams={teams} initialTeamId={query.equipo ?? null}/>}
    {active === 'rankings' && <RankingsPage teams={teams} navigate={navigate}/>}
  </Screen>;
}

const CLUB_TABS = [
  { id: 'clubes', label: 'Clubes', path: '/equipos' }, { id: 'estadios', label: 'Estadios', path: '/equipos/estadios' },
  { id: 'plantillas', label: 'Plantillas', path: '/equipos/plantillas' }, { id: 'presupuestos', label: 'Presupuestos', path: '/equipos/presupuestos' },
  { id: 'presidentes', label: 'Presidentes', path: '/equipos/presidentes' }, { id: 'directores-tecnicos', label: 'DTs', path: '/equipos/directores-tecnicos' },
  { id: 'emblemas', label: 'Escudos', path: '/equipos/emblemas' }, { id: 'selecciones', label: 'Selecciones', path: '/equipos/selecciones' },
];
const CLUB_INTRO = {
  clubes: 'Los clubes de la liga. El tuyo va primero.',
  estadios: 'Todos los estadios: de quién es cada uno y cuánto cuesta. Si tienes plata, aquí compras el tuyo.',
  plantillas: 'Los jugadores de cada club.',
  presupuestos: 'Cuánta plata tiene cada club.',
  presidentes: 'Quién manda en cada club.',
  'directores-tecnicos': 'El DT de cada club.',
  emblemas: 'Los escudos de todos los clubes.',
  selecciones: 'Equipos nacionales.',
};
const DIRECTORY = { plantillas: 'squads', presupuestos: 'budgets', presidentes: 'presidents', 'directores-tecnicos': 'coaches', emblemas: 'emblems', selecciones: 'national' };

/** Equipos: los clubes (con el tuyo primero), los estadios y los directorios de la liga. */
export function ClubsScreen({ tab, teams = [], navigate }) {
  const active = CLUB_TABS.some(item => item.id === tab) ? tab : 'clubes';
  const go = id => navigate(CLUB_TABS.find(item => item.id === id).path);
  return <Screen kicker="Koinonia e-League" title="Equipos" intro={CLUB_INTRO[active]} tabs={CLUB_TABS} active={active} onTab={go}>
    {active === 'clubes' && <ClubsGrid teams={teams}/>}
    {active === 'estadios' && <StadiumsPage/>}
    {DIRECTORY[active] && <TeamsDirectoryPage mode={DIRECTORY[active]} teams={teams} onChoose={id => navigate(`/equipos/${encodeURIComponent(id)}`)}/>}
  </Screen>;
}

/** Noticias y reglamento: pantallas sueltas (se llega desde el pie, el inicio o el menú de cuenta). */
export function NewsScreen({ teams = [] }) {
  return <Screen kicker="Koinonia e-League" title="Noticias" intro="Todo lo que pasó en la liga."><NewsPage teams={teams}/></Screen>;
}
export function RulesScreen() {
  return <Screen kicker="Koinonia e-League" title="Reglamento" intro="Las reglas de la liga."><RulesPage/></Screen>;
}

/** Jugadores: el buscador de toda la liga y de eFootball, con el comparador. En la ficha de cada uno: oferta, hablarle y seguir. */
export function PlayersScreen({ teams = [], query = {} }) {
  return <Screen kicker="Koinonia e-League" title="Jugadores" intro="Busca cualquier jugador de la liga o de eFootball. Toca uno para hacerle una oferta, hablarle o seguirlo.">
    <PlayersPage key={JSON.stringify(query)} teams={teams} initialQuery={query}/>
  </Screen>;
}
