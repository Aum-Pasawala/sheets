const socket = io();

// --- DOM Elements ---
const homePage = document.getElementById('homePage');
const getStartedBtn = document.getElementById('getStartedBtn');
const buyInScreen = document.getElementById('buyInScreen');
const nameInput = document.getElementById('nameInput');
const buyInInput = document.getElementById('buyInInput');
const joinGameBtn = document.getElementById('joinGameBtn');
const aceChoiceScreen = document.getElementById('aceChoiceScreen');
const aceLowBtn = document.getElementById('aceLowBtn');
const aceHighBtn = document.getElementById('aceHighBtn');
const creditScreen = document.getElementById('creditScreen');
const creditInput = document.getElementById('creditInput');
const addCreditBtn = document.getElementById('addCreditBtn');
const cancelCreditBtn = document.getElementById('cancelCreditBtn');
const gameTable = document.getElementById('gameTable');
const startGameBtn = document.getElementById('startGameBtn');
const card1Elem = document.getElementById('card1');
const card2Elem = document.getElementById('card2');
const nextCardElem = document.getElementById('nextCard');
const potAmountElem = document.getElementById('potAmount');
const messageElem = document.getElementById('message');
const betInput = document.getElementById('betInput');
const betButton = document.getElementById('betButton');
const potButton = document.getElementById('potButton');
const passButton = document.getElementById('passButton');
const creditButton = document.getElementById('creditButton');
const playersArea = document.getElementById('players-area');
const actionArea = document.getElementById('actionArea');
const potRebuildInput = document.getElementById('potRebuildInput');
const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboard = document.getElementById('leaderboard');
const sixSevenBtn = document.getElementById('sixSevenBtn');
const chatContainer = document.getElementById('chat-container');
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const body = document.querySelector('body');
const postVideo = document.getElementById('postVideo');
const videoBackdrop = document.getElementById('videoBackdrop');
const bgMusic = document.getElementById('bgMusic');
const sfxToggle = document.getElementById('sfxToggle');
const musicToggle = document.getElementById('musicToggle');

// Debug check
console.log('🎵 Background Music Element:', bgMusic ? 'FOUND ✅' : 'NOT FOUND ❌');
if (bgMusic) {
  console.log('🎵 Music Source:', bgMusic.src);
}

let myPlayerId = null;
let currentPotValue = 0;
let playerStreaks = {};
let isVideoPlaying = false;
let canBet = false;
let sfxEnabled = true;
let musicEnabled = true;
let players = {};

// --- Sound Effects ---
let soundsReady = false;
const synth = new Tone.PolySynth(Tone.Synth).toDestination();
const sounds = {
  cardSlide: () => { if (sfxEnabled) synth.triggerAttackRelease("G2", "16n", Tone.now(), 0.1); },
  cardFlip: () => { if (sfxEnabled) synth.triggerAttackRelease("C#5", "8n"); },
  cash: () => {
    if (!sfxEnabled) return;
    const now = Tone.now();
    synth.triggerAttackRelease("A5", "16n", now);
    synth.triggerAttackRelease("C6", "16n", now + 0.07);
    synth.triggerAttackRelease("E6", "16n", now + 0.14);
  },
  chips: () => {
    if (!sfxEnabled) return;
    const now = Tone.now();
    synth.triggerAttackRelease("D4", "32n", now);
    synth.triggerAttackRelease("D4", "32n", now + 0.05);
    synth.triggerAttackRelease("D4", "32n", now + 0.1);
  },
  lose: () => {
    if (!sfxEnabled) return;
    const now = Tone.now();
    synth.triggerAttackRelease("D3", "8n", now);
    synth.triggerAttackRelease("C3", "8n", now + 0.15);
    synth.triggerAttackRelease("A2", "4n", now + 0.3);
  },
  sadTrombone: () => {
    if (!sfxEnabled) return;
    const now = Tone.now();
    synth.triggerAttackRelease("D3", "8n", now);
    synth.triggerAttackRelease("C3", "8n", now + 0.2);
    synth.triggerAttackRelease("Bb2", "8n", now + 0.4);
    synth.triggerAttackRelease("A2", "2n", now + 0.6);
  },
  post: () => { if (sfxEnabled) synth.triggerAttackRelease(["C2", "G#2", "C3"], "2n", Tone.now(), 0.5); },
  click: () => { if (sfxEnabled) synth.triggerAttackRelease("C7", "32n", Tone.now(), 0.3); },
};

