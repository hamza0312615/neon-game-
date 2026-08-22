import { Grunt, Tank, Sniper, Striker, Drone, Kamikaze } from '../entities/Enemy.js';
import { Titan, VoidRacer, OmegaCore } from '../entities/Boss.js';
import { Pickup } from '../entities/Pickup.js';

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.waveNumber = 1;
    this.enemiesToSpawn = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // seconds between spawns
    this.waveActive = false;
    
    // Wave queue to hold spawned blueprint list
    this.spawnQueue = [];

    // Map Event trackers
    this.activeEvent = null;
    this.eventTimer = 0;
    this.blackoutActive = false;
  }

  reset() {
    this.waveNumber = 1;
    this.enemiesToSpawn = 0;
    this.spawnQueue = [];
    this.waveActive = false;
    this.activeEvent = null;
    this.blackoutActive = false;
    this.spawnInterval = 1.5;
  }

  startWave() {
    this.waveActive = true;
    this.spawnQueue = [];
    this.game.audio.playWaveStart();
    
    // UI alerts trigger
    const alertTitle = document.getElementById('hud-big-alert');
    const alertSub = document.getElementById('hud-sub-alert');
    
    let subMsg = "PREPARE FOR CONTACT";
    
    // 1. Core wave compositions
    const scale = 1.0 + (this.waveNumber - 1) * 0.12; // Rebalanced scaling curve (12% per wave)
    
    if (this.waveNumber === 10) {
      alertTitle.innerText = "BOSS WAVE 10";
      subMsg = "TITAN MECH CLASSIFIED";
      this.spawnQueue.push({ type: 'titan', scale });
    } else if (this.waveNumber === 20) {
      alertTitle.innerText = "BOSS WAVE 20";
      subMsg = "VOID RACER DETECTED";
      this.spawnQueue.push({ type: 'void_racer', scale });
    } else if (this.waveNumber === 30) {
      alertTitle.innerText = "BOSS WAVE 30";
      subMsg = "OMEGA MATRIX SECURED";
      this.spawnQueue.push({ type: 'omega_core', scale });
    } else if (this.waveNumber % 5 === 0) {
      // Elite Wave
      alertTitle.innerText = `WAVE ${this.waveNumber} (ELITE)`;
      subMsg = "ELITE PHANTOM PATROLS";
      
      const count = 5 + this.waveNumber / 4;
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push({ type: 'elite_grunt', scale: scale * 1.5 });
      }
      this.spawnQueue.push({ type: 'elite_tank', scale: scale * 1.5 });
    } else {
      // Normal Wave
      alertTitle.innerText = `WAVE ${this.waveNumber}`;
      
      // Procedural filler queue based on wave level (increased spawn count)
      const gruntCount = Math.round(5 + this.waveNumber * 2.4);
      const droneCount = Math.max(0, -1 + this.waveNumber);
      const tankCount = this.waveNumber >= 3 ? Math.floor(this.waveNumber / 2.5) : 0;
      const sniperCount = this.waveNumber >= 4 ? Math.floor(this.waveNumber / 3.0) : 0;
      const strikerCount = this.waveNumber >= 5 ? Math.floor(this.waveNumber / 4.0) : 0;
      const kamikazeCount = this.waveNumber >= 5 ? Math.floor(this.waveNumber / 3.5) : 0;

      for (let i = 0; i < gruntCount; i++) this.spawnQueue.push({ type: 'grunt', scale });
      for (let i = 0; i < droneCount; i++) this.spawnQueue.push({ type: 'drone', scale });
      for (let i = 0; i < tankCount; i++) this.spawnQueue.push({ type: 'tank', scale });
      for (let i = 0; i < sniperCount; i++) this.spawnQueue.push({ type: 'sniper', scale });
      for (let i = 0; i < strikerCount; i++) this.spawnQueue.push({ type: 'striker', scale });
      for (let i = 0; i < kamikazeCount; i++) this.spawnQueue.push({ type: 'kamikaze', scale });
    }

    this.enemiesToSpawn = this.spawnQueue.length;
    this.spawnInterval = Math.max(0.4, 1.5 - this.waveNumber * 0.05); // spawn faster on higher waves

    // Display alert UI panel
    if (alertSub) alertSub.innerText = subMsg;
    alertTitle?.classList.remove('hidden');
    alertSub?.classList.remove('hidden');
    
    setTimeout(() => {
      alertTitle?.classList.add('hidden');
      alertSub?.classList.add('hidden');
    }, 2500);

    // 2. Random Event trigger (chance of happening starting on wave 2, except boss waves)
    if (this.waveNumber % 10 !== 0 && Math.random() < 0.35 && this.waveNumber > 1) {
      this.triggerRandomEvent();
    }
  }

  triggerRandomEvent() {
    const events = ['supply_drop', 'ambush', 'power_surge', 'blackout', 'elite_hunt'];
    const selected = events[Math.floor(Math.random() * events.length)];
    
    this.activeEvent = selected;
    this.eventTimer = selected === 'power_surge' || selected === 'blackout' ? 15.0 : 0;

    const alertSub = document.getElementById('hud-sub-alert');
    alertSub?.classList.remove('hidden');

    if (selected === 'supply_drop') {
      alertSub.innerText = "CRITICAL RESOURCE CACHE INCOMING";
      // Spawn supply drop crate in random coordinates
      const sx = 1000 + Math.random() * 3000;
      const sy = 1000 + Math.random() * 3000;
      
      // Spawns a crate containing 3 distinct powerups
      setTimeout(() => {
        const crate = this.game.arena.createObstacle(sx, sy, 'crate');
        crate.health = 5; // easy to break
        // Overrides crate destroy to drop 3 powerups
        const defaultDestroy = this.game.arena.destroyObstacle;
        crate.destroyOverride = () => {
          this.game.audio.playExplosion(false);
          crate.isDead = true;
          // Spawn powerups
          const powerups = ['rapidFire', 'damageBoost', 'overdrive', 'magnet'];
          for (let i = 0; i < 3; i++) {
            const rx = sx + (Math.random() * 40 - 20);
            const ry = sy + (Math.random() * 40 - 20);
            const type = powerups[Math.floor(Math.random() * powerups.length)];
            this.game.pickups.push(new Pickup(this.game, rx, ry, type, 1));
          }
        };
        this.game.arena.obstacles.push(crate);
        this.game.particles.spawnShieldPulse(sx, sy, 80, 'var(--neon-green)');
      }, 3000);
      
    } else if (selected === 'ambush') {
      alertSub.innerText = "AMBUSH CONE FORMED";
      // Spawn ring of 8 grunts surrounding player
      const count = 8;
      const r = 360;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count;
        const x = this.game.player.x + Math.cos(angle) * r;
        const y = this.game.player.y + Math.sin(angle) * r;
        
        // Spawn portal ring
        this.game.particles.spawnShieldPulse(x, y, 20, 'var(--neon-red)');
        
        const g = new Grunt(this.game, x, y, 'grunt', 1.0);
        this.game.enemies.push(g);
      }
      
    } else if (selected === 'power_surge') {
      alertSub.innerText = "WARNING: POWER SURGE REGISTERED";
      // Boost player fire rates
      this.game.player.powerups.rapidFire = 15.0;
      
    } else if (selected === 'blackout') {
      alertSub.innerText = "GRID BLACKOUT COMMENCING";
      this.blackoutActive = true;
      
    } else if (selected === 'elite_hunt') {
      alertSub.innerText = "ELITE UNIT PURSUIT INITIATED";
      // Spawn Elite striker tracking player
      const angle = Math.random() * Math.PI * 2;
      const ex = this.game.player.x + Math.cos(angle) * 600;
      const ey = this.game.player.y + Math.sin(angle) * 600;
      
      const elite = new Striker(this.game, ex, ey, 'striker', 1.8);
      elite.color = 'var(--neon-purple)';
      elite.speed = 175;
      elite.maxHp = 90;
      elite.hp = 90;
      this.game.enemies.push(elite);
      this.game.particles.spawnShieldPulse(ex, ey, elite.radius, 'var(--neon-purple)');
    }

    setTimeout(() => {
      alertSub.classList.add('hidden');
    }, 2500);
  }

  update(dt) {
    if (!this.waveActive) return;

    // Tick map events
    if (this.activeEvent === 'power_surge' || this.activeEvent === 'blackout') {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.activeEvent = null;
        this.blackoutActive = false;
      }
    }

    // 1. Spawning queues logic
    if (this.spawnQueue.length > 0) {
      if (this.spawnTimer > 0) {
        this.spawnTimer -= dt;
      } else {
        this.spawnTimer = this.spawnInterval;
        
        // Retrieve blueprint from queue
        const bp = this.spawnQueue.shift();
        this.enemiesToSpawn = this.spawnQueue.length;
        
        this.spawnEnemy(bp.type, bp.scale);
      }
    }

    // 2. Check for wave completion
    if (this.spawnQueue.length === 0 && this.game.enemies.length === 0) {
      this.waveActive = false;
      this.waveNumber++;
      
      // Delay wave start to let player catch breath
      setTimeout(() => {
        this.startWave();
      }, 3500);
    }
  }

  spawnEnemy(type, scale) {
    // Determine offscreen coordinates (approx 150px outside screen border)
    const angle = Math.random() * Math.PI * 2;
    // Viewport diagonal radius is approx width/2
    const radius = Math.hypot(this.game.canvas.width, this.game.canvas.height) / 2 + 100;
    
    let sx = this.game.player.x + Math.cos(angle) * radius;
    let sy = this.game.player.y + Math.sin(angle) * radius;

    // Clamp spawn coordinates inside world border
    sx = Math.max(100, Math.min(sx, this.game.arena.width - 100));
    sy = Math.max(100, Math.min(sy, this.game.arena.height - 100));

    let e = null;

    if (type === 'grunt') {
      e = new Grunt(this.game, sx, sy, 'grunt', scale);
    } else if (type === 'tank') {
      e = new Tank(this.game, sx, sy, 'tank', scale);
    } else if (type === 'sniper') {
      e = new Sniper(this.game, sx, sy, 'sniper', scale);
    } else if (type === 'striker') {
      e = new Striker(this.game, sx, sy, 'striker', scale);
    } else if (type === 'drone') {
      e = new Drone(this.game, sx, sy, 'drone', scale);
    } else if (type === 'kamikaze') {
      e = new Kamikaze(this.game, sx, sy, 'kamikaze', scale);
    } else if (type === 'titan') {
      e = new Titan(this.game, sx, sy, 'titan', scale);
    } else if (type === 'void_racer') {
      e = new VoidRacer(this.game, sx, sy, 'void_racer', scale);
    } else if (type === 'omega_core') {
      // Omega Core spawns snapped to the absolute center of the map
      e = new OmegaCore(this.game, 2500, 2500, 'omega_core', scale);
    } else if (type === 'elite_grunt') {
      // Elite grunts are larger and purple
      e = new Grunt(this.game, sx, sy, 'grunt', scale);
      e.color = 'var(--neon-purple)';
      e.radius = 23;
      e.maxHp = 50 * scale;
      e.hp = e.maxHp;
    } else if (type === 'elite_tank') {
      e = new Tank(this.game, sx, sy, 'tank', scale);
      e.color = 'var(--neon-purple)';
      e.radius = 36;
      e.maxHp = 220 * scale;
      e.hp = e.maxHp;
    }

    if (e) {
      this.game.enemies.push(e);
      // Spawn glowing portal rings particles
      this.game.particles.spawnShieldPulse(sx, sy, e.radius + 15, e.color);
    }
  }

  spawnBossNow() {
    this.waveActive = true;
    const scale = 1.0 + (this.waveNumber - 1) * 0.12;
    const bosses = ['titan', 'void_racer', 'omega_core'];
    const chosen = bosses[Math.floor(Math.random() * bosses.length)];
    
    this.spawnEnemy(chosen, scale);
    this.game.uiEffects.spawnScoreFloat(this.game.player.x, this.game.player.y - 60, `⚠️ BOSS DETECTED!`, 'var(--neon-yellow)');
    this.game.audio.playExplosion(true);
  }
}
