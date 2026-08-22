import { Projectile } from './Projectile.js';
import { Pickup } from './Pickup.js';
import { resolveColor } from '../engine/Colors.js';

export class Enemy {
  constructor(game, x, y, type, waveScale = 1.0) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type; // grunt, tank, sniper, striker, drone, kamikaze, boss
    this.waveScale = waveScale; // scales health/damage based on wave

    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.radius = 20;
    this.color = 'var(--neon-red)';
    
    this.damageFlash = 0;
    this.stunTimer = 0;
    this.isDead = false;
    this.empHitRegistry = false; // prevents multi-hits from single EMP blast
    
    // Steering behaviors settings
    this.maxForce = 250;
    this.separationDist = 45;
    this.avoidForceFactor = 150;

    this.initStats();
  }

  initStats() {
    // Override in subclasses, base parameters:
    this.maxHp = 25 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 140;
    this.damage = 10 * this.waveScale;
    
    this.scoreReward = 100;
    this.creditsReward = 10;
    this.xpReward = 15;
    
    this.cooldown = 2.0;
    this.fireTimer = Math.random() * 1.5; // randomize first shot
  }

  takeDamage(amount, isCrit) {
    if (this.isDead) return;
    
    this.hp -= amount;
    this.damageFlash = 0.15;
    this.game.audio.playHit();
    
    // Floating damage numbers
    if (this.game.saveData.settings.damageNumbersEnabled) {
      this.game.uiEffects.spawnDamageFloat(this.x, this.y - 20, amount, isCrit);
    }
    
    // Spark effects
    this.game.particles.spawnSparkDebris(this.x, this.y, isCrit ? 10 : 5, isCrit ? 'var(--neon-yellow)' : this.color);
    
    if (this.hp <= 0) {
      this.die();
    }
  }

  applyStun(duration) {
    this.stunTimer = duration;
    this.damageFlash = duration; // reuse flash to show disabled glitched color
  }

  isStunned() {
    return this.stunTimer > 0;
  }

  die() {
    this.isDead = true;
    this.game.audio.playExplosion(false);
    
    // Spawns explosion debris
    this.game.particles.spawnExplosionSparks(this.x, this.y, this.color, 12);
    this.game.camera.addTrauma(0.12);

    // Score & kills counters
    this.game.score += this.scoreReward * this.game.player.combo;
    this.game.kills++;
    this.game.player.addCombo();
    
    // Float score gain text
    this.game.uiEffects.spawnScoreFloat(this.x, this.y - 20, `+${this.scoreReward * this.game.player.combo}`);

    // Drop pickup resource (100% Drop Rate with increased and randomized rewards!)
    const roll = Math.random();
    let pickupType = 'xp';
    let pickupVal = Math.round(this.xpReward * (1.2 + Math.random() * 0.6)); // +20% base increase + random variance

    if (roll < 0.45) {
      pickupType = 'credits';
      pickupVal = Math.round(this.creditsReward * (1.5 + Math.random() * 0.8)); // +50% base increase + random variance
    } else if (roll < 0.62) { // 17% chance of dropping powerups!
      const powerupsPool = ['health', 'shield', 'rapidFire', 'spreadShot', 'damageBoost', 'magnet', 'overdrive'];
      pickupType = powerupsPool[Math.floor(Math.random() * powerupsPool.length)];
      pickupVal = 1; // standard count
    }

    // Spawn reward
    const creditBonus = Math.floor(pickupVal * (1 + (this.game.player.upgrades.utility - 1) * 0.1));
    this.game.pickups.push(new Pickup(this.game, this.x, this.y, pickupType, pickupType === 'credits' ? creditBonus : pickupVal));
  }

  update(player, dt) {
    if (this.isDead) return;

    // Handle tickers
    if (this.damageFlash > 0) this.damageFlash -= dt;
    
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      // Friction drift stop when stunned
      this.vx *= (1 - 4 * dt);
      this.vy *= (1 - 4 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return; // disabled updates
    }

    if (this.fireTimer > 0) this.fireTimer -= dt;

    // AI steering forces
    let steerX = 0;
    let steerY = 0;

    // 1. SEEK PLAYER FORCE
    const seek = this.getSeekForce(player.x, player.y);
    steerX += seek.x;
    steerY += seek.y;

    // 2. SEPARATION FROM OTHER ENEMIES FORCE
    const sep = this.getSeparationForce();
    steerX += sep.x * 1.5;
    steerY += sep.y * 1.5;

    // 3. OBSTACLE AVOIDANCE FORCE (Drones fly over boxes and ignore)
    if (this.type !== 'drone') {
      const avoid = this.getObstacleAvoidForce();
      steerX += avoid.x * 2.0;
      steerY += avoid.y * 2.0;
    }

    // Apply steer forces
    this.vx += steerX * dt;
    this.vy += steerY * dt;

    // Cap velocity
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.speed) {
      this.vx = (this.vx / speed) * this.speed;
      this.vy = (this.vy / speed) * this.speed;
    }

    // Apply displacement
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Point facing angle towards movement direction
    if (Math.hypot(this.vx, this.vy) > 10) {
      this.angle = Math.atan2(this.vy, this.vx);
    }

    // Call subclass firing routine
    this.shootRoutine(player, dt);
  }

  getSeekForce(tx, ty) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist === 0) return { x: 0, y: 0 };
    
    // Desired velocity pointing to target
    const desVx = (dx / dist) * this.speed;
    const desVy = (dy / dist) * this.speed;
    
    return {
      x: desVx - this.vx,
      y: desVy - this.vy
    };
  }

  getSeparationForce() {
    let forceX = 0;
    let forceY = 0;
    let count = 0;

    for (let other of this.game.enemies) {
      if (other === this || other.isDead) continue;
      
      const d = Math.hypot(other.x - this.x, other.y - this.y);
      if (d > 0 && d < this.separationDist) {
        const diffX = this.x - other.x;
        const diffY = this.y - other.y;
        
        forceX += diffX / d; // Weight by distance (closer is stronger)
        forceY += diffY / d;
        count++;
      }
    }

    if (count === 0) return { x: 0, y: 0 };
    
    forceX /= count;
    forceY /= count;
    
    const len = Math.hypot(forceX, forceY);
    if (len === 0) return { x: 0, y: 0 };
    
    return {
      x: (forceX / len) * this.speed - this.vx,
      y: (forceY / len) * this.speed - this.vy
    };
  }

  getObstacleAvoidForce() {
    let forceX = 0;
    let forceY = 0;
    let count = 0;

    for (let obs of this.game.arena.obstacles) {
      if (obs.isDead) continue;
      
      // Calculate distance to closest point on obstacle
      const cx = Math.max(obs.x, Math.min(this.x, obs.x + obs.width));
      const cy = Math.max(obs.y, Math.min(this.y, obs.y + obs.height));
      
      const d = Math.hypot(this.x - cx, this.y - cy);
      const detectionRadius = this.radius + 35; // warn before crashing
      
      if (d < detectionRadius && d > 0) {
        forceX += (this.x - cx) / d;
        forceY += (this.y - cy) / d;
        count++;
      }
    }

    if (count === 0) return { x: 0, y: 0 };
    
    const len = Math.hypot(forceX, forceY);
    return {
      x: (forceX / len) * this.speed,
      y: (forceY / len) * this.speed
    };
  }

  shootRoutine(player, dt) {
    // Override in subclasses
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 3, this.radius, 0, Math.PI*2);
    ctx.fill();

    // Flash colors on taking damage, or glitched purple when disabled/stunned
    if (this.isStunned() && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.strokeStyle = resolveColor('var(--neon-purple)');
      ctx.fillStyle = 'rgba(189, 0, 255, 0.2)';
    } else if (this.damageFlash > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    } else {
      ctx.strokeStyle = resolveColor(this.color);
      ctx.fillStyle = 'rgba(255, 0, 60, 0.03)';
    }

    ctx.lineWidth = 2;
    ctx.shadowBlur = this.game.saveData.settings.glowEnabled ? 8 : 0;
    ctx.shadowColor = ctx.strokeStyle;

    this.drawChassis(ctx);
    
    ctx.shadowBlur = 0;
    ctx.restore();

    this.drawCustomEffects(ctx);
  }

  drawChassis(ctx) {
    // Draw generic small diamond car chassis (overridden in subclasses)
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(6, -10);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-12, 10);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawCustomEffects(ctx) {
    // Subclass health bars or warning indicators
  }
}

