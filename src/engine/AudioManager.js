export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    
    this.volumes = {
      master: 0.7,
      music: 0.5,
      sfx: 0.8
    };

    // Tracking active loops (e.g. boost hum, laser, engine hum)
    this.loops = {
      engine: null,
      boost: null,
      laser: null,
      music: null
    };

    this.musicInterval = null;
    this.musicStep = 0;
    this.isPlayingMusic = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      
      this.ctx = new AudioContextClass();
      
      // Node Graph Setup
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      
      this.setVolumes(this.volumes.master, this.volumes.music, this.volumes.sfx);
      this.startEngineHum();
    } catch (e) {
      console.warn("Web Audio API not supported or blocked", e);
    }
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolumes(master, music, sfx) {
    this.volumes.master = master;
    this.volumes.music = music;
    this.volumes.sfx = sfx;
    
    if (this.masterGain) this.masterGain.gain.setValueAtTime(master, this.ctx.currentTime);
    if (this.musicGain) this.musicGain.gain.setValueAtTime(music, this.ctx.currentTime);
    if (this.sfxGain) this.sfxGain.gain.setValueAtTime(sfx, this.ctx.currentTime);
  }

  // Create simple noise buffer for explosions and hit sounds
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playSFX(freqStart, freqEnd, duration, type = 'sine', gainVal = 0.5, filterType = null, filterFreq = 1000) {
    if (!this.ctx) return;
    this.unlock();
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    }
    
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    let destNode = this.sfxGain;
    if (filterType) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, now);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    
    gain.connect(destNode);
    osc.start(now);
    osc.stop(now + duration);
  }

  playShoot(weaponType) {
    switch (weaponType) {
      case 'plasma':
        this.playSFX(880, 220, 0.15, 'triangle', 0.25);
        break;
      case 'spread':
        this.playSFX(600, 150, 0.12, 'sawtooth', 0.18);
        this.playSFX(550, 100, 0.14, 'sawtooth', 0.18);
        break;
      case 'railgun':
        // Piercing sci-fi blast
        this.playSFX(1200, 50, 0.45, 'sawtooth', 0.6, 'lowpass', 400);
        this.playSFX(100, 5, 0.35, 'square', 0.4);
        break;
      case 'missile':
        this.playSFX(150, 600, 0.3, 'sine', 0.35);
        break;
      case 'emp':
        this.playSFX(900, 80, 0.6, 'sine', 0.5, 'bandpass', 300);
        break;
      case 'laser':
        // Quick pulse trigger for continuous beam
        this.playSFX(660, 660, 0.05, 'sawtooth', 0.08, 'lowpass', 1200);
        break;
    }
  }

  playExplosion(isBoss = false) {
    if (!this.ctx) return;
    this.unlock();
    
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBoss ? 150 : 300, now);
    
    const gain = this.ctx.createGain();
    const duration = isBoss ? 1.5 : 0.6;
    gain.gain.setValueAtTime(isBoss ? 0.8 : 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    noise.start(now);
    noise.stop(now + duration);
    
    // Add low bass rumble oscillator
    this.playSFX(isBoss ? 80 : 120, 20, duration, 'sine', isBoss ? 0.6 : 0.3);
  }

  playHit() {
    this.playSFX(250, 100, 0.06, 'triangle', 0.15, 'bandpass', 400);
  }

  playShieldHit() {
    this.playSFX(980, 440, 0.1, 'sine', 0.25);
  }

  playDrift(active) {
    if (!this.ctx) return;
    if (active) {
      if (!this.loops.drift) {
        this.unlock();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(700, now);
        gain.gain.setValueAtTime(0.08, now);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.start(now);
        this.loops.drift = { osc, gain, filter };
      } else {
        // Modulate frequency slightly to make it squeal
        const now = this.ctx.currentTime;
        this.loops.drift.osc.frequency.setValueAtTime(700 + Math.sin(now * 30) * 120, now);
      }
    } else {
      if (this.loops.drift) {
        try { this.loops.drift.osc.stop(); } catch(e){}
        this.loops.drift = null;
      }
    }
  }

  playBoost(active) {
    if (!this.ctx) return;
    if (active) {
      if (!this.loops.boost) {
        this.unlock();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(160, now + 0.5);
        
        gain.gain.setValueAtTime(0.12, now);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        
        osc.start(now);
        this.loops.boost = { osc, gain };
      }
    } else {
      if (this.loops.boost) {
        try { this.loops.boost.osc.stop(); } catch(e){}
        this.loops.boost = null;
      }
    }
  }

  startEngineHum() {
    if (!this.ctx || this.loops.engine) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(55, now); // Low engine growl
    gain.gain.setValueAtTime(0.04, now);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, now);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(now);
    this.loops.engine = { osc, gain };
  }

  updateEngineHum(speedRatio) {
    if (!this.ctx || !this.loops.engine) return;
    const now = this.ctx.currentTime;
    // Map speed ratio to engine pitch (55Hz to 120Hz)
    const freq = 55 + speedRatio * 65;
    this.loops.engine.osc.frequency.setValueAtTime(freq, now);
    this.loops.engine.gain.gain.setValueAtTime(0.04 + speedRatio * 0.03, now);
  }

  playPickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playSFX(523.25, 783.99, 0.2, 'sine', 0.15); // C5 -> G5
  }

  playLevelUp() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Play quick arpeggio
    this.playSFX(523.25, 523.25, 0.1, 'sine', 0.2); // C5
    setTimeout(() => this.playSFX(659.25, 659.25, 0.1, 'sine', 0.2), 80); // E5
    setTimeout(() => this.playSFX(783.99, 783.99, 0.1, 'sine', 0.2), 160); // G5
    setTimeout(() => this.playSFX(1046.50, 1046.50, 0.3, 'sine', 0.2), 240); // C6
  }

  playWaveStart() {
    if (!this.ctx) return;
    this.playSFX(330, 220, 0.4, 'sawtooth', 0.25, 'lowpass', 600);
    setTimeout(() => {
      this.playSFX(330, 220, 0.6, 'sawtooth', 0.25, 'lowpass', 600);
    }, 200);
  }

  playUIClick() {
    this.playSFX(600, 300, 0.08, 'sine', 0.15);
  }

  playUIHover() {
    this.playSFX(800, 800, 0.03, 'sine', 0.05);
  }

  // PROCEDURAL SYNTHWAVE MUSIC SEQUENCER
  startMusic() {
    if (this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.unlock();
    
    const tempo = 110; // BPM
    const stepTime = 60 / tempo / 2; // Eighth notes
    this.musicStep = 0;
    
    // Notes mappings (Hz)
    const notes = {
      C2: 65.41, D2: 73.42, Eb2: 77.78, F2: 87.31, G2: 98.00, Ab2: 103.83, Bb2: 116.54,
      C3: 130.81, D3: 146.83, Eb3: 155.56, F3: 174.61, G3: 196.00, Ab3: 207.65, Bb3: 233.08,
      C4: 261.63, G4: 392.00, Bb4: 466.16
    };
    
    // 16-step bassline loop
    const bassline = [
      'C2', 'C2', 'C2', 'C2', 'Eb2', 'Eb2', 'Eb2', 'Eb2',
      'F2', 'F2', 'F2', 'F2', 'Bb2', 'Bb2', 'G2', 'G2'
    ];
    
    // Melodic arpeggio patterns based on bass note index
    const melody = [
      'C4', 'G4', 'C4', 'Bb4', 'G4', 'Bb4', 'C4', 'G4',
      'Eb4', 'Bb4', 'Eb4', 'C4', 'Bb4', 'C4', 'Eb4', 'Bb4'
    ];
    
    this.musicInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      
      const now = this.ctx.currentTime;
      const bassNote = bassline[this.musicStep % bassline.length];
      const hz = notes[bassNote] || 65.41;
      
      // BASS synthesizer
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, now);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + stepTime * 0.9);
      
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + stepTime * 0.95);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      
      osc.start(now);
      osc.stop(now + stepTime * 0.95);
      
      // Ambient Hi-hat trigger on off-beats
      if (this.musicStep % 2 === 1) {
        const hhOsc = this.ctx.createOscillator();
        const hhGain = this.ctx.createGain();
        const hhFilter = this.ctx.createBiquadFilter();
        
        hhOsc.type = 'triangle';
        hhOsc.frequency.setValueAtTime(10000, now);
        
        hhFilter.type = 'highpass';
        hhFilter.frequency.setValueAtTime(8000, now);
        
        hhGain.gain.setValueAtTime(0.015, now);
        hhGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        
        hhOsc.connect(hhFilter);
        hhFilter.connect(hhGain);
        hhGain.connect(this.musicGain);
        
        hhOsc.start(now);
        hhOsc.stop(now + 0.05);
      }
      
      // Ambient Chord pad on step 0, 4, 8, 12
      if (this.musicStep % 8 === 0) {
        const root = hz * 4; // Shift up two octaves
        const chordOffsets = [1, 1.2, 1.5]; // Major/minor approximation
        
        chordOffsets.forEach((factor) => {
          const padOsc = this.ctx.createOscillator();
          const padGain = this.ctx.createGain();
          
          padOsc.type = 'sine';
          padOsc.frequency.setValueAtTime(root * factor, now);
          
          padGain.gain.setValueAtTime(0.03, now);
          padGain.gain.exponentialRampToValueAtTime(0.001, now + stepTime * 7.5);
          
          padOsc.connect(padGain);
          padGain.connect(this.musicGain);
          
          padOsc.start(now);
          padOsc.stop(now + stepTime * 8);
        });
      }
      
      this.musicStep++;
    }, stepTime * 1000);
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}
