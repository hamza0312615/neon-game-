import { Projectile } from './Projectile.js';

export class Weapon {
  constructor(game, id, upgradeLevel = 1) {
    this.game = game;
    this.id = id;
    this.level = upgradeLevel;
    
    this.timer = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    
    // Laser heat mechanics
    this.heat = 0;
    this.maxHeat = 100;
    this.overheated = false;
    this.isFiringLaser = false;

    this.initStats();
  }

  initStats() {
    const mult = (1 + (this.level - 1) * 0.15); // +15% damage per level
    const cooldownMult = Math.max(0.4, 1 - (this.level - 1) * 0.055); // -5.5% cd per level (max 60% reduction)

    switch (this.id) {
      case 'plasma':
        this.name = 'Plasma Cannon';
        this.baseCooldown = 0.18;
        this.cooldown = this.baseCooldown * cooldownMult;
        this.damage = Math.round(12 * mult);
        this.projSpeed = 650;
        this.maxAmmo = 30;
        this.ammo = this.maxAmmo;
        this.reloadTime = 1.2;
        this.critChance = 0.08;
        this.spread = 0.04; // radians
        this.recoil = 8;
        break;

      case 'spread':
        this.name = 'Spread Blaster';
        this.baseCooldown = 0.42;
        this.cooldown = this.baseCooldown * cooldownMult;
        this.damage = Math.round(9 * mult); // 9 * 3 bullets = 27 damage total
        this.projSpeed = 550;
        this.maxAmmo = 12;
        this.ammo = this.maxAmmo;
        this.reloadTime = 1.6;
        this.critChance = 0.05;
        this.spread = 0.22; // wide spread
        this.recoil = 22;
        break;

      case 'railgun':
        this.name = 'Hyper Railgun';
        this.baseCooldown = 1.35;
        this.cooldown = this.baseCooldown * cooldownMult;
        this.damage = Math.round(75 * mult);
        this.projSpeed = 1600;
        this.maxAmmo = 5;
        this.ammo = this.maxAmmo;
        this.reloadTime = 2.0;
        this.critChance = 0.25; // high critical
        this.spread = 0.0;
        this.recoil = 90;
        break;

      case 'missile':
        this.name = 'Seeker Missiles';
        this.baseCooldown = 0.75;
        this.cooldown = this.baseCooldown * cooldownMult;
        this.damage = Math.round(35 * mult);
        this.projSpeed = 400;
        this.maxAmmo = 8;
        this.ammo = this.maxAmmo;
        this.reloadTime = 1.8;
        this.critChance = 0.1;
        this.spread = 0.15;
        this.recoil = 30;
        break;

      case 'laser':
        this.name = 'Thermal Laser';
        this.baseCooldown = 0.05; // ticks fast
        this.cooldown = this.baseCooldown;
        this.damage = Math.round(2.8 * mult); // ticks continuously
        this.projSpeed = 1800;
        this.maxAmmo = 99999; // Laser uses heat instead of ammo
        this.ammo = this.maxAmmo;
        this.reloadTime = 0.1;
        this.critChance = 0.04;
        this.spread = 0.01;
        this.recoil = 1;
        break;

      case 'emp':
        this.name = 'EMP Crusher';
        this.baseCooldown = 2.2;
        this.cooldown = this.baseCooldown * cooldownMult;
        this.damage = Math.round(25 * mult);
        this.projSpeed = 250; // shockwave expansion speed
        this.maxAmmo = 4;
        this.ammo = this.maxAmmo;
        this.reloadTime = 2.4;
        this.critChance = 0.02;
        this.spread = 0;
        this.recoil = 5;
        break;
    }
  }

  update(dt) {
    if (this.timer > 0) this.timer -= dt;

    // Handle weapon reload sequence
    if (this.reloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.reloadTime) {
        this.ammo = this.maxAmmo;
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }

    // Laser cooling mechanics
    if (this.id === 'laser') {
      if (!this.isFiringLaser) {
        // Cool down if not firing
        const coolingRate = this.overheated ? 30 : 50; // cools slower if overheated
        this.heat = Math.max(0, this.heat - coolingRate * dt);
        if (this.overheated && this.heat === 0) {
          this.overheated = false;
        }
      }
      this.isFiringLaser = false; // Reset every frame; set back to true if fired
    }
  }

