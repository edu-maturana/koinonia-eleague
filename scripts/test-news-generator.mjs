import assert from 'node:assert/strict';
import { newsTemplates } from '../src/features/news/newsTemplates.js';
import { classifyMatchResult, generateNews } from '../src/features/news/newsEngine.js';
import { generateMatchNews, generateSanctionNews, generateTransferNews } from '../src/utils/newsGenerator.js';
import { buildMatchStoryAngle, buildMatchStorySuffix, getMatchStoryFacts } from '../src/features/news/newsStoryAngles.js';

const expectedStructure = {
  victory: ['narrow', 'normal', 'big'],
  defeat: ['narrow', 'normal', 'big'],
  draw: ['goalless', 'normal', 'crazy'],
  transfer: ['arrival', 'departure', 'move'],
  sanction: ['player', 'club'],
};

let templateCount = 0;
for (const [type, subtypes] of Object.entries(expectedStructure)) {
  assert.deepEqual(Object.keys(newsTemplates[type]), subtypes, `Subcategorías incorrectas en ${type}`);
  for (const subtype of subtypes) {
    const group = newsTemplates[type][subtype];
    for (const field of ['labels', 'headlines', 'bodies']) {
      assert.equal(group[field].length, 10, `${type}.${subtype}.${field} debe contener exactamente 10 plantillas`);
      templateCount += group[field].length;
    }
  }
}
assert.equal(templateCount, 420);

const matchCases = [
  [{ golesEquipo: 4, golesRival: 2 }, { type: 'victory', subtype: 'normal' }],
  [{ golesEquipo: 2, golesRival: 1 }, { type: 'victory', subtype: 'narrow' }],
  [{ golesEquipo: 5, golesRival: 1 }, { type: 'victory', subtype: 'big' }],
  [{ golesEquipo: 1, golesRival: 3 }, { type: 'defeat', subtype: 'normal' }],
  [{ golesEquipo: 1, golesRival: 2 }, { type: 'defeat', subtype: 'narrow' }],
  [{ golesEquipo: 0, golesRival: 4 }, { type: 'defeat', subtype: 'big' }],
  [{ golesEquipo: 0, golesRival: 0 }, { type: 'draw', subtype: 'goalless' }],
  [{ golesEquipo: 2, golesRival: 2 }, { type: 'draw', subtype: 'normal' }],
  [{ golesEquipo: 4, golesRival: 4 }, { type: 'draw', subtype: 'crazy' }],
];

for (const [scores, expected] of matchCases) {
  assert.deepEqual(classifyMatchResult(scores), expected);
  const event = {
    id: `match-${scores.golesEquipo}-${scores.golesRival}`,
    kind: 'match',
    equipo: 'Forestyle FC',
    rival: 'Bombo FC',
    resultado: `${scores.golesEquipo}-${scores.golesRival}`,
    jornada: 'la Jornada 4',
    competicion: 'Liga 2026',
    ...scores,
  };
  const first = generateNews(event);
  const second = generateNews(structuredClone(event));
  assert.deepEqual(first, second, `${expected.type}.${expected.subtype} debe ser determinista`);
  assert.equal(first.type, expected.type);
  assert.equal(first.subtype, expected.subtype);
  assert.deepEqual(Object.keys(first), ['id', 'type', 'subtype', 'label', 'headline', 'body', 'image']);
  assert.equal(first.image.id.startsWith(`${expected.type}-${expected.subtype}-`), true);
}

const transferBase = {
  id: 184,
  type: 'transfer',
  jugador: 'Juan Pérez',
  equipoOrigen: 'Bombo FC',
  equipoDestino: 'Forestyle FC',
  competicion: 'Koinonia e-League',
};
for (const subtype of ['arrival', 'departure', 'move']) {
  const news = generateNews({ ...transferBase, subtype });
  assert.equal(news.type, 'transfer');
  assert.equal(news.subtype, subtype);
  assert.match(`${news.headline} ${news.body}`, /Juan Pérez/);
}

const playerSanction = generateNews({
  id: 'player-sanction', type: 'sanction', subtype: 'player', jugador: 'Jugador Uno', equipo: 'Club A',
  partidosSancion: 2, tipoSancion: 'suspensión', competicion: 'Liga 2026',
});
assert.equal(playerSanction.subtype, 'player');
assert.match(`${playerSanction.headline} ${playerSanction.body}`, /Jugador Uno/);

const clubSanction = generateNews({
  id: 'club-sanction', type: 'sanction', subtype: 'club', equipo: 'Club B', tipoSancion: 'amonestación',
});
assert.equal(clubSanction.subtype, 'club');
assert.match(`${clubSanction.headline} ${clubSanction.body}`, /Club B/);

const sanctionWithoutMatches = generateNews({
  id: 'without-match-count', type: 'sanction', subtype: 'player', jugador: 'Jugador Dos', equipo: 'Club C',
});
assert.ok(sanctionWithoutMatches);
assert.doesNotMatch(JSON.stringify(sanctionWithoutMatches), /undefined|\{\w+\}/);

const stringIdEvent = {
  id: 'uuid-37ba206b-16ad-44ea', kind: 'match', equipo: 'Club A', rival: 'Club B', resultado: '2-1',
  golesEquipo: 2, golesRival: 1,
};
assert.deepEqual(generateNews(stringIdEvent), generateNews(structuredClone(stringIdEvent)));

