import { useEffect, useState } from 'react';
import { endpoints } from '../../../api/endpoints.js';
import { useApiQuery } from '../useApiQuery.js';

// Reloj del mercado: abierto → cuánto falta para que cierre; cerrado → cuándo vuelve según el ciclo de temporadas
// (mercado → liga → liga → mercado, ver /season-flow en el servidor). La apertura es manual, así que cerrado no hay hora exacta.

/** "2 d 4 h", "3 h 12 min", "8 min", "menos de 1 min". */
export function countdownText(ms) {
  if (!(ms > 0)) return 'ya';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${mins} min`;
  return mins ? `${mins} min` : 'menos de 1 min';
}

/** Se refresca cada 30 s mientras la pestaña está visible. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => { if (document.visibilityState !== 'hidden') setNow(Date.now()); };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [active]);
  return now;
}

/** Para una ventana de 2 ligas: qué liga hay que terminar para que vuelva el mercado. */
function reopenTarget(flow) {
  if (!flow) return null;
  const left = Math.max((flow.windowSize ?? 2) - (flow.leaguesInWindow ?? 0), 0);
  if (flow.running) return left === 0 ? flow.running.name : left === 1 ? flow.nextName : null;
  return null;
}

export function useMarketClock(revision = 0) {
  const status = useApiQuery(signal => endpoints.marketStatus(signal).catch(() => ({ data: null })), [revision]);
  const flow = useApiQuery(signal => endpoints.seasonFlow(signal).catch(() => ({ data: null })), [revision]);
  const open = Boolean(status.data?.open);
  const closesAt = open && status.data?.closesAt ? new Date(status.data.closesAt).getTime() : null;
  const now = useNow(Boolean(closesAt));
  if (!status.data) return { ready: false, open: false };
  if (open) {
    const left = closesAt ? closesAt - now : null;
    return { ready: true, open, phase: status.data.phase, closesAt: status.data.closesAt, left,
      short: left == null ? 'Abierto' : left > 0 ? `Cierra en ${countdownText(left)}` : 'Cerrando…',
      detail: status.data.phase === 'renewals' ? 'Período de renovaciones.' : 'Transacciones abiertas.' };
  }
  const target = reopenTarget(flow.data);
  const leagues = flow.data ? Math.max((flow.data.windowSize ?? 2) - (flow.data.leaguesInWindow ?? 0), 0) : null;
  return { ready: true, open: false, target,
    short: target ? `Vuelve al terminar la ${target.replace(/^Koinonia E-League /i, '')}` : 'Cerrado',
    detail: target
      ? (leagues === 1 ? `Falta esta liga y la ${flow.data.nextName.replace(/^Koinonia E-League /i, '')}; lo abre un admin.` : 'Al terminar esta liga; lo abre un admin.')
      : 'Lo abre un admin entre temporadas.' };
}
