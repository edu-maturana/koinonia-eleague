import { DataState, formatDate, gp } from '../DataStates.jsx';

/* Resumen del club del presi: saldo, margen contra el tope de plantilla y estado del mercado. */
export function marketStatusText(status, clock = null) {
  if (!status) return null;
  if (!status.open) return clock?.target ? `MERCADO CERRADO · ${clock.short.toUpperCase()}` : 'MERCADO CERRADO';
  return `MERCADO ABIERTO · ${clock?.left > 0 ? `${clock.short.toUpperCase()} (${formatDate(status.closesAt).toUpperCase()})` : `CIERRA ${formatDate(status.closesAt).toUpperCase()}`}`;
}

export function clubFigures(profile) {
  if (!profile) return null;
  const balance = Number(profile.balance);
  const squadValue = Number(profile.squadValue);
  const limit = Number(profile.squadValueLimit);
  return {
    balance: Number.isFinite(balance) ? balance : null,
    squadValue: Number.isFinite(squadValue) ? squadValue : null,
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    room: Number.isFinite(squadValue) && Number.isFinite(limit) && limit > 0 ? Math.max(0, limit - squadValue) : null,
  };
}

/* Por qué un club no puede pagar un fichaje (texto en mayúsculas), o null si puede. */
// Abrir una encuesta es una propuesta: solo la frena el mercado cerrado. El saldo se exige al confirmar la
// compra; pasado del tope de plantilla o de nómina el club no puede jugar partidos hasta ordenarse.
export function signingBlocker(figures, price, marketOpen) {
  return marketOpen === false ? 'EL MERCADO ESTÁ CERRADO.' : null;
}

/** Avisos que no frenan: qué pasaría con el saldo y el tope si la compra se concreta. */
export function signingNotes(figures, price) {
  if (!figures || price == null) return [];
  const notes = [];
  if (figures.balance !== null && figures.balance < price) notes.push(`Ojo: para confirmar la compra necesitas ${gp(price)} de saldo (hoy tienes ${gp(figures.balance)}).`);
  if (figures.room !== null && price > figures.room) notes.push(`Ojo: con él quedarías ${gp(price - figures.room)} sobre el tope. Tienes hasta el cierre del mercado para ordenarte.`);
  return notes;
}

export function MyClubPanel({ team, figures, profileQuery, status, statusQuery, clock = null, children = null }) {
  // Una sola franja: lo que el presi necesita mirar antes de ofertar (saldo, margen bajo el tope y el reloj del mercado).
  return <section className="market-section market-myclub" aria-label="Tu club en el mercado">
    <span className={`market-myclub-status ${status?.open ? 'is-open' : ''}`}>{marketStatusText(status, clock) ?? 'ESTADO DEL MERCADO NO DISPONIBLE'}</span>
    {team && <b className="market-myclub-name">{team.name}</b>}
    {profileQuery && <DataState query={profileQuery}/>}
    {figures && <dl className="market-figures">
      <div><dt>SALDO</dt><dd>{figures.balance === null ? '—' : gp(figures.balance)}</dd></div>
      <div title={figures.limit === null ? undefined : `Tope de plantilla: ${gp(figures.limit)}`}><dt>MARGEN BAJO EL TOPE</dt><dd>{figures.room === null ? '—' : gp(figures.room)}</dd></div>
    </dl>}
    {children}
    {statusQuery?.error && statusQuery.error.status !== 404 && <p className="signing-warning">No se pudo leer el estado del mercado.</p>}
  </section>;
}
