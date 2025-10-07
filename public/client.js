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

let myPlayerId = null;
let currentPotValue = 0;
let playerStreaks = {}; // Track consecutive losses/posts
let isVideoPlaying = false; // Track if post video is playing
let canBet = false; // Prevent betting before second card is shown

// --- Sound Effects ---
let soundsReady = false;
const synth = new Tone.PolySynth(Tone.Synth).toDestination();
const sounds = {
    cardSlide: () => synth.triggerAttackRelease("G2", "16n", Tone.now(), 0.1),
    cardFlip: () => synth.triggerAttackRelease("C#5", "8n"),
    cash: () => {
        const now = Tone.now();
        synth.triggerAttackRelease("A5", "16n", now);
        synth.triggerAttackRelease("C6", "16n", now + 0.07);
        synth.triggerAttackRelease("E6", "16n", now + 0.14);
    },
    chips: () => {
        const now = Tone.now();
        synth.triggerAttackRelease("D4", "32n", now);
        synth.triggerAttackRelease("D4", "32n", now + 0.05);
        synth.triggerAttackRelease("D4", "32n", now + 0.1);
    },
    lose: () => {
        const now = Tone.now();
        synth.triggerAttackRelease("D3", "8n", now);
        synth.triggerAttackRelease("C3", "8n", now + 0.15);
        synth.triggerAttackRelease("A2", "4n", now + 0.3);
    },
    sadTrombone: () => {
        const now = Tone.now();
        synth.triggerAttackRelease("D3", "8n", now);
        synth.triggerAttackRelease("C3", "8n", now + 0.2);
        synth.triggerAttackRelease("Bb2", "8n", now + 0.4);
        synth.triggerAttackRelease("A2", "2n", now + 0.6);
    },
    post: () => synth.triggerAttackRelease(["C2", "G#2", "C3"], "2n", Tone.now(), 0.5),
    click: () => synth.triggerAttackRelease("C7", "32n", Tone.now(), 0.3),
};

// Initialize audio on any user interaction
async function initAudio() {
    if (!soundsReady) {
        await Tone.start();
        soundsReady = true;
        console.log('Audio is ready');
    }
}

document.body.addEventListener('click', initAudio, { once: true });

// --- Render Functions ---
function renderCard(element, card, isFaceUp = false) {
    const front = element.querySelector('.card-front');
    element.className = 'card'; // reset classes to just 'card'
    
    if (!card) {
        front.innerHTML = '';
        const back = element.querySelector('.card-back');
        back.innerHTML = '';
        if (element.id === 'nextCard') {
            back.innerHTML = '?';
            element.classList.add('card-middle');
        }
        return;
    }

    const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
    element.classList.add(color, 'visible');
    front.innerHTML = `<span class="top">${card.rank}${card.suit}</span><span>${card.suit}</span><span class="bottom">${card.rank}${card.suit}</span>`;
    
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
}

function updateLeaderboard(players, playerStats, myId) {
    leaderboardBody.innerHTML = '';
    const sortedPlayers = Object.values(players).sort((a, b) => b.chips - a.chips);
    for (const player of sortedPlayers) {
        const pId = player.id;
        const stats = playerStats[pId] || { wins: 0, losses: 0, posts: 0 };
        const netCash = player.chips - player.totalBuyIn;
        const netClass = netCash > 0 ? 'net-positive' : (netCash < 0 ? 'net-negative' : '');
        const netDisplay = (netCash >= 0 ? '+' : '-') + '$' + Math.abs(netCash).toFixed(2);
        const row = document.createElement('tr');
        if (pId === myId) row.classList.add('my-row');
        row.innerHTML = `
            <td>${player.name}</td>
            <td>$${player.totalBuyIn.toFixed(2)}</td>
            <td class="${netClass}">${netDisplay}</td>
            <td>${stats.wins}</td>
            <td>${stats.losses}</td>
            <td>${stats.posts}</td>
        `;
        leaderboardBody.appendChild(row);
    }
}

