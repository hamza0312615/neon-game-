import { Projectile } from './Projectile.js';
import { Weapon } from './Weapons.js';
import { resolveColor } from '../engine/Colors.js';

export class Player {
  constructor(game, x, y, upgrades) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.radius = 24; // Collision radius
    
    // Parse garage upgrades
    this.upgrades = upgrades;
    this.initStats();

    // Movement physics variables
    this.vx = 0;
    this.vy = 0;
    this.angle = 0; // facing direction in radians
    
    this.boostEnergy = this.maxBoostEnergy;
    this.isBoosting = false;
    this.boostCooldown = 0;

    // Drifting state
    this.isDrifting = false;
    this.driftTime = 0;
    this.driftScore = 0;
    this.skidMarks = []; // Stores point history for skid lines
    
    // Independent Turret rotation
    this.turretAngle = 0;
    this.recoilForce = 0;
    
    // Animation properties
    this.wheelAngle = 0;
    this.recoilAnim = 0;
    
    // Combo multiplier
    this.combo = 1;
    this.comboTimer = 0;
    this.comboDuration = 4.0; // seconds

    // Damage & flash fx
    this.damageFlash = 0;
    this.shieldFlash = 0;
    this.shieldCooldown = 0;

    // Weapon slots
    this.weapons = [
      new Weapon(game, 'plasma', upgrades.weapon),
      new Weapon(game, 'spread', upgrades.weapon),
      new Weapon(game, 'railgun', upgrades.weapon),
      new Weapon(game, 'missile', upgrades.weapon),
      new Weapon(game, 'laser', upgrades.weapon),
      new Weapon(game, 'emp', upgrades.weapon)
    ];
    
    // Equip selected weapon from garage
    const selectedWeapon = this.game?.saveData?.progression?.activeWeapon || 'plasma';
    this.activeWeaponIndex = this.weapons.findIndex(w => w.id === selectedWeapon);
    if (this.activeWeaponIndex === -1) this.activeWeaponIndex = 0;

    // Perk Power-ups multipliers
    this.damageMultiplier = 1.0;
    this.speedMultiplier = 1.0;
    this.fireRateMultiplier = 1.0;
    this.criticalChanceMultiplier = 1.0;
    this.armorBonus = 0;

