import { useMediaQuery } from '../app/useMediaQuery.js';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';
import { AccountMenu } from './AccountMenu.jsx';
import { ApiStatus } from './ApiStatus.jsx';
import { GlobalSearch } from './GlobalSearch.jsx';
import { MusicPlayer } from './MusicPlayer.jsx';
import { Navigation } from './Navigation.jsx';
import { TransparentLogo } from './TransparentLogo.jsx';
import { UpdateNotice } from './UpdateNotice.jsx';

export function SiteLayout({ route, navigate, children, sidebar, error, dismissError, playlist = [], teams = [] }) {
  // La radio no se monta en mobile (mismo corte que el resto del diseño responsive).
  const mobile = useMediaQuery('(max-width: 900px)');
  return <div className="site">
    <header className="site-header">
      <div className="site-header-inner">
        <button className="brand" onClick={() => navigate('/')} aria-label="Koinonia e-League, ir al inicio">
          <TransparentLogo className="brand-logo" src="/koinonia-eleague-logo.png" label="Koinonia e-League"/>
        </button>
        <Navigation route={route} navigate={navigate}/>
        <GlobalSearch navigate={navigate} teams={teams}/>
        {!mobile && <MusicPlayer tracks={playlist}/>}
        <div className="header-tools"><NotificationBell navigate={navigate}/><AccountMenu navigate={navigate} teams={teams}/></div>
      </div>
    </header>
    <div className={`site-body ${sidebar ? 'with-sidebar' : ''} ${route.name === 'home' ? 'home-body' : ''}`}>
      <div className="site-content">{children}</div>
      {sidebar}
    </div>
    <footer className="site-footer"><span className="site-slogan">KOINONIA e-LEAGUE · FÚTBOL VIRTUAL. PASIÓN REAL.</span><nav className="site-footer-links" aria-label="Más"><a href="#/noticias">NOTICIAS</a><a href="#/reglas">REGLAMENTO</a></nav><ApiStatus/></footer>
    <UpdateNotice/>
    {error && <div className="preview-notice" role="status">{error}<button onClick={dismissError} aria-label="Cerrar aviso">×</button></div>}
  </div>;
}
