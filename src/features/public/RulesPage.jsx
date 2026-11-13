import { endpoints } from '../../api/endpoints.js';
import { useApiQuery } from './useApiQuery.js';
import { gpLabel } from '../../utils/money.js';

const MatchRules = () => <section className="rules-section">
  <h2>1. Configuración de Partidos y Jugabilidad</h2>
  <ul>
    <li><strong>Creación de la Sala (Localía):</strong> El jugador que figure como equipo local en el calendario tiene la responsabilidad de crear la sala de juego.</li>
    <li><strong>Formato de Liga:</strong> El partido debe configurarse en <strong>10 minutos</strong> y con la condición de los jugadores en <strong>“Excelente Estado”</strong> para ambos equipos.</li>
    <li><strong>Formato del torneo:</strong> fase regular todos contra todos a <strong>dos vueltas</strong>. Clasifican los <strong>6 primeros</strong> a los playoffs: el <strong>1.º y el 2.º pasan directo a semifinales</strong> y del <strong>3.º al 6.º juegan el play-in</strong>. En el play-in, 3.º vs 4.º (el ganador enfrenta al 2.º en semis) y 5.º vs 6.º (el perdedor queda eliminado); el perdedor del 3.º-4.º juega contra el ganador del 5.º-6.º, y quien gane enfrenta al 1.º en semis. <strong>Play-in, semifinales y final son a partido único</strong>; juega de local el mejor ubicado en la tabla. Si queda empatado, se define por penales.</li>
    <li><strong>Formato de Copa (Eliminatorias):</strong> En los encuentros de eliminación directa deben estar activadas obligatoriamente las opciones de <strong>Prórroga y Penales</strong>.</li>
    <li><strong>Interrupciones y Caídas del Servidor:</strong> Se deberá crear una nueva sala y jugar un partido de <strong>5 minutos</strong> para simular el tiempo restante. Alternativamente, ambos jugadores pueden acordar un partido normal de 10 minutos disputando únicamente un tiempo.</li>
  </ul>
</section>;

const Sanctions = () => <section className="rules-section">
  <h2>2. Régimen de Sanciones (W.O.)</h2>
  <ul>
    <li><strong>Abandono de Partido:</strong> Si un jugador se retira de la sala o deja el mando intencionalmente, perderá automáticamente por <strong>10 a 0</strong>.</li>
    <li><strong>Ausencia e Inactividad:</strong> Quien no se presente o no manifieste interés en coordinar dentro de <strong>3 días</strong>, perderá por W.O. con marcador de <strong>3 a 0</strong>.</li>
  </ul>
</section>;

const Divisions = () => <section className="rules-section">
  <h2>3. Sistema de Divisiones (Ascensos y Descensos)</h2>
  <p>El flujo entre divisiones se define al concluir la temporada:</p>
  <table className="rules-table"><thead><tr><th>Posición final</th><th>Resolución</th></tr></thead><tbody>
    <tr><td><strong>Último lugar</strong> de Primera División</td><td>Desciende automáticamente a Segunda División.</td></tr>
    <tr><td><strong>Primer lugar</strong> de Segunda División</td><td>Asciende automáticamente a Primera División.</td></tr>
    <tr><td><strong>Penúltimo de Primera</strong> vs. <strong>2.º de Segunda</strong></td><td>Juegan un partido de promoción. El ganador permanece o asciende a Primera División.</td></tr>
  </tbody></table>
</section>;