// Initialize audio context
async function initAudio() {
  if (!soundsReady) {
    await Tone.start();
    soundsReady = true;
    console.log('🔊 Audio context ready');
  }
}

// Start music function
function startMusic() {
  if (bgMusic && musicEnabled) {
    bgMusic.volume = 0.6;
    bgMusic.play()
      .then(() => console.log('🎵 Music PLAYING ✅'))
      .catch(err => console.error('🎵 Music play failed:', err));
  }
}

// Try to start on any interaction
document.body.addEventListener('click', async () => {
  await initAudio();
  if (bgMusic && musicEnabled && bgMusic.paused) {
    startMusic();
  }
}, { once: false });

// --- Render Functions ---
function renderCard(element, card, isFaceUp = false) {
  const front = element.querySelector('.card-front');
  element.className = 'card';
  
  if (!card) {
    front.innerHTML = '';
    const back = element.querySelector('.card-back');
    back.innerHTML = '';
    if (element.id === 'nextCard') back.innerHTML = '?';
    return;
  }

  const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
  element.classList.add(color, 'visible');
  front.innerHTML = `
    <span class="top">${card.rank}${card.suit}</span>
    <span>${card.suit}</span>
    <span class="bottom">${card.rank}${card.suit}</span>
  `;

  if (isFaceUp) element.classList.add('is-flipping');
}

function addChatMessage(data) {
  const p = document.createElement('p');
  if (data.isSystem) {
    p.className = 'system-message';
    p.textContent = data.message;
  } else {
    p.innerHTML = `<strong>${data.name}:</strong> ${data.message}`;
  }
  chatWindow.appendChild(p);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function updateLeaderboard(players, stats, myId) {
  leaderboardBody.innerHTML = '';
  const sorted = Object.values(players).sort((a, b) => b.chips - a.chips);
  for (const p of sorted) {
    const s = stats[p.id] || { wins: 0, losses: 0, posts: 0 };
    const net = p.chips - p.totalBuyIn;
    const cls = net > 0 ? 'net-positive' : net < 0 ? 'net-negative' : '';
    const row = document.createElement('tr');
    if (p.id === myId) row.classList.add('my-row');
    row.innerHTML = `
      <td>${p.name}</td>
      <td>$${p.totalBuyIn.toFixed(2)}</td>
      <td class="${cls}">${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}</td>
      <td>${s.wins}</td>
      <td>${s.losses}</td>
      <td>${s.posts}</td>
    `;
    leaderboardBody.appendChild(row);
  }
}

// --- Event Listeners ---
getStartedBtn.addEventListener('click', async () => {
  await initAudio();
  homePage.style.display = 'none';
  buyInScreen.style.display = 'flex';
  sounds.click();
  startMusic();
});

joinGameBtn.addEventListener('click', () => {
  const buy = parseFloat(buyInInput.value);
  const name = nameInput.value || `Player ${Math.floor(Math.random() * 100)}`;
  if (buy > 0) {
    socket.emit('joinGame', { name, buyIn: buy });
    buyInScreen.style.display = 'none';
    gameTable.style.display = 'flex';
    chatContainer.style.display = 'flex';
    leaderboard.style.display = 'block';
    sounds.click();
    startMusic();
  }
});

creditButton.addEventListener('click', () => creditScreen.style.display = 'flex');
addCreditBtn.addEventListener('click', () => {
  const amt = parseFloat(creditInput.value);
  if (amt > 0) socket.emit('addCredit', amt);
  creditScreen.style.display = 'none';
  creditInput.value = '';
});
cancelCreditBtn.addEventListener('click', () => creditScreen.style.display = 'none');

startGameBtn.addEventListener('click', () => socket.emit('startGame'));
aceLowBtn.addEventListener('click', () => { socket.emit('aceChoice', 'low'); aceChoiceScreen.style.display = 'none'; });
aceHighBtn.addEventListener('click', () => { socket.emit('aceChoice', 'high'); aceChoiceScreen.style.display = 'none'; });

betButton.addEventListener('click', () => {
  if (!canBet) return;
  const amt = parseFloat(betInput.value);
  const player = players[myPlayerId];
  
  if (!amt || amt <= 0) return;
  
  if (player && amt > player.chips) {
    alert(`Insufficient funds! You have $${player.chips.toFixed(2)}.\n\nPlease:\n• Add more credit, or\n• Bet a smaller amount`);
    return;
  }
  
  canBet = false;
  socket.emit('playerBet', amt);
  betInput.value = '';
  sounds.chips();
});

passButton.addEventListener('click', () => {
  if (!canBet) return;
  canBet = false;
  socket.emit('playerPass');
  sounds.click();
});

potButton.addEventListener('click', () => {
  if (!canBet) return;
  const player = players[myPlayerId];
  
  if (currentPotValue > 0) {
    if (player && currentPotValue > player.chips) {
      alert(`Insufficient funds to bet the pot!\n\nPot: $${currentPotValue.toFixed(2)}\nYour chips: $${player.chips.toFixed(2)}\n\nPlease:\n• Add more credit, or\n• Bet a smaller amount`);
      return;
    }
    
    canBet = false;
    socket.emit('playerBet', currentPotValue);
    sounds.chips();
  }
});

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  const active = e.target || document.activeElement;
  const typing = active && (active.tagName === 'TEXTAREA' ||
    (active.tagName === 'INPUT' && (active.type === 'text' || active.id === 'chat-input')));
  if (typing) return;
  if (creditScreen.style.display === 'flex' || aceChoiceScreen.style.display === 'flex' || buyInScreen.style.display === 'flex') return;
  if (actionArea.style.display !== 'flex' || !canBet) return;

  const key = e.key?.toLowerCase();
  if (key === ' ') { e.preventDefault(); passButton.click(); }
  else if (key === 'b') { e.preventDefault(); if (!betInput.value) betInput.focus(); else betButton.click(); }
  else if (key === 'p') { e.preventDefault(); potButton.click(); }
});

