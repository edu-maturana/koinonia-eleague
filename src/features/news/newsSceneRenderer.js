export const fallbackSceneSrc = '/reference-art.webp';

export const fallbackKitColors = {
  team: { shirt: '#0752A0', shorts: '#FFFFFF', socks: '#0752A0' },
  opponent: { shirt: '#B00020', shorts: '#111111', socks: '#B00020' },
};

const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function hasConfiguredColors(source) {
  const colors = source?.colors ?? source?.kitColors ?? source?.kit?.colors ?? source ?? {};
  return Boolean(source?.primaryColor ?? colors.primary ?? colors.shirt);
}

export function resolveKitColors(source, fallback = fallbackKitColors.team) {
  const colors = source?.colors ?? source?.kitColors ?? source?.kit?.colors ?? source ?? {};
  const primary = source?.primaryColor ?? colors.primary;
  const secondary = source?.secondaryColor ?? colors.secondary;
  const tertiary = source?.tertiaryColor ?? colors.tertiary;
  const pick = (candidate, backup) => validHex(candidate) ? candidate.toUpperCase() : backup;
  return {
    shirt: pick(colors.shirt ?? colors.jersey ?? primary, fallback.shirt),
    shorts: pick(colors.shorts ?? secondary, fallback.shorts),
    socks: pick(colors.socks ?? tertiary ?? primary, fallback.socks),
  };
}

export function resolveScenePalette(team, opponent) {
  const teamKit = resolveKitColors(team, fallbackKitColors.team);
  const opponentKit = resolveKitColors(opponent, fallbackKitColors.opponent);
  const teamColors = team?.colors ?? team?.kitColors ?? team?.kit?.colors ?? team ?? {};
  return {
    primary: teamKit.shirt,
    secondary: opponent ? opponentKit.shirt : teamKit.shorts,
    accent: validHex(teamColors.tertiary ?? teamColors.accent ?? team?.accentColor)
      ? (teamColors.tertiary ?? teamColors.accent ?? team.accentColor).toUpperCase()
      : teamKit.socks,
  };
}

export function getSceneBaseSrc(scene) {
  if (!scene?.src) return null;
  return `${scene.src}/scene-base.png`;
}

export function getSceneColorLayers(scene, team, opponent) {
  if (!scene?.recolorable) return [];
  const layers = [];
  const participants = [
    ['team', 'team1', resolveKitColors(team, fallbackKitColors.team)],
    ['opponent', 'team2', resolveKitColors(opponent, fallbackKitColors.opponent)],
  ];
  for (const [colorTarget, maskTarget, colors] of participants) {
    if (!scene.colorTargets?.includes(colorTarget)) continue;
    for (const part of ['shirt', 'shorts', 'socks']) {
      layers.push({ colorTarget, part, color: colors[part], src: `${scene.src}/mask-${maskTarget}-${part}.png` });
    }
  }
  return layers;
}

export function hexToRgb(hex) {
  const normalized = validHex(hex) ? hex.slice(1) : 'FFFFFF';
  return [0, 2, 4].map(index => Number.parseInt(normalized.slice(index, index + 2), 16));
}

export function recolorPixels(basePixels, maskPixels, color) {
  const output = new Uint8ClampedArray(basePixels);
  const [targetRed, targetGreen, targetBlue] = hexToRgb(color);
  for (let index = 0; index < output.length; index += 4) {
    const maskIntensity = Math.max(maskPixels[index], maskPixels[index + 1], maskPixels[index + 2]) / 255;
    const maskAlpha = maskIntensity * (maskPixels[index + 3] / 255);
    if (maskAlpha <= 0) continue;
    const luminance = (basePixels[index] * .2126 + basePixels[index + 1] * .7152 + basePixels[index + 2] * .0722) / 255;
    const shade = .28 + luminance * .88;
    output[index] = Math.round(basePixels[index] * (1 - maskAlpha) + targetRed * shade * maskAlpha);
    output[index + 1] = Math.round(basePixels[index + 1] * (1 - maskAlpha) + targetGreen * shade * maskAlpha);
    output[index + 2] = Math.round(basePixels[index + 2] * (1 - maskAlpha) + targetBlue * shade * maskAlpha);
  }
  return output;
}

export function applyAvailableMasks(basePixels, masks = []) {
  return masks.reduce((pixels, mask) => {
    if (!mask?.pixels || !mask?.color || mask.pixels.length !== pixels.length) return pixels;
    return recolorPixels(pixels, mask.pixels, mask.color);
  }, new Uint8ClampedArray(basePixels));
}
