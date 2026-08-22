export class ChallengeSystem {
  static getDailyChallenges() {
    return [
      { id: 'c1', title: 'SURVIVE 5 WAVES', desc: 'Reach Wave 5 in combat.', target: 5, reward: 250, icon: '🌊' },
      { id: 'c2', title: 'ELIMINATE 25 HOSTILES', desc: 'Destroy 25 enemy units.', target: 25, reward: 300, icon: '👾' },
      { id: 'c3', title: 'COLLECT 300 CREDITS', desc: 'Gather 300 credit chips.', target: 300, reward: 200, icon: '🪙' }
    ];
  }

  static evaluate(game) {
    const list = this.getDailyChallenges();
    list[0].current = Math.min(list[0].target, game.waveManager.waveNumber);
    list[0].completed = game.waveManager.waveNumber >= list[0].target;

    list[1].current = Math.min(list[1].target, game.kills);
    list[1].completed = game.kills >= list[1].target;

    list[2].current = Math.min(list[2].target, game.creditsEarned);
    list[2].completed = game.creditsEarned >= list[2].target;

    return list;
  }
}
