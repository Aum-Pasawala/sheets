const socket = io();

// --- DOM Elements ---
const homePage = document.getElementById('homePage');
const getStartedBtn = document.getElementById('getStartedBtn');
const buyInScreen = document.getElementById('buyInScreen');
const nameInput = document.getElementById('nameInput');
const buyInInput = document.getElementById('buyInInput');
const joinGameBtn = document.getElementById('joinGameBtn');
const createGameBtn = document.getElementById('createGameBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeBanner = document.getElementById('roomCodeBanner');
const roomCodeText   = document.getElementById('roomCodeText');
let myRoomCode = null; // store which room we’re in
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
const allInButton = document.getElementById('allInButton');
const quarterPotButton = document.getElementById('quarterPotButton');
const halfPotButton = document.getElementById('halfPotButton');
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
const bigWinSound = document.getElementById('bigWinSound');
const sfxToggle = document.getElementById('sfxToggle');
const musicToggle = document.getElementById('musicToggle');
const BIG_BET_THRESHOLD = 80;
const chatMinBtn = document.getElementById('chatMinBtn');
const chatUnreadBadge = document.getElementById('chatUnreadBadge');
let unreadCount = 0;
// --- Admin Add-to-Pot controls ---
const manualPotInput = document.getElementById('manualPotInput');
const addPotBtn = document.getElementById('addPotBtn');
const endGameBtn = document.getElementById('endGameBtn');

const postToggle = document.getElementById('postToggle');
let postVideoEnabled = postToggle ? postToggle.checked : true;

if (postToggle) {
  postToggle.addEventListener('change', (e) => {
    postVideoEnabled = e.target.checked;

    if (!postVideoEnabled && postVideo) {
      // Immediately stop and hide any playing post video
      postVideo.pause();
      postVideo.currentTime = 0;
      postVideo.style.display = 'none';
      videoBackdrop.style.display = 'none';
    }

    console.log('📹 Post Video:', postVideoEnabled ? 'ENABLED' : 'DISABLED');
  });
}

// Debug check
console.log('🎵 Background Music Element:', bgMusic ? 'FOUND ✅' : 'NOT FOUND ❌');
if (bgMusic) {
  console.log('🎵 Music Source:', bgMusic.src);
  console.log('🎵 Current Source:', bgMusic.currentSrc);
  
  // Test if file exists
  bgMusic.addEventListener('error', (e) => {
    console.error('❌ MUSIC FILE ERROR - File not found or cannot load!');
    console.error('Make sure casino-music.mp3 exists in public folder');
  });
  
  bgMusic.addEventListener('canplaythrough', () => {
    console.log('✅ Music file loaded and ready to play');
  });
} else {
  console.error('❌ bgMusic element is NULL - check HTML');
}

let myPlayerId = null;
let currentPotValue = 0;
let playerStreaks = {};
let isVideoPlaying = false;
let canBet = false;
let sfxEnabled = true;
let musicEnabled = false;
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
  chaChing: () => {
    if (!sfxEnabled) return;
    const now = Tone.now();
    // Bell "cha" sound (high sharp note)
    synth.triggerAttackRelease("E6", "16n", now, 0.8);
    synth.triggerAttackRelease("C6", "16n", now + 0.02, 0.6);
    // Register drawer "ching" (lower resonant ring)
    synth.triggerAttackRelease(["A4", "E5"], "8n", now + 0.15, 0.7);
    synth.triggerAttackRelease(["A4", "E5"], "4n", now + 0.25, 0.5);
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
  const back = element.querySelector('.card-back');
  element.className = 'card';
  
  if (!card) {
    front.innerHTML = '';
    back.innerHTML = '';
    if (element.id === 'nextCard') {
      back.innerHTML = '?';
      element.classList.add('visible', 'card-middle');
    }
    return;
  }

  const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
  element.classList.add(color, 'visible');
  front.innerHTML = `
    <span class="top">${card.rank}${card.suit}</span>
    <span>${card.suit}</span>
    <span class="bottom">${card.rank}${card.suit}</span>
  `;

  // For outer cards, immediately show face-up
  if (isFaceUp) {
    element.classList.add('is-flipping');
  }
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

  handleUnreadBump();
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

  // ✅ Only start music if toggle is ON
  if (musicEnabled && musicToggle.checked) {
    startMusic();
  }
});

