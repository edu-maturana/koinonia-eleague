import { endpoints } from '../../api/endpoints.js';
import { EntityLink } from '../../components/EntityLink.jsx';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { DataState } from './DataStates.jsx';
import { useApiQuery } from './useApiQuery.js';

/**
 * Tabla de goleadores de un torneo: puesto, cara del jugador, su nombre con el escudo y el club con que marcó, y los goles.
 * No muestra partidos jugados: la liga no registra quién jugó cada partido.
 */
export function ScorersList({ query, resolveTeam = team => team, title = 'GOLEADORES', empty = 'AÚN NO HAY GOLES.' }) {
  const rows = Array.isArray(query.data) ? query.data : [];
  return <section className="workspace-panel tournament-scorers"><h3>{title}</h3><DataState query={query} empty={null}/>
    {!query.loading && !query.error && (rows.length ? <ol className="tournament-scorer-list">{rows.map((row, index) => {
      const team = row.teamId ? resolveTeam({ id: row.teamId, name: row.teamName }) : null;
      // Puesto compartido: con los mismos goles que el de arriba se repite el número.
      const rank = index > 0 && rows[index - 1].goals === row.goals ? null : index + 1;
      return <li key={row.playerId ?? row.name}>
        <b aria-label={rank ? `Puesto ${rank}` : 'Mismo puesto que el anterior'}>{rank ?? '='}</b>
        <PlayerFace src={row.faceUrl} name={row.playerName ?? row.name} className="scorer-face"/>
        <span className="scorer-identity">
          <EntityLink to="player" id={row.playerId}>{row.playerName ?? row.name}</EntityLink>
          {team && <EntityLink to="team" id={team.id} className="scorer-club"><TeamMark team={team}/><span>{team.name}</span></EntityLink>}
        </span>
        <strong aria-label={`${row.goals ?? 0} ${row.goals === 1 ? 'gol' : 'goles'}`}>{row.goals ?? 0}</strong>
      </li>;
    })}</ol> : <p className="empty-copy">{empty}</p>)}
  </section>;
}

/** Goleadores de un torneo por su id (la copa es un torneo propio: sus goles no se mezclan con los de la liga). */
export function TournamentScorers({ tournamentId, resolveTeam, title, empty }) {
  const query = useApiQuery(signal => endpoints.scorers(tournamentId, signal), [tournamentId]);
  return <ScorersList query={query} resolveTeam={resolveTeam} title={title} empty={empty}/>;
}
