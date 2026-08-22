import { Enemy } from './Enemy.js';
import { Projectile } from './Projectile.js';
import { resolveColor } from '../engine/Colors.js';

// Base Boss class extending Enemy
export class Boss extends Enemy {
  constructor(game, x, y, type, waveScale = 1.0) {
    super(game, x, y, type, waveScale);
  }

  initStats() {
    this.maxHp = 600 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 100;
    this.damage = 15 * this.waveScale;
    this.radius = 45;
    this.color = 'var(--neon-magenta)';
    
    this.scoreReward = 2000;
    this.creditsReward = 250;
    this.xpReward = 200;

    this.bossPhase = 1; // 1 = 100-70%, 2 = 70-40%, 3 = 40-15%, 4 = <15% (Enraged)
  }

  takeDamage(amount, isCrit) {
    super.takeDamage(amount, isCrit);
    
    // Evaluate Boss Phase changes
    const hpRatio = this.hp / this.maxHp;
    let nextPhase = 1;
    
    if (hpRatio <= 0.15) {
      nextPhase = 4; // Enraged
    } else if (hpRatio <= 0.40) {
      nextPhase = 3;
    } else if (hpRatio <= 0.70) {
      nextPhase = 2;
    }

    if (nextPhase !== this.bossPhase) {
      this.bossPhase = nextPhase;
      this.game.camera.addTrauma(0.5);
      this.game.uiEffects.spawnScoreFloat(this.x, this.y - 60, `PHASE ${this.bossPhase} INITIATED!`);
      this.onPhaseChange(nextPhase);
    }
  }

  onPhaseChange(phase) {
    // Custom trigger in subclasses
  }

  die() {
    super.die();
    this.game.camera.addTrauma(0.85);
    this.game.audio.playExplosion(true);
    
    // Large reward notifications
    this.game.eliteKills++;
    
    // Spawn heavy credits explosion
    for (let i = 0; i < 6; i++) {
      const rx = this.x + (Math.random() * 80 - 40);
      const ry = this.y + (Math.random() * 80 - 40);
      this.game.pickups.push(new Pickup(this.game, rx, ry, 'credits', 50));
    }
  }
}

// ==========================================
// 1. TITAN (Colossus, Homing Missiles, Ram)
// ==========================================
export class Titan extends Boss {
  initStats() {
    super.initStats();
    this.maxHp = 800 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 80;
    this.radius = 55;
    this.color = 'var(--neon-magenta)';
    
    this.cooldown = 0.12; // Machine gun rate
    this.fireTimer = 1.0;
    
    this.missileCooldown = 6.0;
    this.missileTimer = 3.0;

    // Charge attack variables
    this.chargeCooldown = 8.0;
    this.chargeTimer = 4.0;
    this.chargePrepTimer = 0;
    this.isCharging = false;
    this.chargeDirX = 0;
    this.chargeDirY = 0;
  }

  onPhaseChange(phase) {
    if (phase === 4) {
      this.speed = 130; // rage speed
      this.cooldown = 0.07;
    }
  }