if (createGameBtn) {
  createGameBtn.addEventListener('click', () => {
    const name = (document.getElementById('nameInput').value || '').trim(); // optional
    const buyIn = parseFloat(document.getElementById('buyInInput').value);
    if (!Number.isFinite(buyIn) || buyIn <= 0) {
      alert('Enter a valid buy-in.');
      return;
    }
    socket.emit('createRoom', { name, buyIn });
  });
}

if (joinGameBtn) {
  joinGameBtn.addEventListener('click', () => {
    const name = (document.getElementById('nameInput').value || '').trim(); // optional
    const buyIn = parseFloat(document.getElementById('buyInInput').value);
    const code = (roomCodeInput.value || '').trim().toUpperCase();
    if (!code) { alert('Enter a room code to join.'); return; }
    if (!Number.isFinite(buyIn) || buyIn <= 0) {
      alert('Enter a valid buy-in.');
      return;
    }
    socket.emit('joinRoom', { code, name, buyIn });
  });
}

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

allInButton.addEventListener('click', () => {
  if (!canBet) return;
  const player = players[myPlayerId];
  if (player && player.chips > 0) {
    canBet = false;
    socket.emit('playerBet', player.chips);
    sounds.chips();
  }
});

quarterPotButton.addEventListener('click', () => {
  if (!canBet || currentPotValue <= 0) return;
  const amt = currentPotValue * 0.25;
  const player = players[myPlayerId];
  if (amt > 0 && player && amt <= player.chips) {
    canBet = false;
    socket.emit('playerBet', parseFloat(amt.toFixed(2)));
    sounds.chips();
  }
});

halfPotButton.addEventListener('click', () => {
  if (!canBet || currentPotValue <= 0) return;
  const amt = currentPotValue * 0.5;
  const player = players[myPlayerId];
  if (amt > 0 && player && amt <= player.chips) {
    canBet = false;
    socket.emit('playerBet', parseFloat(amt.toFixed(2)));
    sounds.chips();
  }
});

if (chatMinBtn) {
  chatMinBtn.addEventListener('click', () => {
    chatContainer.classList.toggle('minimized');
    if (!chatContainer.classList.contains('minimized')) {
      // reset unread when restored
      unreadCount = 0;
      if (chatUnreadBadge) {
        chatUnreadBadge.textContent = '0';
        chatUnreadBadge.hidden = true;
      }
    }
  });
}

// When a new chat message arrives, bump unread if minimized
function handleUnreadBump() {
  if (chatContainer.classList.contains('minimized') && chatUnreadBadge) {
    unreadCount += 1;
    chatUnreadBadge.textContent = String(unreadCount);
    chatUnreadBadge.hidden = false;
  }
}

// --- Keyboard Shortcuts (Desktop Only) ---
document.addEventListener('keydown', (e) => {
  // Skip on mobile devices
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  
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

// --- Admin Add-to-Pot click handler ---
if (addPotBtn) {
  addPotBtn.addEventListener('click', () => {
    const amount = parseFloat(manualPotInput.value);
    if (isNaN(amount) || amount <= 0) {
      alert('Enter a valid positive amount to add to the pot.');
      return;
    }
    socket.emit('adminAddToPot', amount);
    manualPotInput.value = '';
  });
}
// --- Touch Support for Mobile ---
function addTouchSupport(button) {
  if (!button) return;
  
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    button.click();
  }, { passive: false });
}

// Apply touch support to all buttons
[betButton, passButton, potButton, allInButton, quarterPotButton, halfPotButton,
 creditButton, startGameBtn, aceLowBtn, aceHighBtn,
 addCreditBtn, cancelCreditBtn, joinGameBtn,
 sixSevenBtn, chatSendBtn, getStartedBtn].forEach(addTouchSupport);

// Prevent double-tap zoom on buttons
document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
  }, { passive: false });
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
  console.log('🎵 Music:', musicEnabled ? 'ON' : 'OFF');
});

