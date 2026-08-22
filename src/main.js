import './style.css';
import { Game } from './engine/Game.js';

// Wait for DOM to load fully before launching
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();

  // Handle browser autoplay policy by unlocking AudioContext on any user interaction
  const unlockAudio = () => {
    game.audio.unlock();
    // remove listener once unlocked
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
});
