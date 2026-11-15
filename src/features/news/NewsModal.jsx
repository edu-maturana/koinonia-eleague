import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NewsArtwork } from '../../components/NewsArtwork.jsx';
import { formatDate } from '../public/DataStates.jsx';
import { cachedNews, findNews, newsPath, newsShareUrl } from './newsCache.js';

const newsDate = item => item?.publishedAt ?? item?.date;

// Resuelve una noticia por id (enlace directo): primero la caché, luego el feed.
export function useNewsItem(id) {
  const [state, setState] = useState(() => ({ item: id ? cachedNews(id) : null, loading: Boolean(id && !cachedNews(id)), error: null }));
  useEffect(() => {
    if (!id) { setState({ item: null, loading: false, error: null }); return undefined; }
    const cached = cachedNews(id);
    if (cached) { setState({ item: cached, loading: false, error: null }); return undefined; }
    const controller = new AbortController();
    setState({ item: null, loading: true, error: null });
    findNews(id, controller.signal)
      .then(item => setState({ item, loading: false, error: null }))
      .catch(error => { if (!controller.signal.aborted) setState({ item: null, loading: false, error }); });
    return () => controller.abort();
  }, [id]);
  return state;
}

// Modal de lectura: en escritorio foto 4:3 a la izquierda y texto a la derecha;
// en celular ocupa la pantalla completa con la foto arriba.
export function NewsModal({ item, loading, teams = [], onClose }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  // Abierta desde el inicio o la central del club, la barra de direcciones igual muestra el enlace de la noticia
  // (#/noticias/<id>) sin cambiar de pantalla; al cerrar vuelve la dirección de antes.
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) return undefined;
    const own = `#${newsPath({ id: itemId })}`;
    const previous = window.location.hash;
    if (previous === own) return undefined;
    window.history.replaceState(window.history.state, '', own);
    return () => { if (window.location.hash === own) window.history.replaceState(window.history.state, '', previous || '#/'); };
  }, [itemId]);
  // Se comparte el enlace público (/api/share/news/<id>): trae la vista previa para Discord o WhatsApp y lleva a la noticia.
  const share = async () => {
    const url = newsShareUrl(item);
    try {
      if (navigator.share) await navigator.share({ title: item.headline, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    } catch {
      // Compartir cancelado o portapapeles bloqueado.
    }
  };
  // Va directo al <body>: dentro del sitio quedaba bajo la barra inferior del teléfono, que tapaba el botón Compartir.
  return createPortal(<div className="news-reader-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="news-reader" role="dialog" aria-modal="true" aria-label={item?.headline ?? 'Noticia'}>
      <button type="button" className="news-reader-close" onClick={onClose} aria-label="Cerrar noticia">×</button>
      {!item ? <div className="arcade-state">{loading ? 'CARGANDO NOTICIA…' : 'ESTA NOTICIA YA NO ESTÁ DISPONIBLE.'}</div> : <>
        <figure className="news-reader-figure"><NewsArtwork item={item} teams={teams}/></figure>
        <div className="news-reader-copy">
          <p className="news-reader-meta"><b>{item.label}</b>{newsDate(item) && <time>{formatDate(newsDate(item))}</time>}</p>
          <h2>{item.headline}</h2>
          {item.subtitle && <h3>{item.subtitle}</h3>}
          <div className="news-reader-body">{item.body && <p>{item.body}</p>}{item.body2 && <p className="news-story-angle">{item.body2}</p>}</div>
          <button type="button" className="news-reader-share" onClick={share}>{copied ? '✓ ENLACE COPIADO' : '↗ COMPARTIR'}</button>
        </div>
      </>}
    </article>
  </div>, document.body);
}
