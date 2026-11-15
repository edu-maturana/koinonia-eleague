import { endpoints } from '../../api/endpoints.js';
import { apiUrl } from '../../api/client.js';

// La API no expone /news/:id: las noticias que ya se cargaron (inicio, página de
// noticias) quedan en memoria, y si se abre un enlace directo se recorre el feed.
const cache = new Map();
const SEARCH_PAGE_SIZE = 50;
const SEARCH_MAX_PAGES = 10;

export function rememberNews(items = []) {
  items.forEach(item => { if (item?.id) cache.set(String(item.id), item); });
}

export const cachedNews = id => cache.get(String(id)) ?? null;

export async function findNews(id, signal) {
  const cached = cachedNews(id);
  if (cached) return cached;
  for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) {
    const response = await endpoints.news({ page, pageSize: SEARCH_PAGE_SIZE }, signal);
    const items = Array.isArray(response?.data) ? response.data : [];
    rememberNews(items);
    const found = cachedNews(id);
    if (found) return found;
    const totalPages = response?.pagination?.totalPages;
    if (!items.length || (totalPages && page >= totalPages)) break;
  }
  return null;
}

export const newsPath = item => `/noticias/${encodeURIComponent(item.id)}`;

/** Enlace público para compartir: una página con la vista previa (titular, bajada, imagen) que redirige a la noticia. */
export const newsShareUrl = item => new URL(apiUrl(`/share/news/${encodeURIComponent(item.id)}`), window.location.origin).toString();