// --- Event Listeners ---
if (getStartedBtn) {
    getStartedBtn.addEventListener('click', async () => {
        await initAudio(); // Initialize audio on first click
        homePage.style.display = 'none';
        buyInScreen.style.display = 'flex';
        if (soundsReady) sounds.click();
    });
}

joinGameBtn.addEventListener('click', () => {
    const buyInAmount = parseFloat(buyInInput.value);
    const playerName = nameInput.value || `Player ${Math.floor(Math.random() * 100)}`;
    if (buyInAmount && buyInAmount > 0) {
        socket.emit('joinGame', { name: playerName, buyIn: buyInAmount });
        buyInScreen.style.display = 'none';
        gameTable.style.display = 'flex';
        chatContainer.style.display = 'flex';
        leaderboard.style.display = 'block';
        sounds.click();
    }
});

creditButton.addEventListener('click', () => {
    creditScreen.style.display = 'flex';
    sounds.click();
});
addCreditBtn.addEventListener('click', () => {
    const amount = parseFloat(creditInput.value);
    if (amount && amount > 0) {
        socket.emit('addCredit', amount);
        creditInput.value = '';
        creditScreen.style.display = 'none';
        sounds.click();
    }
});
cancelCreditBtn.addEventListener('click', () => {
    creditInput.value = '';
    creditScreen.style.display = 'none';
    sounds.click();
});
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
    sounds.click();
});
aceLowBtn.addEventListener('click', () => { socket.emit('aceChoice', 'low'); aceChoiceScreen.style.display = 'none'; sounds.click(); });
aceHighBtn.addEventListener('click', () => { socket.emit('aceChoice', 'high'); aceChoiceScreen.style.display = 'none'; sounds.click(); });

betButton.addEventListener('click', () => {
    if (!canBet) return; // Don't allow bet until second card is shown
    const betAmount = parseFloat(betInput.value);
    if (betAmount > 0) {
        canBet = false; // Disable betting after placing bet
        socket.emit('playerBet', betAmount); 
        betInput.value = ''; 
        if (soundsReady) sounds.chips();
    }
});

passButton.addEventListener('click', () => {
    if (!canBet) return; // Don't allow pass until second card is shown
    canBet = false; // Disable after passing
    socket.emit('playerPass'); 
    sounds.click(); 
});

potButton.addEventListener('click', () => {
    if (!canBet) return; // Don't allow pot bet until second card is shown
    if (currentPotValue > 0) {
        canBet = false; // Disable betting after placing bet
        socket.emit('playerBet', currentPotValue);
        if (soundsReady) sounds.chips();
    }
});

// ✅ Improved KEYBOARD SHORTCUTS
document.addEventListener('keydown', (e) => {
    // Figure out the active/focused element
    const active = e.target || document.activeElement;

    // If user is typing in chat or a text input/textarea, don't trigger shortcuts
    const isTypingText = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && (active.type === 'text' || active.id === 'chat-input')));
    if (isTypingText) return;

    // If any modal is open, ignore shortcuts
    if (creditScreen.style.display === 'flex' || aceChoiceScreen.style.display === 'flex' || buyInScreen.style.display === 'flex') {
        return;
    }

    // Only work when action area is visible (your turn) AND canBet
    if (actionArea.style.display !== 'flex' || !canBet) return;

    const key = e.key || '';
    const code = e.code || '';

    // Space: pass
    if (code === 'Space' || key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        passButton.click();
        return;
    }

    // B: bet (only if a bet amount exists)
    if ((key.toLowerCase && key.toLowerCase() === 'b')) {
        e.preventDefault();
        // If bet input is empty, focus it so user can type quickly
        if (!betInput.value) {
            betInput.focus();
            return;
        }
        betButton.click();
        return;
    }

    // P: pot
    if ((key.toLowerCase && key.toLowerCase() === 'p')) {
        e.preventDefault();
        potButton.click();
        return;
    }
});