const Transfers = ({ squadValueLimit, payrollCap, contractsEnabled }) => <section className="rules-section">
  <h2>4. Mercado de Fichajes, Contratos y Traspasos</h2>
  <h3>4.1 Traspasos y Trueques</h3>
  <ul>
    <li>Todo se hace en el <strong>Mercado de la web</strong>: ofertas, contraofertas, trueques, encuestas y subastas.</li>
    <li>Un traspaso lo cierran <strong>los dos presidentes</strong>: el que compra ofrece y el que vende acepta, rechaza o contraoferta. El jugador no lo puede frenar. El precio va entre <strong>0,7× y 1,25×</strong> su valor de Transfermarkt.</li>
    <li>Se permiten los trueques de jugador por jugador y de jugador más dinero por otro jugador.</li>
    <li>Al llegar, el jugador firma un <strong>contrato nuevo</strong> con el club que lo recibe (sección 6.4). Su contrato anterior se termina: no viaja con él.</li>
  </ul>
  <h3>4.2 Liberar a un jugador</h3>
  <ul>
    <li>Liberar a un jugador es <strong>rescindir</strong> su contrato si está vigente (ver sección 6.3) o dejarlo ir gratis y sin castigo si ya venció. Rescindir resta reputación igual que una liberación: el castigo se diluye con los torneos, no hay castigo si el jugador cumplió 4 torneos o más en el club (solo se paga la indemnización), fichar y botar pesa ×1,5 y corta la racha sin liberar.</li>
    <li>Un despido baja el valor de mercado del jugador y la reputación del club.</li>
  </ul>
  <h3>4.3 Agentes libres: encuesta y subasta sellada</h3>
  <ul>
    <li>Para fichar un agente libre se abre una <strong>encuesta</strong>. Si junta las confirmaciones que pide el mercado y nadie pide subasta, el club lo compra a su valor.</li>
    <li>Si otro club pide subasta, un admin abre una <strong>subasta sellada</strong>: cada club ofrece en secreto entre 0,7× y 1,25× su valor. <strong>Elige el jugador</strong>, mirando la plata y cuánto le gusta cada club (minutos, compañeros, DT, historia, proyecto y fama del presidente), con una pizca de azar.</li>
  </ul>
  <h3>4.4 Fair Play Financiero</h3>
  <ul>
    <li>Hay dos topes: el <strong>valor total de la plantilla</strong> no puede pasar de <strong>{squadValueLimit === null ? 'el tope que define la liga' : gpLabel(squadValueLimit)}</strong>{contractsEnabled && <> y la <strong>nómina</strong> (la suma de los sueldos anuales) no puede pasar de <strong>{payrollCap === null ? 'el tope que define la liga' : `${gpLabel(payrollCap)} al año`}</strong></>}.</li>
    <li>Durante el mercado puedes pasarte mientras ordenas tu plantel; lo único que frena una compra es el saldo. Pero <strong>un club pasado de cualquiera de los topes no puede iniciar partidos</strong> hasta vender, liberar o trocar y quedar dentro.</li>
    <li>El valor de mercado de cada jugador parte de su valor de Transfermarkt y se mueve entre <strong>0,7× y 1,25×</strong> de ese valor: un traspaso o una subasta lo deja valiendo lo que se pagó, un despido lo baja 0,15× (nunca bajo 0,7×), y los trueques y los contratos que vencen no lo cambian. La referencia es siempre Transfermarkt, así que nunca baja de 0,7× por muchas ventas que tenga.</li>
  </ul>
</section>;

const Prizes = () => <>
  <section className="rules-section">
    <h2>5. Sistema de Premios</h2>
    <h3>Tabla de la liga</h3>
    <ul><li><strong>1.º:</strong> 150 M GP</li><li><strong>Desde el 2.º:</strong> 10 M GP menos por cada puesto (2.º 140 M, 3.º 130 M, 4.º 120 M, y así hasta el 10.º, que recibe 60 M).</li></ul>
    <h3>Playoffs</h3>
    <ul>
      <li><strong>Campeón:</strong> 40 M GP.</li>
      <li><strong>Subcampeón:</strong> 20 M GP.</li>
      <li><strong>Semifinalista:</strong> 10 M GP.</li>
      <li><strong>Cuartofinalista:</strong> 5 M GP.</li>
    </ul>
    <p>Los premios de los playoffs se suman a los de la tabla.</p>
  </section>
</>;