    // Active power-up timers
    this.powerups = {
      rapidFire: 0,
      spreadShot: 0,
      damageBoost: 0,
      magnet: 0,
      overdrive: 0
    };
  }

  isWeaponUnlocked(weaponId) {
    const unlockWaves = { plasma: 0, spread: 3, railgun: 7, missile: 12, laser: 16, emp: 20 };
    const reqWave = unlockWaves[weaponId] || 0;
    return (this.game?.saveData?.progression?.highestWave || 1) >= reqWave;
  }

  cycleWeapon(dir = 1) {
    let nextIdx = this.activeWeaponIndex;
    for (let i = 0; i < this.weapons.length; i++) {
      nextIdx = (nextIdx + dir + this.weapons.length) % this.weapons.length;
      if (this.isWeaponUnlocked(this.weapons[nextIdx].id)) {
        this.selectWeaponIndex(nextIdx);
        break;
      }
    }
  }

  selectWeaponIndex(index) {
    if (index < 0 || index >= this.weapons.length) return;
    const targetWeapon = this.weapons[index];
    if (!this.isWeaponUnlocked(targetWeapon.id)) return;

    if (this.activeWeaponIndex !== index) {
      this.activeWeaponIndex = index;
      this.game.saveData.progression.activeWeapon = targetWeapon.id;
      this.game.audio.playUIClick();
      this.game.uiEffects.spawnScoreFloat(this.x, this.y - 45, `EQUIPPED: ${targetWeapon.name.toUpperCase()}`, 'var(--neon-green)');
    }
  }

  initStats() {
    const getVal = (cat, base, step) => base + (this.upgrades[cat] - 1) * step;

    // Max HP: Lvl 1 = 100, Lvl 10 = 235
    this.maxHp = getVal('armor', 100, 15);
    this.hp = this.maxHp;

    // Armor reduction: Lvl 1 = 15%, Lvl 10 = 45% (factor of 0.85 to 0.55 damage taken)
    this.armorReduction = 1 - (getVal('armor', 15, 3.3) / 100);

    // Max Shield: Lvl 1 = 50, Lvl 10 = 140
    this.maxShield = getVal('shield', 50, 10);
    this.shield = this.maxShield;
    
    // Shield recharge per sec: Lvl 1 = 5, Lvl 10 = 14
    this.shieldRechargeRate = getVal('shield', 5, 1);

    // Engine Speed: Lvl 1 = 320 max, Lvl 10 = 500 max (slight speed boost)
    this.baseMaxSpeed = getVal('engine', 320, 20);
    this.maxSpeed = this.baseMaxSpeed;

    // Engine Acceleration: Lvl 1 = 560, Lvl 10 = 1010 (snappier speed up)
    this.accelerationRate = getVal('engine', 560, 50);

    // Boost Capacity: Lvl 1 = 100, Lvl 10 = 235
    this.maxBoostEnergy = getVal('boost', 100, 15);
    this.boostDrainRate = 50; // Units per second
    
    // Boost Recharge Rate: Lvl 1 = 15, Lvl 10 = 42 per second
    this.boostRechargeRate = getVal('boost', 15, 3);

    // Handling: Lvl 1 = 4.5 turn rate, Lvl 10 = 6.3 turn rate (snappier steering)
    this.turnSpeed = getVal('handling', 4.5, 0.2);
    // Drift control slides (drift slip value): lower level slides more, higher level grips better
    this.driftGrip = 0.90 + ((this.upgrades.handling - 1) * 0.007); // Lvl 1 = 0.90, Lvl 10 = 0.963

    // Utility: Pickup Radius: Lvl 1 = 80px, Lvl 10 = 260px
    this.pickupRadius = getVal('utility', 80, 20);
    // XP Multiplier: Lvl 1 = 1.0, Lvl 10 = 1.9
    this.xpMultiplier = 1.0 + ((this.upgrades.utility - 1) * 0.1);

    // XP and level progression
    this.level = 1;
    this.xp = 0;
  }

  getXpNeeded() {
    return Math.round(50 * Math.pow(1.25, this.level - 1));
  }

  addXp(amount) {
    const gained = amount * this.xpMultiplier;
    this.xp += gained;
    
    const needed = this.getXpNeeded();
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      
      // Spawn massive glowing level-up blast wave that deals 60 damage and pushes back all enemies!
      const levelUpBlast = new Projectile(this.game, this.x, this.y, 0, 0, 60, 30, 'var(--neon-purple)', 'player', 'emp_blast', 0.8, false);
      levelUpBlast.empMaxRadius = 450; // huge expanding ring
      this.game.projectiles.push(levelUpBlast);
      this.game.camera.addTrauma(0.65); // heavy screen shake

      this.game.audio.playLevelUp();
      this.triggerLevelUpChoices();
    }
  }

  triggerLevelUpChoices() {
    // Generate 3 random perks
    const pool = [
      {
        title: "💥 KINETIC OVERLOAD",
        description: "Increase projectile damage by 20%.",
        bonusText: "+20% DAMAGE",
        action: (p) => p.damageMultiplier += 0.2
      },
      {
        title: "🔥 HYPERCOOLING CHASSIS",
        description: "Reduce weapon cooldown/increase fire rate.",
        bonusText: "+15% FIRE RATE",
        action: (p) => p.fireRateMultiplier += 0.15
      },
      {
        title: "🚀 LIGHTNING INJECTORS",
        description: "Increase maximum vehicle driving speed.",
        bonusText: "+12% SPEED",
        action: (p) => {
          p.speedMultiplier += 0.12;
          p.maxSpeed = p.baseMaxSpeed * p.speedMultiplier;
        }
      },
      {
        title: "🎯 REACTION MATRIX",
        description: "Improve critical hit chance of all guns.",
        bonusText: "+8% CRITICAL CHANCE",
        action: (p) => p.criticalChanceMultiplier += 0.08
      },
      {
        title: "🛡️ NANO-REINFORCED PLATING",
        description: "Reduce all incoming hull damage by 5%.",
        bonusText: "+5% ARMOR ABS",
        action: (p) => p.armorReduction = Math.max(0.3, p.armorReduction - 0.05)
      },
      {
        title: "⚡ SHIELD MATRIX STACK",
        description: "Increase shield capacity immediately.",
        bonusText: "+30 SHIELD CAP",
        action: (p) => {
          p.maxShield += 30;
          p.shield = p.maxShield;
        }
      },
      {
        title: "💖 CELL REPAIR FIELD",
        description: "Regenerate 15 Hull integrity points.",
        bonusText: "+15 HP REPAIR",
        action: (p) => p.hp = Math.min(p.maxHp, p.hp + 15)
      },
      {
        title: "🧲 MAGNETIC PULSER",
        description: "Permanently extend item pick up range.",
        bonusText: "+40 PX RADIUS",
        action: (p) => p.pickupRadius += 40
      }
    ];

    // Pick 3 unique randomly
    const shuffled = pool.sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);
    
    this.game.levelUp(choices);
  }

  takeDamage(amount) {
    if (this.powerups.overdrive > 0) return; // Invulnerable in overdrive!

    // Resets shield recharge timer
    this.shieldCooldown = 4.0;
    
    if (this.shield > 0) {
      this.shieldFlash = 0.2;
      this.game.audio.playShieldHit();
      this.game.particles.spawnShieldPulse(this.x, this.y, this.radius, 'cyan');
      
      this.shield -= amount;
      if (this.shield < 0) {
        const excess = Math.abs(this.shield);
        this.shield = 0;
        // Excess goes through armor
        this.hp -= excess * this.armorReduction;
        this.damageFlash = 0.3;
        this.game.audio.playHit();
      }
    } else {
      this.hp -= amount * this.armorReduction;
      this.damageFlash = 0.3;
      this.game.audio.playHit();
      this.game.particles.spawnSparkDebris(this.x, this.y, 8, 'red');
    }

    // Camera trauma
    this.game.camera.addTrauma(amount / 40);
  }

  addCombo() {
    this.combo++;
    this.comboTimer = this.comboDuration;
    if (this.combo > this.game.bestCombo) {
      this.game.bestCombo = this.combo;
    }
  }

  update(input, dt) {
    // 1. Process active power-ups tickers
    for (let key in this.powerups) {
      if (this.powerups[key] > 0) {
        this.powerups[key] = Math.max(0, this.powerups[key] - dt);
        if (key === 'overdrive' && this.powerups[overdrive] === 0) {
          this.maxSpeed = this.baseMaxSpeed * this.speedMultiplier;
        }
      }
    }

    // 2. Shield regeneration delay cooldowns
    if (this.shieldCooldown > 0) {
      this.shieldCooldown -= dt;
    } else if (this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRechargeRate * dt);
    }

    // 3. Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
      }
    }

    // 4. Damage indicators timers
    if (this.damageFlash > 0) this.damageFlash -= dt;
    if (this.shieldFlash > 0) this.shieldFlash -= dt;
    if (this.boostCooldown > 0) this.boostCooldown -= dt;

    // 5. BOOSTER Turbo trigger
    const wantBoost = input.isBoosting() && this.boostEnergy > 10 && this.boostCooldown <= 0;
    
    if (wantBoost) {
      if (!this.isBoosting) {
        this.isBoosting = true;
        this.game.audio.playBoost(true);
        this.game.camera.targetZoom = 0.88; // Zoom out to see ahead
      }
      this.boostEnergy = Math.max(0, this.boostEnergy - this.boostDrainRate * dt);
      if (this.boostEnergy <= 0) {
        this.isBoosting = false;
        this.boostCooldown = 2.0; // penalty cooldown for draining it fully
        this.game.audio.playBoost(false);
        this.camera.targetZoom = 1.0;
      }
    } else {
      if (this.isBoosting) {
        this.isBoosting = false;
        this.game.audio.playBoost(false);
        this.game.camera.targetZoom = 1.0;
      }
      // Recharging boost (faster if drifting!)
      const rechargeFactor = this.isDrifting ? 2.5 : 1.0;
      this.boostEnergy = Math.min(this.maxBoostEnergy, this.boostEnergy + this.boostRechargeRate * rechargeFactor * dt);
    }

    // If Overdrive active, force infinite boost and override max speed
    if (this.powerups.overdrive > 0) {
      this.boostEnergy = this.maxBoostEnergy;
      this.isBoosting = true;
      this.maxSpeed = this.baseMaxSpeed * 1.6;
    } else {
      this.maxSpeed = (this.isBoosting ? this.baseMaxSpeed * 1.5 : this.baseMaxSpeed) * this.speedMultiplier;
    }

    // 6. 2D VEHICLE PHYSICS & MOVEMENT
    // Steering controls (rotates chassis angle)
    if (input.isTurningLeft()) {
      this.angle -= this.turnSpeed * dt;
      if (this.tutorialActive) this.game.advanceTutorial(0);
    }
    if (input.isTurningRight()) {
      this.angle += this.turnSpeed * dt;
      if (this.tutorialActive) this.game.advanceTutorial(0);
    }

    // Acceleration & Braking inputs
    let throttle = 0;
    if (input.isAccelerating()) {
      throttle = 1.0;
      if (this.tutorialActive) this.game.advanceTutorial(0);
    } else if (input.isReversing()) {
      throttle = -1.0; // faster braking / reverse speed
      if (this.tutorialActive) this.game.advanceTutorial(0);
    }

    // Forward drive vector direction
    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    
    // Right hand vector direction (orthogonal to car direction)
    const rightX = -Math.sin(this.angle);
    const rightY = Math.cos(this.angle);

    // Project current velocity vector onto forward/sideways axis
    const speedForward = this.vx * forwardX + this.vy * forwardY;
    const speedRight = this.vx * rightX + this.vy * rightY;

    // Apply engine acceleration force
    let currentAcc = throttle * this.accelerationRate;
    if (this.isBoosting) currentAcc *= 1.8;

    // Update forward speed
    let nextSpeedForward = speedForward + currentAcc * dt;
    
    // Cap forward speed to max speed
    if (nextSpeedForward > this.maxSpeed) nextSpeedForward = this.maxSpeed;
    if (nextSpeedForward < -this.maxSpeed * 0.4) nextSpeedForward = -this.maxSpeed * 0.4;

    // Apply natural rolling resistance (friction)
    // Tighter engine braking when releasing throttle, heavier braking on reversing
    const rollingResistance = throttle === 0 ? 0.85 : (throttle < 0 ? 1.6 : 0.25);
    nextSpeedForward *= (1 - rollingResistance * dt);

    // Apply lateral grip constraints (sideways friction)
    // Drifting occurs if steering hard at high speed
    const turnRateAbs = Math.abs(input.isTurningRight() - input.isTurningLeft());
    const isHardSteering = turnRateAbs > 0.5 && Math.abs(speedForward) > 150;
    
    let lateralSlip = this.driftGrip;
    
    if (isHardSteering) {
      this.isDrifting = true;
      lateralSlip = 0.985; // Low friction sideways slide
      
      this.driftTime += dt;
      // Spawn tire tracks coordinates
      this.spawnSkidMarks(rightX, rightY);
      
      this.game.audio.playDrift(true);
      
      // Award points for drifting
      this.driftScore += Math.floor(100 * dt);
      if (this.driftTime > 1.0) {
        this.game.uiEffects.spawnScoreFloat(this.x, this.y - 30, `DRIFT +${Math.round(this.driftScore)}`);
        this.game.score += Math.round(this.driftScore);
        this.driftScore = 0;
      }
    } else {
      if (this.isDrifting) {
        this.isDrifting = false;
        this.driftTime = 0;
        this.driftScore = 0;
        this.game.audio.playDrift(false);
      }
    }

    // Update sideways speed using lateral slip dampening
    const nextSpeedRight = speedRight * (1 - (1 - lateralSlip) * 10 * dt);

    // Reconstruct velocity vectors
    this.vx = forwardX * nextSpeedForward + rightX * nextSpeedRight;
    this.vy = forwardY * nextSpeedForward + rightY * nextSpeedRight;

    // Recoil forces pushed back
    if (this.recoilForce > 0) {
      this.vx -= Math.cos(this.turretAngle) * this.recoilForce;
      this.vy -= Math.sin(this.turretAngle) * this.recoilForce;
      this.recoilForce = 0;
    }

    // Apply displacement velocity to coordinates
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Clamp coordinates inside Arena borders
    const margin = this.radius + 10;
    if (this.x < margin) { this.x = margin; this.vx = 0; }
    if (this.x > this.game.arena.width - margin) { this.x = this.game.arena.width - margin; this.vx = 0; }
    if (this.y < margin) { this.y = margin; this.vy = 0; }
    if (this.y > this.game.arena.height - margin) { this.y = this.game.arena.height - margin; this.vy = 0; }

    // 7. BOOST & ENGINE SPARK PARTICLES
    if (this.isBoosting && Math.random() < (this.powerups.overdrive > 0 ? 0.8 : 0.4)) {
      // Emit exhaust spark particles backwards
      const backAngle = this.angle + Math.PI;
      const spreadAngle = backAngle + (Math.random() * 0.4 - 0.2);
      const exX = this.x - Math.cos(this.angle) * this.radius;
      const exY = this.y - Math.sin(this.angle) * this.radius;
      
      const speed = 100 + Math.random() * 150;
      this.game.particles.spawnParticle({
        x: exX,
        y: exY,
        vx: Math.cos(spreadAngle) * speed + this.vx,
        vy: Math.sin(spreadAngle) * speed + this.vy,
        color: this.powerups.overdrive > 0 ? 'var(--neon-yellow)' : 'var(--neon-magenta)',
        size: 3 + Math.random() * 4,
        life: 0.3 + Math.random() * 0.3,
        glow: true
      });
    }

    // 8. Aim turret independently (With Smart Auto-Aim)
    // Track mouse movement to determine manual vs auto-aim
    const mouseMoved = this.lastMouseX !== undefined && 
                       (Math.abs(input.mouse.x - this.lastMouseX) > 2 || 
                        Math.abs(input.mouse.y - this.lastMouseY) > 2);
    
    this.lastMouseX = input.mouse.x;
    this.lastMouseY = input.mouse.y;

    if (mouseMoved || input.mouse.isDown) {
      this.manualAimTimer = 1.8; // keep manual aiming for 1.8 seconds after mouse movement
    } else if (this.manualAimTimer > 0) {
      this.manualAimTimer -= dt;
    }

    let targetTurretAngle = this.angle;
    
    // Find closest enemy within range
    let closestEnemy = null;
    let minDist = 750; // max auto-aim range
    for (let e of this.game.enemies) {
      if (e.isDead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < minDist) {
        minDist = d;
        closestEnemy = e;
      }
    }
    this.targetEnemy = closestEnemy;

    if (input.touchActive) {
      // Touch: Auto-aim closest enemy. If aiming by touching the right side, manual override.
      const rect = this.game.canvas.getBoundingClientRect();
      const hasTouchAim = input.mouse.screenX >= rect.width * 0.45;
      
      if (hasTouchAim) {
        const mouseWorld = this.game.camera.screenToWorld(input.mouse.x, input.mouse.y);
        targetTurretAngle = Math.atan2(mouseWorld.y - this.y, mouseWorld.x - this.x);
      } else if (closestEnemy) {
        targetTurretAngle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x);
      } else {
        targetTurretAngle = this.angle;
      }
    } else {
      // Desktop: Manual mouse aim if moving mouse or shooting, otherwise auto-lock nearest
      if (this.manualAimTimer > 0) {
        const mouseWorld = this.game.camera.screenToWorld(input.mouse.x, input.mouse.y);
        targetTurretAngle = Math.atan2(mouseWorld.y - this.y, mouseWorld.x - this.x);
      } else if (closestEnemy) {
        targetTurretAngle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x);
      } else {
        // Point in direction of velocity vector if moving, otherwise face car angle
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 20) {
          targetTurretAngle = Math.atan2(this.vy, this.vx);
        } else {
          targetTurretAngle = this.angle;
        }
      }
    }
    
    // Smoothly rotate turret towards target angle
    const angleDiff = Math.atan2(Math.sin(targetTurretAngle - this.turretAngle), Math.cos(targetTurretAngle - this.turretAngle));
    const turretRotateSpeed = 9.0; // Lerp speed
    this.turretAngle += angleDiff * turretRotateSpeed * dt;

    // 9. SHOOTING SYSTEM TRIGGER (Auto-Fire when locked onto an enemy!)
    const currentWeapon = this.weapons[this.activeWeaponIndex];
    currentWeapon.update(dt);
    
    // Update car animation states
    const speed = Math.hypot(this.vx, this.vy);
    this.wheelAngle += speed * dt * 0.2;
    if (this.recoilAnim > 0) {
      this.recoilAnim = Math.max(0, this.recoilAnim - dt * 50);
    }

    const shouldShoot = input.isShooting() || closestEnemy !== null;
    
    if (shouldShoot) {
      if (this.tutorialActive) this.game.advanceTutorial(1);
      
      // Check for weapon quick firing
      const spreadActive = this.powerups.spreadShot > 0;
      const fireMultiplier = this.powerups.rapidFire > 0 ? 1.6 : 1.0;
      
      const fired = currentWeapon.fire(this.x, this.y, this.turretAngle, this.vx, this.vy, this.damageMultiplier, this.fireRateMultiplier * fireMultiplier, spreadActive);
      if (fired) {
        this.recoilAnim = 7; // recoil gun barrel backwards 7px on fire!
      }
    } else {
      currentWeapon.stopContinuousLaser();
    }
  }

  spawnSkidMarks(rightX, rightY) {
    if (Math.random() > 0.6) return;
    
    // Left/Right rear wheel offsets from center
    const wLength = -18;
    const wWidth = 14;
    
    const wheelL = this.angle + Math.atan2(-wWidth, wLength);
    const wheelR = this.angle + Math.atan2(wWidth, wLength);
    const dist = Math.hypot(wLength, wWidth);
    
    const wlX = this.x + Math.cos(wheelL) * dist;
    const wlY = this.y + Math.sin(wheelL) * dist;
    const wrX = this.x + Math.cos(wheelR) * dist;
    const wrY = this.y + Math.sin(wheelR) * dist;

    // Save points in buffer
    this.skidMarks.push({ x1: wlX, y1: wlY, x2: wrX, y2: wrY, life: 3.0 });
  }

  renderSkidMarks(ctx) {
    // Decay skid marks
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 3;
    
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      const mark = this.skidMarks[i];
      mark.life -= 0.016; // approx 60fps decay
      
      if (mark.life <= 0) {
        this.skidMarks.splice(i, 1);
        continue;
      }
      
      ctx.fillStyle = `rgba(0, 240, 255, ${Math.min(0.25, mark.life / 6)})`;
      ctx.fillRect(mark.x1 - 1.5, mark.y1 - 1.5, 3, 3);
      ctx.fillRect(mark.x2 - 1.5, mark.y2 - 1.5, 3, 3);
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const isGlow = this.game?.saveData?.settings?.glowEnabled ?? true;
    const colorCyan = resolveColor('var(--neon-cyan)');
    const colorMagenta = resolveColor('var(--neon-magenta)');
    const colorYellow = resolveColor('var(--neon-yellow)');
    const colorRed = resolveColor('var(--neon-red)');

    // 0. Neon Ground Underglow Aura (Glows vibrant cyan, gold on boost, red on damage)
    let underglowColor = 'rgba(0, 243, 255, 0.45)';
    if (this.powerups.overdrive > 0) underglowColor = 'rgba(255, 204, 0, 0.75)';
    else if (this.isBoosting) underglowColor = 'rgba(255, 204, 0, 0.65)';
    else if (this.damageFlash > 0) underglowColor = 'rgba(255, 0, 68, 0.75)';

    const underglowGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, 42);
    underglowGrad.addColorStop(0, underglowColor);
    underglowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = underglowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Calculate steering angle for front wheels
    let steerAngle = 0;
    if (this.game && this.game.input) {
      if (this.game.input.isTurningLeft()) steerAngle = -0.38;
      if (this.game.input.isTurningRight()) steerAngle = 0.38;
    }

    // Micro hover bobbing offset
    const hoverBob = Math.sin(Date.now() * 0.007) * 1.8;
    ctx.translate(0, hoverBob);

    // 1. Draw Wheels with Animated Spinning Rim Lines & Rubber Treads
    const wheelOffsets = [
      { x: 16, y: -16, isFront: true },  // Front right
      { x: 16, y: 16, isFront: true },   // Front left
      { x: -16, y: -16, isFront: false }, // Rear right
      { x: -16, y: 16, isFront: false }   // Rear left
    ];

    wheelOffsets.forEach(w => {
      ctx.save();
      ctx.translate(w.x, w.y);
      if (w.isFront) {
        ctx.rotate(steerAngle); // Front wheels physically turn left/right!
      }
      
      // Rubber tire casing
      ctx.fillStyle = '#080a14';
      ctx.strokeStyle = colorCyan;
      ctx.lineWidth = 1.2;
      ctx.fillRect(-7, -4, 14, 8);
      ctx.strokeRect(-7, -4, 14, 8);

      // Glowing Rim Center
      ctx.fillStyle = colorCyan;
      ctx.fillRect(-2, -1.5, 4, 3);

      // Spinning tread line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      const spinOffset = (this.wheelAngle % 10) - 5;
      ctx.beginPath();
      ctx.moveTo(spinOffset, -4);
      ctx.lineTo(spinOffset, 4);
      ctx.stroke();

      ctx.restore();
    });

    // 2. Headlight Beam Cones (projecting forward 220px)
    ctx.save();
    const headGrad = ctx.createRadialGradient(22, 0, 5, 220, 0, 220);
    headGrad.addColorStop(0, 'rgba(0, 243, 255, 0.5)');
    headGrad.addColorStop(0.4, 'rgba(0, 243, 255, 0.15)');
    headGrad.addColorStop(1, 'rgba(0, 243, 255, 0)');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(220, -55);
    ctx.lineTo(220, 55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Draw Main Chassis Body (Sleek Supercar Geometry)
    if (this.damageFlash > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ff0044';
    } else {
      ctx.strokeStyle = colorYellow; // Bold Neon Gold Trim
      ctx.fillStyle = '#00aaff';    // Electric Blue Core Body
    }

    ctx.lineWidth = 2.8;
    ctx.shadowBlur = isGlow ? 16 : 0;
    ctx.shadowColor = colorCyan;

    // Aerodynamic Chassis Polygon Path
    ctx.beginPath();
    ctx.moveTo(26, 0);        // Nose tip
    ctx.lineTo(16, -14);      // Front Right Splitter
    ctx.lineTo(4, -16);       // Front Intake Right
    ctx.lineTo(-12, -15);     // Side Skirt Right
    ctx.lineTo(-22, -18);     // Rear Spoiler Wing Right
    ctx.lineTo(-22, -10);     // Rear Bumper Right
    ctx.lineTo(-20, 0);       // Central Exhaust Notch
    ctx.lineTo(-22, 10);      // Rear Bumper Left
    ctx.lineTo(-22, 18);      // Rear Spoiler Wing Left
    ctx.lineTo(-12, 15);      // Side Skirt Left
    ctx.lineTo(4, 16);        // Front Intake Left
    ctx.lineTo(16, 14);       // Front Left Splitter
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Glowing Intake Grille Vent Stripes
    ctx.shadowBlur = 0;
    ctx.fillStyle = colorMagenta;
    ctx.fillRect(8, -12, 6, 2);
    ctx.fillRect(8, 10, 6, 2);

    // Front Headlight Bars
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = isGlow ? 10 : 0;
    ctx.shadowColor = '#ffffff';
    ctx.fillRect(16, -13, 5, 3);
    ctx.fillRect(16, 10, 5, 3);

    // Glass Cockpit Canopy (Dark Blue Tinted Glass with White Specular Reflection)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#021836';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(1, -7);
    ctx.lineTo(-10, -7);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, 7);
    ctx.lineTo(1, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Canopy Specular Highlight Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(6, -3);
    ctx.lineTo(-4, -5);
    ctx.stroke();

    // Central Reactor Core Eye
    ctx.fillStyle = colorCyan;
    ctx.shadowBlur = isGlow ? 8 : 0;
    ctx.shadowColor = colorCyan;
    ctx.beginPath();
    ctx.arc(-2, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // 4. Thruster Jet Flame (Flickering Dual Plasma Exhaust)
    const moveSpeed = Math.hypot(this.vx, this.vy);
    if (moveSpeed > 10 || this.isBoosting) {
      ctx.save();
      const flameLen = (this.isBoosting ? 32 : 16) + Math.random() * 8;

      const flameGrad = ctx.createLinearGradient(-22, 0, -22 - flameLen, 0);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.3, this.powerups.overdrive > 0 ? '#ffcc00' : '#ff007f');
      flameGrad.addColorStop(1, 'rgba(0, 243, 255, 0)');

      ctx.fillStyle = flameGrad;
      ctx.shadowBlur = isGlow ? 16 : 0;
      ctx.shadowColor = colorYellow;

      ctx.beginPath();
      ctx.moveTo(-22, -5);
      ctx.lineTo(-22 - flameLen, 0);
      ctx.lineTo(-22, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // 5. Draw Turret (rotates independently towards aim vector)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.turretAngle);

    // Turret Base Ring
    ctx.fillStyle = 'rgba(6, 12, 30, 0.95)';
    ctx.strokeStyle = colorMagenta;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dual Gun Barrels with Recoil Kickback
    ctx.fillStyle = '#080d1a';
    ctx.strokeStyle = colorCyan;
    ctx.lineWidth = 1.5;

    const recoilX = 4 - this.recoilAnim;
    // Top barrel
    ctx.fillRect(recoilX, -5, 18, 4);
    ctx.strokeRect(recoilX, -5, 18, 4);
    // Bottom barrel
    ctx.fillRect(recoilX, 1, 18, 4);
    ctx.strokeRect(recoilX, 1, 18, 4);

    // Barrel Muzzle Tips
    ctx.fillStyle = colorCyan;
    ctx.shadowBlur = isGlow ? 8 : 0;
    ctx.shadowColor = colorCyan;
    ctx.fillRect(recoilX + 18, -4, 2, 2);
    ctx.fillRect(recoilX + 18, 2, 2, 2);

    ctx.restore();

    // 6. Shield Overlay Ring
    if (this.shieldFlash > 0 && this.shield > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 243, 255, ${this.shieldFlash * 4})`;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = isGlow ? 18 : 0;
      ctx.shadowColor = colorCyan;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Lock-On Target Reticle over active auto-aim enemy
    if (this.targetEnemy && !this.targetEnemy.isDead) {
      ctx.save();
      ctx.translate(this.targetEnemy.x, this.targetEnemy.y);

      const rot = Date.now() * 0.005;
      ctx.rotate(rot);

      ctx.strokeStyle = colorMagenta;
      ctx.lineWidth = 2;
      ctx.shadowBlur = isGlow ? 12 : 0;
      ctx.shadowColor = colorMagenta;

      const r = this.targetEnemy.radius + 12;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = colorMagenta;
      ctx.fillRect(-2, -r - 5, 4, 7);
      ctx.fillRect(-2, r - 2, 4, 7);
      ctx.fillRect(-r - 5, -2, 7, 4);
      ctx.fillRect(r - 2, -2, 7, 4);

      ctx.restore();
    }
  }
}