  stopContinuousLaser() {
    this.isFiringLaser = false;
  }

  fire(x, y, angle, carVx, carVy, dmgMult, fireRateMult, spreadShotPowerup) {
    if (this.reloading || this.timer > 0) return;
    
    // Laser heat validation
    if (this.id === 'laser') {
      this.isFiringLaser = true;
      if (this.overheated) return;
      
      this.heat += 1.8; // increase heat per tick
      if (this.heat >= this.maxHeat) {
        this.overheated = true;
        this.heat = this.maxHeat;
        this.game.audio.playExplosion(false); // short static pop
        return;
      }
    }

    // Normal Ammo validation
    if (this.id !== 'laser') {
      if (this.ammo <= 0) {
        this.reloading = true;
        this.reloadTimer = 0;
        return;
      }
      this.ammo--;
    }

    // Set cooldown timer
    this.timer = this.cooldown / fireRateMult;
    
    // Apply recoil to player car
    this.game.player.recoilForce = this.recoil * 0.9;
    
    // Play SFX hook
    this.game.audio.playShoot(this.id);
    
    // Spawn camera muzzle shake
    const cameraShakeTrauma = this.id === 'railgun' ? 0.35 : (this.id === 'missile' ? 0.15 : 0.03);
    this.game.camera.addTrauma(cameraShakeTrauma);

    // Calculate critical status
    const isCrit = Math.random() < (this.critChance * this.game.player.criticalChanceMultiplier);
    const finalDamage = Math.round(this.damage * dmgMult * (isCrit ? 2.5 : 1.0));

    // Determine bullets to fire
    let fireAngles = [];
    if (this.id === 'spread') {
      // Spread blaster shoots 3 projectiles normally, 5 if spread power-up active
      const count = spreadShotPowerup ? 5 : 3;
      const step = this.spread;
      const start = -(count - 1) * step / 2;
      for (let i = 0; i < count; i++) {
        fireAngles.push(angle + start + i * step);
      }
    } else if (spreadShotPowerup && (this.id === 'plasma' || this.id === 'railgun' || this.id === 'missile')) {
      // Normal weapons shoot 3 bullets in spread configuration if spread power-up active
      fireAngles = [angle - 0.15, angle, angle + 0.15];
    } else {
      // Standard single shot
      const actualSpread = this.spread > 0 ? (Math.random() * this.spread - this.spread / 2) : 0;
      fireAngles = [angle + actualSpread];
    }

    // Create projectile instances
    fireAngles.forEach(a => {
      // Spawns from tip of barrel (approx 20px forward in angle direction)
      const spawnX = x + Math.cos(a) * 22;
      const spawnY = y + Math.sin(a) * 22;
      
      const pVx = Math.cos(a) * this.projSpeed + carVx * 0.3; // inherit partial vehicle momentum
      const pVy = Math.sin(a) * this.projSpeed + carVy * 0.3;

      let projectileType = 'normal';
      let color = 'var(--neon-cyan)';
      let size = 3;
      let life = 1.5;

      if (this.id === 'railgun') {
        projectileType = 'pierce';
        color = 'var(--neon-magenta)';
        size = 5.5;
        life = 0.8;
      } else if (this.id === 'missile') {
        projectileType = 'homing';
        color = 'var(--neon-yellow)';
        size = 4.5;
        life = 3.0;
      } else if (this.id === 'laser') {
        projectileType = 'laser_beam';
        color = 'var(--neon-green)';
        size = 3.5;
        life = 0.05;
      } else if (this.id === 'emp') {
        projectileType = 'emp_blast';
        color = 'var(--neon-purple)';
        size = 10; // initial radius of shockwave
        life = 0.6; // expands rapidly and dies
      }

      const proj = new Projectile(this.game, spawnX, spawnY, pVx, pVy, finalDamage, size, color, 'player', projectileType, life, isCrit);
      
      if (this.id === 'emp') {
        proj.vx = 0; // EMP rings expand statically centered
        proj.vy = 0;
        proj.x = x; // Lock to player center
        proj.y = y;
      }

      this.game.projectiles.push(proj);
      
      // Spawn tiny muzzle spark particles
      this.game.particles.spawnMuzzleFlash(spawnX, spawnY, a, color);
    });
  }
}
