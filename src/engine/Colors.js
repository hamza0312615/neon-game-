export const Colors = {
  cyan: '#00e5ff',      // Player & Primary UI Accent
  magenta: '#ff007f',   // Laser / Secondary Weapon Accent
  yellow: '#ffb800',    // Mid-tier threat / Boost / Warning
  purple: '#b14aff',    // Boss & Elite Threat ONLY
  green: '#39ff8f',     // Reward / Health / Success
  red: '#ff2e63',       // Danger / Critical / Damage
  blue: '#0088ff',      // Shield / Secondary Accent
  orange: '#ff6b00',    // Thermal / Fire
  gold: '#ffb800',      // Credits / Rewards
  pink: '#ff007f',      // Pink accent
  white: '#ffffff',
  grey: '#8a99ad',      // Neutral Chrome Light
  darkGrey: '#4a5568',  // Neutral Chrome Dark
  dark: '#05060f'       // Dark background
};

export function resolveColor(color) {
  if (typeof color !== 'string') return color;
  if (!color) return '#ffffff';
  if (color.startsWith('var(--neon-')) {
    const name = color.substring(11, color.length - 1).trim(); // extracts name from 'var(--neon-name)'
    return Colors[name] || '#00e5ff';
  }
  return color;
}
