const SAVE_KEY = 'neon_circuit_save_data';

export class SaveSystem {
  static getDefaults() {
    return {
      settings: {
        masterVolume: 0.7,
        musicVolume: 0.5,
        sfxVolume: 0.8,
        glowEnabled: true,
        particlesQuality: 'high',
        shakeEnabled: true,
        damageNumbersEnabled: true,
        colorblindMode: false,
        photosensitiveMode: false
      },
      progression: {
        bestScore: 0,
        highestWave: 1,
        credits: 0,
        completedTutorial: false,
        firstLaunch: true,
        dailyStreak: 1,
        lastLoginDate: new Date().toISOString().slice(0, 10),
        unlockedWeapons: ['plasma'],
        activeWeapon: 'plasma',
        upgrades: {
          engine: 1,      // Speed, acceleration
          armor: 1,       // Max HP, damage resistance
          shield: 1,      // Capacity, recharge speed
          weapon: 1,      // Bullet damage, fire rate
          handling: 1,    // Turning speed, drift grip
          boost: 1,       // Capacity, recharge speed
          utility: 1      // Pickup range, XP gain bonus
        }
      },
      statistics: {
        totalKills: 0,
        totalBossKills: 0,
        totalSurvivalTime: 0,
        runsCount: 0
      }
    };
  }

  static load() {
    try {
      const dataStr = localStorage.getItem(SAVE_KEY);
      if (!dataStr) {
        return this.getDefaults();
      }
      
      const parsed = JSON.parse(dataStr);
      const defaults = this.getDefaults();
      
      return {
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
        progression: {
          ...defaults.progression,
          ...(parsed.progression || {}),
          upgrades: { ...defaults.progression.upgrades, ...(parsed.progression?.upgrades || {}) }
        },
        statistics: { ...defaults.statistics, ...(parsed.statistics || {}) }
      };
    } catch (e) {
      console.error("Failed to load save data. Resetting to defaults safely.", e);
      return this.getDefaults();
    }
  }

  static save(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("Failed to save data to localStorage", e);
      return false;
    }
  }

  static reset() {
    try {
      const defaults = this.getDefaults();
      localStorage.setItem(SAVE_KEY, JSON.stringify(defaults));
      return defaults;
    } catch (e) {
      console.error("Failed to reset local storage", e);
      return this.getDefaults();
    }
  }
}