  shootRoutine(player, dt) {
    if (this.isStunned()) return;

    // 1. Machine gun turret (fires streams of purple bullets)
    if (!this.isCharging && this.chargePrepTimer <= 0) {
      if (this.fireTimer <= 0) {
        this.fireTimer = this.cooldown * (this.bossPhase === 4 ? 0.6 : 1.0);
        
        const angle = Math.atan2(player.y - this.y, player.x - this.x) + (Math.random() * 0.15 - 0.075);
        const vx = Math.cos(angle) * 450;
        const vy = Math.sin(angle) * 450;
        
        const p = new Projectile(this.game, this.x + Math.cos(angle)*this.radius, this.y + Math.sin(angle)*this.radius, vx, vy, this.damage, 3.5, 'var(--neon-magenta)', 'enemy', 'normal', 2.0, false);
        this.game.projectiles.push(p);
      }
    }

    // 2. Phase 2+ Homing Rocket launchers
    if (this.bossPhase >= 2 && !this.isCharging) {
      if (this.missileTimer > 0) {
        this.missileTimer -= dt;
      } else {
        this.missileTimer = this.missileCooldown * (this.bossPhase >= 3 ? 0.7 : 1.0);
        
        // Spawn 3 homing rockets spreading outward
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const offsets = [-0.3, 0, 0.3];
        offsets.forEach(off => {
          const ma = angle + off;
          const vx = Math.cos(ma) * 220;
          const vy = Math.sin(ma) * 220;
          const p = new Projectile(this.game, this.x + Math.cos(ma)*40, this.y + Math.sin(ma)*40, vx, vy, this.damage * 2.0, 4.0, 'var(--neon-yellow)', 'enemy', 'homing', 4.0, false);
          this.game.projectiles.push(p);
        });
        
        this.game.audio.playShoot('missile');
      }
    }

    // 3. Charging Ram attack
    if (this.chargeTimer > 0) {
      this.chargeTimer -= dt;
    } else if (!this.isCharging && this.chargePrepTimer <= 0) {
      // Begin charging prep (locks line of sight)
      this.chargePrepTimer = 1.2; // 1.2 seconds telegraph
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.chargeDirX = Math.cos(angle);
      this.chargeDirY = Math.sin(angle);
      this.game.audio.playSFX(220, 88, 1.2, 'sawtooth', 0.4);
    }

    if (this.chargePrepTimer > 0) {
      this.chargePrepTimer -= dt;
      if (this.chargePrepTimer <= 0) {
        this.isCharging = true;
        this.chargeTimer = this.chargeCooldown;
        this.speed = 460; // dash speed
        this.vx = this.chargeDirX * this.speed;
        this.vy = this.chargeDirY * this.speed;
      }
    }

    if (this.isCharging) {
      // Move in locked direction
      this.vx = this.chargeDirX * this.speed;
      this.vy = this.chargeDirY * this.speed;
      
      // Check collision walls or timeout
      const speed = Math.hypot(this.vx, this.vy);
      if (speed < 100 || Math.random() < 0.05) {
        // Slam finished, emit radial EMP blast shockwaves
        this.isCharging = false;
        this.speed = 80;
        this.game.camera.addTrauma(0.55);
        this.game.audio.playExplosion(false);
        
        // Spawn EMP Projectile ring centered on Boss
        const emp = new Projectile(this.game, this.x, this.y, 0, 0, this.damage * 1.5, 20, 'var(--neon-purple)', 'enemy', 'emp_blast', 0.5, false);
        this.game.projectiles.push(emp);
      }
    }
  }

  update(player, dt) {
    if (this.isCharging || this.chargePrepTimer > 0) {
      // Skip normal steering code during charging prep and charge ram
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle = Math.atan2(this.vy, this.vx);
      this.shootRoutine(player, dt);
      
      // decay stun & damage flashes anyway
      if (this.damageFlash > 0) this.damageFlash -= dt;
      if (this.stunTimer > 0) this.stunTimer -= dt;
    } else {
      super.update(player, dt);
    }
  }

