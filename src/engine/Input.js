export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x: 0, y: 0, screenX: 0, screenY: 0, isDown: false };
    
    // Touch controls (virtual joystick)
    this.touchActive = false;
    this.joystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, vx: 0, vy: 0 };
    this.shootBtn = { active: false };
    this.boostBtn = { active: false };

    this.setupListeners();
  }

  setupListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      this.keys[e.code] = true; // Support alternative mapping codes e.g. ArrowUp, ShiftLeft
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.keys[e.code] = false;
    });

    // Mouse Movement
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Screen space mouse
      this.mouse.screenX = e.clientX - rect.left;
      this.mouse.screenY = e.clientY - rect.top;
      
      // Calculate normalized relative position from center of canvas
      this.mouse.x = this.mouse.screenX;
      this.mouse.y = this.mouse.screenY;
    });

    // Mouse Clicks
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.isDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.isDown = false;
    });

    // Prevent right click menu in game area
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch Event Listeners for Mobile / Tablets
    window.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchActive = true;
      const rect = this.canvas.getBoundingClientRect();
      
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const tx = touch.clientX - rect.left;
        const ty = touch.clientY - rect.top;

        // If left side of screen, initialize virtual movement joystick
        if (tx < rect.width / 2 && !this.joystick.active) {
          this.joystick.active = true;
          this.joystick.startX = tx;
          this.joystick.startY = ty;
          this.joystick.curX = tx;
          this.joystick.curY = ty;
          this.joystick.vx = 0;
          this.joystick.vy = 0;
        } else if (tx >= rect.width / 2) {
          // Right side handles firing / boost touch regions
          if (ty > rect.height * 0.6) {
            this.shootBtn.active = true;
          } else {
            this.boostBtn.active = true;
          }
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const tx = touch.clientX - rect.left;
        const ty = touch.clientY - rect.top;

        if (this.joystick.active && tx < rect.width / 2) {
          this.joystick.curX = tx;
          this.joystick.curY = ty;
          
          // Calculate joystick vector
          const dx = this.joystick.curX - this.joystick.startX;
          const dy = this.joystick.curY - this.joystick.startY;
          const dist = Math.hypot(dx, dy);
          const maxDist = 60; // Max joystick radius
          
          if (dist === 0) {
            this.joystick.vx = 0;
            this.joystick.vy = 0;
          } else {
            const angle = Math.atan2(dy, dx);
            const intensity = Math.min(dist / maxDist, 1.0);
            this.joystick.vx = Math.cos(angle) * intensity;
            this.joystick.vy = Math.sin(angle) * intensity;
          }
        } else if (tx >= rect.width / 2) {
          // Set aiming vector towards touch point on right half of screen
          this.mouse.screenX = tx;
          this.mouse.screenY = ty;
          this.mouse.x = tx;
          this.mouse.y = ty;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const tx = touch.clientX - rect.left;

        if (this.joystick.active && tx < rect.width / 2) {
          this.joystick.active = false;
          this.joystick.vx = 0;
          this.joystick.vy = 0;
        } else if (tx >= rect.width / 2) {
          this.shootBtn.active = false;
          this.boostBtn.active = false;
        }
      }
      if (e.touches.length === 0) {
        this.touchActive = false;
      }
    }, { passive: false });
  }

  // Helper getters to unify input source (keyboard or virtual touch)
  isAccelerating() {
    return this.keys['w'] || this.keys['arrowup'] || (this.joystick.active && this.joystick.vy < -0.2);
  }

  isReversing() {
    return this.keys['s'] || this.keys['arrowdown'] || (this.joystick.active && this.joystick.vy > 0.2);
  }

  isTurningLeft() {
    return this.keys['a'] || this.keys['arrowleft'] || (this.joystick.active && this.joystick.vx < -0.2);
  }

  isTurningRight() {
    return this.keys['d'] || this.keys['arrowright'] || (this.joystick.active && this.joystick.vx > 0.2);
  }

  isShooting() {
    return this.mouse.isDown || this.keys[' '] || this.keys['space'] || this.shootBtn.active;
  }

  isBoosting() {
    return this.keys['shift'] || this.keys['shiftleft'] || this.boostBtn.active;
  }

  isPausePressed() {
    // We check for pause trigger in the Game class update so it doesn't fire repeatedly
    const pressed = this.keys['escape'] || this.keys['esc'];
    if (pressed) {
      this.keys['escape'] = false; // consume
      this.keys['esc'] = false;
      return true;
    }
    return false;
  }
}
