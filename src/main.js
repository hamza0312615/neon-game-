import './style.css';
import { Game } from './engine/Game.js';

function initGame() {
  const game = new Game();
  game.start();

  const unlockAudio = () => {
    game.audio.unlock();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
  };
  
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}
