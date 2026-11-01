// modes.js — every game mode lives here. Add a new one by adding a new block.
window.ISB = window.ISB || {};

ISB.MODES = [
  {
    id: 'normal', name: 'Normal', icon: '🐍', tag: '200 players · Free for all',
    playable: true, leaderboard: true, aggressive: false,
    world: 2800, bots: 199, food: 2400,
    instructions: [
      'Move the left stick to steer your snake.',
      'Eat the glowing dots to grow bigger.',
      'Hold the ⚡ button on the right to go fast. Its glowing ring shows your fat. It unwraps as you burn it.',
      'If your head hits another snake or the red wall, you pop.',
      'Reach the top of the leaderboard!'
    ]
  },
  {
    id: 'og', name: 'OG Players', icon: '🔥', tag: '100 players · Aggressive',
    playable: true, leaderboard: true, aggressive: true,
    world: 2800, bots: 99, food: 2400, tough: true,
    instructions: [
      'Same controls as Normal mode, but the bots are hungry and mean.',
      'Big snakes hunt smaller snakes. They speed up and curl around your head to trap you. Some are much bigger than you!',
      'Eat to get chubby, then bully everyone nearby.',
      'Use ⚡ to escape or to chase. Watch the ring so you do not run out of fat.'
    ]
  },
  {
    id: 'foodchain', name: 'Food Chain', icon: '🦈', tag: 'Eat smaller · Flee bigger',
    playable: true, leaderboard: true, aggressive: true, foodchain: true,
    world: 4500, bots: 119, food: 3500, tough: true,
    instructions: [
      'You can only eat snakes that are SMALLER than you. A snake about your size cannot hurt you.',
      'Snakes glow GREEN if you can eat them and RED if they can eat you. Bigger snakes are dangerous!',
      'Bite a smaller snake with your head: from the bite to its tail turns into food and it loses points. Bite its head and it is game over for it.',
      'If a bigger snake touches YOUR head, or eats you from the tail all the way to the head, it is game over. You do not come back!',
      'If you try to bite a snake that is bigger than you, it is game over for you.',
      'Eat your way up: 🐟 Minnow, 🐠 Piranha, 🦈 Shark, 🐋 Whale, 🐉 Apex. Small snakes are faster, big snakes are slower.',
      'The biggest snake wears the 👑. A 👑 at the edge of your screen shows where it is. Nobody can bite it, so catch up in size!'
    ]
  },
  {
    id: 'adventure', name: 'Adventure', icon: '🗺️', tag: 'Levels 1-10 + the King',
    playable: true, leaderboard: true, adventure: true,
    world: 1800, bots: 0, food: 700,
    instructions: [
      'Levels 1 to 9: eliminate ALL the enemy snakes. No new snakes appear, so plan your attack.',
      'The enemy snakes are allies. They cannot hurt each other and they glide over each other. Only YOU can eliminate them.',
      '3 small arrows around your snake point to the 3 nearest enemies. The red arrow is the nearest.',
      'Level 1 snakes are small, weak and not very smart. But they still eat, so if you wait they will outgrow you!',
      'Every level the enemies get smarter. Level 9 snakes are as smart as the OG Players bots.',
      'Level 10 is a 1 vs 1 fight against the King, a giant and super smart snake.',
      'Your size is saved. The size you reach in levels 1-9 is the size you bring to the King.',
      'Beat the King to finish the scene. Then you start again with a small snake and everything is 10% harder.',
      'Progress is saved on your phone. If you get eliminated, you retry the same level.'
    ]
  },
  {
    id: 'timeattack', name: 'Time Attack', icon: '⏱️', tag: 'Hit the points in time',
    playable: true, leaderboard: true, timeattack: true,
    world: 1200, bots: 0, food: 700,
    instructions: [
      'You are the only snake on a small map. Eat dots to get points before the timer hits zero.',
      'Every level has a points goal. Reach it in time to pass. If time runs out, the mission fails and you retry the level.',
      'Your points and your size are saved. Level 2 starts with the points you finished Level 1 with, so you only need the difference.',
      'Each level the goal gets much bigger and there is less food. You get 15 more seconds each level.',
      'Golden dots are worth 10 normal dots. A gold arrow points to the nearest one.',
      'Boosting burns your points, so use it wisely. Touching the red wall ends your try.'
    ]
  },
  {
    id: 'team', name: 'Team Battle', icon: '🛡️', tag: 'Blue vs Red · 20 v 20',
    playable: true, leaderboard: false, team: true,
    world: 2000, bots: 39, food: 1400,
    instructions: [
      'Pick the blue team or the red team. There are 20 snakes on each side.',
      'You can never hurt your team-mates and they can never hurt you. You glide over each other.',
      'Make the other team crash into your body to eliminate them. Do not touch their bodies!',
      'When you pop, you come back out of a hole after a few seconds, small again. So does everyone else.',
      'After 4 minutes the team with the biggest total size wins.',
      'There is no leaderboard here. The top-right box shows the team scores instead.'
    ]
  },
  {
    id: 'survival', name: 'Survival', icon: '🌋', tag: 'Last snake alive · 3 min',
    playable: true, leaderboard: false, aggressive: true, survival: true,
    world: 2400, bots: 59, food: 1200,
    instructions: [
      'You and 59 other snakes start the same size and come out of holes after a 3-2-1 countdown. You get ONE life.',
      'A safe circle is shown on the map. Everything outside it is the red zone.',
      'Every 30 seconds the circle shrinks. The match lasts 3 minutes, and in the last 20 seconds the circle squeezes almost to nothing.',
      'In the red zone your snake slowly shrinks and its tail turns into food. If you get too small, you are out. A glowing arrow shows the way back inside.',
      'Touching another snake with your head pops you, no matter how big you are. A snake that pops turns into food for everyone.',
      'Gold dots drop inside the circle every time it shrinks. They are worth a lot!',
      'Be the last snake alive. If the time runs out, the biggest snakes alive rank highest.',
      'There is no leaderboard. The box at the top shows the time, how many are alive, and the zone.'
    ]
  }
];

ISB.getMode = id => ISB.MODES.find(m => m.id === id) || ISB.MODES[0];
