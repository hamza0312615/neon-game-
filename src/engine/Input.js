export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x: 0, y: 0, screenX: 0, screenY: 0, isDown: false, rightDown: false };

    // Touch controls (virtual joystick)
    this.touchActive = false;
    this.joystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0, vx: 0, vy: 0 };
    this.shootBtn = { active: false };
    this.boostBtn = { active: false };
    this.swapBtn = { active: false };

    this.setupListeners();
  }

  setupListeners() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code ? e.code.toLowerCase() : '';
      this.keys[key] = true;
      this.keys[e.key] = true;
      this.keys[e.code] = true;
      this.keys[code] = true;

      // Quick weapon swap triggers
      if (this.onWeaponCycleRequest) {
        if (key === 'q') this.onWeaponCycleRequest(-1);
        if (key === 'e') this.onWeaponCycleRequest(1);
        if (key >= '1' && key <= '6') {
          const idx = parseInt(key) - 1;
          this.onWeaponSelectRequest(idx);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key ? e.key.toLowerCase() : '';
      const code = e.code ? e.code.toLowerCase() : '';
      this.keys[key] = false;
      this.keys[e.key] = false;
      this.keys[e.code] = false;
      this.keys[code] = false;
    });

    // Mouse wheel scroll to cycle weapons
    window.addEventListener('wheel', (e) => {
      if (this.onWeaponCycleRequest) {
        const dir = e.deltaY > 0 ? 1 : -1;
        this.onWeaponCycleRequest(dir);
      }
    }, { passive: true });

    // Mouse Movement
    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.screenX = e.clientX - rect.left;
      this.mouse.screenY = e.clientY - rect.top;
      this.mouse.x = this.mouse.screenX;
      this.mouse.y = this.mouse.screenY;
    });

    // Mouse Clicks
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.isDown = true;
      if (e.button === 2) this.mouse.rightDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.isDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
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

        // Left half: Virtual Movement Joystick
        if (tx < rect.width / 2 && !this.joystick.active) {
          this.joystick.active = true;
          this.joystick.startX = tx;
          this.joystick.startY = ty;
          this.joystick.curX = tx;
          this.joystick.curY = ty;
          this.joystick.vx = 0;
          this.joystick.vy = 0;
        } else if (tx >= rect.width / 2) {
          // Right half: Touch action regions
          if (ty > rect.height * 0.65) {
            this.shootBtn.active = true;
          } else if (ty > rect.height * 0.35) {
            this.boostBtn.active = true;
          } else {
            this.swapBtn.active = true;
            if (this.onWeaponCycleRequest) this.onWeaponCycleRequest(1);
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
          
          const dx = this.joystick.curX - this.joystick.startX;
          const dy = this.joystick.curY - this.joystick.startY;
          const dist = Math.hypot(dx, dy);
          const maxDist = 60;
          
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
          this.swapBtn.active = false;
        }
      }
      if (e.touches.length === 0) {
        this.touchActive = false;
      }
    }, { passive: false });
  }

  // Helper getters to unify input source (keyboard or virtual touch)
  updateGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gamepadState = { accelerating: false, reversing: false, turningLeft: false, turningRight: false, shooting: false, boosting: false };

    if (!gamepads) return;
    
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;

      const axisX = gp.axes[0] || 0;
      const axisY = gp.axes[1] || 0;
      const deadzone = 0.22;

      this.gamepadState.accelerating = axisY < -deadzone || !!gp.buttons[12]?.pressed;
      this.gamepadState.reversing = axisY > deadzone || !!gp.buttons[13]?.pressed;
      this.gamepadState.turningLeft = axisX < -deadzone || !!gp.buttons[14]?.pressed;
      this.gamepadState.turningRight = axisX > deadzone || !!gp.buttons[15]?.pressed;
      this.gamepadState.shooting = !!gp.buttons[0]?.pressed || (gp.buttons[7]?.value || 0) > 0.3;
      this.gamepadState.boosting = !!gp.buttons[1]?.pressed || (gp.buttons[6]?.value || 0) > 0.3;

      if (gp.buttons[4]?.pressed && !this.lastGpLB) {
        if (this.onWeaponCycleRequest) this.onWeaponCycleRequest(-1);
      }
      if (gp.buttons[5]?.pressed && !this.lastGpRB) {
        if (this.onWeaponCycleRequest) this.onWeaponCycleRequest(1);
      }
      this.lastGpLB = !!gp.buttons[4]?.pressed;
      this.lastGpRB = !!gp.buttons[5]?.pressed;

      break;
    }
  }

  isAccelerating() {
    this.updateGamepad();
    return !!(this.keys['w'] || this.keys['W'] || this.keys['KeyW'] || this.keys['keyw'] || this.keys['arrowup'] || this.keys['ArrowUp'] || (this.joystick.active && this.joystick.vy < -0.2) || this.gamepadState.accelerating);
  }

  isReversing() {
    return !!(this.keys['s'] || this.keys['S'] || this.keys['KeyS'] || this.keys['keys'] || this.keys['arrowdown'] || this.keys['ArrowDown'] || (this.joystick.active && this.joystick.vy > 0.2) || this.gamepadState.reversing);
  }

  isTurningLeft() {
    return !!(this.keys['a'] || this.keys['KeyA'] || this.keys['keya'] || this.keys['arrowleft'] || this.keys['ArrowLeft'] || (this.joystick.active && this.joystick.vx < -0.2) || this.gamepadState.turningLeft);
  }

  isTurningRight() {
    return !!(this.keys['d'] || this.keys['KeyD'] || this.keys['keyd'] || this.keys['arrowright'] || this.keys['ArrowRight'] || (this.joystick.active && this.joystick.vx > 0.2) || this.gamepadState.turningRight);
  }

  isShooting() {
    return !!(this.mouse.isDown || this.keys[' '] || this.keys['space'] || this.keys['Space'] || this.shootBtn.active || this.gamepadState.shooting);
  }

  isBoosting() {
    return !!(this.keys['shift'] || this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['shiftleft'] || this.keys['shiftright'] || this.boostBtn.active || this.gamepadState.boosting);
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
