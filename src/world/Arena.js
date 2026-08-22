import { Pickup } from '../entities/Pickup.js';
import { resolveColor } from '../engine/Colors.js';

export class Arena {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    
    // Playable objects lists
    this.obstacles = []; // Solid barriers
    this.stations = [];  // Healing / Charging rings
    
    this.generateMap();
  }

  generateMap() {
    this.obstacles = [];
    this.stations = [];

    // 1. Add static neon charging & health stations
    // Top-left: Health, Top-right: Energy, Bottom-left: Energy, Bottom-right: Health
    this.stations.push({ id: 1, type: 'health', x: 800, y: 800, width: 140, height: 140, pulse: 0 });
    this.stations.push({ id: 2, type: 'charge', x: 4000, y: 800, width: 140, height: 140, pulse: 0 });
    this.stations.push({ id: 3, type: 'charge', x: 800, y: 4000, width: 140, height: 140, pulse: 0 });
    this.stations.push({ id: 4, type: 'health', x: 4000, y: 4000, width: 140, height: 140, pulse: 0 });

    // 2. Procedural Obstacles placement (5000 x 5000)
    // We split map into 10x10 grid blocks (each 500x500 px)
    const gridSize = 500;
    
    for (let gx = 0; gx < 10; gx++) {
      for (let gy = 0; gy < 10; gy++) {
        // Ensure starting sector (center 2000-3000) is clear of giant walls
        const rx = gx * gridSize + 250;
        const ry = gy * gridSize + 250;
        
        const distFromCenter = Math.hypot(rx - 2500, ry - 2500);
        if (distFromCenter < 600) {
          // Keep player spawn clear, but maybe place a few destroyable barrels
          if (Math.random() < 0.25) {
            this.obstacles.push(this.createObstacle(rx + (Math.random()*100-50), ry + (Math.random()*100-50), 'barrel'));
          }
          continue;
        }

        // Sector station protection
        let nearStation = false;
        for (let st of this.stations) {
          if (Math.hypot(rx - (st.x + 70), ry - (st.y + 70)) < 400) {
            nearStation = true;
            break;
          }
        }
        if (nearStation) continue;

        // Populate sector obstacles procedurally
        const roll = Math.random();
        
        if (roll < 0.35) {
          // Place static structural concrete wall
          const w = Math.random() > 0.5 ? 160 : 40;
          const h = w === 40 ? 160 : 40;
          this.obstacles.push(this.createObstacle(rx, ry, 'concrete', w, h));
        } else if (roll < 0.65) {
          // Place group of destroyable crates (2 or 3)
          this.obstacles.push(this.createObstacle(rx - 30, ry, 'crate'));
          this.obstacles.push(this.createObstacle(rx + 30, ry, 'crate'));
          if (Math.random() < 0.4) {
            this.obstacles.push(this.createObstacle(rx, ry + 50, 'barrel'));
          }
        } else if (roll < 0.75) {
          // Place explosive barrel cluster
          this.obstacles.push(this.createObstacle(rx, ry - 20, 'barrel'));
          this.obstacles.push(this.createObstacle(rx - 25, ry + 20, 'barrel'));
          this.obstacles.push(this.createObstacle(rx + 25, ry + 20, 'barrel'));
        }
      }
    }
  }

  createObstacle(x, y, type, w = 40, h = 40) {
    let health = 1;
    let maxHealth = 1;
    
    if (type === 'crate') {
      w = 48;
      h = 48;
      health = 30; // standard bullet hits to pop
      maxHealth = 30;
    } else if (type === 'barrel') {
      w = 36;
      h = 36;
      health = 10; // easily explosive!
      maxHealth = 10;
    }
    
    return {
      x: x - w / 2,
      y: y - h / 2,
      width: w,
      height: h,
      type, // 'concrete', 'crate', 'barrel'
      health,
      maxHealth,
      isDead: false
    };
  }

  resolveEntityCollisions(player, enemies, projectiles, game) {
    const checkCollision = (entity, obs) => {
      // Find closest point on obstacle rect to entity center
      const closestX = Math.max(obs.x, Math.min(entity.x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(entity.y, obs.y + obs.height));
      
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const dist = Math.hypot(dx, dy);
      
      return {
        collided: dist < entity.radius,
        overlap: entity.radius - dist,
        nx: dist === 0 ? 0 : dx / dist,
        ny: dist === 0 ? 0 : dy / dist,
        cx: closestX,
        cy: closestY
      };
    };

    // 1. Resolve Solid Obstacles vs Player
    for (let obs of this.obstacles) {
      if (obs.isDead) continue;
      
      const res = checkCollision(player, obs);
      if (res.collided) {
        // Push player outside rect bounding boxes
        player.x += res.nx * res.overlap;
        player.y += res.ny * res.overlap;
        
        // Damping velocity component facing the wall (slide mechanics)
        const dot = player.vx * res.nx + player.vy * res.ny;
        if (dot < 0) {
          player.vx -= res.nx * dot * 1.2; // slight elastic slide bounces
          player.vy -= res.ny * dot * 1.2;
        }
      }
    }

    // 2. Resolve Solid Obstacles vs Enemies
    for (let e of enemies) {
      if (e.isDead) continue;
      
      for (let obs of this.obstacles) {
        if (obs.isDead) continue;
        
        const res = checkCollision(e, obs);
        if (res.collided) {
          e.x += res.nx * res.overlap;
          e.y += res.ny * res.overlap;
          
          const dot = e.vx * res.nx + e.vy * res.ny;
          if (dot < 0) {
            e.vx -= res.nx * dot;
            e.vy -= res.ny * dot;
          }
        }
      }
    }

    // 3. Resolve Projectiles vs Obstacles (damage destroyable boxes)
    for (let p of projectiles) {
      if (p.isDead) continue;
      
      for (let obs of this.obstacles) {
        if (obs.isDead) continue;
        
        const closestX = Math.max(obs.x, Math.min(p.x, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(p.y, obs.y + obs.height));
        
        const dist = Math.hypot(p.x - closestX, p.y - closestY);
        
        if (dist < p.radius) {
          // Projectile impact
          if (obs.type !== 'concrete') {
            obs.health -= p.damage;
            
            // Check destruction
            if (obs.health <= 0) {
              obs.isDead = true;
              this.destroyObstacle(obs, game);
            }
          }
          
          p.hit();
          if (p.isDead) break;
        }
      }
    }

    // 4. Handle Player in Stations fields (HP heals, Charge boost)
    this.stations.forEach(st => {
      st.pulse = (st.pulse + 0.05) % (Math.PI * 2);
      
      const stCenterX = st.x + st.width / 2;
      const stCenterY = st.y + st.height / 2;
      const dist = Math.hypot(player.x - stCenterX, player.y - stCenterY);
      
      if (dist < (st.width / 2 + player.radius)) {
        // Active docking field
        if (st.type === 'health' && player.hp < player.maxHp) {
          player.hp = Math.min(player.maxHp, player.hp + 12 * 0.016); // 12 HP per second
          game.particles.spawnParticle({
            x: player.x + (Math.random()*40-20), y: player.y + (Math.random()*40-20),
            vx: 0, vy: -50,
            color: 'var(--neon-green)',
            size: 2, life: 0.3, glow: true
          });
        } else if (st.type === 'charge' && player.boostEnergy < player.maxBoostEnergy) {
          player.boostEnergy = Math.min(player.maxBoostEnergy, player.boostEnergy + 80 * 0.016); // 80 units/sec recharge
          game.particles.spawnParticle({
            x: player.x + (Math.random()*40-20), y: player.y + (Math.random()*40-20),
            vx: 0, vy: -50,
            color: 'var(--neon-yellow)',
            size: 2, life: 0.3, glow: true
          });
        }
      }
    });

    // Remove dead obstacles
    this.obstacles = this.obstacles.filter(o => !o.isDead);
  }

  destroyObstacle(obs, game) {
    game.audio.playExplosion(false);
    game.camera.addTrauma(0.15);
    
    // Spawn heavy particles
    const color = obs.type === 'barrel' ? 'var(--neon-red)' : '#bf6f30';
    game.particles.spawnExplosionSparks(obs.x + obs.width/2, obs.y + obs.height/2, color, obs.type === 'barrel' ? 18 : 8);

    if (obs.type === 'barrel') {
      // Explosive barrels deal heavy splash damage to everything around them (200px)
      const splash = 180;
      const cx = obs.x + obs.width / 2;
      const cy = obs.y + obs.height / 2;
      
      // Enemies
      for (let e of game.enemies) {
        const d = Math.hypot(e.x - cx, e.y - cy);
        if (d < splash) {
          e.takeDamage(60, false);
          // push back
          const angle = Math.atan2(e.y - cy, e.x - cx);
          e.vx += Math.cos(angle) * 300;
          e.vy += Math.sin(angle) * 300;
        }
      }
      
      // Player
      const dp = Math.hypot(game.player.x - cx, game.player.y - cy);
      if (dp < splash) {
        const factor = 1 - (dp / splash);
        game.player.takeDamage(Math.round(40 * factor));
      }
    }

    // Spawn pickups resource (Credits or XP cells)
    const cx = obs.x + obs.width/2;
    const cy = obs.y + obs.height/2;
    const spawnRoll = Math.random();
    
    if (spawnRoll < 0.6) {
      const type = Math.random() < 0.5 ? 'credits' : 'xp';
      const val = type === 'credits' ? 25 : 15;
      game.pickups.push(new Pickup(game, cx, cy, type, val));
    }
  }

  renderBackground(ctx, camera) {
    const gridSpacing = 160;
    
    // Determine screen offsets based on camera position
    const startX = Math.floor(camera.x / gridSpacing) * gridSpacing;
    const startY = Math.floor(camera.y / gridSpacing) * gridSpacing;
    const endX = startX + camera.width + gridSpacing;
    const endY = startY + camera.height + gridSpacing;

    ctx.save();

    // 1. Draw Player Spotlight Glow (Illuminates player area in Cyan & Magenta)
    const playerX = (this.game && this.game.player) ? this.game.player.x : camera.x + camera.width / 2;
    const playerY = (this.game && this.game.player) ? this.game.player.y : camera.y + camera.height / 2;
    const playerScreenX = (playerX - camera.x) * camera.zoom;
    const playerScreenY = (playerY - camera.y) * camera.zoom;
    
    const grad = ctx.createRadialGradient(playerScreenX, playerScreenY, 20, playerScreenX, playerScreenY, 750);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.22)');
    grad.addColorStop(0.4, 'rgba(157, 0, 255, 0.12)');
    grad.addColorStop(1, 'rgba(4, 6, 18, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, camera.width, camera.height);

    // 2. Render Parallax Cyber City Skyscrapers in the distance
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 380 - camera.x * 0.12) % (camera.width + 400)) - 200;
      const bHeight = 160 + (i % 4) * 110;
      const bWidth = 90 + (i % 3) * 45;
      
      // Building silhouette box
      ctx.strokeRect(bx, camera.height - bHeight, bWidth, bHeight);
      
      // Illuminated window grid rows
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 243, 255, 0.12)' : 'rgba(255, 0, 127, 0.10)';
      ctx.fillRect(bx + 8, camera.height - bHeight + 8, bWidth - 16, bHeight - 16);
    }

    // 3. High-Contrast Cyber Grid Lines
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)';
    const glowEnabled = this.game?.saveData?.settings?.glowEnabled ?? true;
    ctx.shadowBlur = glowEnabled ? 8 : 0;
    ctx.shadowColor = '#00f3ff';

    ctx.beginPath();
    // Vertical grid lines
    for (let x = startX; x <= endX; x += gridSpacing) {
      if (x < 0 || x > this.width) continue;
      const screenX = (x - camera.x) * camera.zoom;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, camera.height);
    }
    // Horizontal grid lines
    for (let y = startY; y <= endY; y += gridSpacing) {
      if (y < 0 || y > this.height) continue;
      const screenY = (y - camera.y) * camera.zoom;
      ctx.moveTo(0, screenY);
      ctx.lineTo(camera.width, screenY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. Glowing Intersection Crosses
    ctx.fillStyle = '#00f3ff';
    for (let x = startX; x <= endX; x += gridSpacing) {
      if (x < 0 || x > this.width) continue;
      for (let y = startY; y <= endY; y += gridSpacing) {
        if (y < 0 || y > this.height) continue;
        const screenX = (x - camera.x) * camera.zoom;
        const screenY = (y - camera.y) * camera.zoom;
        ctx.fillRect(screenX - 6, screenY - 1, 12, 2);
        ctx.fillRect(screenX - 1, screenY - 6, 2, 12);
      }
    }

    // 5. Digital Rain Particles & Cyber Dust
    const time = Date.now() * 0.002;
    for (let i = 0; i < 45; i++) {
      const sx = ((i * 137 + time * 40) % camera.width);
      const sy = ((i * 269 + time * 80) % camera.height);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 243, 255, 0.65)' : 'rgba(255, 0, 127, 0.65)';
      ctx.fillRect(sx, sy, 2.5, 2.5);
    }

    ctx.restore();
  }

  renderStationsAndObstacles(ctx) {
    // 1. Render Stations (Neon Landing Fields)
    this.stations.forEach(st => {
      ctx.save();
      const isHealth = st.type === 'health';
      const colorVar = isHealth ? 'var(--neon-green)' : 'var(--neon-yellow)';
      const color = resolveColor(colorVar);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      
      const glowEnabled = this.game?.saveData?.settings?.glowEnabled ?? true;
      ctx.shadowBlur = glowEnabled ? (12 + Math.sin(st.pulse) * 6) : 0;
      ctx.shadowColor = color;
      ctx.strokeRect(st.x, st.y, st.width, st.height);

      // Inner field glow
      ctx.fillStyle = isHealth ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 204, 0, 0.08)';
      ctx.fillRect(st.x, st.y, st.width, st.height);
      
      // Icon in middle
      ctx.fillStyle = color;
      ctx.font = '700 32px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isHealth ? '✚' : '⚡', st.x + st.width/2, st.y + st.height/2);

      ctx.restore();
    });

    // 2. Render Solid Obstacles
    this.obstacles.forEach(o => {
      ctx.save();
      
      if (o.type === 'concrete') {
        // High Walls (Bright Electric Cyan)
        ctx.fillStyle = 'rgba(0, 180, 255, 0.38)';
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.fillRect(o.x, o.y, o.width, o.height);
        ctx.strokeRect(o.x, o.y, o.width, o.height);
        
        // Inner wireframe diagonal cross
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + o.width, o.y + o.height);
        ctx.moveTo(o.x + o.width, o.y);
        ctx.lineTo(o.x, o.y + o.height);
        ctx.stroke();
      } else if (o.type === 'crate') {
        // Cargo Container (Amber Gold + Hazard Borders)
        ctx.fillStyle = 'rgba(255, 170, 0, 0.50)';
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 3;
        ctx.fillRect(o.x, o.y, o.width, o.height);
        ctx.strokeRect(o.x, o.y, o.width, o.height);

        // Inner box border
        ctx.strokeRect(o.x + 5, o.y + 5, o.width - 10, o.height - 10);
        
        // Damaged HP Bar
        if (o.health < o.maxHealth) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(o.x, o.y - 8, o.width, 4);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(o.x, o.y - 8, o.width * (o.health / o.maxHealth), 4);
        }
      } else if (o.type === 'barrel') {
        // Explosive Fuel Barrel (Bright Neon Red)
        ctx.fillStyle = 'rgba(255, 0, 68, 0.65)';
        const colorRed = resolveColor('var(--neon-red)');
        ctx.strokeStyle = colorRed;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(o.x + o.width/2, o.y + o.height/2, o.width/2, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        // Hazard Warning Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(o.x + o.width/2, o.y + o.height/2, 4, 0, Math.PI*2);
        ctx.fill();

        if (o.health < o.maxHealth) {
          ctx.fillStyle = 'rgba(255, 0, 68, 0.4)';
          ctx.fillRect(o.x, o.y - 8, o.width, 4);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(o.x, o.y - 8, o.width * (o.health / o.maxHealth), 4);
        }
      }

      ctx.restore();
    });
  }
}
