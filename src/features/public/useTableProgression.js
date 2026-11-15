import { endpoints } from '../../api/endpoints.js';
import { useApiQuery } from './useApiQuery.js';

/**
 * Formato de la tabla (zonas de playoffs), forma y puesto fecha a fecha de un torneo. Se vuelve a pedir cuando cambia
 * `refreshKey` (por ejemplo, la cantidad de partidos jugados de la tabla en vivo), así no se consulta cada 12 segundos.
 */
export function useTableProgression(tournamentId, refreshKey = '') {
  return useApiQuery(signal => (tournamentId
    ? endpoints.tournamentProgression(tournamentId, signal).catch(error => (error?.status === 404 ? { data: null } : Promise.reject(error)))
    : Promise.resolve({ data: null })), [tournamentId, refreshKey], { silentRefresh: true });
}

/** Llave de refresco: suma de partidos jugados oficiales de la tabla (los en vivo no cuentan hasta terminar). */
export const playedKey = rows => (Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number(row.played ?? 0) - (row.isPlayingLive ? 1 : 0), 0) : 0);