// Post Video Toggle
postToggle.addEventListener('change', (e) => {
  postVideoEnabled = e.target.checked;
  console.log('📹 Post Video Sound:', postVideoEnabled ? 'ON' : 'OFF');
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
  // ✅ Show Add-to-Pot controls only for admin
  const isAdmin = (state.gameAdminId === myPlayerId);
  const manualPotControls = [
    manualPotInput,
    addPotBtn,
    document.querySelector('label[for="manualPotInput"]')
  ];
  manualPotControls.forEach(el => {
    if (el) el.style.display = isAdmin ? 'inline-block' : 'none';
  });
  potRebuildInput.value = state.potRebuildAmount.toFixed(2);
  if (endGameBtn) {
    endGameBtn.style.display = (isAdmin && state.pot > 0 && state.isGameRunning) ? 'inline-block' : 'none';
  }
  if (endGameBtn) {
  endGameBtn.addEventListener('click', () => {
    socket.emit('endGameSplit');
  });
  const hasPlayers = Array.isArray(state.playerOrder) && state.playerOrder.length > 0;
  setLeaderboardVisible(hasPlayers);
}

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
  
  // Clear any existing classes and reset transform
  elem.className = 'card';
  elem.style.opacity = '0';
  elem.style.transform = '';
  
  // Render the card with face-up flag
  renderCard(elem, data.card, true);
  
  // Add slide animation
  elem.classList.add(data.cardSlot === 1 ? 'slide-in-left' : 'slide-in-right');
  elem.classList.add('visible');
  
  // FORCE the card to show face-up with direct transform
  elem.style.transform = 'rotateY(180deg)';
  elem.style.opacity = '1';
  
  if (soundsReady) sounds.cardSlide();
  
  console.log(`Card ${data.cardSlot} dealt:`, data.card);
  console.log('Transform applied:', elem.style.transform);
  console.log('Classes:', elem.className);
});

socket.on('dealMiddleCardPlaceholder', () => {
  console.log('📋 Middle card placeholder - setting up');
  
  const front = nextCardElem.querySelector('.card-front');
  const back  = nextCardElem.querySelector('.card-back');

  // clean up faces
  if (front) front.innerHTML = '';

  // IMPORTANT: let CSS control the look + rotation
  nextCardElem.className = 'card card-middle visible placeholder';
  nextCardElem.style.transform = '';   // clear inline transform so .card.card-middle (180deg) wins
  nextCardElem.style.opacity = '1';

  // (no flip/slide animation needed here)
  if (soundsReady) sounds.cardSlide();
  canBet = true;
  
  // NO animation - just appear instantly with checkered back
  
  if (soundsReady) sounds.cardSlide();
  canBet = true;
  
  console.log('📋 Middle card ready - checkered back showing');
});

socket.on('promptAceChoice', () => aceChoiceScreen.style.display = 'flex');

