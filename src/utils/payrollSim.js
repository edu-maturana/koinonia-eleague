// Simulación de la nómina de un club para los próximos torneos. Es pura (sin red ni estado): no cambia nada real.
// Cada jugador cobra su sueldo cada torneo mientras dura su contrato; al vencer, si se asume renovación, renueva por 2 torneos
// con el aumento elegido, siempre bajo el tope del 20% de su valor de mercado. Lo que entra sale de la TV de la liga (según el puesto) y la de postemporada.
export const SALARY_STEP = 10_000;
export const MAX_SALARY_SHARE = 0.2;
export const HORIZON = 6;
// Lo que paga la liga al cerrar cada torneo es TV (igual que el servidor, core/league-tv.js): 110 M por club, 40% en partes
// iguales, 45% según el puesto y 15% según la audiencia. Acá la audiencia se toma como la de un club promedio (estimado).
export const LEAGUE_TV_PER_CLUB = 110_000_000;
export const LEAGUE_TV_SHARES = { equal: 0.4, position: 0.45, audience: 0.15 };
export const LEAGUE_CLUBS = 10;
export const PLAYOFF_PRIZES = { none: 0, playin: 5_000_000, semifinal: 10_000_000, runnerUp: 20_000_000, champion: 40_000_000 };

export const roundStep = amount => Math.max(SALARY_STEP, Math.round(amount / SALARY_STEP) * SALARY_STEP);
export const maxSalaryFor = value => Math.max(SALARY_STEP, Math.floor(Number(value) * MAX_SALARY_SHARE / SALARY_STEP) * SALARY_STEP);
export const leaguePrize = (position, clubs = LEAGUE_CLUBS) => {
  const place = Math.min(clubs, Math.max(1, position));
  const pool = LEAGUE_TV_PER_CLUB * clubs;
  const merit = pool * LEAGUE_TV_SHARES.position * (clubs - place + 1) / (clubs * (clubs + 1) / 2);
  return Math.round((LEAGUE_TV_PER_CLUB * (LEAGUE_TV_SHARES.equal + LEAGUE_TV_SHARES.audience) + merit) / 10_000) * 10_000;
};

/**
 * `players`: [{ value, salary, years, raise?, renew?, sold? }]: `raise` y `renew` de un jugador mandan sobre los globales, y `sold` lo saca desde el T1.
 * `options`: { raise (%), renew (bool), position (1..) y playoff (clave de PLAYOFF_PRIZES) por defecto, positions[] y playoffs[]
 * con el puesto y los playoffs de cada torneo (null = el por defecto),
 * balance, cap (nómina máxima o null) }. Devuelve una fila por torneo con nómina, premios, neto, saldo y cuántos contratos vencen.
 */
export function simulate(players, { raise = 15, renew = true, position = 4, playoff = 'none', positions = [], playoffs = [], balance = 0, cap = null } = {}) {
  const state = players.map(player => ({
    value: player.value, salary: player.salary, left: player.years, alive: !player.sold,
    raise: player.raise ?? raise, renew: player.renew ?? renew,
  }));
  const rows = [];
  let running = balance;
  for (let torneo = 1; torneo <= HORIZON; torneo += 1) {
    const place = positions[torneo - 1] ?? position;
    // 'quarterfinal' es el nombre viejo de 'playin' en simulaciones guardadas.
    const raw = playoffs[torneo - 1] ?? playoff;
    const bonus = raw === 'quarterfinal' ? 'playin' : raw;
    const prize = leaguePrize(place) + (PLAYOFF_PRIZES[bonus] ?? 0);
    let payroll = 0; let expiring = 0; let renewed = 0; let leaving = 0;
    for (const item of state) {
      if (!item.alive) continue;
      payroll += item.salary;
      item.left -= 1;
      if (item.left <= 0) {
        expiring += 1;
        if (item.renew) { item.salary = Math.min(roundStep(item.salary * (1 + item.raise / 100)), maxSalaryFor(item.value)); item.left = 2; renewed += 1; }
        else { item.alive = false; leaving += 1; }
      }
    }
    running += prize - payroll;
    rows.push({ torneo, position: place, playoff: bonus, payroll, prize, net: prize - payroll, balance: running, expiring, renewed, leaving, overCap: cap !== null && payroll > cap });
  }
  return rows;
}