  drawChassis(ctx) {
    // Heavy tracked multi-turret fortress
    ctx.beginPath();
    ctx.rect(-45, -35, 90, 70);
    ctx.fill();
    ctx.stroke();

    // Tread bands left/right
    ctx.fillStyle = '#0f0f18';
    ctx.fillRect(-50, -42, 100, 8);
    ctx.strokeRect(-50, -42, 100, 8);
    ctx.fillRect(-50, 34, 100, 8);
    ctx.strokeRect(-50, 34, 100, 8);

    // Twin turrets extending
    ctx.fillStyle = '#100f1c';
    ctx.fillRect(15, -16, 25, 6);
    ctx.strokeRect(15, -16, 25, 6);
    ctx.fillRect(15, 10, 25, 6);
    ctx.strokeRect(15, 10, 25, 6);

    // Phase plate details
    ctx.strokeStyle = resolveColor(this.bossPhase >= 4 ? 'var(--neon-red)' : 'var(--neon-magenta)');
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI*2);
    ctx.stroke();
  }

  drawCustomEffects(ctx) {
    // Telegraph red line lane for charging prep
    if (this.chargePrepTimer > 0 && !this.isStunned()) {
      ctx.save();
      const angle = Math.atan2(this.chargeDirY, this.chargeDirX);
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      
      ctx.fillStyle = 'rgba(255, 0, 60, 0.08)';
      ctx.strokeStyle = `rgba(255, 0, 60, ${0.15 + Math.sin(Date.now()*0.05)*0.08})`;
      ctx.lineWidth = 2;
      
      // Draw rectangular warning lane extending forward 1200px
      ctx.fillRect(0, -this.radius, 1200, this.radius*2);
      ctx.strokeRect(0, -this.radius, 1200, this.radius*2);
      
      ctx.restore();
    }
  }
}

// ==========================================
// 2. VOID RACER (Teleporter, Mines, Clones)
// ==========================================
export class VoidRacer extends Boss {
  initStats() {
    super.initStats();
    this.maxHp = 500 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 190; // High speed
    this.radius = 42;
    this.color = 'var(--neon-cyan)';
    
    this.cooldown = 0.5; // burst rate
    this.fireTimer = 1.0;

    this.teleportCooldown = 5.5;
    this.teleportTimer = 4.0;
    
    this.mineCooldown = 3.0;
    this.mineTimer = 1.5;

    this.isClone = false; // flag to distinguish real from decoys
  }

  onPhaseChange(phase) {
    if (phase === 3) {
      // Spawn 2 clone decoys!
      this.spawnDecoy();
      this.spawnDecoy();
    }
    if (phase === 4) {
      this.speed = 240;
      this.teleportCooldown = 3.5;
    }
  }

  spawnDecoy() {
    if (this.isClone) return;
    const dx = this.x + (Math.random()*200-100);
    const dy = this.y + (Math.random()*200-100);
    
    // Decoy is a simplified VoidRacer with low health
    const decoy = new VoidRacer(this.game, dx, dy, 'void_racer_decoy', this.waveScale);
    decoy.isClone = true;
    decoy.maxHp = 50;
    decoy.hp = 50;
    decoy.color = 'rgba(0, 240, 255, 0.45)'; // slightly transparent
    decoy.scoreReward = 200;
    decoy.creditsReward = 0;
    decoy.xpReward = 25;
    
    this.game.enemies.push(decoy);
    this.game.particles.spawnShieldPulse(dx, dy, decoy.radius, 'var(--neon-cyan)');
  }

  shootRoutine(player, dt) {
    if (this.isStunned()) return;

    // 1. Triple laser shot burst
    if (this.fireTimer <= 0) {
      this.fireTimer = this.cooldown;
      
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      const offsets = [-0.18, 0, 0.18];
      offsets.forEach(off => {
        const a = angle + off;
        const vx = Math.cos(a) * 580;
        const vy = Math.sin(a) * 580;
        const p = new Projectile(this.game, this.x, this.y, vx, vy, this.isClone ? 3 : this.damage, 3.0, 'var(--neon-cyan)', 'enemy', 'normal', 1.5, false);
        this.game.projectiles.push(p);
      });
      this.game.audio.playShoot('plasma');
    }

    // Real boss actions only:
    if (!this.isClone) {
      // 2. Quantum Teleportation (reposition surrounding player)
      if (this.teleportTimer > 0) {
        this.teleportTimer -= dt;
      } else {
        this.teleportTimer = this.teleportCooldown;
        this.executeTeleport(player);
      }

      // 3. Drop energy mines behind while moving
      if (this.bossPhase >= 2) {
        if (this.mineTimer > 0) {
          this.mineTimer -= dt;
        } else {
          this.mineTimer = this.mineCooldown;
          this.dropLaserMine();
        }
      }
    }
  }

