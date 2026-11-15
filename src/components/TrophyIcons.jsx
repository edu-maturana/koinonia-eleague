// Íconos de trofeo: la Koinonia E-League (copa de dos asas, cuenco plateado y base verde) y la Copa Grande Giocatore (copa plateada de cintura fina).
// Los degradados tienen id fijo: si el ícono se repite, todos son idénticos y se comparten.
export const LEAGUE_TROPHY_ICON = <svg viewBox="0 0 32 32" aria-hidden="true">
  <defs>
    <linearGradient id="koi-gold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffe27a"/><stop offset=".5" stopColor="#f2b705"/><stop offset="1" stopColor="#b87f00"/></linearGradient>
    <linearGradient id="koi-silver" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#a9a9b4"/><stop offset=".4" stopColor="#fafafc"/><stop offset=".7" stopColor="#d4d4dc"/><stop offset="1" stopColor="#9a9aa6"/></linearGradient>
  </defs>
  <g fill="none" strokeLinecap="round"><path d="M7.6 6.4C1.4 4.6 1.2 15 10.8 17.6M24.4 6.4C30.6 4.6 30.8 15 21.2 17.6" stroke="url(#koi-gold)" strokeWidth="1.6"/><path d="M7.6 6.4C1.4 4.6 1.2 15 10.8 17.6M24.4 6.4C30.6 4.6 30.8 15 21.2 17.6" stroke="#7a5400" strokeWidth=".35" opacity=".7"/></g>
  <path d="M7.4 6.2C7.4 13.5 10.6 18.2 16 19C21.4 18.2 24.6 13.5 24.6 6.2Z" fill="url(#koi-silver)" stroke="#55556a" strokeWidth=".6" strokeLinejoin="round"/>
  <path d="M16 14.6l1.5 3.4-1.5 1.5-1.5-1.5zM12.2 15.4l1.6 2.8-1.2 1.2-1.9-2zM19.8 15.4l-1.6 2.8 1.2 1.2 1.9-2z" fill="url(#koi-gold)" stroke="#7a5400" strokeWidth=".35" strokeLinejoin="round"/>
  <ellipse cx="16" cy="6.2" rx="8.6" ry="1.5" fill="url(#koi-gold)" stroke="#7a5400" strokeWidth=".6"/>
  <path d="M13.6 19.6h4.8l.9 2.6H12.7zM11.6 22.2h8.8l2.2 5H9.4z" fill="url(#koi-silver)" stroke="#55556a" strokeWidth=".5" strokeLinejoin="round"/>
  <rect x="8.2" y="27" width="15.6" height="2.4" rx=".8" fill="#1d5b43" stroke="#0b2c1f" strokeWidth=".5"/>
  <path d="M12.6 24.2h6.8" fill="none" stroke="#1c1c24" strokeWidth=".7" strokeLinecap="round"/>
</svg>;

export const GG_TROPHY_ICON = <svg viewBox="0 0 24 32" aria-hidden="true">
  <defs><linearGradient id="gg-silver" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#a9a9b4"/><stop offset=".35" stopColor="#f6f6f8"/><stop offset=".65" stopColor="#d6d6dd"/><stop offset="1" stopColor="#9c9ca8"/></linearGradient></defs>
  <path d="M3 3C5.5 12 9.6 15 10.2 19C10.6 23 8.4 26 7.5 28L16.5 28C15.6 26 13.4 23 13.8 19C14.4 15 18.5 12 21 3Z" fill="url(#gg-silver)" stroke="#55556a" strokeWidth=".7" strokeLinejoin="round"/>
  <path d="M6.2 4C8 11 10.4 15 10.8 20M17.8 4C16 11 13.6 15 13.2 20" fill="none" stroke="#f2b705" strokeWidth=".9" strokeLinecap="round"/>
  <ellipse cx="12" cy="3" rx="9" ry="1.8" fill="#f2b705" stroke="#7a5400" strokeWidth=".7"/>
  <path d="M9.4 8.2h5.2M9.4 10.2h5.2" fill="none" stroke="#1c1c24" strokeWidth="1.1" strokeLinecap="round"/>
  <rect x="6.8" y="27.2" width="10.4" height="2.2" rx=".7" fill="#f2b705" stroke="#7a5400" strokeWidth=".7"/>
</svg>;

/** El trofeo que corresponde a un título según su nombre. */
export const trophyIconFor = (name = '') => /grande\s+giocatore/i.test(name) ? GG_TROPHY_ICON : LEAGUE_TROPHY_ICON;