// ==========================================
// 1. GRUNT CLASS (Fast Chase, Basic Gun)
// ==========================================
export class Grunt extends Enemy {
  initStats() {
    this.maxHp = 22 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 160;
    this.damage = 10 * this.waveScale;
    this.radius = 18;
    this.color = 'var(--neon-red)';
    this.scoreReward = 100;
    this.creditsReward = 5;
    this.xpReward = 10;
    
    this.cooldown = 1.6;
    this.fireTimer = 0.5 + Math.random() * 1.5;
  }

  shootRoutine(player, dt) {
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (dist < 400 && this.fireTimer <= 0) {
      this.fireTimer = this.cooldown;
      
      // Shoot small linear projectile
      const dir = Math.atan2(player.y - this.y, player.x - this.x);
      const vx = Math.cos(dir) * 450;
      const vy = Math.sin(dir) * 450;
      
      const p = new Projectile(this.game, this.x + Math.cos(dir)*18, this.y + Math.sin(dir)*18, vx, vy, this.damage, 2.5, 'var(--neon-red)', 'enemy', 'normal', 2.0, false);
      this.game.projectiles.push(p);
    }
  }

  drawChassis(ctx) {
    // Sleek delta wedge
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// ==========================================
// 2. TANK CLASS (Slow, Heavy Projectile Ring)
// ==========================================
export class Tank extends Enemy {
  initStats() {
    this.maxHp = 110 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 85;
    this.damage = 14 * this.waveScale;
    this.radius = 28;
    this.color = 'var(--neon-purple)';
    this.scoreReward = 250;
    this.creditsReward = 25;
    this.xpReward = 35;
    
    this.cooldown = 3.0;
    this.fireTimer = 1.0 + Math.random() * 2.0;
  }

  takeDamage(amount, isCrit) {
    // 25% innate damage reduction on hull
    const reducedAmount = Math.round(amount * 0.75);
    super.takeDamage(reducedAmount, isCrit);
  }

  shootRoutine(player, dt) {
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (dist < 500 && this.fireTimer <= 0) {
      this.fireTimer = this.cooldown;
      
      // Fire radial ring of 6 heavy bullets
      const count = 6;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count;
        const vx = Math.cos(angle) * 320;
        const vy = Math.sin(angle) * 320;
        
        const p = new Projectile(this.game, this.x + Math.cos(angle)*30, this.y + Math.sin(angle)*30, vx, vy, this.damage, 4.0, 'var(--neon-purple)', 'enemy', 'normal', 2.5, false);
        this.game.projectiles.push(p);
      }
      this.game.audio.playShoot('spread');
    }
  }

  drawChassis(ctx) {
    // Giant blocky tank shape
    ctx.beginPath();
    ctx.rect(-24, -18, 48, 36);
    ctx.fill();
    ctx.stroke();
    
    // Core ring indicator
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI*2);
    ctx.stroke();

    // Tread lines
    ctx.fillRect(-28, -22, 10, 4);
    ctx.fillRect(18, -22, 10, 4);
    ctx.fillRect(-28, 18, 10, 4);
    ctx.fillRect(18, 18, 10, 4);
  }
}