  executeTeleport(player) {
    // Spawn vanish particles
    this.game.particles.spawnExplosionSparks(this.x, this.y, 'var(--neon-cyan)', 12);
    
    // Choose random angle and radius around player (approx 350-450px distance)
    const angle = Math.random() * Math.PI * 2;
    const dist = 350 + Math.random() * 100;
    
    this.x = player.x + Math.cos(angle) * dist;
    this.y = player.y + Math.sin(angle) * dist;
    
    // Clamp inside map bounds
    this.x = Math.max(100, Math.min(this.x, this.game.arena.width - 100));
    this.y = Math.max(100, Math.min(this.y, this.game.arena.height - 100));

    // Reset physics vectors
    this.vx = 0;
    this.vy = 0;

    this.game.audio.playSFX(110, 880, 0.3, 'sine', 0.35); // warp sound
    this.game.particles.spawnShieldPulse(this.x, this.y, this.radius, 'var(--neon-cyan)');
    
    // Immediately charge weapons to fire
    this.fireTimer = 0.1;
  }

  dropLaserMine() {
    // Mines are represented by slow projectiles that stay static
    const mine = new Projectile(this.game, this.x, this.y, 0, 0, this.damage * 1.5, 12, 'var(--neon-red)', 'enemy', 'homing', 6.0, false);
    // Overriding homing update to make it static and detonate when player is within radius
    mine.update = (dt) => {
      mine.life -= dt;
      if (mine.life <= 0) {
        mine.isDead = true;
        mine.detonateMissile();
        return;
      }
      
      // Proximity detonation check vs player
      const d = Math.hypot(mine.game.player.x - mine.x, mine.game.player.y - mine.y);
      if (d < mine.game.player.radius + mine.radius + 15) {
        mine.isDead = true;
        mine.detonateMissile();
      }

      // Small hover glow
      if (Math.random() < 0.15) {
        mine.game.particles.spawnParticle({
          x: mine.x + (Math.random()*16-8), y: mine.y + (Math.random()*16-8),
          vx: 0, vy: 0,
          color: 'var(--neon-red)', size: 2.0, life: 0.2, glow: true
        });
      }
    };
    this.game.projectiles.push(mine);
  }

  drawChassis(ctx) {
    // Arrowhead speed ship
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(-15, -20);
    ctx.lineTo(-8, -6);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-8, 6);
    ctx.lineTo(-15, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glow engine wings
    ctx.strokeStyle = resolveColor('var(--neon-cyan)');
    ctx.beginPath();
    ctx.moveTo(-10, -18); ctx.lineTo(-14, -6);
    ctx.moveTo(-10, 18); ctx.lineTo(-14, 6);
    ctx.stroke();
  }
}

// ==========================================
// 3. OMEGA CORE (Stationary Center Node, Shield nodes)
// ==========================================
export class OmegaCore extends Boss {
  constructor(game, x, y, type, waveScale = 1.0) {
    super(game, x, y, type, waveScale);
    
    // Snap to absolute center
    this.x = 2500;
    this.y = 2500;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;

    // Spawn 4 rotating defensive shield cores
    this.shields = [];
    this.shieldAngle = 0;
    this.maxShieldNodes = 4;
    
    this.spawnShieldNodes();
  }

  initStats() {
    super.initStats();
    this.maxHp = 1000 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 0;
    this.radius = 65;
    this.color = 'var(--neon-purple)';

    this.cooldown = 1.5; // Spawn rate
    this.fireTimer = 2.0;

    this.laserSweepCooldown = 7.0;
    this.laserSweepTimer = 4.0;
    this.isSweeping = false;
    this.sweepProgress = 0;
    this.sweepAxis = 'x'; // 'x' or 'y' sweep
  }

