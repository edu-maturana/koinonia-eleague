import { useState } from 'react';
import { endpoints } from '../../api/endpoints.js';
import { Button, Card, Chip, EmptyState, Stat } from '../../ui/index.js';
import { DataState } from '../public/DataStates.jsx';
import { useApiQuery } from '../public/useApiQuery.js';
import { gpLabel } from '../../utils/money.js';

// Se muestran los últimos movimientos; el resumen por tipo dice de dónde viene y a dónde va la plata.
const PAGE = 15;
const TONE = { fichajes: 'navy', subastas: 'neutral', sueldos: 'red', primas: 'yellow', premios: 'green', directiva: 'green', estadio: 'navy', ajustes: 'neutral' };
const when = value => {
  const date = new Date(`${String(value).replace(' ', 'T')}${String(value).includes('Z') || String(value).includes('+') ? '' : 'Z'}`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
};

/** Libro de movimientos del club: cada ingreso y egreso con su motivo, quién lo hizo y el saldo que quedó. Solo lo ve el club y la administración. */
export function LedgerTab({ team, balance }) {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const query = useApiQuery(signal => endpoints.teamLedger(team.id, { category: category || undefined, limit }, signal), [team.id, category, limit]);
  const data = query.data;
  const entries = data?.entries ?? [];
  const categories = data?.categories ?? {};
  const pick = value => { setCategory(value); setLimit(PAGE); };
  return <section className="ledger-tab" aria-busy={query.loading}>
    <header><h2>CAJA</h2><p>Cada ingreso y egreso de tu saldo, con su motivo. Siempre cuadra.</p></header>
    <DataState query={query}/>
    {data && <>
      <Card tone="paper" className="ledger-stats">
        <Stat label="SALDO" value={gpLabel(data.balance)} hint={balance !== null && balance !== undefined && balance !== data.balance ? 'DISTINTO AL DE LA FICHA' : undefined} tone={data.balance < 0 ? 'red' : 'default'}/>
        <Stat label="HA ENTRADO" value={gpLabel(data.totals.income)} tone="green"/>
        <Stat label="HA SALIDO" value={gpLabel(-data.totals.expense)} tone="red"/>
      </Card>
      {!category && <Card title="POR TIPO" className="ledger-summary">
        <div className="ledger-summary-scroll"><table className="ledger-summary-table"><thead><tr><th>Tipo</th><th>Entró</th><th>Salió</th><th>Neto</th></tr></thead>
          {/* `expense` llega en negativo. */}
          <tbody>{Object.entries(data.totals.byCategory).sort(([, a], [, b]) => (b.income - b.expense) - (a.income - a.expense)).map(([key, bucket]) => <tr key={key}>
            <td><button type="button" className="ghost" onClick={() => pick(key)}>{(categories[key] ?? key).toUpperCase()}</button></td>
            <td className="up">{bucket.income ? `+${gpLabel(bucket.income)}` : '—'}</td>
            <td className="down">{bucket.expense ? `−${gpLabel(-bucket.expense)}` : '—'}</td>
            <td className={bucket.income + bucket.expense >= 0 ? 'up' : 'down'}>{gpLabel(bucket.income + bucket.expense)}</td>
          </tr>)}</tbody></table></div>
      </Card>}
      <h3 className="ledger-recent-title">{category ? (categories[category] ?? category).toUpperCase() : 'ÚLTIMOS MOVIMIENTOS'}</h3>
      <div className="ledger-filters" role="group" aria-label="Filtrar por tipo de movimiento">
        <button type="button" className={category === '' ? 'on' : ''} aria-pressed={category === ''} onClick={() => pick('')}>TODOS <b>{Object.values(data.totals.byCategory).reduce((sum, item) => sum + item.count, 0)}</b></button>
        {Object.entries(categories).filter(([key]) => data.totals.byCategory[key]).map(([key, label]) => {
          const bucket = data.totals.byCategory[key];
          return <button type="button" key={key} className={category === key ? 'on' : ''} aria-pressed={category === key} onClick={() => pick(key)} title={`Entró ${gpLabel(bucket.income)} · salió ${gpLabel(-bucket.expense)}`}>{label.toUpperCase()} <b>{bucket.count}</b></button>;
        })}
      </div>
      {entries.length === 0 ? <EmptyState icon="coin" title="SIN MOVIMIENTOS">Aquí aparecerá cada ingreso y egreso del club.</EmptyState> : <ol className={`ledger-list ${query.loading ? 'is-loading' : ''}`}>
        {entries.map(entry => <li key={entry.id} className={`ledger-row ${entry.direction}`}>
          <div className="ledger-main">
            <b>{entry.reason}</b>
            <small>{when(entry.createdAt)}{entry.detail ? ` · ${entry.detail}` : ''}{entry.by ? ` · POR ${entry.by.toUpperCase()}` : ''}</small>
            <Chip tone={TONE[entry.category] ?? 'neutral'}>{(categories[entry.category] ?? entry.category).toUpperCase()}</Chip>
          </div>
          <div className="ledger-money">
            <strong>{entry.amount >= 0 ? '+' : '−'}{gpLabel(Math.abs(entry.amount))}</strong>
            <small>SALDO {gpLabel(entry.balanceAfter)}</small>
          </div>
        </li>)}
      </ol>}
      {data.total > entries.length && <Button variant="ghost" onClick={() => setLimit(value => value + PAGE)}>VER MÁS ({data.total - entries.length} MOVIMIENTOS MÁS)</Button>}
    </>}
  </section>;
}