const Contracts = ({ payrollCap }) => <section className="rules-section">
  <h2>6. Contratos y Nómina (desde el torneo v11)</h2>
  <h3>6.1 Duración</h3>
  <ul>
    <li>Todo contrato inicial o renovación dura <strong>2, 4 o 6 torneos</strong>, según lo defina el Presidente al firmar. Una temporada es un torneo de liga terminado.</li>
    <li>Un mánager puede renovar a un jugador las veces que quiera. Puedes cambiar los años de un contrato mientras no se haya cobrado su primera temporada.</li>
  </ul>
  <h3>6.2 Sueldo y cobro</h3>
  <ul>
    <li>El sueldo anual es el <strong>10% del valor de mercado</strong> del jugador al firmar y queda congelado durante todo el contrato. No se paga por adelantado: se cobra al terminar cada torneo de liga, mientras el jugador siga en el club.</li>
    <li><strong>Ningún jugador puede cobrar más del 20% de su valor de mercado</strong> (se mide al firmar o renovar). Si su valor baja y el tope ya no alcanza ni para igualar su sueldo, no se puede renovar.</li>
    <li>Al renovar, el sueldo sube entre <strong>1% y 100%</strong>. El jugador pide como mínimo su sueldo actual o el 10% de su valor de hoy, el que sea mayor; si no le ofreces eso, rechaza.</li>
    <li>La nómina del club es la suma de los sueldos de su plantilla y {payrollCap === null ? 'tiene un tope que define la liga' : `no puede pasar de ${gpLabel(payrollCap)} al año`}. No bloquea operaciones durante el mercado, pero un club pasado del tope no puede iniciar partidos.</li>
  </ul>
  <h3>6.3 Término, renovación, rescisión y salidas</h3>
  <ul>
    <li>Cuando el contrato cumple todas sus temporadas queda <strong>vencido</strong>, pero el jugador sigue en el club. Se renueva en el <strong>período de renovaciones</strong> del mercado siguiente (sección 11), negociando hasta 3 propuestas: el jugador firma, contraoferta o se niega.</li>
    <li>Si no se renueva, queda libre <strong>sin castigo ni costo</strong> cuando el mercado pasa a <strong>transacciones</strong>, y se puede fichar en ese mismo mercado (también por su club anterior).</li>
    <li>No se puede soltar a un jugador antes de que termine su contrato sin consecuencias: rescindir cuesta una <strong>indemnización del 50% de las temporadas que faltan</strong>, sin reembolso, y el presidente sufre un castigo de reputación.</li>
  </ul>
  <h3>6.4 Contrato de llegada (traspaso, trueque o agente libre)</h3>
  <ul>
    <li>Cuando un jugador llega por traspaso, trueque o como agente libre (encuesta o subasta), firma un contrato <strong>nuevo</strong> con el club que lo recibe; si venía de otro club, el anterior se termina. Escribe al llegar con lo que pide: sueldo, mantener sus primas, su dorsal si otro lo usa, y la cinta de capitán solo si tiene recorrido (veterano o figura con carácter de líder) y sería de los tres más valiosos del plantel.</li>
    <li>Lo que pide toma como referencia lo que ganaba en su club anterior y nunca baja de eso, sin ser muy exigente. El sueldo va entre el 10% y el 20% de su valor. Las primas que tenía no se heredan: son solo una referencia.</li>
    <li>El presidente del club que lo recibe decide qué le da (en Nómina). Con menos de lo que pide <strong>llega igual, pero molesto</strong> (como mucho −15 de ánimo); con lo que pide, llega conforme. Si nadie firma antes de que cierre el mercado, queda firmado con lo que pidió.</li>
  </ul>
  <h3>6.5 Reputación</h3>
  <p>Con el sistema de contratos la reputación de todos los clubes parte de cero. Los títulos y finales (palmarés) se mantienen intactos.</p>
</section>;

