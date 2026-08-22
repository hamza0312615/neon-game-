export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.pool = [];
  }

  clear() {
    this.particles = [];
  }

  spawnParticle(opts) {
    // Check pool first
    let p = this.pool.pop();
    if (!p) {
      p = {};
    }
    
    // Assign fields
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.color = opts.color || 'var(--neon-cyan)';
    p.size = opts.size || 2;
    p.maxSize = p.size;
    p.life = opts.life || 1.0;
    p.maxLife = p.life;
    p.glow = opts.glow !== undefined ? opts.glow : true;
    p.isDead = false;

    this.particles.push(p);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      
      if (p.life <= 0) {
        p.isDead = true;
        this.pool.push(p); // retire to pool
        this.particles.splice(i, 1);
        continue;
      }

      // Linear motion displacement
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Decelerate velocities over time (air drag)
      p.vx *= (1 - 0.5 * dt);
      p.vy *= (1 - 0.5 * dt);
      
      // Scale size down matching decay ratio
      const ratio = p.life / p.maxLife;
      p.size = p.maxSize * ratio;
    }
  }

  spawnSparkDebris(x, y, count, color = 'var(--neon-cyan)') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      this.spawnParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2.5 + Math.random() * 3,
        life: 0.2 + Math.random() * 0.3,
        glow: true
      });
    }
  }

  spawnMuzzleFlash(x, y, angle, color = 'var(--neon-cyan)') {
    // Spawn 5 small sparks spraying forward in a small cone
    for (let i = 0; i < 5; i++) {
      const a = angle + (Math.random() * 0.4 - 0.2);
      const speed = 120 + Math.random() * 180;
      this.spawnParticle({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        color,
        size: 1.5 + Math.random() * 2,
        life: 0.1 + Math.random() * 0.15,
        glow: false
      });
    }
  }

  spawnExplosionSparks(x, y, color = 'var(--neon-red)', count = 15) {
    // Complete 360 circle explosion
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      this.spawnParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 3 + Math.random() * 4,
        life: 0.35 + Math.random() * 0.4,
        glow: true
      });
    }
    
    // Add central shockwave ring overlay
    this.spawnShieldPulse(x, y, 40, color);
  }

  spawnShieldPulse(x, y, radius, color = 'var(--neon-cyan)') {
    // Spawns a dedicated shockwave particle that grows radius instead of moving
    this.spawnParticle({
      x, y,
      vx: 0, vy: 0,
      color,
      size: radius,
      life: 0.35,
      glow: true,
      // Custom draw flag checked in render loop
      isRing: true
    });
  }

  render(ctx) {
    ctx.save();
    
    // Global shadow glow configuration
    ctx.lineWidth = 2.0;

    for (let p of this.particles) {
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;

      if (p.isRing) {
        // Render expanding shockwave ring
        ctx.save();
        const ratio = 1 - (p.life / p.maxLife); // 0 to 1
        const curRadius = ratio * p.maxSize;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - ratio);
        ctx.shadowBlur = p.glow ? 12 : 0;
        ctx.shadowColor = p.color;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, curRadius, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      // Draw particle as tiny glowing squares/dots
      if (p.glow) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    
    ctx.restore();
  }
}
