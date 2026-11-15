// Menú principal: Inicio (la central de tu club) · Partidos · Torneos · Equipos (tu club también vive aquí) · Jugadores · Mercado. La Sala de control (admin) está en el menú de la cuenta.
export function navigationFor() {
  return [
    { label: 'Inicio', path: '/', icon: 'home' },
    { label: 'Partidos', path: '/partidos', icon: 'ball' },
    { label: 'Torneos', path: '/torneos', icon: 'trophy' },
    { label: 'Equipos', path: '/equipos', icon: 'shirt' },
    { label: 'Jugadores', path: '/equipos/jugadores', icon: 'people' },
    { label: 'Mercado', path: '/transferencias', icon: 'handshake' },
  ];
}

const MATCH_PATHS = new Set(['/partidos', '/partidos/jugados', '/partidos/pendientes', '/partidos/calendario', '/sanciones']);
const TOURNAMENT_PATHS = new Set(['/torneos', '/calculadora', '/clasificacion', '/equipos/rankings']);

/** A qué ítem del menú pertenece la pantalla actual (null si no cuelga de ninguno, como Reglas o Notificaciones). */
export function activeNavigationPath(route) {
  if (route.name === 'home') return '/';
  if (route.name === 'player' || route.name === 'card' || route.path.startsWith('/equipos/jugadores')) return '/equipos/jugadores';
  if (route.path === '/transferencias') return '/transferencias';
  if (route.name === 'match' || MATCH_PATHS.has(route.path) || (route.path === '/liga' && route.query?.tab === 'partidos')) return '/partidos';
  if (TOURNAMENT_PATHS.has(route.path) || (route.path === '/liga' && !['partidos', 'clubes', 'estadios'].includes(route.query?.tab))) return '/torneos';
  if (route.name === 'team' || route.name === 'teams' || route.path.startsWith('/equipos') || route.path === '/liga') return '/equipos';
  if (route.path === '/admin' || route.path === '/personas') return '/admin';
  return null;
}

export const sectionContent = {
  '/partidos': ['CENTRO DE PARTIDOS', 'Calendario completo de la liga, encuentros en vivo y próximos cruces.'],
  '/partidos/jugados': ['PARTIDOS JUGADOS', 'Historial de encuentros finalizados con acceso a cada acta.'],
  '/partidos/calendario': ['CALENDARIO', 'Partidos de la liga repartidos por día.'],
  '/partidos/pendientes': ['PRÓXIMOS PARTIDOS', 'Programación pendiente organizada por torneo y fecha.'],
  '/clasificacion': ['TORNEOS', 'Tabla, goleadores y playoffs de cada torneo.'],
  '/equipos/rankings': ['RANKINGS Y DIVISIONES', 'Valor de planteles y estructura divisional.'],
  '/equipos/plantillas': ['PLANTILLAS', 'Jugadores titulares, suplentes, dorsales y orden de plantel.'],
  '/equipos/presupuestos': ['PRESUPUESTOS', 'Saldos GP y movimientos económicos de cada institución.'],
  '/equipos/presidentes': ['PRESIDENTES', 'Directorio de responsables de los clubes participantes.'],
  '/equipos/directores-tecnicos': ['DIRECTORES TÉCNICOS', 'Cuerpos técnicos registrados en la liga.'],
  '/equipos/emblemas': ['EMBLEMAS', 'Galería oficial de clubes y selecciones.'],
  '/equipos/estadios': ['ESTADIOS', 'Catálogo de estadios de la liga: fotos, aforo, precio y dueño.'],
  '/equipos/selecciones': ['SELECCIONES', 'Equipos nacionales y clubes responsables.'],
  '/equipos/jugadores': ['JUGADORES', 'Buscador y fichas individuales de futbolistas.'],
  '/equipos/jugadores/importar': ['AGREGAR JUGADORES', 'Importación desde eFootballDB y alta manual.'],
  '/transferencias': ['MERCADO', 'Agentes libres, jugadores no inscritos y últimos movimientos.'],
  '/notificaciones': ['NOTIFICACIONES', 'Tus avisos y cómo quieres recibirlos.'],
  '/admin': ['SALA DE CONTROL', 'Herramientas de administración de la liga.'],
  '/sanciones': ['SANCIONES', 'Expulsiones y suspensiones registradas en las actas.'],
  '/torneos': ['TORNEOS', 'Tabla, goleadores y playoffs de cada torneo.'],
  '/calculadora': ['CALCULADORA', 'Probabilidades, escenarios y qué necesita cada equipo.'],
  '/noticias': ['ACTIVIDAD DE LA LIGA', 'Novedades generadas por la actividad oficial de Koinonia e-League.'],
  '/personas': ['PERSONAS Y PERMISOS', 'Quién ha entrado a la web, sus equipos y sus permisos.'],
  '/reglas': ['REGLAS DEL TORNEO', 'Reglamento oficial, condiciones de competencia y criterios deportivos de Koinonia e-League.'],
};
