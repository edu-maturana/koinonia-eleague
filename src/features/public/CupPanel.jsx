import { endpoints } from '../../api/endpoints.js';
import { Card, Chip, Notice } from '../../ui/index.js';
import { DataState, gp } from './DataStates.jsx';
import { PreseasonBracket } from './PreseasonPanel.jsx';
import { useApiQuery } from './useApiQuery.js';

const upper = text => String(text ?? '').toUpperCase();
const CUP_PLACES = { champion: 'CAMPEÓN', runnerUp: 'FINALISTA', third: '3.º', fourth: '4.º', quarterfinal: 'CUARTOS' };

/** Cuadro de una Copa Grande Jogatore: cupos (tabla del torneo anterior), cruces y, al terminar, puestos y premios. */
export function CupBracketView({ cup, teams = [], onChanged }) {
  const names = Object.fromEntries(teams.map(team => [team.id, team.name]));
  const teamIndex = Object.fromEntries(teams.map(team => [team.id, team]));
  return <>
    <h3>CUADRO DE LA COPA <small>LOS 8 PRIMEROS DE {upper(cup.sourceName ?? 'la liga anterior')} · 1.º VS 2.º DE ENTRADA, EL RESTO POR SORTEO · PARTIDO ÚNICO, LOCAL EL MEJOR UBICADO</small></h3>
    {cup.seeds?.length > 0 && <p className="club-life-hint">CUPOS: {cup.seeds.map(seed => `${seed.rank}.º ${names[seed.teamId] ?? ''}`).join(' · ')}</p>}
    <PreseasonBracket bracket={{ ...cup, teamNames: names, teamIndex, placeLabels: CUP_PLACES }} onChanged={onChanged}/>
  </>;
}

/** Aviso de liga en pausa mientras se juega la copa (lo usan Partidos y la pestaña Copa). */
export function CupPauseNotice() {
  const flow = useApiQuery(signal => endpoints.seasonFlow(signal).catch(() => ({ data: null })), []);
  const cup = flow.data?.cup;
  if (!cup || cup.status !== 'active') return null;
  return <Notice tone="warning">{upper(flow.data.running?.name ?? 'La liga')} ESTÁ EN PAUSA: SE JUEGA LA {upper(cup.name)}. LA SEGUNDA VUELTA SIGUE CUANDO TERMINE LA FINAL.</Notice>;
}

/** Pestaña Copa: la Copa Grande Jogatore en juego y las ya jugadas. */
export function CupPanel({ teams = [] }) {
  const query = useApiQuery(signal => endpoints.cups(signal), []);
  const cups = Array.isArray(query.data) ? query.data : null;
  if (!cups) return <DataState query={query}/>;
  const prizes = cups[0]?.prizes;
  return <Card title="COPA GRANDE JOGATORE" className="preseason-panel">
    <CupPauseNotice/>
    <p className="club-life-hint">Se juega a mitad de cada torneo: al terminar la primera vuelta la liga se pausa y entran los 8 primeros de la tabla del torneo anterior. El 1.º y el 2.º se cruzan de entrada en cuartos y los otros 6 se sortean. Todo a partido único y eliminación directa (empate: penales), de local el mejor ubicado; los que pierden las semis juegan el 3.er puesto el día de la final. El campeón suma un título a la vitrina (GC1, GC2…).{prizes?.third ? ` Premios: campeón ${gp(prizes.champion)}, finalista ${gp(prizes.runnerUp)}, 3.º ${gp(prizes.third)}, 4.º ${gp(prizes.fourth)} y cuartofinalistas ${gp(prizes.quarterfinal)}.` : ''}</p>
    {!cups.length && <p className="trophy-empty">TODAVÍA NO SE JUEGA NINGUNA COPA: LA PRIMERA ARRANCA A MITAD DEL PRÓXIMO TORNEO.</p>}
    {cups.map(cup => <section key={cup.id} className="preseason-item">
      <header><b>{upper(cup.name)}</b><Chip tone={cup.status === 'completed' ? 'green' : 'yellow'}>{cup.status === 'completed' ? 'TERMINADA' : 'EN JUEGO'}</Chip></header>
      <CupBracketView cup={cup} teams={teams} onChanged={query.retry}/>
    </section>)}
  </Card>;
}