chatSendBtn.addEventListener('click', () => {
  if (chatInput.value.trim()) {
    socket.emit('chatMessage', chatInput.value.trim());
    chatInput.value = '';
  }
});
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') chatSendBtn.click(); });

sixSevenBtn.addEventListener('click', () => { 
  socket.emit('pressed67'); 
  sixSevenBtn.style.display = 'none'; 
  sounds.click(); 
});

potRebuildInput.addEventListener('change', () => { 
  socket.emit('setPotRebuild', parseFloat(potRebuildInput.value)); 
});

// --- Audio Toggles ---
sfxToggle.addEventListener('change', (e) => {
  sfxEnabled = e.target.checked;
  console.log('🔊 SFX:', sfxEnabled ? 'ON' : 'OFF');
});

musicToggle.addEventListener('change', (e) => {
  musicEnabled = e.target.checked;
  if (bgMusic) {
    if (musicEnabled) {
      bgMusic.play().catch(e => console.log('Music play error:', e));
    } else {
      bgMusic.pause();
    }
  }
  if (postVideo) {
    postVideo.muted = !musicEnabled;
  }
  console.log('🎵 Music/Video:', musicEnabled ? 'ON' : 'OFF');
});

// --- Socket Events ---
socket.on('connect', () => {
  myPlayerId = socket.id;
  console.log('🔌 Connected:', myPlayerId);
  
  if (postVideo) {
    postVideo.playsInline = true;
    postVideo.preload = 'auto';
  }
  
  if (bgMusic) {
    bgMusic.loop = true;
    bgMusic.volume = 0.6;
    bgMusic.preload = 'auto';
    console.log('🎵 Music configured: volume 60%, looping');
  }
});

socket.on('gameState', (state) => {
  currentPotValue = state.pot;
  potAmountElem.textContent = `$${state.pot.toFixed(2)}`;
  potRebuildInput.disabled = (state.gameAdminId !== myPlayerId);
  potRebuildInput.value = state.potRebuildAmount.toFixed(2);

  startGameBtn.style.display =
    (state.gameAdminId === myPlayerId && !state.isGameRunning && state.playerOrder.length >= 3)
      ? 'block' : 'none';

  playersArea.innerHTML = '';
  state.playerOrder.forEach((pid, idx) => {
    const p = state.players[pid];
    if (!p) return;
    const div = document.createElement('div');
    div.className = `player-seat player-pos-${idx + 1}`;
    const admin = pid === state.gameAdminId ? ' ★' : '';
    const streak = playerStreaks[pid] || 0;
    const cold = streak >= 3 ? ' <span class="cold-streak">🥶 COLD</span>' : '';
    div.innerHTML = `<div class="player-name">${p.name}${admin}${cold}</div>
                     <div class="player-chips">$${p.chips.toFixed(2)}</div>`;
    if (pid === state.currentPlayerId) div.classList.add('current-turn');
    if (pid === myPlayerId) div.classList.add('my-seat');
    playersArea.appendChild(div);
  });

  players = state.players;
  actionArea.style.display = (state.currentPlayerId === myPlayerId) ? 'flex' : 'none';
  updateLeaderboard(state.players, state.playerStats, myPlayerId);
});

