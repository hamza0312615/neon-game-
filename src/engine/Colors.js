export const Colors = {
  cyan: '#00f3ff',
  magenta: '#ff007f',
  yellow: '#ffcc00',
  purple: '#9d00ff',
  green: '#00ff88',
  red: '#ff0044',
  blue: '#0066ff',
  orange: '#ff5500',
  gold: '#ffcc00',
  pink: '#ff007f',
  white: '#ffffff',
  grey: '#8a99ad',
  dark: '#040612'
};

export function resolveColor(color) {
  if (typeof color !== 'string') return color;
  if (color.startsWith('var(--neon-')) {
    const name = color.substring(11, color.length - 2); // extracts name from 'var(--neon-name)'
    return Colors[name] || color;
  }
  return color;
}