const ClubSystems = () => <>
  <section className="rules-section">
    <h2>7. Roles, Ánimo y Peticiones de Jugadores</h2>
    <ul>
      <li>El Presidente asigna a cada jugador un rol: <strong>crucial, importante, rotación o esporádico</strong>. El rol <strong>solo cambia a mano</strong>: mandar a alguien a la banca en la alineación no se lo cambia. Al llegar a un club recibe uno según lo que vale en ese plantel. Los roles solo se cambian con el <strong>mercado cerrado</strong>.</li>
      <li>El ánimo del jugador (de 5 a 100) sale de su rol comparado con el que cree merecer (cada escalón se nota), su sueldo frente a su valor, la forma del equipo en los últimos 5 partidos (los de playoffs pesan el doble), cómo le fue al club en los últimos playoffs (pasar de ronda anima, quedar fuera baja), la reputación del club, los títulos, las promesas cumplidas y su personalidad. Con el ánimo bajo 25 no se sienta a negociar su renovación.</li>
      <li>Cuando un jugador no está conforme (con su rol o con su sueldo) le escribe al Presidente y abre una <strong>petición</strong>. Se responde desde la Bandeja (o por Discord) prometiéndole el rol, <strong>prometiéndole minutos en el próximo partido</strong>, pidiéndole paciencia o ignorándolo. Ninguna respuesta cuesta plata. Solo se puede responder con el <strong>mercado cerrado</strong>.</li>
      <li><strong>Promesa de minutos:</strong> lo que se le puede prometer depende de lo que vale (un suplente no pide ser titular): el partido completo a quien espera ser crucial o importante, medio partido al de rotación y 15 a 25 minutos al esporádico. La promesa vale para el <strong>próximo partido que inicie su club</strong>, sea cual sea. La ficha del partido la recuerda al iniciar y, al terminar, quien maneja la ficha responde si se cumplió. Cumplir suma ánimo; no cumplir resta el doble. Sin respuesta, a las 24 horas se da por cumplida.</li>
      <li>Si la petición se ignora o no se responde a tiempo, el jugador <strong>pide salir</strong>: ya no se le puede renovar. Sale libre al pasar a transacciones (no se vende: su club no cobra) y solo se puede canjear (con o sin plata de por medio).</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>8. Primas</h2>
    <ul>
      <li>Cada jugador puede tener tres primas, que paga el club: por <strong>gol</strong> (hasta el 1% de su valor por gol), por <strong>clasificar a playoffs</strong> (hasta el 5%, a los jugadores de los clubes clasificados) y por <strong>título</strong> (hasta el 10%, al campeón de playoffs).</li>
      <li>Las primas se fijan solo con el <strong>mercado abierto</strong>. Se pagan al cerrar la temporada (goles), al comenzar los playoffs (clasificación) y al coronarse el campeón (título).</li>
      <li>La prima por gol cuenta para el tope del 20% del valor: se suman los goles que se esperan de su posición. Al renovar las primas se mantienen (recortadas si ya no caben con el nuevo sueldo); si el jugador cambia de club llega sin primas.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>9. Directiva y Objetivos</h2>
    <ul>
      <li>Al comenzar cada torneo de liga la directiva le fija a cada club una meta de <strong>tabla</strong> y una de <strong>playoffs</strong>, según lo que se espera de él por sus resultados recientes y su historia (no por el valor del plantel):
        <ul>
          <li><strong>Candidato al título:</strong> terminar entre los 2 primeros (15 M GP) y llegar a la final de los playoffs (30 M GP).</li>
          <li><strong>Alto:</strong> terminar entre los 4 primeros (10 M GP) y llegar al menos a semifinales (20 M GP).</li>
          <li><strong>Medio:</strong> terminar entre los 6 primeros (5 M GP) y clasificar a playoffs (10 M GP).</li>
          <li><strong>Bajo:</strong> clasificar a playoffs (5 M GP). Un club recién llegado a la liga parte siempre acá.</li>
        </ul>
      </li>
      <li><strong>Salir campeón no se le exige a nadie:</strong> el que lo logra cobra un bono de 10 M GP, tenga la meta que tenga. Superar la meta de tabla por dos puestos o más paga 5 M GP por cada puesto de más.</li>
      <li>Se evalúan al terminar el torneo. Cada objetivo cumplido da su premio en GP y sube el ánimo de la plantilla (+5); uno fallado baja el ánimo (−5), sin multa.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>10. Estadios</h2>
    <ul>
      <li>La liga tiene un catálogo de estadios, reales y ficticios, ordenados en categorías <strong>S, A, B, C y D</strong> (de mayor a menor), cada uno con su capacidad y su precio en GP. Se ven todos en <strong>Equipos › Estadios</strong>, con su foto (la sube el club dueño o la administración).</li>
      <li>Cada estadio tiene un solo dueño y cada club puede tener uno. Comprarlo descuenta su precio del saldo; cambiar a otro reembolsa el actual a su precio de catálogo y se paga solo la diferencia; venderlo devuelve su precio de catálogo.</li>
      <li>El aforo es el techo de la taquilla: un club sin estadio del catálogo juega en su cancha propia, de <strong>12.000 personas</strong>. Un estadio más grande deja entrar a más gente en cada partido de local, recibe conciertos más grandes y es requisito para La Velada.</li>
      <li><strong>Mantención del estadio:</strong> al cerrar cada torneo de liga, el club con estadio del catálogo paga su mantención según la categoría: <strong>S 8 M · A 5 M · B 3 M · C 2 M · D 1 M GP</strong>. La cancha propia no paga.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>11. Ventanas del Mercado</h2>
    <ul>
      <li>El mercado puede tener <strong>dos etapas</strong>. Al abrirlo, un admin decide si empieza con el <strong>período de renovaciones</strong>: ahí se renuevan contratos vencidos y se pueden cerrar <strong>preacuerdos</strong>: traspasos y trueques que quedan acordados e innegables (la plata se mueve al aceptar, y los jugadores no se pueden renovar ni mover) y se ejecutan cuando el admin pasa a <strong>transacciones</strong> o, si hay un torneo en curso, cuando termina. Las encuestas por agentes libres ya se pueden abrir y votar en renovaciones, pero la compra se confirma recién al pasar a transacciones. En ese momento los vencidos que nadie renovó quedan libres y se abren fichajes y subastas. El jugador que se <strong>negó a renovar</strong>, está tan molesto que no quiere renovar (ánimo bajo 35) o <strong>pidió salir</strong> no se vende: solo se canjea, con o sin plata de por medio; si nadie lo canjea, queda libre como los demás y se va sin compensación. Si el mercado abre sin renovaciones, los vencidos quedan libres al abrir.</li>
      <li>Si el mercado cierra sin haber pasado a transacciones, los vencidos sin renovar quedan libres al cierre, para el mercado siguiente.</li>
      <li>Con el mercado <strong>abierto</strong>: contratos, renovaciones, negociaciones, contraofertas y primas.</li>
      <li>Con el mercado <strong>cerrado</strong>: roles y respuestas a las peticiones de los jugadores, para que nadie los use para manipular las transacciones.</li>
      <li>Rescindir un contrato se puede en cualquier momento.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>12. Charla con un jugador de otro club</h2>
    <ul>
      <li>Antes de ofertar se puede hablar con un jugador de otro club (o con un libre). Su representante lo presenta y el jugador pregunta por lo que más le preocupa de tu club; respondes con datos reales.</li>
      <li>La charla no decide el traspaso (lo cierran los presidentes), pero si lo convences <strong>llega con más ganas</strong> y si le mientes llega con dudas. Las promesas de vender a alguien o de quedarse con un compañero obligan si el jugador llega.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>13. Clásicos, Superclásicos y Derbis</h2>
    <ul>
      <li><strong>Clásico:</strong> cada Presidente <strong>elige</strong> su clásico y lo cambia cuando quiera (la web sugiere el de más historial: partidos, eliminatorias, finales, goleadas y traspasos entre ambos). Vale desde los dos lados: si te eligen, ese partido también es clásico para ti; si se eligen los dos, es clásico de los dos. En un clásico la demanda de entradas sube 60% y ganar o perder mueve el doble de hinchas y ánimo.</li>
      <li><strong>El Superclásico:</strong> uno solo en toda la liga, el que define la administración (hoy, Laloo Kura vs Real Potente). La demanda sube 90%, el estadio casi se llena y la noticia del partido sale con su etiqueta. Dos clubes que se tienen de clásico mutuamente siguen siendo un clásico.</li>
      <li><strong>Derbis:</strong> las rivalidades de vecinos. El Presidente elige <strong>hasta 3</strong> (se sugieren los clubes de su país y los que tienen la hinchada cerca) y los cambia cuando quiera. En un derbi viaja el triple de hinchada visitante, el estadio llena al menos el 85% y <strong>la visita se lleva el 20% de la taquilla</strong>. Un partido puede ser clásico y derbi a la vez.</li>
      <li><strong>Nombre de la rivalidad:</strong> cualquiera de los dos presis propone un nombre ("El Clásico del Sur") y el otro lo acepta o lo rechaza. Aceptado, sale en los partidos y en las noticias.</li>
      <li>En las tarjetas de partido cada rivalidad tiene su color (rojo el clásico, dorado el superclásico, azul el derbi) y muestra la racha cuando alguien lleva 3 o más partidos sin perder o sin ganar ante el otro (con el apodo del club, si tiene).</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>14. Hinchada y Taquilla</h2>
    <ul>
      <li>Cada club tiene <strong>hinchas</strong>: personas que se declaran hinchas del club (no seguidores de redes). Cuántos tiene depende de su grandeza (historial de títulos, finales y playoffs, y valor del plantel). Una parte vive en Chile, que se reparten entre todos los clubes, y el resto en el país del club. En la ficha del club hay un mapa con dónde viven. Desde ahí crecen o bajan con resultados, clásicos, títulos y eventos. También hay un <strong>ánimo de la hinchada</strong> que cambia partido a partido.</li>
      <li>Al terminar cada partido de clubes, el local cobra las entradas: la asistencia depende de sus hinchas que viven cerca (los de su país y unos pocos de afuera que viajan), el rival, si es clásico o playoffs, el ánimo de la gente y el precio que fijó el Presidente (popular 35 €, normal 60 €, premium 95 €). El aforo es el techo. Los partidos importantes tienen piso: unos <strong>cuartos de final llenan el 90%</strong>, una <strong>semifinal casi se llena</strong> (95% o más) y <strong>una final se llena</strong>; en la liga, un clásico, la visita de un grande o un partido decisivo del tramo final (dos de arriba de la tabla) llenan casi todo el estadio aunque el local tenga poca hinchada. La final a partido único se juega en el estadio más grande de los dos y la taquilla se reparte mitad y mitad.</li>
      <li>La taquilla cobra <strong>desde el v11</strong>. En el v10 se registra el público y los hinchas se mueven con los resultados, pero sin plata (lo que se alcanzó a cobrar se devolvió).</li>
      <li>Un castigo (W.O.) se juega a puertas cerradas: no hay taquilla. Si un partido se reabre o se anula, la taquilla y los hinchas se devuelven.</li>
      <li><strong>El marcador no cambia</strong>: la hinchada y el estadio mueven plata, hinchas y ánimo, nunca el resultado del partido.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>15. Conciertos, La Velada y derechos de TV</h2>
    <ul>
      <li><strong>Conciertos:</strong> el Presidente contrata a un artista de la cartelera, le paga por adelantado lo que cobra por tocar y el show se hace en su próxima fecha de local. Al club le quedan 60 € por persona. Cada artista pide un aforo mínimo. La convocatoria tiene azar: un estadio lleno deja ganancia e hinchas y un show flojo puede dar pérdida. Máximo dos por temporada; cancelar devuelve la mitad de lo pagado. <strong>Cada artista está con un solo club a la vez</strong>: mientras está agendado nadie más lo puede contratar, y apenas toca queda libre para cualquiera (si el show se cancela, también). La cartelera es solo de <strong>música cristiana</strong>: Michael W. Smith, Marcos Witt, Steven Curtis Chapman, Phil Wickham, Tauren Wells, Marcos Barrientos, Redimi2, Marcos Vidal, Alex Zurdo, Juan Carlos Alvarado, Funky, Majo y Dan, Eli Soares, ResQ Band y Jah Love. La mayoría cabe en una cancha de 12.000 personas.</li>
      <li><strong>La Velada del Año:</strong> una vez por temporada Ibai busca estadio para su evento de boxeo (la búsqueda la abre la administración y a cada club le llega un aviso). Funciona como una subasta a sobre cerrado: cada club que quiere el evento le ofrece plata a Ibai, y nadie ve lo que ofrecen los demás. Solo pueden ofrecer los clubes con un estadio de 50.000 personas o más y 100 millones de hinchas. Al cierre, Ibai elige uno mirando la plata (50%), el tamaño del estadio (30%) y los hinchas (20%). El elegido paga lo que ofreció y cobra las entradas a estadio lleno (80 € cada una) más 3 M de transmisión; los demás no pagan nada.</li>
      <li><strong>Derechos de TV:</strong> cada temporada tres canales (TNT Sports, ESPN, DSports, DAZN, Prime Video y otros) ofrecen transmitir los partidos del club: fija (2 torneos), mixta (4 torneos) o arriesgada (6 torneos), para que calcen con las ventanas de mercado. Cada canal paga según su tamaño y los hinchas del club en todo el mundo; los gigantes (Prime Video, DAZN, ESPN) pagan más pero solo llaman a clubes con mucha hinchada, y la TV abierta paga menos y le transmite a cualquiera. Se cobran al cerrar cada torneo de liga, con bonos por playoffs y por título según la oferta. Todos los contratos, los ya firmados y los que vengan, cuentan <strong>desde el v11</strong>: el v10 no paga ni gasta temporadas. Cuando un contrato termina, llegan tres ofertas nuevas, calculadas con los hinchas, los resultados, la historia y el estadio del club en ese momento. No van en la camiseta, porque en el juego se usan camisetas reales con su propia marca.</li>
    </ul>
  </section>
  <section className="rules-section">
    <h2>16. Quiebra</h2>
    <ul>
      <li>Al arrancar cada torneo de liga (con los premios del anterior ya pagados) se revisa la caja de cada club.</li>
      <li><strong>En rojo:</strong> la directiva avisa. Con la caja negativa no se puede comprar (fichajes, pujas ni estadio) y la quiebra baja la reputación del presidente igual que una promesa rota.</li>
      <li><strong>Dos arranques seguidos en rojo:</strong> intervención. La directiva vende a los jugadores más caros del club (al 75% de su valor, quedan como agentes libres) hasta que la caja vuelva a positivo.</li>
      <li>Solo se puede tener un contrato de TV a la vez: el siguiente se firma cuando termina el vigente.</li>
    </ul>
  </section>
