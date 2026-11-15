import { endpoints } from '../../api/endpoints.js';
import { PlayerFace } from '../../components/PlayerFace.jsx';
import { TeamMark } from '../../components/TeamMark.jsx';
import { Card } from '../../ui/index.js';
import { useApiQuery } from '../public/useApiQuery.js';

// Lo que viene en la liga: el partido de la fecha (el que más pesa en la tabla) y los hitos goleadores a la vista.
// Lo calcula el servidor (/v1/highlights) con la tabla, las rivalidades y los goles oficiales; si no hay nada, no se muestra.

export function useHighlights() {
  return useApiQuery(signal => endpoints.highlights(signal).catch(() => ({ data: null })), []);
}

const KIND_ICON = { mark: '🎯', chase: '📈', streak: '🔥', race: '👟' };

export function MatchOfTheDay({ data, teams = [] }) {
  if (!data) return null;
  const byId = new Map(teams.map(team => [team.id, team]));
  const home = { ...data.homeTeam, ...(byId.get(data.homeTeamId) ?? {}) };
  const away = { ...data.awayTeam, ...(byId.get(data.awayTeamId) ?? {}) };
  return <Card className="motd" title="⭐ Partido de la fecha" aside={<a className="card-link" href={`#/partidos/${data.id}`}>Ver ›</a>}>
    <a className="motd-match" href={`#/partidos/${data.id}`}>
      <span className="motd-team"><TeamMark team={home}/><b>{home.name}</b><small>{data.home.position}.º · {data.home.points} pts</small></span>
      <em>vs</em>
      <span className="motd-team"><TeamMark team={away}/><b>{away.name}</b><small>{data.away.position}.º · {data.away.points} pts</small></span>
    </a>
    <ul className="motd-reasons">{data.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <p className="motd-foot">Fecha {data.round}{data.calendarDay ? ` · día ${data.calendarDay} del calendario` : ''}</p>
  </Card>;
}

export function Milestones({ items = [] }) {
  if (!items.length) return null;
  return <Card className="milestones" title="Hitos a la vista">
    <ul>{items.map(item => <li key={`${item.kind}-${item.playerId}`}>
      <a href={`#/jugadores/${encodeURIComponent(item.playerId)}`}>
        <PlayerFace src={item.faceUrl} name={item.name} className="milestone-face"/>
        <span><b><i aria-hidden="true">{KIND_ICON[item.kind] ?? '⚽'}</i> {item.text}</b><small>{item.detail}</small></span>
        {item.team && <TeamMark team={item.team}/>}
      </a>
    </li>)}</ul>
  </Card>;
}

/** Las dos tarjetas juntas (Inicio con y sin club). */
export function HighlightsRow({ teams }) {
  const query = useHighlights();
  const data = query.data;
  if (!data || (!data.matchOfTheDay && !data.milestones?.length)) return null;
  return <div className="highlights-row">
    <MatchOfTheDay data={data.matchOfTheDay} teams={teams}/>
    <Milestones items={data.milestones}/>
  </div>;
}