// ==========================================
// 3. SNIPER CLASS (Laser charge, movement prediction)
// ==========================================
export class Sniper extends Enemy {
  initStats() {
    this.maxHp = 35 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 110;
    this.damage = 30 * this.waveScale; // Heavy single shot
    this.radius = 20;
    this.color = 'var(--neon-yellow)';
    this.scoreReward = 200;
    this.creditsReward = 20;
    this.xpReward = 25;
    
    this.cooldown = 4.5;
    this.fireTimer = 2.0 + Math.random() * 2.0;

    // sniper charging variables
    this.chargeDuration = 1.4;
    this.chargeTimer = 0;
    this.isCharging = false;
    this.lockX = 0;
    this.lockY = 0;
  }

  update(player, dt) {
    if (this.isDead) return;

    if (this.isStunned()) {
      this.isCharging = false;
      this.chargeTimer = 0;
    }

    // Sniper maintains distance: flees if player gets too close, chases if too far
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    
    if (dist < 420 && !this.isCharging) {
      // Flee behavior
      this.speed = 140; // run faster away
      const seek = this.getSeekForce(player.x, player.y);
      // reverse seek vector
      this.vx -= seek.x * dt;
      this.vy -= seek.y * dt;
    } else {
      this.speed = 110;
      super.update(player, dt);
    }
  }

  shootRoutine(player, dt) {
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    
    if (dist < 800 && this.fireTimer <= 0 && !this.isCharging) {
      this.isCharging = true;
      this.chargeTimer = this.chargeDuration;
    }

    if (this.isCharging) {
      this.chargeTimer -= dt;
      
      // PREDICT player position based on player velocity vector
      const predictionCycles = 0.8; // look ahead 0.8 seconds
      this.lockX = player.x + player.vx * predictionCycles;
      this.lockY = player.y + player.vy * predictionCycles;
      
      // Face towards locking coordinates
      this.angle = Math.atan2(this.lockY - this.y, this.lockX - this.x);

      if (this.chargeTimer <= 0) {
        this.isCharging = false;
        this.fireTimer = this.cooldown;
        
        // Fire fast sniper ray bullet
        const dir = Math.atan2(this.lockY - this.y, this.lockX - this.x);
        const vx = Math.cos(dir) * 1200;
        const vy = Math.sin(dir) * 1200;
        
        const p = new Projectile(this.game, this.x + Math.cos(dir)*24, this.y + Math.sin(dir)*24, vx, vy, this.damage, 2.0, 'var(--neon-yellow)', 'enemy', 'normal', 1.5, false);
        this.game.projectiles.push(p);
        this.game.audio.playShoot('railgun');
      }
    }
  }