  spawnShieldNodes() {
    this.shields = [];
    for (let i = 0; i < this.maxShieldNodes; i++) {
      this.shields.push({
        id: i,
        angleOffset: (i * Math.PI * 2) / this.maxShieldNodes,
        hp: 150 * this.waveScale,
        maxHp: 150 * this.waveScale,
        isDead: false
      });
    }
  }

  takeDamage(amount, isCrit) {
    // Core is completely invulnerable until all defensive shield nodes are destroyed!
    const activeShields = this.shields.filter(s => !s.isDead).length;
    if (activeShields > 0) {
      this.game.audio.playShieldHit();
      this.game.particles.spawnShieldPulse(this.x, this.y, this.radius + 20, 'var(--neon-purple)');
      this.game.uiEffects.spawnDamageFloat(this.x, this.y - 40, "SHIELD ACTIVE", false);
      return;
    }

    super.takeDamage(amount, isCrit);
  }

  onPhaseChange(phase) {
    if (phase === 3) {
      // Regenerate shield nodes once at phase 3 for secondary barrier challenge!
      this.spawnShieldNodes();
      this.game.uiEffects.spawnScoreFloat(this.x, this.y - 65, "SHIELDS REBOOTING!");
    }
  }

  update(player, dt) {
    if (this.isDead) return;

    // Decay tickers
    if (this.damageFlash > 0) this.damageFlash -= dt;
    if (this.stunTimer > 0) this.stunTimer -= dt; // Bosses resist stun time (reduce by 4x speed)
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt * 3.0);
    
    if (this.fireTimer > 0) this.fireTimer -= dt;

    // Rotate shield nodes coordinates
    const rotationRate = 0.8 * (this.bossPhase >= 3 ? 1.5 : 1.0);
    this.shieldAngle += rotationRate * dt;

    // Update active shield nodes coordinates for collision checks
    const orbitRadius = 110;
    this.shields.forEach(sh => {
      if (sh.isDead) return;
      const angle = this.shieldAngle + sh.angleOffset;
      sh.x = this.x + Math.cos(angle) * orbitRadius;
      sh.y = this.y + Math.sin(angle) * orbitRadius;
      sh.radius = 16;
    });

    // 1. Resolve Projectiles vs Shield nodes
    this.game.projectiles.forEach(p => {
      if (p.isDead || p.owner !== 'player') return;
      
      this.shields.forEach(sh => {
        if (sh.isDead) return;
        const d = Math.hypot(p.x - sh.x, p.y - sh.y);
        
        if (d < p.radius + sh.radius) {
          sh.hp -= p.damage;
          p.hit();
          
          this.game.particles.spawnSparkDebris(sh.x, sh.y, 4, 'var(--neon-cyan)');
          this.game.audio.playHit();
          
          if (sh.hp <= 0) {
            sh.isDead = true;
            this.game.audio.playExplosion(false);
            this.game.particles.spawnExplosionSparks(sh.x, sh.y, 'var(--neon-cyan)', 12);
            this.game.score += 500;
          }
        }
      });
    });

    // 2. Spawn combat defensive Drones constantly
    if (this.fireTimer <= 0) {
      this.fireTimer = this.cooldown * (this.bossPhase === 4 ? 0.5 : 1.0);
      
      // Spawn drones at center to hunt player
      if (this.game.enemies.length < 15) { // cap max enemy count to avoid lag
        const drone = new (this.game.enemies.find(e => e.type === 'drone')?.constructor || Enemy)(this.game, this.x, this.y, 'drone', this.waveScale);
        drone.speed = 150;
        drone.maxHp = 15 * this.waveScale;
        drone.hp = drone.maxHp;
        this.game.enemies.push(drone);
        this.game.particles.spawnShieldPulse(this.x, this.y, 30, 'var(--neon-green)');
      }
    }

