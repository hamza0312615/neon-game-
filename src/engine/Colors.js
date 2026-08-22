export const Colors = {
  cyan: '#00f0ff',
  magenta: '#ff007f',
  yellow: '#ffea00',
  purple: '#bd00ff',
  green: '#39ff14',
  red: '#ff003c',
  blue: '#0055ff',
  orange: '#ff6c00',
  white: '#ffffff',
  grey: '#888888',
  dark: '#111122'
};

export function resolveColor(color) {
  if (typeof color !== 'string') return color;
  if (color.startsWith('var(--neon-')) {
    const name = color.substring(11, color.length - 2); // extracts name from 'var(--neon-name)'
    return Colors[name] || color;
  }
  return color;
}