const apiMatch = generateMatchNews({
  id: 'api-match', homeTeam: { name: 'Club A' }, awayTeam: { name: 'Club B' }, homeScore: 4, awayScore: 2,
  tournament: { name: 'Liga 2026' }, roundNumber: 3, finishedAt: '2026-09-08T10:00:00Z',
  goals: [
    { player: { name: 'Juan Pérez' }, scoringTeam: { name: 'Club A' } },
    { player: { name: 'Juan Pérez' }, scoringTeam: { name: 'Club A' } },
    { player: { name: 'Diego Soto' }, scoringTeam: { name: 'Club A' } },
    { player: { name: 'Carlos Díaz' }, scoringTeam: { name: 'Club B' } },
  ],
  redCards: [{ playerName: 'Luis Gómez', teamName: 'Club B' }],
});
assert.equal(apiMatch.id, 'match-api-match');
assert.equal(apiMatch.type, 'victory');
assert.equal(apiMatch.subtype, 'normal');
assert.equal(apiMatch.sourceType, 'match');
assert.doesNotMatch(apiMatch.body, /Goleadores:|Expulsados:/);
assert.ok(apiMatch.body2);
assert.ok(apiMatch.storyAngle);

const storyFacts = getMatchStoryFacts({
  goals: [{ playerName: 'Sin Equipo', teamName: 'Club A', isOwnGoal: true }],
  redCards: [{ player: { name: 'Jugador Rojo' }, team: { name: 'Club B' } }],
});
assert.equal(storyFacts.scorerCount, 1);
assert.equal(storyFacts.redCardCount, 1);
assert.equal(buildMatchStorySuffix({
  goals: [{ playerName: 'Jugador', teamName: 'Club A' }],
  redCards: [{ playerName: 'Expulsado', teamName: 'Club B' }],
}), 'Goleadores: Club A: Jugador. Expulsados: Expulsado (Club B).');
const streakAngleMatch = {
  id: 'streak-match', homeTeam: { id: 'a', name: 'Club A' }, awayTeam: { id: 'b', name: 'Club B' },
  homeScore: 2, awayScore: 1, finishedAt: '2026-09-10T10:00:00Z',
};
const streakContext = { matches: [
  { id: 'previous-1', homeTeam: { id: 'a' }, awayTeam: { id: 'b' }, homeScore: 2, awayScore: 0, finishedAt: '2026-09-09T10:00:00Z' },
  { id: 'previous-2', homeTeam: { id: 'b' }, awayTeam: { id: 'a' }, homeScore: 0, awayScore: 1, finishedAt: '2026-09-08T10:00:00Z' },
] };
const selectedStreakAngle = buildMatchStoryAngle(streakAngleMatch, streakContext);
assert.ok(['streak', 'tournament', 'moment', 'rivalry', 'result'].includes(selectedStreakAngle.key));
assert.deepEqual(selectedStreakAngle, buildMatchStoryAngle(streakAngleMatch, streakContext));

for (const subtype of ['arrival', 'departure', 'move']) {
  const transfer = generateTransferNews({
    id: `transfer-${subtype}`, player: { name: 'Jugador Tres' }, fromTeam: { name: 'Club A' },
    toTeam: { name: 'Club B' }, createdAt: '2026-09-08T10:00:00Z',
  }, subtype);
  assert.equal(transfer.subtype, subtype);
}

const adaptedPlayerSanction = generateSanctionNews({
  id: 'sanction-player', player: { name: 'Jugador Cuatro' }, team: { name: 'Club C' }, suspensionMatches: 2,
});
assert.equal(adaptedPlayerSanction.subtype, 'player');

const adaptedClubSanction = generateSanctionNews({ id: 'sanction-club', team: { name: 'Club D' }, type: 'club_warning' });
assert.equal(adaptedClubSanction.subtype, 'club');

assert.equal(generateMatchNews({ id: 'pending', homeTeam: { name: 'A' }, awayTeam: { name: 'B' } }), null);
assert.equal(generateTransferNews({ id: 'incomplete' }), null);
assert.equal(generateSanctionNews({ id: 'incomplete' }), null);

console.log(`Generador verificado: 14 subcategorías, ${templateCount} plantillas y selección determinista.`);

// Contracciones con apodos ("a el" → "al", "de el" → "del"), sin tocar nombres propios.
{
  const { contract, withPreposition } = await import('../src/utils/spanish.js');
  const { fillTemplate } = await import('../src/features/news/newsEngine.js');
  assert.equal(fillTemplate('{equipo} no le gana a {rival}', { equipo: 'Los Poruños', rival: 'el Lado Oscuro' }), 'Los Poruños no le gana al Lado Oscuro');
  assert.equal(fillTemplate('TRIUNFO DE {equipo}', { equipo: 'EL LUCARIO' }), 'TRIUNFO DEL LUCARIO');
  assert.equal(contract('Llegó desde El Tanque FC'), 'Llegó desde El Tanque FC');
  assert.equal(contract('La Poruña el domingo'), 'La Poruña el domingo');
  assert.equal(withPreposition('de', 'El Tranque'), 'del Tranque');
  assert.equal(withPreposition('a', 'los Poruños'), 'a los Poruños');
}
