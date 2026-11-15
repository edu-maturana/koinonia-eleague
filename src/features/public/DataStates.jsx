import { gpLabel } from '../../utils/money.js';
import { useEmbedded } from '../../ui/index.js';

export function DataState({ query, empty = 'NO HAY REGISTROS PUBLICADOS.' }) {
  if (query.loading) return <div className="arcade-state compact">CARGANDO DATOS...</div>;
  // Un 404 no se arregla reintentando: se dice qué no existe y se ofrece volver.
  if (query.error?.status === 404) return <div className="data-error"><b>NO LO ENCONTRAMOS</b><span>{query.error.message || 'Ya no existe o el enlace está mal.'}</span><button onClick={() => window.history.back()}>← VOLVER</button></div>;
  if (query.error) return <div className="data-error"><b>NO FUE POSIBLE CARGAR</b><span>{query.error.message}</span><button onClick={query.retry}>REINTENTAR</button></div>;
  // empty={null}: la pantalla ya explica el vacío a su manera (así no salen dos mensajes seguidos).
  if (Array.isArray(query.data) && !query.data.length) return empty ? <p className="empty-copy data-empty">{empty}</p> : null;
  return null;
}

export function PageHeader({ kicker, title, children }) {
  // Dentro de una Screen el título ya está arriba: solo quedan las acciones de la página, en una barra.
  const embedded = useEmbedded();
  if (embedded) return children ? <div className="screen-toolbar">{children}</div> : null;
  return <header className="data-page-header"><p>{kicker}</p><h1>{title}</h1>{children}</header>;
}

export function Pagination({ pagination, page, onPage }) {
  if (!pagination) return null;
  const totalPages = pagination.totalPages ?? Math.max(1, Math.ceil((pagination.total ?? 0) / (pagination.pageSize ?? 20)));
  return <nav className="pagination" aria-label="Paginación"><button disabled={page <= 1} onClick={() => onPage(page - 1)}>◀ ANTERIOR</button><span>PÁGINA {page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>SIGUIENTE ▶</button></nav>;
}

export const formatDate = value => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const gp = value => typeof value === 'number' ? gpLabel(value) : '—';
export function OverallBadge({ value, className = '' }) {
  return <span className={`overall-badge ${className}`.trim()} title={value == null ? 'Media eFootball no disponible' : `Media eFootball: ${value}`}>OVR {value ?? '—'}</span>;
}
