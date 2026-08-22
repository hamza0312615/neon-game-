import { resolveColor } from '../engine/Colors.js';

export class Projectile {
  constructor(game, x, y, vx, vy, damage, radius, color, owner = 'player', type = 'normal', life = 1.5, isCrit = false) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.radius = radius;
    this.color = color;
    this.owner = owner; // 'player' or 'enemy'
    this.type = type; // 'normal', 'pierce', 'homing', 'laser_beam', 'emp_blast'
    this.life = life;
    this.maxLife = life;
    this.isCrit = isCrit;
    this.isDead = false;

    // Homing configurations
    this.target = null;
    this.homingSteerSpeed = 6.5; // Turn radians per second
    
    // EMP configurations
    this.empMaxRadius = 220;
    this.empCurrentRadius = radius;
    
    // Trail tracking (for high quality tracers)
    this.history = [];
    this.maxHistory = this.type === 'pierce' ? 6 : 4;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      if (this.type === 'homing') {
        this.detonateMissile();
      }
      return;
    }

    // Capture point history for trail rendering
    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Handle distinct projectile mechanics
    if (this.type === 'homing') {
      this.updateHoming(dt);
    } else if (this.type === 'emp_blast') {
      this.updateEmpBlast(dt);
    } else {
      // Linear motion for normal, pierce, laser
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // Spawn movement particle trails
    if (this.game.saveData.settings.particlesQuality !== 'low' && Math.random() < 0.25) {
      if (this.type === 'normal') {
        this.game.particles.spawnParticle({
          x: this.x, y: this.y,
          vx: (Math.random() * 20 - 10), vy: (Math.random() * 20 - 10),
          color: this.color,
          size: 1.5,
          life: 0.15,
          glow: false
        });
      }
    }
  }

  updateHoming(dt) {
    // 1. Acquire target if none or target dead
    if (this.owner === 'player') {
      if (!this.target || this.target.isDead) {
        this.target = this.findNearestEnemy();
      }
    } else {
      this.target = this.game.player;
    }

    // 2. Steer velocity vector towards target
    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const targetAngle = Math.atan2(dy, dx);
      
      const currentAngle = Math.atan2(this.vy, this.vx);
      const angleDiff = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));
      
      const nextAngle = currentAngle + angleDiff * this.homingSteerSpeed * dt;
      
      // Update speed scalar
      const speed = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(nextAngle) * speed;
      this.vy = Math.sin(nextAngle) * speed;
    }

    // Apply linear translation
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Constantly emit exhaust smoke particles
    if (Math.random() < 0.7) {
      const speed = Math.hypot(this.vx, this.vy);
      const bx = this.x - (this.vx / speed) * 10;
      const by = this.y - (this.vy / speed) * 10;
      this.game.particles.spawnParticle({
        x: bx,
        y: by,
        vx: -this.vx * 0.2 + (Math.random() * 40 - 20),
        vy: -this.vy * 0.2 + (Math.random() * 40 - 20),
        color: 'var(--neon-yellow)',
        size: 2 + Math.random() * 2,
        life: 0.2 + Math.random() * 0.2,
        glow: true
      });
    }
  }

  findNearestEnemy() {
    let nearest = null;
    let minDist = Infinity;
    
    for (let e of this.game.enemies) {
      if (e.isDead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }
    return nearest;
  }

  updateEmpBlast(dt) {
    // Blast expands outward centered on the car
    const ratio = 1 - (this.life / this.maxLife); // 0 to 1
    this.empCurrentRadius = ratio * this.empMaxRadius;
    this.radius = this.empCurrentRadius; // Update collision radius

    // Trigger disable/stun on enemies inside overlapping zone
    if (this.owner === 'player') {
      for (let e of this.game.enemies) {
        if (e.isDead) continue;
        const dist = Math.hypot(e.x - this.x, e.y - this.y);
        
        // Check if inside shockwave ring boundary
        if (dist < this.empCurrentRadius && !e.empHitRegistry) {
          e.empHitRegistry = true; // prevent multi hits in single pulse
          e.takeDamage(this.damage, false);
          e.applyStun(3.0); // 3 seconds stun disable
          
          this.game.particles.spawnShieldPulse(e.x, e.y, e.radius + 5, 'var(--neon-purple)');
        }
      }
    }
  }

  detonateMissile() {
    // Homing rocket explosions do splash radius damage
    this.game.audio.playExplosion(false);
    this.game.camera.addTrauma(0.25);
    
    // Spawn heavy fire sparks
    this.game.particles.spawnExplosionSparks(this.x, this.y, 'var(--neon-yellow)', 12);

    const splashRadius = 90;
    if (this.owner === 'player') {
      for (let e of this.game.enemies) {
        if (e.isDead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < splashRadius) {
          // Linear damage falloff based on distance from center
          const factor = 1 - (d / splashRadius);
          const dmg = Math.round(this.damage * factor);
          e.takeDamage(dmg, false);
        }
      }
    } else {
      const d = Math.hypot(this.game.player.x - this.x, this.game.player.y - this.y);
      if (d < splashRadius) {
        const factor = 1 - (d / splashRadius);
        const dmg = Math.round(this.damage * factor);
        this.game.player.takeDamage(dmg);
      }
    }
  }

  hit() {
    if (this.type === 'pierce') {
      // Pierce bullets continue moving without dying immediately
      this.game.particles.spawnSparkDebris(this.x, this.y, 4, this.color);
      return;
    }
    
    if (this.type === 'homing') {
      this.detonateMissile();
    } else if (this.type === 'normal') {
      // Normal bullet collision impact
      this.game.particles.spawnSparkDebris(this.x, this.y, 6, this.color);
    }
    
    this.isDead = true;
  }

  render(ctx) {
    if (this.type === 'emp_blast') {
      ctx.save();
      const resolvedEmpColor = resolveColor('var(--neon-purple)');
      ctx.strokeStyle = resolvedEmpColor;
      ctx.lineWidth = 4;
      ctx.shadowBlur = this.game.saveData.settings.glowEnabled ? 15 : 0;
      ctx.shadowColor = resolvedEmpColor;
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.empCurrentRadius, 0, Math.PI*2);
      ctx.stroke();
      
      // Draw faint transparent fill
      ctx.fillStyle = `rgba(189, 0, 255, ${(this.life / this.maxLife) * 0.05})`;
      ctx.fill();
      ctx.restore();
      return;
    }

    const resolvedColor = resolveColor(this.color);

    if (this.history.length < 2) {
      ctx.save();
      ctx.fillStyle = resolvedColor;
      ctx.shadowBlur = this.game.saveData.settings.glowEnabled ? 10 : 0;
      ctx.shadowColor = resolvedColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Outer Neon Aura
    ctx.strokeStyle = resolvedColor;
    ctx.lineWidth = Math.max(6, this.radius * 2.8);
    ctx.shadowBlur = this.game.saveData.settings.glowEnabled ? 14 : 0;
    ctx.shadowColor = resolvedColor;

    ctx.beginPath();
    ctx.moveTo(this.history[0].x, this.history[0].y);
    for (let i = 1; i < this.history.length; i++) {
      ctx.lineTo(this.history[i].x, this.history[i].y);
    }
    ctx.stroke();

    // 2. Pure White High-Energy Core Line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, this.radius * 1.2);
    ctx.beginPath();
    ctx.moveTo(this.history[0].x, this.history[0].y);
    for (let i = 1; i < this.history.length; i++) {
      ctx.lineTo(this.history[i].x, this.history[i].y);
    }
    ctx.stroke();

    // 3. Bright Glowing Bullet Head Tip
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = resolvedColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(4, this.radius + 1.5), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Rocket body for homing missile
    if (this.type === 'homing') {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.restore(); // reset styles
      
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      
      ctx.fillStyle = '#0f0f18';
      ctx.strokeStyle = 'var(--neon-yellow)';
      ctx.lineWidth = 1.5;
      
      // Small rectangle rocket body
      ctx.fillRect(-6, -3, 12, 6);
      ctx.strokeRect(-6, -3, 12, 6);
      
      // Red fin tips
      ctx.fillStyle = 'var(--neon-red)';
      ctx.fillRect(-8, -4, 2, 8);
      
      // Nose cone
      ctx.fillStyle = 'var(--neon-yellow)';
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(10, 0);
      ctx.lineTo(6, 3);
      ctx.fill();
      
      ctx.restore();
      return;
    }

    ctx.restore();
  }
}
