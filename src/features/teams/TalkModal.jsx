import { Modal } from '../../ui/index.js';
import { TransferChat } from '../public/market/TransferChat.jsx';

/** Conversación con un jugador (de otro club o libre) en una ventana: se abre desde su ficha o desde Mensajes. */
export function TalkModal({ player, teamId, onClose, onChanged }) {
  return <Modal title={`Hablar con ${player.name}`} onClose={onClose} wide className="ui-modal--chat">
    <p className="talk-help">Te va a preguntar lo que le preocupa de tu club. Responde con la verdad: lo que logres convencerlo cuenta cuando le hagas una oferta, aunque el mercado esté cerrado.</p>
    <TransferChat player={player} teamId={teamId} onChanged={onChanged}/>
  </Modal>;
}