    // 3. Grid sweeps laser sweep (Phase 2+)
    if (this.bossPhase >= 2) {
      if (this.laserSweepTimer > 0) {
        this.laserSweepTimer -= dt;
      } else if (!this.isSweeping) {
        this.isSweeping = true;
        this.sweepProgress = 0;
        this.sweepAxis = Math.random() > 0.5 ? 'x' : 'y';
        this.game.audio.playSFX(100, 300, 1.8, 'sawtooth', 0.25);
      }

      if (this.isSweeping) {
        this.sweepProgress += dt * 0.4; // takes 2.5 seconds to sweep screen
        
        // Sweep check collision box
        const sweepCoord = this.sweepAxis === 'x' 
          ? this.x - 400 + this.sweepProgress * 800 
          : this.y - 400 + this.sweepProgress * 800;
        
        // Damage player if overlaps sweep line coords
        const pCoord = this.sweepAxis === 'x' ? player.x : player.y;
        if (Math.abs(pCoord - sweepCoord) < player.radius + 15) {
          player.takeDamage(12 * dt * 60); // tick DPS damage
        }

        if (this.sweepProgress >= 1.0) {
          this.isSweeping = false;
          this.laserSweepTimer = this.laserSweepCooldown;
        }
      }
    }
  }

  shootRoutine(player, dt) {
    // Center node fires small radial lasers at player periodically
    // (handled inside update to coordinate with stationary structure)
  }

  die() {
    super.die();
    // Destroy all remaining shield nodes
    this.shields.forEach(s => s.isDead = true);
    
    // Complete victory trigger
    this.game.handleVictory();
  }

  drawChassis(ctx) {
    // Large heavy central computer matrix
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Rotating internal gears
    ctx.save();
    ctx.rotate(-this.shieldAngle * 0.5);
    ctx.strokeStyle = resolveColor('var(--neon-magenta)');
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-25, -25, 50, 50);
    ctx.restore();

    // Center core neon dome
    ctx.fillStyle = resolveColor(this.bossPhase === 4 ? 'var(--neon-red)' : 'var(--neon-purple)');
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI*2);
    ctx.fill();
  }

  render(ctx) {
    super.render(ctx); // renders center core core

    // Render orbiting shields
    this.shields.forEach(sh => {
      if (sh.isDead) return;
      
      ctx.save();
      ctx.fillStyle = '#0f0f18';
      const colorCyan = resolveColor('var(--neon-cyan)');
      ctx.strokeStyle = colorCyan;
      ctx.lineWidth = 2;
      ctx.shadowBlur = (this.game?.saveData?.settings?.glowEnabled ?? true) ? 8 : 0;
      ctx.shadowColor = colorCyan;
      
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      
      // Draw shield inner core details
      ctx.fillStyle = colorCyan;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 4, 0, Math.PI*2);
      ctx.fill();
      
      // HP health line above node
      ctx.restore();
      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 60, 0.4)';
      ctx.fillRect(sh.x - 14, sh.y - 22, 28, 2);
      ctx.fillStyle = colorCyan;
      ctx.fillRect(sh.x - 14, sh.y - 22, 28 * (sh.hp / sh.maxHp), 2);
      ctx.restore();
    });
 
    // Render laser sweep telegraph beams
    if (this.isSweeping) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 60, 0.7)';
      ctx.shadowBlur = (this.game?.saveData?.settings?.glowEnabled ?? true) ? 15 : 0;
      ctx.shadowColor = resolveColor('var(--neon-red)');
      ctx.lineWidth = 6;
      
      const sweepCoord = this.sweepAxis === 'x' 
        ? this.x - 400 + this.sweepProgress * 800 
        : this.y - 400 + this.sweepProgress * 800;

      ctx.beginPath();
      if (this.sweepAxis === 'x') {
        ctx.moveTo(sweepCoord, this.y - 400);
        ctx.lineTo(sweepCoord, this.y + 400);
      } else {
        ctx.moveTo(this.x - 400, sweepCoord);
        ctx.lineTo(this.x + 400, sweepCoord);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
