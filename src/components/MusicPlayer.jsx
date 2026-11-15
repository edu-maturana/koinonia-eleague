import { useEffect, useId, useRef, useState } from 'react';
import { AudioControls } from '../audio/AudioControls.jsx';
import { useAudioSettings, setAudioSettings } from '../audio/settings.js';

// Nombres de juego largos abreviados para que quepan en la barra.
const shortArtist = artist => String(artist ?? '').replace('International Superstar Soccer Deluxe', 'ISS Deluxe').replace('International Superstar Soccer', 'ISS');

export function MusicPlayer({ tracks = [] }) {
  const audioRef = useRef(null);
  const rootRef = useRef(null);
  const resumeAfterTrackChangeRef = useRef(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const audioSettings = useAudioSettings();
  const volume = audioSettings.musicVolume;
  const setVolume = value => setAudioSettings({ musicVolume: value });
  const volumeId = useId();
  const panelId = useId();
  const track = tracks[trackIndex];

  const move = (direction, resumePlayback = false) => {
    if (!tracks.length) return;
    const audio = audioRef.current;
    if (resumePlayback || playing || (audio && !audio.paused)) resumeAfterTrackChangeRef.current = true;
    setTrackIndex(index => (index + direction + tracks.length) % tracks.length);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const resumePlayback = resumeAfterTrackChangeRef.current || playing || !audio.paused;
    resumeAfterTrackChangeRef.current = false;
    audio.load();
    if (resumePlayback) audio.play().catch(() => {});
  }, [track]);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.volume = volume; audioRef.current.muted = audioSettings.muted; }
  }, [volume, audioSettings.muted]);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const handleEnded = () => move(1, true);

  return <section className="radio" ref={rootRef} aria-label="Radio Koinonia League">
    <audio ref={audioRef} src={track?.src} preload="metadata" onEnded={handleEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}/>
    <button className={`radio-play ${playing ? 'playing' : ''}`} type="button" onClick={toggle} disabled={!tracks.length} aria-label={playing ? 'Pausar radio' : 'Reproducir radio'}>{playing ? '❚❚' : '▶'}</button>
    <button className="radio-info" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <small>{playing ? 'RADIO KOINONIA' : 'RADIO · TOCA PLAY'}</small>
      {/* Varios temas se llaman igual ("Main Menu"): sin el juego al lado parecía un texto de prueba. */}
      <b title={track ? `${track.title} · ${track.artist}` : undefined}>{track ? `${track.title} · ${shortArtist(track.artist)}` : 'PLAYLIST PENDIENTE'}</b>
    </button>
    {open && <div className="radio-panel" id={panelId}>
      <div className="radio-controls">
        <button type="button" onClick={() => move(-1)} disabled={!tracks.length} aria-label="Canción anterior">◀◀</button>
        <button className="radio-panel-play" type="button" onClick={toggle} disabled={!tracks.length}>{playing ? 'PAUSA' : 'PLAY'}</button>
        <button type="button" onClick={() => move(1)} disabled={!tracks.length} aria-label="Siguiente canción">▶▶</button>
      </div>
      <label className="radio-volume" htmlFor={volumeId}>VOLUMEN <output>{Math.round(volume * 100)}%</output>
        <input id={volumeId} type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))}/>
      </label>
      <AudioControls compact/>
      <div className="radio-playlist" role="listbox" aria-label="Seleccionar canción">
        {tracks.length ? tracks.map((item, index) => <button type="button" role="option" aria-selected={trackIndex === index} className={trackIndex === index ? 'active' : ''} key={`${item.src}-${index}`} onClick={() => setTrackIndex(index)}><span>{String(index + 1).padStart(2, '0')}</span><b>{item.title}</b><small>{item.artist}</small></button>) : <p>PLAYLIST PENDIENTE.</p>}
      </div>
    </div>}
  </section>;
}
