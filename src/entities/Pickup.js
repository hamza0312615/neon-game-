import { resolveColor } from '../engine/Colors.js';

export class Pickup {
  constructor(game, x, y, type, value = 1) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type; // 'xp', 'credits', 'health', 'shield', 'rapidFire', 'spreadShot', 'damageBoost', 'magnet', 'overdrive'
    this.value = value;
    
    // Jump outwards on spawn
    const angle = Math.random() * Math.PI * 2;
    const force = 80 + Math.random() * 80;
    this.vx = Math.cos(angle) * force;
    this.vy = Math.sin(angle) * force;

    this.radius = 8;
    this.life = 10.0; // disappear after 10s
    this.isDead = false;
    
    this.bobTime = Math.random() * 100;
  }

  update(player, dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }

    // Apply friction to initial pop velocity
    this.vx *= (1 - 4 * dt);
    this.vy *= (1 - 4 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bobbing offset calculation
    this.bobTime += dt * 4.0;

    // Calculate distance to player
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Auto-collect range: Base range expanded to 220px minimum, or 3000px if Magnet active / drop expiring!
    const activeMagnet = player.powerups.magnet > 0 || this.type === 'overdrive' || this.life < 4.0;
    const range = activeMagnet ? 3000 : Math.max(220, player.pickupRadius * 1.6);

    if (dist < range) {
      // Accelerating magnetic pull speed (faster as it gets closer)
      const speedFactor = Math.max(0.2, 1 - dist / range);
      const pullSpeed = activeMagnet ? 1000 : (550 + speedFactor * 800);
      
      const dirX = dx / dist;
      const dirY = dy / dist;
      
      // Pull coordinates towards player car
      this.x += dirX * pullSpeed * dt;
      this.y += dirY * pullSpeed * dt;

      // Spawn subtle particle trails
      if (Math.random() < 0.25 && this.game.saveData.settings.particlesQuality !== 'low') {
        this.game.particles.spawnParticle({
          x: this.x, y: this.y,
          vx: -dirX * 60, vy: -dirY * 60,
          color: this.getColor(),
          size: 1.8, life: 0.25, glow: true
        });
      }
    }

    // Collect range trigger
    if (dist < player.radius + this.radius + 10) {
      this.collect(player);
    }
  }

  collect(player) {
    this.isDead = true;
    this.game.audio.playPickup();

    let displayMsg = '';
    const color = resolveColor(this.getColor());

    switch (this.type) {
      case 'xp':
        player.addXp(this.value);
        displayMsg = `+${Math.round(this.value * player.xpMultiplier)} ⭐`;
        break;

      case 'credits':
        this.game.creditsEarned += this.value;
        displayMsg = `+${this.value} 🪙`;
        break;

      case 'health':
        player.hp = Math.min(player.maxHp, player.hp + 25);
        displayMsg = "REPAIR +25 ❤️";
        this.game.particles.spawnShieldPulse(player.x, player.y, player.radius + 8, 'var(--neon-green)');
        break;

      case 'shield':
        player.shield = Math.min(player.maxShield, player.shield + 30);
        displayMsg = "SHIELD +30 🛡️";
        this.game.particles.spawnShieldPulse(player.x, player.y, player.radius + 8, 'var(--neon-cyan)');
        break;

      case 'rapidFire':
        player.powerups.rapidFire = 8.0; // 8 seconds duration
        displayMsg = "RAPID FIRE ⚡";
        break;

      case 'spreadShot':
        player.powerups.spreadShot = 8.0;
        displayMsg = "SPREAD BULLETS 💥";
        break;

      case 'damageBoost':
        player.powerups.damageBoost = 8.0;
        displayMsg = "DOUBLE DAMAGE 🔥";
        break;

      case 'magnet':
        player.powerups.magnet = 10.0;
        displayMsg = "GRAVITY MAGNET 🧲";
        break;

      case 'overdrive':
        player.powerups.overdrive = 5.0; // invulnerability and boost
        displayMsg = "OVERDRIVE ENGAGED 🚀";
        this.game.camera.addTrauma(0.4);
        this.game.particles.spawnShieldPulse(player.x, player.y, 110, 'var(--neon-yellow)');
        break;
    }

    // Spawn floating score indicators
    if (displayMsg) {
      this.game.uiEffects.spawnScoreFloat(player.x, player.y - 30, displayMsg, color);
    }
  }

  getColor() {
    switch (this.type) {
      case 'xp': return 'var(--neon-purple)';
      case 'credits': return 'var(--neon-yellow)';
      case 'health': return 'var(--neon-green)';
      case 'shield': return 'var(--neon-cyan)';
      case 'rapidFire': return 'var(--neon-green)';
      case 'spreadShot': return 'var(--neon-purple)';
      case 'damageBoost': return 'var(--neon-red)';
      case 'magnet': return 'var(--neon-magenta)';
      case 'overdrive': return 'var(--neon-yellow)';
      default: return '#fff';
    }
  }

  render(ctx) {
    // Bobbing hover calculation
    const bobOffset = Math.sin(this.bobTime) * 4;
    const drawY = this.y + bobOffset;

    ctx.save();
    ctx.translate(this.x, drawY);

    const color = resolveColor(this.getColor());
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    
    // Blinking effect if about to decay (< 2.5 seconds left)
    if (this.life < 2.5 && Math.floor(Date.now() / 120) % 2 === 0) {
      ctx.restore();
      return;
    }

    const isGlow = this.game?.saveData?.settings?.glowEnabled ?? true;
    ctx.shadowBlur = isGlow ? 10 : 0;
    ctx.shadowColor = color;

    // Draw customized shape depending on type
    if (this.type === 'xp') {
      // Circular glowing nucleus
      ctx.fillStyle = 'rgba(189, 0, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'credits') {
      // Diamond shape
      ctx.fillStyle = 'rgba(255, 234, 0, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'health') {
      // Cross shape
      ctx.fillStyle = 'rgba(57, 255, 20, 0.2)';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
      ctx.strokeRect(-2, -6, 4, 12);
      ctx.strokeRect(-6, -2, 12, 4);
    } else if (this.type === 'shield') {
      // Hexagon capsule
      ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, -3);
      ctx.lineTo(5, 3);
      ctx.lineTo(0, 7);
      ctx.lineTo(-5, 3);
      ctx.lineTo(-5, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Power-up cards (draw rectangular wireframe tag with type initials)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(-8, -10, 16, 20);
      ctx.strokeRect(-8, -10, 16, 20);
      
      ctx.shadowBlur = 0; // reset glow for font
      ctx.fillStyle = color;
      ctx.font = 'bold 9px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let letter = 'P';
      if (this.type === 'rapidFire') letter = 'F';
      if (this.type === 'spreadShot') letter = 'S';
      if (this.type === 'damageBoost') letter = 'D';
      if (this.type === 'magnet') letter = 'M';
      if (this.type === 'overdrive') letter = 'O';
      
      ctx.fillText(letter, 0, 0);
    }

    ctx.restore();
  }
}
