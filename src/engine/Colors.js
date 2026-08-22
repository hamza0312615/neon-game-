export const Colors = {
  cyan: '#00f0ff',
  magenta: '#00e5ff',
  yellow: '#ffea00',
  purple: '#0099ff',
  green: '#39ff14',
  red: '#ff003c',
  blue: '#00a2ff',
  orange: '#ff7700',
  white: '#ffffff',
  grey: '#a0a0c0',
  dark: '#080c1c'
};

export function resolveColor(color) {
  if (typeof color !== 'string') return color;
  if (color.startsWith('var(--neon-')) {
    const name = color.substring(11, color.length - 2); // extracts name from 'var(--neon-name)'
    return Colors[name] || color;
  }
  return color;
}