  drawChassis(ctx) {
    // Sleek long polygonal sniper chassis
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(2, -8);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-14, 8);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Long barrel barrel extending
    ctx.fillRect(8, -1.5, 14, 3);
  }

  drawCustomEffects(ctx) {
    if (this.isCharging && !this.isStunned()) {
      // Draw warning aim laser line
      ctx.save();
      ctx.strokeStyle = `rgba(255, 0, 60, ${0.1 + (Math.sin(Date.now() * 0.05) * 0.05 + 0.1) * (1 - this.chargeTimer/this.chargeDuration)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.lockX, this.lockY);
      ctx.stroke();
      
      // Target dot at end
      ctx.fillStyle = resolveColor('var(--neon-red)');
      ctx.beginPath();
      ctx.arc(this.lockX, this.lockY, 3, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ==========================================
// 4. STRIKER CLASS (Orbiter, Turbo Charger Ram)
// ==========================================
export class Striker extends Enemy {
  initStats() {
    this.maxHp = 45 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 130;
    this.damage = 18 * this.waveScale;
    this.radius = 18;
    this.color = 'var(--neon-cyan)';
    this.scoreReward = 180;
    this.creditsReward = 15;
    this.xpReward = 20;

    this.dashCooldown = 3.5;
    this.dashTimer = 0;
    this.dashActiveTimer = 0;
    this.isDashing = false;
  }

  update(player, dt) {
    if (this.isDead) return;

    if (this.isStunned()) {
      this.isDashing = false;
      this.dashActiveTimer = 0;
    }

    if (this.dashTimer > 0) this.dashTimer -= dt;

    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    
    // Charging Dash mechanic
    if (dist < 260 && this.dashTimer <= 0 && !this.isDashing && !this.isStunned()) {
      this.isDashing = true;
      this.dashActiveTimer = 0.6; // dash duration
      this.dashTimer = this.dashCooldown;
      this.game.audio.playBoost(true);
    }

    if (this.isDashing) {
      this.dashActiveTimer -= dt;
      this.speed = 340; // extreme acceleration spike
      
      // Seek directly to player during dash
      const seek = this.getSeekForce(player.x, player.y);
      this.vx += seek.x * dt * 4.0;
      this.vy += seek.y * dt * 4.0;
      
      // Spawn boost trail sparks
      if (Math.random() < 0.6) {
        this.game.particles.spawnParticle({
          x: this.x, y: this.y,
          vx: -this.vx*0.3 + (Math.random()*40-20), vy: -this.vy*0.3 + (Math.random()*40-20),
          color: 'var(--neon-cyan)',
          size: 2, life: 0.25, glow: true
        });
      }

      if (this.dashActiveTimer <= 0) {
        this.isDashing = false;
        this.game.audio.playBoost(false);
      }

      // Linear motion translation
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.speed = 130;
      // Orbit around player slightly instead of direct chase (add tangent sideways velocity)
      super.update(player, dt);
      
      if (!this.isStunned()) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          // Add perpendicular vector (tangent orbiting slip)
          const tx = -dy / dist;
          const ty = dx / dist;
          this.vx += tx * 40 * dt;
          this.vy += ty * 40 * dt;
        }
      }
    }
  }

  drawChassis(ctx) {
    // Sleek dual-spiked racer
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(4, -12);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 8);
    ctx.lineTo(4, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Spoiler
    ctx.fillRect(-16, -10, 4, 20);
  }
}

// ==========================================
// 5. DRONE CLASS (Flies over obstacles, weave)
// ==========================================
export class Drone extends Enemy {
  initStats() {
    this.maxHp = 18 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 145;
    this.damage = 8 * this.waveScale;
    this.radius = 16;
    this.color = 'var(--neon-green)';
    this.scoreReward = 120;
    this.creditsReward = 8;
    this.xpReward = 12;

    this.cooldown = 1.3;
    this.fireTimer = 0.5 + Math.random() * 1.5;
    this.waveTime = Math.random() * Math.PI * 2;
  }

  update(player, dt) {
    if (this.isDead) return;
    
    this.waveTime += dt * 5.0; // weaving frequency
    
    super.update(player, dt);
    
    // Add sinus weaving motion perpendicular to flight direction
    if (!this.isStunned()) {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 10) {
        const perpX = -this.vy / speed;
        const perpY = this.vx / speed;
        const weaveIntensity = Math.sin(this.waveTime) * 120;
        
        this.x += perpX * weaveIntensity * dt;
        this.y += perpY * weaveIntensity * dt;
      }
    }
  }

  shootRoutine(player, dt) {
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (dist < 380 && this.fireTimer <= 0) {
      this.fireTimer = this.cooldown;
      
      const dir = Math.atan2(player.y - this.y, player.x - this.x);
      const vx = Math.cos(dir) * 480;
      const vy = Math.sin(dir) * 480;
      
      const p = new Projectile(this.game, this.x, this.y, vx, vy, this.damage, 2.0, 'var(--neon-green)', 'enemy', 'normal', 1.8, false);
      this.game.projectiles.push(p);
    }
  }

  drawChassis(ctx) {
    // Quadcopter circular rotor chassis
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Rotors lines
    ctx.beginPath();
    ctx.moveTo(-14, -14); ctx.lineTo(14, 14);
    ctx.moveTo(14, -14); ctx.lineTo(-14, 14);
    ctx.stroke();

    // Rotor circular blades
    const offsets = [ {x:-14, y:-14}, {x:14, y:-14}, {x:14, y:14}, {x:-14, y:14} ];
    offsets.forEach(o => {
      ctx.beginPath();
      ctx.arc(o.x, o.y, 4, 0, Math.PI*2);
      ctx.stroke();
    });
  }
}

// ==========================================
// 6. KAMIKAZE CLASS (Self-destruct bomb fuse)
// ==========================================
export class Kamikaze extends Enemy {
  initStats() {
    this.maxHp = 15 * this.waveScale;
    this.hp = this.maxHp;
    this.speed = 195; // Extremely fast
    this.damage = 38 * this.waveScale; // Severe blast damage
    this.radius = 16;
    this.color = 'var(--neon-magenta)';
    this.scoreReward = 150;
    this.creditsReward = 10;
    this.xpReward = 18;

    this.fuseDuration = 0.75;
    this.fuseTimer = 0;
    this.isTriggered = false;
  }

  update(player, dt) {
    if (this.isDead) return;

    if (this.isStunned()) {
      this.isTriggered = false;
      this.fuseTimer = 0;
      this.color = 'var(--neon-magenta)';
    }

    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    
    // Trigger detonation fuse when near player
    if (dist < 80 && !this.isTriggered && !this.isStunned()) {
      this.isTriggered = true;
      this.fuseTimer = this.fuseDuration;
      this.vx = 0; // stop moving to detonate
      this.vy = 0;
      this.speed = 0;
      this.game.audio.playSFX(220, 880, this.fuseDuration, 'sawtooth', 0.25); // build alarm squeal
    }

    if (this.isTriggered) {
      this.fuseTimer -= dt;
      
      // detonate flashing colors rapidly
      this.color = Math.floor(Date.now() / 60) % 2 === 0 ? '#fff' : 'var(--neon-red)';
      
      if (this.fuseTimer <= 0) {
        this.detonate();
      }
    } else {
      super.update(player, dt);
    }
  }

  detonate() {
    this.isDead = true;
    this.game.audio.playExplosion(false);
    this.game.camera.addTrauma(0.4);
    
    // Spawn massive fiery ring expansion
    this.game.particles.spawnExplosionSparks(this.x, this.y, 'var(--neon-red)', 20);
    this.game.particles.spawnShieldPulse(this.x, this.y, 90, 'var(--neon-red)');

    const blastRadius = 100;
    const dist = Math.hypot(this.game.player.x - this.x, this.game.player.y - this.y);
    
    if (dist < blastRadius) {
      // damage based on distance
      const factor = 1 - (dist / blastRadius);
      this.game.player.takeDamage(Math.round(this.damage * factor));
    }

    // Remove from active list
    const index = this.game.enemies.indexOf(this);
    if (index !== -1) {
      this.game.enemies.splice(index, 1);
    }
  }

  drawChassis(ctx) {
    // Spiky spherical mine shape
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Mine spikes
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      ctx.moveTo(Math.cos(angle)*11, Math.sin(angle)*11);
      ctx.lineTo(Math.cos(angle)*16, Math.sin(angle)*16);
    }
    ctx.stroke();
  }
}
