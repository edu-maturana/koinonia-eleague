import { useEffect, useRef, useState } from 'react';
import { getData } from '../../api/client.js';

const list = value => Array.isArray(value) ? value : [];

export function useLeagueData(teamId) {
  const [revision, setRevision] = useState(0);
  const [league, setLeague] = useState({ home: null, teams: [], standings: [], standingsByTournament: {} });
  const [teamDetail, setTeamDetail] = useState(null);
  const [squad, setSquad] = useState([]);
  const [teamMatches, setTeamMatches] = useState([]);
  const [teamRecent, setTeamRecent] = useState([]);
  const [teamHistory, setTeamHistory] = useState([]);
  const [teamHistoryError, setTeamHistoryError] = useState(null);
  // Error al cargar la ficha del club (404 = no existe): sin esto la ficha se quedaba en "Cargando el club…" para siempre.
  const [teamError, setTeamError] = useState(null);
  const [state, setState] = useState({ loading: true, loadingTeam: false, error: '' });
  const loadedTeamId = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getData('/home', { signal: controller.signal }),
      getData('/teams', { query: { page: 1, pageSize: 100 }, signal: controller.signal }),
    ]).then(async ([home, teams]) => {
      const tournaments = list(home?.activeTournaments);
      const standingsEntries = await Promise.all(tournaments.map(async tournament => [
        tournament.id,
        list(await getData(`/tournaments/${tournament.id}/standings`, { signal: controller.signal }).catch(() => [])),
      ]));
      const standingsByTournament = Object.fromEntries(standingsEntries);
      const primaryTournament = tournaments.find(tournament => tournament.format === 'league') ?? tournaments[0];
      setLeague({ home, teams: list(teams), standings: standingsByTournament[primaryTournament?.id] ?? [], standingsByTournament });
      setState(current => ({ ...current, loading: false, error: '' }));
    }).catch(error => {
      if (error.code !== 'REQUEST_ABORTED') {
        setState(current => ({ ...current, loading: false, error: 'No fue posible actualizar los datos de la liga.' }));
      }
    });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (!teamId) {
      loadedTeamId.current = null;
      setTeamDetail(null);
      setSquad([]);
      setTeamMatches([]);
      setTeamRecent([]);
      setTeamHistory([]);
      setTeamHistoryError(null);
      setState(current => ({ ...current, loadingTeam: false }));
      return undefined;
    }

    const controller = new AbortController();
    // Al cambiar de equipo se limpia la ficha; al refrescar el mismo equipo (tras
    // editar formación, plantel, etc.) se conservan los datos hasta que llegan los nuevos.
    const switchingTeam = loadedTeamId.current !== teamId;
    loadedTeamId.current = teamId;
    setTeamError(null);
    if (switchingTeam) {
      setTeamDetail(null);
      setSquad([]);
      setTeamMatches([]);
      setTeamHistory([]);
      setTeamHistoryError(null);
      setState(current => ({ ...current, loadingTeam: true }));
    }
    Promise.all([
      getData(`/teams/${teamId}`, { signal: controller.signal }),
      getData(`/teams/${teamId}/squad`, { signal: controller.signal }),
      // La API pagina de a 100 (tope) y un club ya pasa los 150 partidos: se piden dos páginas para no perder los más recientes.
      Promise.all([1, 2].map(page => getData(`/teams/${teamId}/matches`, { query: { page, pageSize: 100 }, signal: controller.signal })))
        .then(pages => pages.flatMap(list)),
      getData(`/teams/${teamId}/matches`, { query: { status: 'finished', order: 'recent', pageSize: 5 }, signal: controller.signal }),
      getData(`/history/team/${teamId}`, { signal: controller.signal })
        .then(data => ({ data: list(data), error: null }))
        .catch(error => ({ data: [], error })),
    ]).then(([team, roster, matches, recent, history]) => {
      setTeamDetail(team);
      setSquad(list(roster));
      setTeamMatches(matches);
      setTeamRecent(list(recent));
      setTeamHistory(history.data);
      setTeamHistoryError(history.error);
      setState(current => ({ ...current, loadingTeam: false }));
    }).catch(error => {
      if (error.code !== 'REQUEST_ABORTED') {
        setTeamError(error);
        setState(current => ({ ...current, loadingTeam: false, error: error.status === 404 ? current.error : 'No fue posible cargar la ficha completa del equipo.' }));
      }
    });
    return () => controller.abort();
  }, [teamId, revision]);

  return {
    league,
    teamDetail,
    squad,
    teamMatches,
    teamRecent,
    teamHistory,
    teamHistoryError,
    teamError,
    state,
    refresh: () => setRevision(value => value + 1),
    dismissError: () => setState(current => ({ ...current, error: '' })),
  };
}