</>;

// Grabaciones de estadio usadas en la ficha de partido (Freesound y Wikimedia Commons; recortadas y normalizadas).
const SOUND_CREDITS = [
  ['Gol', 'Football-crowd-GOAL (Brentford FC, Griffin Park)', 'paulw2k', 'CC BY 4.0', 'https://freesound.org/s/196461/'],
  ['Gol (grito)', 'Crowd screaming GOAL, Mexico-Holland (Mundial 2014)', 'felix.blume', 'CC0', 'https://freesound.org/s/241630/'],
  ['Festejo de la visita', "Southampton vs Hull at Saint Mary's Stadium", 'Quistard', 'CC BY 3.0', 'https://freesound.org/s/237681/'],
  ['Pifias', 'Football stadium fans are not happy with the referee (Aris FC)', 'avakas', 'CC BY 4.0', 'https://freesound.org/s/263680/'],
  ['Canto', "West Ham: I'm Forever Blowing Bubbles", 'zedkah', 'CC0', 'https://freesound.org/s/133833/'],
  ['Aliento', 'EURO2024 - Football UK England Fans singing crowd', 'imagefilm.berlin', 'CC BY 4.0', 'https://freesound.org/s/746441/'],
  ['Aliento', 'Colombian Soccer Stadium Crowd', 'USBMED_Ambiences_Sound_Library', 'CC BY 4.0', 'https://freesound.org/s/638367/'],
  ['Aliento', 'Milan Derby (Milan vs Inter) at San Siro Stadium', 'neilraouf', 'CC0', 'https://freesound.org/s/424354/'],
  ['Aliento', 'Football match chanting crowd (Wimbledon)', 'Dan_AudioFile', 'CC BY 4.0', 'https://freesound.org/s/654084/'],
  ['Murmullo (cuando el local pierde por goleada)', 'Old Trafford', 'BeeProductive', 'CC0', 'https://freesound.org/s/430020/'],
  ['Silbato', 'Referee whistle blow (gymnasium)', 'SpliceSound', 'CC0', 'https://commons.wikimedia.org/wiki/File:218318_splicesound_referee-whistle-blow-gymnasium.wav'],
  ['Aplausos', 'Applause I', 'thore', 'Dominio público', 'https://commons.wikimedia.org/wiki/File:Applause_i.ogg'],
];

