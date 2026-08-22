import { Input } from './Input.js';
import { Camera } from './Camera.js';
import { SaveSystem } from './SaveSystem.js';
import { AudioManager } from './AudioManager.js';
import { Player } from '../entities/Player.js';
import { Arena } from '../world/Arena.js';
import { WaveManager } from '../world/WaveManager.js';
import { ParticleSystem } from '../fx/Particles.js';
import { FloatingTextSystem } from '../fx/UIEffects.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Core engine systems
    this.saveData = SaveSystem.load();
    this.input = new Input(this.canvas);
    this.audio = new AudioManager();
    this.camera = new Camera(this.canvas.width, this.canvas.height, 5000, 5000);
    
    // Game entity arrays
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    
    // FX systems
    this.particles = new ParticleSystem();
    this.uiEffects = new FloatingTextSystem();
    
    // World and layout
    this.arena = new Arena(5000, 5000);
    this.waveManager = new WaveManager(this);
    
    // Player
    this.player = null;
    
    // Game state tracking
    this.state = 'MENU'; // MENU, PLAYING, PAUSED, LEVEL_UP, GAME_OVER, VICTORY, GARAGE, SETTINGS
    this.isPlaying = false;
    this.survivalTime = 0; // In seconds
    this.score = 0;
    this.creditsEarned = 0;
    this.kills = 0;
    this.eliteKills = 0;
    this.bestCombo = 1;
    
    // Developer debug states
    this.debugMode = false;
    this.fps = 0;
    this.lastFpsUpdate = 0;
    this.framesThisSecond = 0;

    // Resizing
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    
    // Bind DOM events
    this.bindUIEvents();

    // Register weapon cycle and select callbacks for in-game swapping
    this.input.onWeaponCycleRequest = (dir) => {
      if (this.state === 'PLAYING' && this.player) {
        this.player.cycleWeapon(dir);
      }
    };
    this.input.onWeaponSelectRequest = (idx) => {
      if (this.state === 'PLAYING' && this.player) {
        this.player.selectWeaponIndex(idx);
      }
    };
    
    // Set initial volumes
    this.audio.volumes.master = this.saveData.settings.masterVolume;
    this.audio.volumes.music = this.saveData.settings.musicVolume;
    this.audio.volumes.sfx = this.saveData.settings.sfxVolume;

    // Populate initial menu info
    this.updateMenuStats();
  }

  handleResize() {
    // Determine screen pixel density
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.resize(this.canvas.width, this.canvas.height);
  }

  updateMenuStats() {
    document.getElementById('best-score-display').innerText = `HIGH SCORE: ${this.saveData.progression.bestScore.toLocaleString()}`;
    document.getElementById('total-credits-display').innerText = `CREDITS: ${this.saveData.progression.credits.toLocaleString()}`;
  }

  bindUIEvents() {
    const bindBtn = (id, callback) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          this.audio.unlock();
          this.audio.playUIClick();
          callback(e);
        });
        el.addEventListener('mouseenter', () => {
          this.audio.unlock();
          this.audio.playUIHover();
        });
      }
    };

    // Main Menu Buttons
    bindBtn('btn-play', () => this.startGame());
    bindBtn('btn-garage', () => this.changeState('GARAGE'));
    bindBtn('btn-tutorial', () => this.changeState('TUTORIAL'));
    bindBtn('btn-settings', () => this.changeState('SETTINGS'));

    // Garage Screen Buttons
    bindBtn('btn-garage-back', () => {
      this.updateMenuStats();
      this.changeState('MENU');
    });

    // Pause Screen Buttons
    bindBtn('btn-resume', () => this.resumeGame());
    bindBtn('btn-pause-settings', () => {
      this.previousState = 'PAUSED';
      this.changeState('SETTINGS');
    });
    bindBtn('btn-restart', () => this.startGame());
    bindBtn('btn-abort', () => {
      this.audio.stopMusic();
      this.changeState('MENU');
    });

    // Settings Screen Buttons
    bindBtn('btn-settings-back', () => {
      // Save settings
      this.saveData.settings.masterVolume = parseFloat(document.getElementById('vol-master').value) / 100;
      this.saveData.settings.musicVolume = parseFloat(document.getElementById('vol-music').value) / 100;
      this.saveData.settings.sfxVolume = parseFloat(document.getElementById('vol-sfx').value) / 100;
      this.saveData.settings.glowEnabled = document.getElementById('setting-glow').checked;
      this.saveData.settings.particlesQuality = document.getElementById('setting-particles').value;
      this.saveData.settings.shakeEnabled = document.getElementById('setting-shake').checked;
      this.saveData.settings.damageNumbersEnabled = document.getElementById('setting-damage-nums').checked;
      this.saveData.settings.colorblindMode = document.getElementById('setting-colorblind')?.checked ?? false;
      this.saveData.settings.photosensitiveMode = document.getElementById('setting-photosensitive')?.checked ?? false;

      this.audio.setVolumes(
        this.saveData.settings.masterVolume,
        this.saveData.settings.musicVolume,
        this.saveData.settings.sfxVolume
      );
      this.camera.enabledShake = this.saveData.settings.shakeEnabled && !this.saveData.settings.photosensitiveMode;
      
      SaveSystem.save(this.saveData);

      if (this.previousState) {
        this.changeState(this.previousState);
        this.previousState = null;
      } else {
        this.changeState('MENU');
      }
    });

    // Tutorial screen
    bindBtn('btn-tutorial-back', () => this.changeState('MENU'));

    // Game Over Buttons
    bindBtn('btn-gameover-retry', () => this.startGame());
    bindBtn('btn-gameover-share', () => this.generateShareCard());
    bindBtn('btn-gameover-garage', () => this.changeState('GARAGE'));
    bindBtn('btn-gameover-menu', () => this.changeState('MENU'));

    // Victory Buttons
    bindBtn('btn-victory-share', () => this.generateShareCard());
    bindBtn('btn-victory-garage', () => this.changeState('GARAGE'));
    bindBtn('btn-victory-menu', () => this.changeState('MENU'));

    // Boss Summoning listeners (Click Wave title or press 'B')
    bindBtn('hud-wave-title', () => {
      if (this.state === 'PLAYING') this.waveManager.spawnBossNow();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && this.state === 'PLAYING') {
        this.waveManager.spawnBossNow();
      }
    });

    // Skip Tutorial Overlay
    bindBtn('btn-skip-tut', () => {
      document.getElementById('tutorial-overlay')?.classList.add('hidden');
      if (this.tutorialActive) {
        this.tutorialActive = false;
        this.saveData.progression.completedTutorial = true;
        SaveSystem.save(this.saveData);
      }
    });

    // Upgrade purchases inside the Garage
    const upgradeBtns = ['engine', 'armor', 'shield', 'weapon', 'handling', 'boost', 'utility'];
    upgradeBtns.forEach(category => {
      bindBtn(`btn-upgrade-${category}`, () => this.buyUpgrade(category));
    });

    // Debug Mode toggles on pressing backtick / tilde key
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~' || e.key === '\\') {
        this.debugMode = !this.debugMode;
        console.log(`Developer Debug Mode: ${this.debugMode ? 'ENABLED' : 'DISABLED'}`);
      }
    });
  }

  generateShareCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 640, 400);
    bg.addColorStop(0, '#0a0e1f');
    bg.addColorStop(1, '#05060f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 640, 400);

    const cyan = resolveColor('var(--neon-cyan)');
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, 610, 370);

    ctx.fillStyle = cyan;
    ctx.font = '900 26px Orbitron';
    ctx.fillText('⚡ NEON CIRCUIT COMBAT CARD', 40, 55);

    ctx.fillStyle = '#8a99ad';
    ctx.font = '14px Share Tech Mono';
    ctx.fillText('TACTICAL TELEMETRY EXPORT', 40, 78);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Share Tech Mono';
    ctx.fillText(`🏆 FINAL SCORE: ${this.score.toLocaleString()}`, 40, 140);
    ctx.fillText(`🌊 WAVES SURVIVED: ${this.waveManager.waveNumber}`, 40, 175);
    ctx.fillText(`👾 HOSTILES DESTROYED: ${this.kills}`, 40, 210);
    ctx.fillText(`⚡ BEST COMBO: ×${this.bestCombo}`, 40, 245);
    ctx.fillText(`🪙 CREDITS SALVAGED: ${this.creditsEarned.toLocaleString()}`, 40, 280);

    ctx.save();
    ctx.translate(480, 210);
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = cyan;
    ctx.font = 'bold 14px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('SUPERCAR', 0, 95);
    ctx.restore();

    const link = document.createElement('a');
    link.download = `neon_circuit_score_wave${this.waveManager.waveNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    this.audio.playPickup();
  }

  buyUpgrade(category) {
    const currentLvl = this.saveData.progression.upgrades[category] || 1;
    if (currentLvl >= 10) return; // Max level 10
    
    // Formula for upgrade costs
    const baseCosts = { engine: 100, armor: 100, shield: 100, weapon: 120, handling: 80, boost: 90, utility: 80 };
    const costMultiplier = 1.5;
    const cost = Math.round(baseCosts[category] * Math.pow(costMultiplier, currentLvl - 1));
    
    if (this.saveData.progression.credits >= cost) {
      this.saveData.progression.credits -= cost;
      this.saveData.progression.upgrades[category]++;
      SaveSystem.save(this.saveData);
      this.audio.playLevelUp();
      this.populateGarageScreen();
    } else {
      this.audio.playExplosion(false); // short buzzing failure sound
    }
  }

  populateGarageScreen() {
    document.getElementById('garage-credits').innerText = this.saveData.progression.credits.toLocaleString();
    
    const categories = ['engine', 'armor', 'shield', 'weapon', 'handling', 'boost', 'utility'];
    const baseCosts = { engine: 100, armor: 100, shield: 100, weapon: 120, handling: 80, boost: 90, utility: 80 };
    
    categories.forEach(category => {
      const lvl = this.saveData.progression.upgrades[category] || 1;
      const elLvl = document.getElementById(`upgrade-lvl-${category}`);
      const btn = document.getElementById(`btn-upgrade-${category}`);
      
      if (lvl >= 10) {
        elLvl.innerText = 'MAX (Lvl 10)';
        btn.innerHTML = '<span>MAXED OUT</span>';
        btn.disabled = true;
      } else {
        elLvl.innerText = `Lvl ${lvl}`;
        const cost = Math.round(baseCosts[category] * Math.pow(1.5, lvl - 1));
        btn.innerHTML = `<span>UPGRADE (<span class="cost">${cost}</span> CR)</span>`;
        btn.disabled = this.saveData.progression.credits < cost;
      }
    });

    // Populate weapons grid
    const weaponCards = document.querySelectorAll('.weapon-card');
    weaponCards.forEach(card => {
      const weaponId = card.getAttribute('data-weapon');
      const reqWave = parseInt(card.getAttribute('data-unlock')) || 0;
      
      // Determine lock status
      const unlocked = this.saveData.progression.highestWave >= reqWave;
      
      if (unlocked) {
        card.classList.remove('locked');
        const isEquipped = this.saveData.progression.activeWeapon === weaponId;
        
        if (isEquipped) {
          card.classList.add('active');
          card.querySelector('.status').innerText = 'EQUIPPED';
        } else {
          card.classList.remove('active');
          card.querySelector('.status').innerText = 'SELECT WEAPON';
        }
        
        // Remove old event listener first
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        newCard.addEventListener('click', () => {
          this.saveData.progression.activeWeapon = weaponId;
          SaveSystem.save(this.saveData);
          this.audio.playUIClick();
          this.populateGarageScreen();
        });
      } else {
        card.classList.add('locked');
        card.querySelector('.status').innerText = `REACH WAVE ${reqWave} TO UNLOCK`;
      }
    });
  }

  changeState(newState) {
    this.state = newState;
    
    // Hide all screens
    const screens = document.querySelectorAll('.ui-screen');
    screens.forEach(s => s.classList.add('hidden'));
    screens.forEach(s => s.classList.remove('active'));
    
    // Show new screen
    const currentScreen = document.getElementById(`menu-${newState.toLowerCase().replace('_', '-')}`);
    
    if (currentScreen) {
      currentScreen.classList.remove('hidden');
      // Timeout to trigger CSS transition
      setTimeout(() => currentScreen.classList.add('active'), 50);
    }
    
    const hud = document.getElementById('hud');
    if (newState === 'PLAYING') {
      hud.classList.remove('hidden');
      hud.classList.add('active');
      this.updateHUD(); // Immediate refresh of health, shield, score, level
    } else {
      hud.classList.add('hidden');
      hud.classList.remove('active');
    }
    
    if (newState === 'GARAGE') {
      this.populateGarageScreen();
    }

    if (newState === 'SETTINGS') {
      // Load current inputs
      document.getElementById('vol-master').value = Math.round(this.saveData.settings.masterVolume * 100);
      document.getElementById('vol-music').value = Math.round(this.saveData.settings.musicVolume * 100);
      document.getElementById('vol-sfx').value = Math.round(this.saveData.settings.sfxVolume * 100);
      document.getElementById('setting-glow').checked = this.saveData.settings.glowEnabled;
      document.getElementById('setting-particles').value = this.saveData.settings.particlesQuality;
      document.getElementById('setting-shake').checked = this.saveData.settings.shakeEnabled;
      document.getElementById('setting-damage-nums').checked = this.saveData.settings.damageNumbersEnabled;
    }
  }

  startGame() {
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    
    this.particles.clear();
    this.uiEffects.clear();
    
    // Spawn player
    this.player = new Player(this, 2500, 2500, this.saveData.progression.upgrades);
    
    // Center camera on player immediately
    this.camera.x = this.player.x - this.canvas.width / 2;
    this.camera.y = this.player.y - this.canvas.height / 2;
    this.camera.zoom = 1;
    this.camera.targetZoom = 1;
    
    // Stats reset for this run
    this.survivalTime = 0;
    this.score = 0;
    this.creditsEarned = 0;
    this.kills = 0;
    this.eliteKills = 0;
    this.bestCombo = 1;
    this.waveManager.reset();
    
    // Capture window focus and canvas focus
    window.focus();
    if (this.canvas) this.canvas.focus();

    this.changeState('PLAYING');
    
    // Start soundtrack
    this.audio.unlock();
    this.audio.stopMusic();
    this.audio.startMusic();
    
    // Run short wave start warning
    this.waveManager.startWave();

    // Trigger interactive tutorial for new players
    const tutOverlay = document.getElementById('tutorial-overlay');
    if (!this.saveData.progression.completedTutorial && tutOverlay) {
      this.tutorialStep = 0;
      this.tutorialActive = true;
      tutOverlay.classList.remove('hidden');
      this.updateTutorialOverlay();
    } else {
      this.tutorialActive = false;
      if (tutOverlay) tutOverlay.classList.add('hidden');
    }
  }

  updateTutorialOverlay() {
    const tutOverlay = document.getElementById('tutorial-overlay');
    if (!tutOverlay) return;

    const tutorialSteps = [
      "Drive using W, A, S, D or Arrow keys.",
      "Aim with Mouse, click or hold SPACE to fire.",
      "Hold LEFT SHIFT to turbo boost.",
      "Destroy hostiles to gather XP and Level Up!"
    ];
    
    const dots = document.querySelectorAll('.tut-progress-dots .dot');
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === this.tutorialStep);
    });

    const instEl = document.getElementById('tut-instruction');
    if (instEl) instEl.innerText = tutorialSteps[this.tutorialStep] || '';
  }

  advanceTutorial(step) {
    if (!this.tutorialActive || step !== this.tutorialStep) return;
    this.tutorialStep++;
    if (this.tutorialStep >= 4) {
      this.tutorialActive = false;
      const tutOverlay = document.getElementById('tutorial-overlay');
      if (tutOverlay) tutOverlay.classList.add('hidden');
      this.saveData.progression.completedTutorial = true;
      SaveSystem.save(this.saveData);
    } else {
      this.updateTutorialOverlay();
    }
  }

  pauseGame() {
    this.changeState('PAUSED');
  }

  resumeGame() {
    this.changeState('PLAYING');
  }

  levelUp(perkChoices) {
    this.changeState('LEVEL_UP');
    
    const container = document.getElementById('level-up-choices');
    container.innerHTML = '';
    
    perkChoices.forEach(perk => {
      const card = document.createElement('div');
      card.className = 'choice-card';
      card.innerHTML = `
        <h3>${perk.title}</h3>
        <p>${perk.description}</p>
        <span class="bonus">${perk.bonusText}</span>
      `;
      card.addEventListener('click', () => {
        // Apply perk
        perk.action(this.player);
        this.audio.playUIClick();
        this.resumeGame();
      });
      container.appendChild(card);
    });
  }

  handleGameOver() {
    this.audio.stopMusic();
    this.audio.playExplosion(true);
    
    // Save credits and highscore
    const totalCredits = this.saveData.progression.credits + this.creditsEarned;
    this.saveData.progression.credits = totalCredits;
    
    if (this.score > this.saveData.progression.bestScore) {
      this.saveData.progression.bestScore = this.score;
    }
    
    if (this.waveManager.waveNumber > this.saveData.progression.highestWave) {
      this.saveData.progression.highestWave = this.waveManager.waveNumber;
    }
    
    // Update lifetime stats
    this.saveData.statistics.totalKills += this.kills;
    this.saveData.statistics.totalSurvivalTime += this.survivalTime;
    this.saveData.statistics.runsCount += 1;
    
    SaveSystem.save(this.saveData);
    
    // Populate Game Over screen
    document.getElementById('stat-waves').innerText = this.waveManager.waveNumber;
    document.getElementById('stat-score').innerText = this.score.toLocaleString();
    document.getElementById('stat-kills').innerText = this.kills;
    document.getElementById('stat-elites').innerText = this.eliteKills;
    document.getElementById('stat-credits-earned').innerText = this.creditsEarned;
    document.getElementById('stat-combo').innerText = `×${this.bestCombo}`;
    
    const minutes = Math.floor(this.survivalTime / 60);
    const seconds = Math.floor(this.survivalTime % 60).toString().padStart(2, '0');
    document.getElementById('stat-time').innerText = `${minutes}:${seconds}`;
    
    this.changeState('GAME_OVER');
  }

  handleVictory() {
    this.audio.stopMusic();
    this.audio.playLevelUp();
    
    // Add heavy rewards
    const victoryBonus = 5000;
    this.creditsEarned += victoryBonus;
    
    const totalCredits = this.saveData.progression.credits + this.creditsEarned;
    this.saveData.progression.credits = totalCredits;
    
    if (this.score > this.saveData.progression.bestScore) {
      this.saveData.progression.bestScore = this.score;
    }
    
    SaveSystem.save(this.saveData);
    
    document.getElementById('vic-score').innerText = this.score.toLocaleString();
    document.getElementById('vic-waves').innerText = this.waveManager.waveNumber;
    document.getElementById('vic-credits').innerText = this.creditsEarned;
    
    this.changeState('VICTORY');
  }

  // CORE UPDATE ROUTINE
  update(dt) {
    if (this.state !== 'PLAYING') return;

    // Check pause request
    if (this.input.isPausePressed()) {
      this.pauseGame();
      return;
    }
    
    this.survivalTime += dt;

    // Update Player
    if (this.player) {
      this.player.update(this.input, dt);
      
      // Check for death
      if (this.player.hp <= 0) {
        this.handleGameOver();
        return;
      }
    }
    
    // Update Camera
    const mouseWorld = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    this.camera.update(this.player.x, this.player.y, this.input.mouse.x, this.input.mouse.y, dt, this.input.touchActive);
    
    // Update Waves
    this.waveManager.update(dt);
    
    // Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(this.player, dt);
      
      if (enemy.isDead) {
        this.enemies.splice(i, 1);
      }
    }
    
    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(dt);
      
      if (proj.isDead) {
        this.projectiles.splice(i, 1);
      }
    }
    
    // Update Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.update(this.player, dt);
      
      if (pickup.isDead) {
        this.pickups.splice(i, 1);
      }
    }
    
    // Update FX
    this.particles.update(dt);
    this.uiEffects.update(dt);
    
    // Resolve Collisions
    this.resolveCollisions();
    
    // Sync HUD displays
    this.updateHUD();
  }

  resolveCollisions() {
    // 1. Bullets vs Enemies
    for (let p of this.projectiles) {
      if (p.isDead || p.owner === 'enemy') continue;
      
      for (let e of this.enemies) {
        if (e.isDead) continue;
        
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < p.radius + e.radius) {
          e.takeDamage(p.damage, p.isCrit);
          p.hit();
          
          if (p.isDead) break;
        }
      }
    }

    // 2. Bullets vs Player
    for (let p of this.projectiles) {
      if (p.isDead || p.owner === 'player') continue;
      
      const dx = p.x - this.player.x;
      const dy = p.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < p.radius + this.player.radius) {
        this.player.takeDamage(p.damage);
        p.hit();
      }
    }

    // 3. Player vs Enemies (collisions & collision damage)
    for (let e of this.enemies) {
      if (e.isDead) continue;
      
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const overlap = (this.player.radius + e.radius) - dist;
      
      if (overlap > 0) {
        // Push enemy back and damage player/enemy
        const angle = Math.atan2(dy, dx);
        
        // Simple physics push back
        e.x += Math.cos(angle) * overlap;
        e.y += Math.sin(angle) * overlap;
        
        // Ramming damage proportional to player velocity
        const speed = Math.hypot(this.player.vx, this.player.vy);
        const damage = Math.max(5, Math.round(speed * 0.8));
        
        e.takeDamage(damage, false);
        this.player.takeDamage(10); // Standard collision penalty
        
        this.camera.addTrauma(0.2);
      }
    }
    
    // 4. Bullets vs Arena Walls
    for (let p of this.projectiles) {
      if (p.isDead) continue;
      if (p.x < 0 || p.x > this.arena.width || p.y < 0 || p.y > this.arena.height) {
        p.isDead = true;
      }
    }

    // 5. Entities vs Destructible Obstacles
    this.arena.resolveEntityCollisions(this.player, this.enemies, this.projectiles, this);
  }

  updateHUD() {
    // 1. Bars
    document.getElementById('hud-hp-bar').style.width = `${Math.max(0, (this.player.hp / this.player.maxHp) * 100)}%`;
    document.getElementById('hud-hp-text').innerText = `${Math.round(this.player.hp)} / ${this.player.maxHp}`;
    
    document.getElementById('hud-shield-bar').style.width = `${Math.max(0, (this.player.shield / this.player.maxShield) * 100)}%`;
    document.getElementById('hud-shield-text').innerText = `${Math.round(this.player.shield)} / ${this.player.maxShield}`;
    
    const armorPct = Math.round((1 - this.player.armorReduction) * 100);
    document.getElementById('hud-armor-bar').style.width = `${armorPct}%`;
    document.getElementById('hud-armor-text').innerText = `${armorPct}% ABS`;

    document.getElementById('hud-boost-bar').style.width = `${(this.player.boostEnergy / this.player.maxBoostEnergy) * 100}%`;
    
    const speed = Math.round(Math.hypot(this.player.vx, this.player.vy) * 20); // Scale up for visual speed
    document.getElementById('hud-speedometer').innerText = `${speed} KM/H`;

    // 2. Score, wave, credits
    document.getElementById('hud-score').innerText = this.score.toString().padStart(6, '0');
    document.getElementById('hud-credits').innerText = this.creditsEarned;
    document.getElementById('hud-lvl-text').innerText = this.player.level;
    
    const xpNeeded = this.player.getXpNeeded();
    document.getElementById('hud-xp-bar').style.width = `${(this.player.xp / xpNeeded) * 100}%`;

    document.getElementById('hud-wave-title').innerText = `WAVE ${this.waveManager.waveNumber}`;
    document.getElementById('hud-enemies-left').innerText = `ENEMIES: ${this.enemies.length + this.waveManager.enemiesToSpawn}`;

    // Weapon UI status
    const currentWeapon = this.player.weapons[this.player.activeWeaponIndex];
    document.getElementById('hud-weapon-name').innerText = currentWeapon.name.toUpperCase();
    
    if (currentWeapon.type === 'laser') {
      document.getElementById('hud-ammo-container').classList.add('hidden');
      document.getElementById('hud-heat-container').classList.remove('hidden');
      document.getElementById('hud-heat-bar').style.width = `${(currentWeapon.heat / currentWeapon.maxHeat) * 100}%`;
      if (currentWeapon.overheated) {
        document.getElementById('hud-weapon-name').innerText = 'OVERHEATED';
      }
    } else {
      document.getElementById('hud-ammo-container').classList.remove('hidden');
      document.getElementById('hud-heat-container').classList.add('hidden');
      if (currentWeapon.reloading) {
        document.getElementById('hud-ammo-bar').style.width = `${(currentWeapon.reloadTimer / currentWeapon.reloadTime) * 100}%`;
        document.getElementById('hud-ammo-text').innerText = 'RELOADING...';
        document.getElementById('hud-ammo-bar').style.backgroundColor = 'var(--neon-magenta)';
      } else {
        document.getElementById('hud-ammo-bar').style.width = `${(currentWeapon.ammo / currentWeapon.maxAmmo) * 100}%`;
        document.getElementById('hud-ammo-text').innerText = `${currentWeapon.ammo} / ${currentWeapon.maxAmmo}`;
        document.getElementById('hud-ammo-bar').style.backgroundColor = '';
      }
    }

    // 3. Combo UI
    const comboProgress = this.player.comboTimer / this.player.comboDuration;
    if (this.player.combo > 1) {
      document.getElementById('hud-combo-container').classList.remove('hidden');
      document.getElementById('hud-combo-value').innerText = `COMBO ×${this.player.combo}`;
      document.getElementById('hud-combo-bar').style.width = `${comboProgress * 100}%`;
    } else {
      document.getElementById('hud-combo-container').classList.add('hidden');
    }

    // 4. Power-up icons
    const list = document.getElementById('hud-powerups-list');
    list.innerHTML = '';
    
    for (let key in this.player.powerups) {
      const active = this.player.powerups[key];
      if (active > 0) {
        const item = document.createElement('div');
        let colorClass = 'cyan';
        if (key === 'rapidFire') colorClass = 'green';
        if (key === 'spreadShot') colorClass = 'purple';
        if (key === 'damageBoost') colorClass = 'red';
        if (key === 'magnet') colorClass = 'magenta';
        if (key === 'overdrive') colorClass = 'yellow';
        
        item.className = `powerup-indicator ${colorClass}`;
        
        const labelText = key.replace(/([A-Z])/g, ' $1').toUpperCase();
        item.innerHTML = `${labelText} <span>${Math.ceil(active)}s</span>`;
        list.appendChild(item);
      }
    }
  }

  // CORE RENDER ROUTINE
  render() {
    // 1. Draw rich radial background centered on screen
    const grad = this.ctx.createRadialGradient(
      this.canvas.width / 2, this.canvas.height / 2, 10,
      this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.75
    );
    grad.addColorStop(0, '#0d0d29'); // glowing dark violet center
    grad.addColorStop(1, '#020206'); // black edge
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render static grid, parallax, background signs, stars
    this.arena.renderBackground(this.ctx, this.camera);

    // Apply Camera translation
    this.camera.applyTransforms(this.ctx);

    // Draw world boundaries
    this.ctx.strokeStyle = 'var(--neon-magenta)';
    this.ctx.lineWidth = 15;
    this.ctx.strokeRect(0, 0, this.arena.width, this.arena.height);
    
    // Render tire skid marks on floor
    if (this.player) {
      this.player.renderSkidMarks(this.ctx);
    }

    // Render pickups
    for (let p of this.pickups) {
      p.render(this.ctx);
    }

    // Render stations & obstacles
    this.arena.renderStationsAndObstacles(this.ctx);

    // Render player
    if (this.player) {
      this.player.render(this.ctx);
    }

    // Render enemies
    for (let e of this.enemies) {
      e.render(this.ctx);
    }

    // Render projectiles with screen blend glow
    this.ctx.save();
    if (this.saveData.settings.glowEnabled) {
      this.ctx.globalCompositeOperation = 'screen';
    }
    for (let p of this.projectiles) {
      p.render(this.ctx);
    }
    this.ctx.restore();

    // Render particles with screen blend glow
    this.ctx.save();
    if (this.saveData.settings.glowEnabled) {
      this.ctx.globalCompositeOperation = 'screen';
    }
    this.particles.render(this.ctx);
    this.ctx.restore();

    // Render floating damage indicators
    this.uiEffects.render(this.ctx);

    // Render developer hitboxes and AI statuses if debug active
    if (this.debugMode) {
      this.renderDebugInfo();
    }

    // Restore Camera translation
    this.camera.restoreTransforms(this.ctx);

    // Render HUD Minimap (radar) on top of screen
    this.renderMinimap();
    
    // Render off-screen directional tracking arrows (Bosses & Stations)
    this.renderOffscreenPointers();

    // Draw touch controls in screen-space if active
    if (this.input.touchActive) {
      this.renderTouchControls();
    }
    
    // Render FPS monitor in corner if debug mode
    if (this.debugMode) {
      this.renderFpsTracker();
    }

    if (this.state === 'MENU') {
      this.renderMenuShowcaseCar();
    }
  }

  renderMenuShowcaseCar() {
    const cvs = document.getElementById('menu-car-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const w = cvs.width;
    const h = cvs.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);

    const angle = Date.now() * 0.0012;
    ctx.rotate(angle);

    const cyanCol = resolveColor('var(--neon-cyan)');
    const yellowCol = resolveColor('var(--neon-yellow)');

    const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 55);
    aura.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, 0, 55, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#080c1a';
    ctx.strokeStyle = cyanCol;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(14, -14);
    ctx.lineTo(-20, -16);
    ctx.lineTo(-28, -6);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-28, 6);
    ctx.lineTo(-20, 16);
    ctx.lineTo(14, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(2, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const wheels = [
      { x: 14, y: -15 }, { x: 14, y: 15 },
      { x: -16, y: -15 }, { x: -16, y: 15 }
    ];
    ctx.fillStyle = '#05070e';
    ctx.strokeStyle = cyanCol;
    ctx.lineWidth = 1.5;

    wheels.forEach(wh => {
      ctx.fillRect(wh.x - 6, wh.y - 3, 12, 6);
      ctx.strokeRect(wh.x - 6, wh.y - 3, 12, 6);
    });

    ctx.fillStyle = yellowCol;
    ctx.fillRect(6, -6, 12, 3);
    ctx.fillRect(6, 3, 12, 3);

    ctx.restore();
  }

  renderOffscreenPointers() {
    if (!this.player || this.state !== 'PLAYING') return;

    const margin = 38;
    const screenW = this.canvas.width;
    const screenH = this.canvas.height;
    const centerX = screenW / 2;
    const centerY = screenH / 2;

    const targets = [];

    // 1. Track Active Bosses
    for (let e of this.enemies) {
      if (e.isDead) continue;
      if (e.type === 'titan' || e.type === 'void_racer' || e.type === 'omega_core' || e.type.includes('boss')) {
        targets.push({ x: e.x, y: e.y, label: '👹 BOSS', color: 'var(--neon-magenta)' });
      }
    }

    // 2. Track Health / Charge Stations
    for (let st of this.arena.stations) {
      const stCenterX = st.x + st.width / 2;
      const stCenterY = st.y + st.height / 2;
      const isHealth = st.type === 'health';
      targets.push({
        x: stCenterX,
        y: stCenterY,
        label: isHealth ? '✚ REPAIR' : '⚡ CHARGE',
        color: isHealth ? 'var(--neon-green)' : 'var(--neon-yellow)'
      });
    }

    targets.forEach(t => {
      const screenPos = this.camera.worldToScreen(t.x, t.y);

      // Check if target is outside screen viewport
      const isOffscreen = screenPos.x < 30 || screenPos.x > screenW - 30 ||
                          screenPos.y < 30 || screenPos.y > screenH - 30;

      if (!isOffscreen) return;

      const angle = Math.atan2(screenPos.y - centerY, screenPos.x - centerX);

      // Clamp pointer position to screen boundary margin
      const edgeX = Math.max(margin, Math.min(screenW - margin, centerX + Math.cos(angle) * (centerX - margin)));
      const edgeY = Math.max(margin, Math.min(screenH - margin, centerY + Math.sin(angle) * (centerY - margin)));

      const distMeters = Math.round(Math.hypot(t.x - this.player.x, t.y - this.player.y) / 10);

      this.ctx.save();
      this.ctx.translate(edgeX, edgeY);

      const resolvedCol = resolveColor(t.color);
      this.ctx.fillStyle = resolvedCol;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;

      const isGlow = this.saveData.settings.glowEnabled;
      this.ctx.shadowBlur = isGlow ? 10 : 0;
      this.ctx.shadowColor = resolvedCol;

      // Draw arrow pointer
      this.ctx.save();
      this.ctx.rotate(angle);
      this.ctx.beginPath();
      this.ctx.moveTo(14, 0);
      this.ctx.lineTo(-8, -7);
      this.ctx.lineTo(-3, 0);
      this.ctx.lineTo(-8, 7);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();

      // Text label and distance
      this.ctx.shadowBlur = 0;
      this.ctx.font = 'bold 10px Share Tech Mono';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const textOffsetY = Math.sin(angle) > 0 ? -16 : 16;
      this.ctx.fillText(`${t.label} (${distMeters}m)`, 0, textOffsetY);

      this.ctx.restore();
    });
  }

  renderMinimap() {
    // We render a neon radar circle overlay
    const size = 150;
    const margin = 20;
    const x = this.canvas.width - size - margin;
    const y = 200; // Place below the top right stats panel
    
    this.ctx.save();
    this.ctx.translate(x, y);
    
    // Circular background
    this.ctx.fillStyle = 'rgba(5, 5, 20, 0.75)';
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Center ring
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    this.ctx.beginPath();
    this.ctx.arc(size/2, size/2, size/4, 0, Math.PI*2);
    this.ctx.stroke();

    // Map scaling factor
    const mapScale = size / this.arena.width;

    // Draw arena boundaries
    this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.2)';
    this.ctx.strokeRect(0, 0, size, size);

    // Draw Stations
    this.ctx.fillStyle = 'rgba(57, 255, 20, 0.4)'; // green
    for (let st of this.arena.stations) {
      this.ctx.fillRect(st.x * mapScale, st.y * mapScale, st.width * mapScale, st.height * mapScale);
    }

    // Draw Pickups
    this.ctx.fillStyle = 'rgba(255, 234, 0, 0.6)'; // yellow
    for (let p of this.pickups) {
      this.ctx.fillRect(p.x * mapScale - 1, p.y * mapScale - 1, 2, 2);
    }

    // Draw Enemies
    this.ctx.fillStyle = resolveColor('var(--neon-red)');
    for (let e of this.enemies) {
      this.ctx.beginPath();
      this.ctx.arc(e.x * mapScale, e.y * mapScale, 2, 0, Math.PI*2);
      this.ctx.fill();
    }

    // Draw Player (flashing Cyan dot)
    if (this.player) {
      this.ctx.fillStyle = (Date.now() % 400 < 200) ? resolveColor('var(--neon-cyan)') : '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(this.player.x * mapScale, this.player.y * mapScale, 3, 0, Math.PI*2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  renderDebugInfo() {
    if (!this.player) return;
    // 1. Draw Player outline & speed vector
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI*2);
    this.ctx.stroke();
    
    // Draw collision box
    this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
    this.ctx.fillRect(this.player.x - this.player.radius, this.player.y - this.player.radius, this.player.radius*2, this.player.radius*2);

    // Velocity Vector
    this.ctx.strokeStyle = resolveColor('var(--neon-cyan)');
    this.ctx.beginPath();
    this.ctx.moveTo(this.player.x, this.player.y);
    this.ctx.lineTo(this.player.x + this.player.vx * 20, this.player.y + this.player.vy * 20);
    this.ctx.stroke();

    // 2. Draw Enemy bounds & AI trajectories
    for (let e of this.enemies) {
      this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI*2);
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
      this.ctx.fillRect(e.x - e.radius, e.y - e.radius, e.radius*2, e.radius*2);
      
      // Draw detection range circle
      if (e.detectRange) {
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.15)';
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(e.x, e.y, e.detectRange, 0, Math.PI*2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
      
      // Draw velocity vector
      this.ctx.strokeStyle = resolveColor('var(--neon-yellow)');
      this.ctx.beginPath();
      this.ctx.moveTo(e.x, e.y);
      this.ctx.lineTo(e.x + (e.vx || 0) * 15, e.y + (e.vy || 0) * 15);
      this.ctx.stroke();

      // Show AI state text above them
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '10px Share Tech Mono';
      this.ctx.fillText(e.aiState || 'CHASE', e.x - 15, e.y - e.radius - 12);
      this.ctx.fillText(`HP: ${e.hp}`, e.x - 15, e.y - e.radius - 2);
    }

    // 3. Draw Obstacles collision boxes
    for (let o of this.arena.obstacles) {
      this.ctx.strokeStyle = resolveColor('var(--neon-yellow)');
      this.ctx.strokeRect(o.x, o.y, o.width, o.height);
    }
  }

  renderFpsTracker() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.strokeStyle = resolveColor('var(--neon-cyan)');
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(10, this.canvas.height - 120, 200, 110);
    this.ctx.strokeRect(10, this.canvas.height - 120, 200, 110);

    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Share Tech Mono';
    this.ctx.fillText(`ENGINE STATE: ${this.state}`, 20, this.canvas.height - 100);
    this.ctx.fillText(`FPS: ${this.fps}`, 20, this.canvas.height - 85);
    this.ctx.fillText(`ENTITIES: ${1 + this.enemies.length + this.projectiles.length + this.pickups.length}`, 20, this.canvas.height - 70);
    this.ctx.fillText(`PARTICLES: ${this.particles.particles.length}`, 20, this.canvas.height - 55);
    this.ctx.fillText(`COORDS: X ${Math.round(this.player?.x || 0)} Y ${Math.round(this.player?.y || 0)}`, 20, this.canvas.height - 40);
    this.ctx.fillText(`TIME: ${this.survivalTime.toFixed(1)}s`, 20, this.canvas.height - 25);
    this.ctx.restore();
  }

  renderTouchControls() {
    this.ctx.save();
    
    // Left side: Movement Joystick Base & Knob
    const j = this.input.joystick;
    const baseR = 50;
    const handleR = 22;
    
    // Render static hint ring if joystick inactive
    const jx = j.active ? j.startX : 90;
    const jy = j.active ? j.startY : this.canvas.height - 90;
    const curX = j.active ? j.curX : jx;
    const curY = j.active ? j.curY : jy;

    const cyanCol = resolveColor('var(--neon-cyan)');
    const greenCol = resolveColor('var(--neon-green)');
    const yellowCol = resolveColor('var(--neon-yellow)');

    // Outer base ring
    this.ctx.strokeStyle = j.active ? cyanCol : 'rgba(0, 243, 255, 0.35)';
    this.ctx.fillStyle = j.active ? 'rgba(0, 243, 255, 0.12)' : 'rgba(4, 6, 18, 0.4)';
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = cyanCol;
    this.ctx.shadowBlur = (this.saveData.settings.glowEnabled && j.active) ? 12 : 0;
    
    this.ctx.beginPath();
    this.ctx.arc(jx, jy, baseR, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Inner handle knob
    this.ctx.fillStyle = j.active ? cyanCol : 'rgba(0, 243, 255, 0.5)';
    this.ctx.beginPath();
    this.ctx.arc(curX, curY, handleR, 0, Math.PI * 2);
    this.ctx.fill();

    // Right side: Action Touch Buttons
    const rect = this.canvas.getBoundingClientRect();
    const bx = rect.width - 85;
    const by = rect.height - 85;
    
    // 1. FIRE Touch Button (💥)
    this.ctx.strokeStyle = this.input.shootBtn.active ? greenCol : 'rgba(0, 255, 136, 0.4)';
    this.ctx.fillStyle = this.input.shootBtn.active ? 'rgba(0, 255, 136, 0.3)' : 'rgba(4, 6, 18, 0.5)';
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = greenCol;
    this.ctx.shadowBlur = (this.saveData.settings.glowEnabled && this.input.shootBtn.active) ? 14 : 0;
    
    this.ctx.beginPath();
    this.ctx.arc(bx, by, 36, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 12px Orbitron';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.shadowBlur = 0;
    this.ctx.fillText("💥 FIRE", bx, by);

    // 2. BOOST Touch Button (🚀)
    const tbx = rect.width - 85;
    const tby = rect.height - 170;
    
    this.ctx.strokeStyle = this.input.boostBtn.active ? yellowCol : 'rgba(255, 204, 0, 0.4)';
    this.ctx.fillStyle = this.input.boostBtn.active ? 'rgba(255, 204, 0, 0.3)' : 'rgba(4, 6, 18, 0.5)';
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = yellowCol;
    this.ctx.shadowBlur = (this.saveData.settings.glowEnabled && this.input.boostBtn.active) ? 14 : 0;
    
    this.ctx.beginPath();
    this.ctx.arc(tbx, tby, 28, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText("🚀 BOOST", tbx, tby);

    // 3. WEAPON SWAP Touch Button (🔄)
    const swx = rect.width - 85;
    const swy = rect.height - 245;

    this.ctx.strokeStyle = this.input.swapBtn.active ? cyanCol : 'rgba(0, 243, 255, 0.4)';
    this.ctx.fillStyle = this.input.swapBtn.active ? 'rgba(0, 243, 255, 0.3)' : 'rgba(4, 6, 18, 0.5)';
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = cyanCol;
    this.ctx.fillStyle = this.input.swapBtn.active ? 'rgba(0, 243, 255, 0.3)' : 'rgba(4, 6, 18, 0.5)';
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowColor = 'var(--neon-cyan)';
    this.ctx.shadowBlur = (this.saveData.settings.glowEnabled && this.input.swapBtn.active) ? 12 : 0;

    this.ctx.beginPath();
    this.ctx.arc(swx, swy, 25, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 10px Orbitron';
    this.ctx.fillText("🔄 SWAP", swx, swy);
    
    this.ctx.restore();
  }

  // Main tick loop
  tick(timestamp) {
    // Cap delta time to prevent massive jumps during focus loss (spontaneous teleportation)
    let dt = (timestamp - this.lastTime) / 1000;
    if (isNaN(dt) || dt > 0.1) dt = 0.1;
    this.lastTime = timestamp;

    // Track FPS
    this.framesThisSecond++;
    if (timestamp > this.lastFpsUpdate + 1000) {
      this.fps = this.framesThisSecond;
      this.framesThisSecond = 0;
      this.lastFpsUpdate = timestamp;
    }

    // Game logic and updates
    this.update(dt);

    // Audio hum pitch mapping to car speed
    if (this.state === 'PLAYING' && this.player) {
      const speed = Math.hypot(this.player.vx, this.player.vy);
      const speedRatio = Math.min(speed / this.player.maxSpeed, 1.0);
      this.audio.updateEngineHum(speedRatio);
    }

    // Render calls
    this.render();

    requestAnimationFrame((t) => this.tick(t));
  }

  start() {
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    requestAnimationFrame((t) => this.tick(t));
  }
}