potRebuildInput.addEventListener('change', () => { socket.emit('setPotRebuild', parseFloat(potRebuildInput.value)); });
sixSevenBtn.addEventListener('click', () => { socket.emit('pressed67'); sixSevenBtn.style.display = 'none'; sounds.click(); });
chatSendBtn.addEventListener('click', () => {
    if (chatInput.value.trim()) {
        socket.emit('chatMessage', chatInput.value.trim());
        chatInput.value = '';
    }
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') chatSendBtn.click(); });

// --- Socket.IO Event Listeners ---
socket.on('connect', () => { 
    myPlayerId = socket.id;
    console.log('Connected with ID:', myPlayerId);
    
    // Check if video exists
    if (postVideo) {
        console.log('Post video element found');
        postVideo.playsInline = true;
        postVideo.preload = 'auto';
    } else {
        console.error('Post video element NOT found!');
    }
});

socket.on('gameState', (state) => {
    currentPotValue = state.pot;
    potAmountElem.textContent = `$${state.pot.toFixed(2)}`;
    potRebuildInput.disabled = (state.gameAdminId !== myPlayerId);
    potRebuildInput.title = potRebuildInput.disabled ? "Only the admin can set this value." : "You are the admin.";
    potRebuildInput.value = state.potRebuildAmount.toFixed(2);
    
    if (state.gameAdminId === myPlayerId && !state.isGameRunning && state.playerOrder.length >= 3) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }

    playersArea.innerHTML = '';
    state.playerOrder.forEach((playerId, index) => {
        const player = state.players[playerId];
        if (!player) return;
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-seat player-pos-${index + 1}`;
        const adminMarker = (playerId === state.gameAdminId) ? ' &#9733;' : '';
        
        // Check for cold streak
        const streak = playerStreaks[playerId] || 0;
        let streakMarker = '';
        if (streak >= 3) {
            streakMarker = ' <span class="cold-streak">🥶 COLD</span>';
        }
        
        playerDiv.innerHTML = `<div class="player-name">${player.name}${adminMarker}${streakMarker}</div><div class="player-chips">$${player.chips.toFixed(2)}</div>`;
        if (playerId === state.currentPlayerId) playerDiv.classList.add('current-turn');
        if (playerId === myPlayerId) playerDiv.classList.add('my-seat');
        playersArea.appendChild(playerDiv);
    });
    
    actionArea.style.display = (state.isGameRunning && state.currentPlayerId === myPlayerId && !state.isWaitingForAceChoice) ? 'flex' : 'none';

    updateLeaderboard(state.players, state.playerStats, myPlayerId);
});

socket.on('dealCard', (data) => {
    const elem = data.cardSlot === 1 ? card1Elem : card2Elem;
    // set card and animation class
    renderCard(elem, data.card, true);
    // reset possible slide classes, then add the correct one
    elem.classList.remove('slide-in-left','slide-in-right','slide-in-middle');
    elem.classList.add(data.cardSlot === 1 ? 'slide-in-left' : 'slide-in-right');
    if(soundsReady) sounds.cardSlide();
});

socket.on('dealMiddleCardPlaceholder', () => {
    renderCard(nextCardElem, null, false);
    nextCardElem.classList.remove('slide-in-left','slide-in-right','slide-in-middle');
    nextCardElem.classList.add('slide-in-middle');
    if (soundsReady) sounds.cardSlide();
    
    // Enable betting after second card is dealt
    canBet = true;
});

socket.on('promptAceChoice', () => { aceChoiceScreen.style.display = 'flex'; });

socket.on('cardResult', (data) => {
    renderCard(nextCardElem, data.card, false);
    if (data.isDramatic) nextCardElem.classList.add('dramatic-flip');
    
    setTimeout(() => {
        nextCardElem.classList.add('is-flipping');
        if (soundsReady) sounds.cardFlip();
    }, 100);

    if (data.isPost) {
        setTimeout(() => {
            const cardFace = nextCardElem.querySelector('.card-front');
            if (cardFace) cardFace.classList.add('post-hit');
            body.classList.add('screen-shake');
            if(soundsReady) sounds.post();
            
            // Play post video
            if (postVideo && !isVideoPlaying) {
                isVideoPlaying = true;
                videoBackdrop.style.display = 'block';
                postVideo.style.display = 'block';
                postVideo.currentTime = 0;
                postVideo.volume = 1.0;
                
                const playPromise = postVideo.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('Post video playing');
                        
                        // Stop at 15 seconds
                        const checkTime = setInterval(() => {
                            if (postVideo.currentTime >= 15) {
                                postVideo.pause();
                                postVideo.style.display = 'none';
                                videoBackdrop.style.display = 'none';
                                isVideoPlaying = false;
                                clearInterval(checkTime);
                                console.log('Post video stopped at 15s');
                            }
                        }, 150);
                        
                    }).catch(error => {
                        console.error('Video play failed:', error);
                        postVideo.style.display = 'none';
                        videoBackdrop.style.display = 'none';
                        isVideoPlaying = false;
                    });
                } else {
                    // fallback: set a timer in case play returns undefined
                    setTimeout(() => {
                        postVideo.pause();
                        postVideo.style.display = 'none';
                        videoBackdrop.style.display = 'none';
                        isVideoPlaying = false;
                    }, 15000);
                }
                
                // Handle video ending naturally
                postVideo.onended = () => {
                    postVideo.style.display = 'none';
                    videoBackdrop.style.display = 'none';
                    isVideoPlaying = false;
                    console.log('Post video ended');
                };
                
                // Handle errors
                postVideo.onerror = () => {
                    console.error('Video error - check if post.mp4 exists in public folder');
                    postVideo.style.display = 'none';
                    videoBackdrop.style.display = 'none';
                    isVideoPlaying = false;
                };
            }
        }, data.isDramatic ? 1250 : 600);
        
        setTimeout(() => {
            const cardFace = nextCardElem.querySelector('.card-front');
            if (cardFace) cardFace.classList.remove('post-hit');
            body.classList.remove('screen-shake');
        }, data.isDramatic ? 2250 : 1500);
    }
});

socket.on('clearResult', () => { 
    renderCard(nextCardElem, null, false); 
    renderCard(card1Elem, null, false); 
    renderCard(card2Elem, null, false);
    nextCardElem.classList.remove('is-flipping','dramatic-flip','post-hit','visible');
    card1Elem.classList.remove('is-flipping','dramatic-flip','post-hit','visible');
    card2Elem.classList.remove('is-flipping','dramatic-flip','post-hit','visible');
    canBet = false; // Disable betting when clearing for new turn
});

socket.on('message', (data) => {
    messageElem.textContent = data.text;
    if (data.isEmphasis) {
        messageElem.classList.add('emphasis');
        setTimeout(() => messageElem.classList.remove('emphasis'), 2800); 
    } else {
        messageElem.classList.remove('emphasis');
    }
    
    // Update streaks based on outcome
    if (data.actorId) {
        if (data.outcome === 'win') {
            playerStreaks[data.actorId] = 0; // Reset streak on win
            if (data.actorId === myPlayerId && soundsReady) sounds.cash();
        } else if (data.outcome === 'loss' || data.outcome === 'post') {
            playerStreaks[data.actorId] = (playerStreaks[data.actorId] || 0) + 1;
            
            // Play sad sound if on cold streak
            if (data.actorId === myPlayerId && soundsReady) {
                if (playerStreaks[data.actorId] >= 3) {
                    sounds.sadTrombone();
                } else {
                    sounds.lose();
                }
            }
        }
    }
});

socket.on('start67Challenge', () => { sixSevenBtn.style.display = 'block'; });
socket.on('end67Challenge', () => { sixSevenBtn.style.display = 'none'; });
socket.on('newChatMessage', (data) => { addChatMessage(data); });
