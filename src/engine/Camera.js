export class Camera {
  constructor(width, height, worldWidth, worldHeight) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    
    // Zoom configurations
    this.zoom = 1;
    this.targetZoom = 1;
    this.baseZoom = 1;
    this.zoomSpeed = 2; // zoom change Lerp speed
    this.calculateBaseZoom();
    this.zoom = this.baseZoom;
    
    // Smooth follow configurations
    this.lerpSpeed = 0.08; // Lerp factor
    
    // Look-ahead configurations (towards the aiming mouse)
    this.lookAheadFactor = 0.15; // Shift camera 15% towards the mouse target
    
    // Camera shake (trauma model)
    this.trauma = 0; // 0 to 1 range
    this.maxShakeAngle = 4 * (Math.PI / 180); // Maximum angle offset
    this.maxShakeOffset = 25; // Maximum pixel offset
    this.shakeDecay = 1.2; // How fast trauma decays per second
    
    this.shakeAngle = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.shakeAngleOffset = 0;

    this.enabledShake = true;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.calculateBaseZoom();
  }

  calculateBaseZoom() {
    const size = Math.min(this.width, this.height);
    // Base reference size is 850px.
    this.baseZoom = Math.max(0.75, Math.min(1.45, size / 850));
    this.targetZoom = this.baseZoom;
  }

  addTrauma(amount) {
    if (!this.enabledShake) return;
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  update(playerX, playerY, mouseX, mouseY, dt) {
    // 1. Calculate base look-ahead offset
    // mouse coordinates are in screen-space, we find their offset from center of screen
    const dx = mouseX - this.width / 2;
    const dy = mouseY - this.height / 2;
    const targetOffsetX = dx * this.lookAheadFactor;
    const targetOffsetY = dy * this.lookAheadFactor;

    // 2. Target coordinates (player center + look-ahead offset)
    const targetX = playerX + targetOffsetX - (this.width / this.zoom) / 2;
    const targetY = playerY + targetOffsetY - (this.height / this.zoom) / 2;

    // 3. Lerp towards target position
    this.x += (targetX - this.x) * this.lerpSpeed;
    this.y += (targetY - this.y) * this.lerpSpeed;

    // 4. Clamping camera to world boundaries
    const maxCameraX = this.worldWidth - this.width / this.zoom;
    const maxCameraY = this.worldHeight - this.height / this.zoom;
    this.x = Math.max(0, Math.min(this.x, maxCameraX));
    this.y = Math.max(0, Math.min(this.y, maxCameraY));

    // 5. Update Zoom level
    this.zoom += (this.targetZoom - this.zoom) * this.zoomSpeed * dt;

    // 6. Camera Shake Processing
    if (this.trauma > 0) {
      const shakePower = Math.pow(this.trauma, 2); // Exponential decay feels punchier
      
      this.shakeAngle = Math.random() * Math.PI * 2;
      this.offsetX = Math.cos(this.shakeAngle) * this.maxShakeOffset * shakePower;
      this.offsetY = Math.sin(this.shakeAngle) * this.maxShakeOffset * shakePower;
      this.shakeAngleOffset = (Math.random() * 2 - 1) * this.maxShakeAngle * shakePower;

      // Decay trauma
      this.trauma = Math.max(0, this.trauma - this.shakeDecay * dt);
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
      this.shakeAngleOffset = 0;
    }
  }

  // Converts canvas screen position to world coordinates
  screenToWorld(screenX, screenY) {
    return {
      x: this.x + screenX / this.zoom,
      y: this.y + screenY / this.zoom
    };
  }

  // Converts world position to canvas screen coordinates
  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom,
      y: (worldY - this.y) * this.zoom
    };
  }

  applyTransforms(ctx) {
    ctx.save();
    
    // Apply camera shake translations and rotation around the screen center
    if (this.trauma > 0) {
      ctx.translate(this.width / 2 + this.offsetX, this.height / 2 + this.offsetY);
      ctx.rotate(this.shakeAngleOffset);
      ctx.translate(-this.width / 2, -this.height / 2);
    }
    
    // Apply camera zoom (scaling from screen top-left)
    ctx.scale(this.zoom, this.zoom);
    
    // Apply camera offset
    ctx.translate(-this.x, -this.y);
  }

  restoreTransforms(ctx) {
    ctx.restore();
  }
}
