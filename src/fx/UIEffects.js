export class FloatingTextSystem {
  constructor() {
    this.texts = [];
  }

  clear() {
    this.texts = [];
  }

  spawnDamageFloat(x, y, amount, isCrit) {
    const text = isCrit ? `💥 CRIT! -${amount}` : `-${amount}`;
    const color = isCrit ? 'var(--neon-yellow)' : 'var(--neon-cyan)';
    const size = isCrit ? '900 18px Orbitron' : '700 14px Share Tech Mono';
    
    // float upwards with small random horizontal drift
    this.texts.push({
      x, y,
      vx: (Math.random() * 40 - 20),
      vy: isCrit ? -110 : -75,
      text,
      color,
      font: size,
      life: 0.85,
      maxLife: 0.85
    });
  }

  spawnScoreFloat(x, y, text, color = 'var(--neon-green)') {
    const size = '700 14px Orbitron';
    this.texts.push({
      x,
      y: y - 10,
      vx: 0,
      vy: -60,
      text,
      color,
      font: size,
      life: 1.0,
      maxLife: 1.0
    });
  }

  update(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      
      // Floating coordinates translation
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      
      // Decelerate velocities
      t.vy *= (1 - 1.5 * dt);
    }
  }

  render(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let t of this.texts) {
      const alpha = Math.min(1.0, t.life / (t.maxLife * 0.4)); // fade out in last 40% of life
      
      // Map colors to RGBA hex support
      let fillStyle = t.color;
      if (t.color === 'var(--neon-yellow)') fillStyle = `rgba(255, 234, 0, ${alpha})`;
      else if (t.color === 'var(--neon-green)') fillStyle = `rgba(57, 255, 20, ${alpha})`;
      else if (t.color === 'var(--neon-magenta)') fillStyle = `rgba(255, 0, 127, ${alpha})`;
      else if (t.color === 'var(--neon-purple)') fillStyle = `rgba(189, 0, 255, ${alpha})`;
      else if (t.color === 'var(--neon-cyan)') fillStyle = `rgba(0, 240, 255, ${alpha})`;
      else if (t.color === '#fff') fillStyle = `rgba(255, 255, 255, ${alpha})`;
      
      ctx.font = t.font;
      
      // High-contrast background stroke outline
      ctx.shadowBlur = 8;
      ctx.shadowColor = fillStyle;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.95})`;
      ctx.lineWidth = 4.0;
      ctx.strokeText(t.text, t.x, t.y);
      
      ctx.fillStyle = fillStyle;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  }
}