socket.on('cardResult', (data) => {
  // Render the actual card value on the middle card
  const front = nextCardElem.querySelector('.card-front');
  const color = (data.card.suit === '♥' || data.card.suit === '♦') ? 'red' : 'black';
  
  // Clear and set card classes
  nextCardElem.className = 'card card-middle visible';
  nextCardElem.classList.add(color);
  
  // Set the card content
  front.innerHTML = `
    <span class="top">${data.card.rank}${data.card.suit}</span>
    <span>${data.card.suit}</span>
    <span class="bottom">${data.card.rank}${data.card.suit}</span>
  `;
  
  if (data.isDramatic) nextCardElem.classList.add('dramatic-flip');
  
  // Flip the card to show face after a brief delay
  setTimeout(() => {
    nextCardElem.style.transform = 'rotateY(0deg)'; // Flip from 180deg to 0deg
    if (soundsReady) sounds.cardFlip();
    console.log('Middle card flipped:', data.card);
  }, 50);

  if (data.isPost) {
    setTimeout(() => {
    const face = nextCardElem.querySelector('.card-front');
    if (face) face.classList.add('post-hit');
    body.classList.add('screen-shake');

    // always play sound
    if (soundsReady) sounds.post();

    // ✅ Only play video if bet >= 80
    if (data.betAmount >= BIG_BET_THRESHOLD && postVideo && !isVideoPlaying) {
      isVideoPlaying = true;
      videoBackdrop.style.display = 'block';
      postVideo.style.display = 'block';
      postVideo.currentTime = 0;
      postVideo.volume = postVideoEnabled ? 1 : 0; // Use postVideoEnabled toggle
      postVideo.muted = !postVideoEnabled;
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
  }, data.isDramatic ? 800 : 400);

  setTimeout(() => {
    body.classList.remove('screen-shake');
    const face = nextCardElem.querySelector('.card-front');
    if (face) face.classList.remove('post-hit');
  }, data.isDramatic ? 1400 : 900);
}
});

socket.on('clearResult', () => {
  console.log('🧹 Clearing cards for next turn');
  
  // Reset outer cards
  card1Elem.className = 'card';
  card1Elem.style.opacity = '0';
  card1Elem.style.transform = '';
  
  card2Elem.className = 'card';
  card2Elem.style.opacity = '0';
  card2Elem.style.transform = '';
  
  // Reset middle card but KEEP it at 180deg (back showing)
  nextCardElem.className = 'card card-middle';
  nextCardElem.style.opacity = '0';
  nextCardElem.style.transform = 'rotateY(180deg)'; // Start at 180deg so no flip needed
  
  // Clear content
  renderCard(card1Elem, null);
  renderCard(card2Elem, null);
  
  const front = nextCardElem.querySelector('.card-front');
  const back = nextCardElem.querySelector('.card-back');
  front.innerHTML = '';
  back.innerHTML = '';
  
  canBet = false;
  
  console.log('✅ Cards cleared - middle card already at 180deg');
});

socket.on('message', (data) => {
  messageElem.textContent = data.text;
  if (data.text === 'Invalid bet.') {
    canBet = true;
    // keep the action area visible if it's your turn
    if (actionArea && players && players[myPlayerId]) {
      actionArea.style.display = 'flex';
    }
    return; // we can early-return if you don't want emphasis effects here
  }
  
  if (data.isEmphasis) {
    messageElem.classList.add('emphasis');
    setTimeout(() => messageElem.classList.remove('emphasis'), 2800);
  }
  if (data.actorId) {
    if (data.outcome === 'win') {
      playerStreaks[data.actorId] = 0;
      if (data.actorId === myPlayerId && soundsReady) {
        if (data.betAmount && data.betAmount >= 60) {
          // Big win - play the 60win.mp3 file
          if (bigWinSound && sfxEnabled) {
            bigWinSound.currentTime = 0;
            bigWinSound.volume = 0.8;
            bigWinSound.play().catch(e => console.log('Big win sound error:', e));
          }
        } else {
          // Normal win - play cha-ching sound
          sounds.chaChing();
        }
      }
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

// --- Show Bet on Table ---
socket.on('playerBetPlaced', (data) => {
  const playerDiv = document.querySelector(`.player-seat.player-pos-${Object.keys(players).indexOf(data.playerId) + 1}`);
  if (!playerDiv) return;

  // Create floating bet display
  const betElem = document.createElement('div');
  betElem.className = 'bet-display';
  betElem.textContent = `$${data.amount.toFixed(2)}`;
  playerDiv.appendChild(betElem);

  // Animate & remove after 2.5 seconds
  setTimeout(() => {
    betElem.classList.add('fade-out');
    setTimeout(() => betElem.remove(), 500);
  }, 2500);
});

socket.on('roomError', (msg) => {
  alert(msg);
});

function setLeaderboardVisible(on) {
  const el = document.getElementById('leaderboard');
  if (el) el.style.display = on ? 'block' : 'none';
}

function handleJoinedRoomState(state) {
  const home = document.getElementById('homePage');
  const modal = document.getElementById('buyInScreen');
  const table = document.getElementById('gameTable');
  if (home)  home.style.display = 'none';
  if (modal) modal.style.display = 'none';
  if (table) table.style.display = 'block';
}

socket.on('roomCreated', ({ code, state }) => {
  myRoomCode = code;
  if (roomCodeBanner) { roomCodeText.textContent = code; roomCodeBanner.style.display = 'block'; }
  handleJoinedRoomState(state);
  setLeaderboardVisible(true);
});
socket.on('joinedRoom', ({ code, state }) => {
  myRoomCode = code;
  if (roomCodeBanner) { roomCodeText.textContent = code; roomCodeBanner.style.display = 'block'; }
  handleJoinedRoomState(state);
  setLeaderboardVisible(true);
});