socket.on('dealCard', (data) => {
  const elem = data.cardSlot === 1 ? card1Elem : card2Elem;
  renderCard(elem, data.card, false);
  elem.classList.remove('slide-in-left', 'slide-in-right', 'slide-in-middle');
  elem.classList.add(data.cardSlot === 1 ? 'slide-in-left' : 'slide-in-right');
  elem.classList.add('is-flipping');
  elem.style.opacity = '1';
  if (soundsReady) sounds.cardSlide();
});

socket.on('dealMiddleCardPlaceholder', () => {
  renderCard(nextCardElem, null);
  nextCardElem.classList.remove('slide-in-left','slide-in-right','slide-in-middle');
  nextCardElem.classList.add('slide-in-middle');
  if (soundsReady) sounds.cardSlide();
  canBet = true;
});

socket.on('promptAceChoice', () => aceChoiceScreen.style.display = 'flex');

socket.on('cardResult', (data) => {
  renderCard(nextCardElem, data.card);
  if (data.isDramatic) nextCardElem.classList.add('dramatic-flip');
  setTimeout(() => {
    nextCardElem.classList.add('is-flipping');
    if (soundsReady) sounds.cardFlip();
  }, 100);

  if (data.isPost) {
    setTimeout(() => {
      const face = nextCardElem.querySelector('.card-front');
      if (face) face.classList.add('post-hit');
      body.classList.add('screen-shake');
      if (soundsReady) sounds.post();

      if (postVideo && !isVideoPlaying) {
        isVideoPlaying = true;
        videoBackdrop.style.display = 'block';
        postVideo.style.display = 'block';
        postVideo.currentTime = 0;
        postVideo.volume = musicEnabled ? 1 : 0;
        postVideo.muted = !musicEnabled;
        const playPromise = postVideo.play();
        if (playPromise) {
          playPromise.then(() => {
            const check = setInterval(() => {
              if (postVideo.currentTime >= 15) {
                postVideo.pause();
                postVideo.style.display = 'none';
                videoBackdrop.style.display = 'none';
                clearInterval(check);
                isVideoPlaying = false;
              }
            }, 200);
          }).catch(() => {
            postVideo.style.display = 'none';
            videoBackdrop.style.display = 'none';
            isVideoPlaying = false;
          });
        }
        postVideo.onended = () => {
          postVideo.style.display = 'none';
          videoBackdrop.style.display = 'none';
          isVideoPlaying = false;
        };
      }
    }, data.isDramatic ? 1200 : 600);

    setTimeout(() => {
      body.classList.remove('screen-shake');
      const face = nextCardElem.querySelector('.card-front');
      if (face) face.classList.remove('post-hit');
    }, data.isDramatic ? 2200 : 1500);
  }
});

socket.on('clearResult', () => {
  renderCard(card1Elem, null);
  renderCard(card2Elem, null);
  renderCard(nextCardElem, null);
  canBet = false;
});

socket.on('message', (data) => {
  messageElem.textContent = data.text;
  if (data.isEmphasis) {
    messageElem.classList.add('emphasis');
    setTimeout(() => messageElem.classList.remove('emphasis'), 2800);
  }
  if (data.actorId) {
    if (data.outcome === 'win') {
      playerStreaks[data.actorId] = 0;
      if (data.actorId === myPlayerId && soundsReady) sounds.cash();
    } else if (['loss', 'post'].includes(data.outcome)) {
      playerStreaks[data.actorId] = (playerStreaks[data.actorId] || 0) + 1;
      if (data.actorId === myPlayerId && soundsReady) {
        if (playerStreaks[data.actorId] >= 3) sounds.sadTrombone();
        else sounds.lose();
      }
    }
  }
});

socket.on('start67Challenge', () => sixSevenBtn.style.display = 'block');
socket.on('end67Challenge', () => sixSevenBtn.style.display = 'none');
socket.on('newChatMessage', addChatMessage);