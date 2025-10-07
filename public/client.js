const socket = io();

// --- DOM Elements ---
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
const betPotButton = document.getElementById('betPotButton'); // ✅ NEW POT BUTTON
const passButton = document.getElementById('passButton');
const creditButton = document.getElementById('creditButton');
const playersArea = document.getElementById('players-area');
const actionArea = document.getElementById('actionArea');
const potRebuildInput = document.getElementById('potRebuildInput');
const leaderboardBody = document.getElementById('leaderboard-body');
const sixSevenBtn = document.getElementById('sixSevenBtn');
const chatContainer = document.getElementById('chat-container');
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const body = document.querySelector('body');

let myPlayerId = null;
let currentGameState = {};

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
    lose: () => synth.triggerAttackRelease("C3", "4n"),
    post: () => synth.triggerAttackRelease(["C2", "G#2", "C3"], "2n", Tone.now(), 0.5),
    click: () => synth.triggerAttackRelease("C7", "32n", Tone.now(), 0.3),
};

document.body.addEventListener('click', async () => {
    if (!soundsReady) {
        await Tone.start();
        soundsReady = true;
        console.log('Audio is ready');
    }
}, { once: true });

// --- Render Functions ---
function renderCard(element, card, isFaceUp = false) {
    const front = element.querySelector('.card-front');
    element.className = 'card';
    if (!card) {
        front.innerHTML = '';
        if (element.id === 'nextCard') {
            const back = element.querySelector('.card-back');
            back.innerHTML = '?';
            element.classList.add('visible', 'card-middle');
        }
        return;
    }

    const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
    element.classList.add(color, 'visible');
    front.innerHTML = `<span class="top">${card.rank}${card.suit}</span><span>${card.suit}</span><span class="bottom">${card.rank}${card.suit}</span>`;
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
joinGameBtn.addEventListener('click', () => {
    const buyInAmount = parseFloat(buyInInput.value);
    const playerName = nameInput.value || `Player ${Math.floor(Math.random() * 100)}`;
    if (buyInAmount && buyInAmount > 0) {
        socket.emit('joinGame', { name: playerName, buyIn: buyInAmount });
        buyInScreen.style.display = 'none';
        gameTable.style.display = 'flex';
        chatContainer.style.display = 'flex';
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
    socket.emit('playerBet', parseFloat(betInput.value));
    betInput.value = '';
    sounds.click();
});

// ✅ NEW: Pot button — bets entire pot
betPotButton.addEventListener('click', () => {
    if (currentGameState && currentGameState.pot) {
        socket.emit('playerBet', currentGameState.pot);
        sounds.click();
    } else {
        alert("Pot value not available yet!");
    }
});

passButton.addEventListener('click', () => { socket.emit('playerPass'); sounds.click(); });
potRebuildInput.addEventListener('change', () => { socket.emit('setPotRebuild', parseFloat(potRebuildInput.value)); });
sixSevenBtn.addEventListener('click', () => { socket.emit('pressed67'); sixSevenBtn.style.display = 'none'; sounds.click(); });
chatSendBtn.addEventListener('click', () => {
    if (chatInput.value.trim()) {
        socket.emit('chatMessage', chatInput.value.trim());
        chatInput.value = '';
    }
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') chatSendBtn.click(); });

// --- Socket.IO Listeners ---
socket.on('connect', () => { myPlayerId = socket.id; });

socket.on('gameState', (state) => {
    currentGameState = state;
    potAmountElem.textContent = `$${state.pot.toFixed(2)}`;
    potRebuildInput.disabled = (state.gameAdminId !== myPlayerId);
    potRebuildInput.title = potRebuildInput.disabled ? "Only the admin can set this value." : "You are the admin.";
    potRebuildInput.value = state.potRebuildAmount.toFixed(2);
    
    // Admin start visibility
    if (state.gameAdminId === myPlayerId && !state.isGameRunning && state.playerOrder.length >= 3) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }

    // Render players
    playersArea.innerHTML = '';
    state.playerOrder.forEach((playerId, index) => {
        const player = state.players[playerId];
        if (!player) return;
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-seat player-pos-${index + 1}`;
        const adminMarker = (playerId === state.gameAdminId) ? ' &#9733;' : '';
        playerDiv.innerHTML = `<div class="player-name">${player.name}${adminMarker}</div><div class="player-chips">$${player.chips.toFixed(2)}</div>`;
        if (playerId === state.currentPlayerId) playerDiv.classList.add('current-turn');
        if (playerId === myPlayerId) playerDiv.classList.add('my-seat');
        playersArea.appendChild(playerDiv);
    });

    // Enable actions only when it's my turn
    const myTurn = state.isGameRunning && state.currentPlayerId === myPlayerId && !state.isWaitingForAceChoice;
    actionArea.style.display = myTurn ? 'flex' : 'none';
    betInput.disabled = !myTurn;
    betButton.disabled = !myTurn;
    betPotButton.disabled = !myTurn;
    passButton.disabled = !myTurn;
    creditButton.disabled = !myTurn;

    updateLeaderboard(state.players, state.playerStats, myPlayerId);
});

socket.on('dealCard', (data) => {
    const elem = data.cardSlot === 1 ? card1Elem : card2Elem;
    renderCard(elem, data.card, true);
    elem.classList.add('slide-in');
    if (soundsReady) sounds.cardSlide();
});

socket.on('dealMiddleCardPlaceholder', () => {
    renderCard(nextCardElem, null, false);
    nextCardElem.classList.add('slide-in');
    if (soundsReady) sounds.cardSlide();
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
            cardFace.classList.add('post-hit');
            body.classList.add('screen-shake');
            if (soundsReady) sounds.post();
        }, data.isDramatic ? 1250 : 600);
        setTimeout(() => {
            const cardFace = nextCardElem.querySelector('.card-front');
            cardFace.classList.remove('post-hit');
            body.classList.remove('screen-shake');
        }, data.isDramatic ? 2250 : 1500);
    }
});

socket.on('clearResult', () => { 
    renderCard(nextCardElem, null, false); 
    renderCard(card1Elem, null, false); 
    renderCard(card2Elem, null, false); 
});

socket.on('message', (data) => {
    messageElem.textContent = data.text;
    if (data.isEmphasis) {
        messageElem.classList.add('emphasis');
        setTimeout(() => messageElem.classList.remove('emphasis'), 2800); 
    } else {
        messageElem.classList.remove('emphasis');
    }
    if (data.actorId === myPlayerId) {
        if (data.outcome === 'win' && soundsReady) sounds.cash();
        if (data.outcome === 'loss' && soundsReady) sounds.lose();
    }
});

socket.on('start67Challenge', () => { sixSevenBtn.style.display = 'block'; });
socket.on('end67Challenge', () => { sixSevenBtn.style.display = 'none'; });
socket.on('newChatMessage', (data) => { addChatMessage(data); });