const SoundCredits = () => <section className="rules-section">
  <h2>Créditos de sonido</h2>
  <ul>{SOUND_CREDITS.map(([use, title, author, license, file]) => <li key={file}><strong>{use}:</strong> <a href={file} target="_blank" rel="noreferrer">{title}</a>, de {author} ({license}).</li>)}</ul>
</section>;

export function RulesPage() {
  const rules = useApiQuery(signal => endpoints.leagueRules(signal), []);
  const squadValueLimit = Number(rules.data?.squadValueLimit) > 0 ? Number(rules.data.squadValueLimit) : null;
  const payrollCap = Number(rules.data?.payrollCap) > 0 ? Number(rules.data.payrollCap) : null;
  const contractsEnabled = Boolean(rules.data?.contractsEnabled);
  return <main className="newspaper"><article className="data-paper rules-paper">
    <header className="rules-header"><p>KOINONIA e-LEAGUE · DOCUMENTO OFICIAL</p><h1>Reglamento Oficial de la Liga eFootball</h1></header>
    <p className="rules-intro">Este documento establece la normativa oficial para el desarrollo de la liga, incluyendo reglas de jugabilidad, sanciones, sistema de divisiones, mercado de fichajes y sistema de premiación. Todos los presidentes y participantes están obligados a cumplir estas normativas.</p>
    <MatchRules/><Sanctions/><Divisions/><Transfers squadValueLimit={squadValueLimit} payrollCap={payrollCap} contractsEnabled={contractsEnabled}/><Prizes/><Contracts payrollCap={payrollCap}/>{contractsEnabled && <ClubSystems/>}<SoundCredits/>
  </article></main>;
}
