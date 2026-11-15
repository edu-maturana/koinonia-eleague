import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newsImageCatalog } from '../src/features/news/newsImageCatalog.js';
import { deterministicImage, getNewsImage } from '../src/features/news/newsImageSelector.js';
import {
  applyAvailableMasks,
  fallbackKitColors,
  fallbackSceneSrc,
  getSceneBaseSrc,
  getSceneColorLayers,
  recolorPixels,
  resolveKitColors,
  resolveScenePalette,
} from '../src/features/news/newsSceneRenderer.js';

const expectedStructure = {
  victory: ['normal', 'narrow', 'big'],
  defeat: ['normal', 'narrow', 'big'],
  draw: ['goalless', 'normal', 'crazy'],
  transfer: ['arrival', 'departure', 'move'],
  sanction: ['player', 'club'],
};

let sceneCount = 0;
for (const [type, subtypes] of Object.entries(expectedStructure)) {
  assert.deepEqual(Object.keys(newsImageCatalog[type]), subtypes);
  for (const subtype of subtypes) {
    const images = newsImageCatalog[type][subtype];
    assert.ok(images.length > 0, `${type}.${subtype} necesita escenas`);
    for (const image of images) {
      assert.equal(typeof image.id, 'string');
      assert.equal(typeof image.scene, 'string');
      assert.match(image.src, /^\/news-scenes\//);
      assert.equal(image.recolorable, image.colorTargets.length > 0);
      sceneCount += 1;
    }
  }
}

const input = { id: 'uuid-news-37ba206b', type: 'victory', subtype: 'normal' };
assert.deepEqual(getNewsImage(input), getNewsImage(structuredClone(input)));
assert.match(getSceneBaseSrc(getNewsImage(input)), /^\/news-scenes\/victory\/normal\/[a-z-]+\/scene-base\.png$/);
assert.equal(getNewsImage({ ...input, type: 'unknown' }), null);
assert.equal(getNewsImage({ ...input, subtype: 'unknown' }), null);
assert.equal(deterministicImage([], input.id), null);

const selectedIds = new Set(Array.from({ length: 100 }, (_, index) =>
  deterministicImage(newsImageCatalog.victory.normal, `event-${index}`)?.id));
assert.ok(selectedIds.size > 1, 'IDs distintos deben poder distribuirse entre varias escenas');

const twoTeamScene = newsImageCatalog.victory.normal[1];
const layers = getSceneColorLayers(
  twoTeamScene,
  { colors: { shirt: '#123456', shorts: '#ABCDEF', socks: '#654321' } },
  { primaryColor: '#AA0000', secondaryColor: '#001122' },
);
assert.equal(layers.length, 6);
assert.deepEqual(layers.slice(0, 3).map(layer => layer.color), ['#123456', '#ABCDEF', '#654321']);
assert.match(layers[0].src, /mask-team1-shirt\.png$/);
assert.match(layers[3].src, /mask-team2-shirt\.png$/);

const oneTeamScene = newsImageCatalog.transfer.arrival[0];
assert.equal(getSceneColorLayers(oneTeamScene, {}, {}).length, 3);
const fixedScene = newsImageCatalog.transfer.departure.find(image => !image.recolorable);
assert.equal(getSceneColorLayers(fixedScene, {}, {}).length, 0);
assert.deepEqual(resolveKitColors({ primaryColor: 'invalid' }), fallbackKitColors.team);

const alternativePalette = resolveScenePalette(
  { colors: { shirt: '#00A651', shorts: '#FFFFFF', accent: '#F6EB14' } },
  { colors: { shirt: '#5B2C83', shorts: '#111111', socks: '#5B2C83' } },
);
assert.deepEqual(alternativePalette, { primary: '#00A651', secondary: '#5B2C83', accent: '#F6EB14' });
assert.deepEqual(
  resolveScenePalette({ colors: { shirt: '#00A651', shorts: '#FFFFFF', socks: '#F6EB14' } }, null),
  { primary: '#00A651', secondary: '#FFFFFF', accent: '#F6EB14' },
);

const base = new Uint8ClampedArray([40, 40, 40, 255, 220, 220, 220, 255]);
const mask = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
const recolored = recolorPixels(base, mask, '#FF0000');
assert.ok(recolored[0] < recolored[4], 'La recoloración debe conservar luces y sombras');
const opaqueBlackMask = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
assert.deepEqual(recolorPixels(base, opaqueBlackMask, '#FF0000'), base, 'El negro opaco de una máscara no debe recolorear la escena');
assert.deepEqual(applyAvailableMasks(base, [null]), base, 'Una máscara ausente no debe impedir el render');
assert.deepEqual(applyAvailableMasks(base, [{ pixels: new Uint8ClampedArray(4), color: '#FF0000' }]), base);
assert.equal(fallbackSceneSrc, '/reference-art.webp');

for (const path of [
  new URL('../src/features/news/newsImageCatalog.js', import.meta.url),
  new URL('../src/features/news/newsImageSelector.js', import.meta.url),
]) {
  assert.doesNotMatch(readFileSync(path, 'utf8'), /Math\.random/);
}

console.log(`Catálogo verificado: ${sceneCount} escenas deterministas, recoloración y fallbacks seguros.`);
