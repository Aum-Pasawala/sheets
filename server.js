const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Game State ---
let players = {};
let playerStats = {};
let waitingPlayers = {};
let playerOrder = [];
let currentPlayerIndex = -1;
let pot = 0;
let potRebuildAmount = 5.00;
let deck = [];
let currentCards = [];
let gameAdminId = null;
let isGameRunning = false;
const MIN_PLAYERS = 3;
let isWaitingForAceChoice = false;
let is67ChallengeActive = false;
let sixSevenPresses = [];

// --- Helper Functions ---
function initializeDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    deck = [];
    for (let i = 0; i < 5; i++) {
        for (const suit of suits) {
            for (const rank of ranks) {
                let value;
                if (rank === 'A') value = 14;
                else if (rank === 'K') value = 13;
                else if (rank === 'Q') value = 12;
                else if (rank === 'J') value = 11;
                else value = parseFloat(rank);
                deck.push({ suit, rank, value });
            }
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function broadcastGameState() {
    io.emit('gameState', {
        players,
        playerStats,
        playerOrder,
        pot,
        isGameRunning,
        currentPlayerId: playerOrder.length > 0 ? playerOrder[currentPlayerIndex] : null,
        gameAdminId: gameAdminId,
        potRebuildAmount: potRebuildAmount,
        isWaitingForAceChoice: isWaitingForAceChoice
    });
}

function broadcastMessage(text, isEmphasis = false, actorId = null, outcome = null) {
    io.emit('message', { text, isEmphasis, actorId, outcome });
}

function broadcastSystemMessage(message) {
    io.emit('newChatMessage', { message, isSystem: true });
}

function startGame() {
    if (isGameRunning) return;

    isGameRunning = true;
    broadcastMessage(`Minimum of ${MIN_PLAYERS} players reached. Starting the game!`, true);
    playerOrder.forEach(playerId => {
        players[playerId].chips -= potRebuildAmount;
        pot += potRebuildAmount;
    });
    broadcastMessage(`All players contribute $${potRebuildAmount.toFixed(2)} to the starting pot.`);
    startNewTurn();
}

async function startNewTurn() {
    if (!isGameRunning || playerOrder.length < MIN_PLAYERS) {
        isGameRunning = false;
        broadcastMessage('Game paused. Waiting for more players...');
        broadcastGameState();
        return;
    }

    io.emit('clearResult');

    if (pot <= 0) {
        let playersInGame = 0;
        playerOrder.forEach(playerId => {
            if (players[playerId] && players[playerId].chips > 0) {
                players[playerId].chips -= potRebuildAmount;
                pot += potRebuildAmount;
                playersInGame++;
            }
        });
        broadcastMessage(`Pot rebuilt! ${playersInGame} players add $${potRebuildAmount.toFixed(2)}.`);

        if (Object.keys(waitingPlayers).length > 0) {
            for (const playerId in waitingPlayers) {
                const waitingPlayer = waitingPlayers[playerId];
                players[playerId] = waitingPlayer.playerData;
                playerStats[playerId] = { wins: 0, losses: 0, posts: 0 };
                playerOrder.push(playerId);
                players[playerId].chips -= potRebuildAmount;
                pot += potRebuildAmount;
                broadcastSystemMessage(`${players[playerId].name} has joined the game from the waiting list.`);
            }
            waitingPlayers = {};
        }
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerOrder.length;
    
    if (deck.length < 20) {
        initializeDeck();
        broadcastMessage("Deck is low, creating a fresh shuffle...");
    }
    
    currentCards = [];
    const currentPlayerId = playerOrder[currentPlayerIndex];
    broadcastGameState();
    broadcastMessage(`${players[currentPlayerId].name}'s turn.`);

    await new Promise(resolve => setTimeout(resolve, 1000));
    let card1 = deck.pop();
    currentCards.push(card1);
    io.emit('dealCard', { card: card1, cardSlot: 1 });
    
    if (card1.value === 14) {
        isWaitingForAceChoice = true;
        broadcastGameState();
        io.to(currentPlayerId).emit('promptAceChoice');
        return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    dealSecondCard();
}

async function dealSecondCard() {
    let card2 = deck.pop();
    if (card2.value === 14) card2.rank = 'A (High)';
    currentCards.push(card2);
    io.emit('dealCard', { card: card2, cardSlot: 2 });
    currentCards.sort((a, b) => a.value - b.value);

    await new Promise(resolve => setTimeout(resolve, 500));
    io.emit('dealMiddleCardPlaceholder');

    if (currentCards[0].value === currentCards[1].value) {
        const currentPlayerId = playerOrder[currentPlayerIndex];
        const penalty = 1.00;
        players[currentPlayerId].chips -= penalty;
        pot += penalty;
        broadcastMessage(`Same cards! ${players[currentPlayerId].name} pays $${penalty.toFixed(2)} and passes.`, true);
        setTimeout(startNewTurn, 2000);
        return;
    }

    const cardValues = new Set(currentCards.map(c => c.value));
    if (cardValues.has(6) && cardValues.has(7)) {
        is67ChallengeActive = true;
        sixSevenPresses = [];
        broadcastMessage("6-7 CHALLENGE! Last to press pays a fine!", true);
        io.emit('start67Challenge');

        setTimeout(() => {
            if (!is67ChallengeActive) return;
            is67ChallengeActive = false;
            io.emit('end67Challenge');
            let loserId = null;

            if (sixSevenPresses.length < playerOrder.length) {
                const playersWhoDidNotPress = playerOrder.filter(pId => players[pId] && !sixSevenPresses.includes(pId));
                if (playersWhoDidNotPress.length > 0) {
                    loserId = playersWhoDidNotPress[playersWhoDidNotPress.length - 1];
                }
            } else if (sixSevenPresses.length > 0) {
                loserId = sixSevenPresses[sixSevenPresses.length - 1];
            }

            if (loserId) {
                const fine = 5.00;
                players[loserId].chips -= fine;
                pot += fine;
                broadcastMessage(`${players[loserId].name} was last and is fined $${fine.toFixed(2)}!`, true);
                broadcastSystemMessage(`${players[loserId].name} was too slow on the 6-7 challenge and paid $${fine.toFixed(2)}.`);
                broadcastGameState();
            } else {
                broadcastMessage("6-7 challenge ended with no loser.");
            }
        }, 5000);
    }

    broadcastGameState();
}

// --- Socket.IO Connections ---
io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        if (isGameRunning) {
            waitingPlayers[socket.id] = { 
                playerData: { id: socket.id, name: data.name, chips: data.buyIn, totalBuyIn: data.buyIn }
            };
            socket.emit('message', { text: 'Game in progress. You are in the queue and will join when the pot is empty.' });
            broadcastSystemMessage(`${data.name} is waiting to join the next round.`);
            return;
        }

        if (playerOrder.length === 0) gameAdminId = socket.id;
        
        players[socket.id] = { id: socket.id, name: data.name, chips: data.buyIn, totalBuyIn: data.buyIn };
        playerStats[socket.id] = { wins: 0, losses: 0, posts: 0 };
        playerOrder.push(socket.id);
        broadcastSystemMessage(`${data.name} has joined the game.`);
        
        const needed = MIN_PLAYERS - playerOrder.length;
        if (needed > 0) {
             broadcastMessage(`Waiting for ${needed} more player(s)...`);
        } else {
             broadcastMessage(`Ready to start when the admin clicks 'Start Game'.`);
        }
        broadcastGameState();
    });

    socket.on('startGame', () => {
        if (socket.id === gameAdminId && !isGameRunning && playerOrder.length >= MIN_PLAYERS) {
            startGame();
        }
    });

    socket.on('addCredit', (amount) => {
        if (players[socket.id] && amount > 0) {
            players[socket.id].chips += amount;
            players[socket.id].totalBuyIn += amount;
            broadcastSystemMessage(`${players[socket.id].name} added $${amount.toFixed(2)} in credit.`);
            broadcastGameState();
        }
    });

    socket.on('aceChoice', (choice) => {
        if (!isWaitingForAceChoice || socket.id !== playerOrder[currentPlayerIndex]) return;
        if (choice === 'low') {
            const ace = currentCards.find(c => c.rank === 'A');
            if (ace) ace.value = 1;
        }
        isWaitingForAceChoice = false;
        dealSecondCard();
    });

    socket.on('setPotRebuild', (amount) => {
        if (socket.id === gameAdminId && amount >= 0) {
            potRebuildAmount = amount;
            broadcastMessage(`Admin set pot rebuild amount to $${amount.toFixed(2)}.`);
            broadcastGameState();
        }
    });

    socket.on('playerBet', (betAmount) => {
        const player = players[socket.id];
        if (!isGameRunning || !player || socket.id !== playerOrder[currentPlayerIndex] || isWaitingForAceChoice) return;
        if (isNaN(betAmount) || betAmount > player.chips || betAmount > pot || betAmount <= 0) {
            socket.emit('message', { text: "Invalid bet." });
            return;
        }
        
        io.emit('playerBetPlaced', { playerId: socket.id, amount: betAmount });

        const nextCard = deck.pop();
        const [lowCard, highCard] = currentCards;
        let messageText, isPost = false, outcome;

        if (nextCard.value > lowCard.value && nextCard.value < highCard.value) {
            messageText = `Winner! ${player.name} wins $${betAmount.toFixed(2)}.`;
            player.chips += betAmount; pot -= betAmount; outcome = "win";
            playerStats[player.id].wins++;
        } else if (nextCard.value === lowCard.value || nextCard.value === highCard.value) {
            const penalty = betAmount * 2;
            messageText = `Hit the post! ${player.name} pays double ($${penalty.toFixed(2)}).`;
            player.chips -= penalty; pot += penalty; isPost = true; outcome = "post";
            playerStats[player.id].posts++;
        } else {
            messageText = `Outside. ${player.name} loses $${betAmount.toFixed(2)}.`;
            player.chips -= betAmount; pot += betAmount; outcome = "loss";
            playerStats[player.id].losses++;
        }
        
        const isDramatic = betAmount >= 40;
        io.emit('cardResult', { card: nextCard, isPost, isDramatic, betAmount });
        
        setTimeout(() => {
            broadcastMessage(messageText, true, player.id, outcome);
            setTimeout(startNewTurn, 2500);
        }, isDramatic ? 2500 : 1200);
    });
    
    socket.on('playerPass', () => {
        const player = players[socket.id];
        if (!isGameRunning || !player || socket.id !== playerOrder[currentPlayerIndex] || isWaitingForAceChoice) return;
        broadcastMessage(`${player.name} passes.`, false, socket.id);
        setTimeout(startNewTurn, 1000);
    });
    
    socket.on('pressed67', () => {
        if (is67ChallengeActive && !sixSevenPresses.includes(socket.id)) {
            sixSevenPresses.push(socket.id);
            broadcastMessage(`${players[socket.id].name} pressed the button!`);
        }
    });

    socket.on('chatMessage', (msg) => {
        if(players[socket.id]) {
            io.emit('newChatMessage', { name: players[socket.id].name, message: msg });
        }
    });

    // --- FIXED ADMIN SWITCH LOGIC ---
   socket.on('disconnect', () => {
    if (waitingPlayers[socket.id]) {
        broadcastSystemMessage(`${waitingPlayers[socket.id].playerData.name} left the waiting queue.`);
        delete waitingPlayers[socket.id];
        return;
    }

    if (players[socket.id]) {
        const wasAdmin = (socket.id === gameAdminId);
        const disconnectedPlayerIndex = playerOrder.indexOf(socket.id);
        const playerName = players[socket.id].name;

        // Remove from game first
        delete players[socket.id];
        delete playerStats[socket.id];
        playerOrder = playerOrder.filter(id => id !== socket.id);

        broadcastSystemMessage(`${playerName} has left the game.`);

        // ✅ FIX: Reassign admin safely after removal
        if (wasAdmin && playerOrder.length > 0) {
            gameAdminId = playerOrder[0];
            broadcastSystemMessage(`${players[gameAdminId].name} is the new game admin.`);
            broadcastGameState(); // ✅ Immediately notify all clients
        } else if (playerOrder.length === 0) {
            gameAdminId = null;
        }

        // ✅ Handle game state conditions correctly
        if (playerOrder.length < MIN_PLAYERS && isGameRunning) {
            isGameRunning = false;
            broadcastMessage('Not enough players. Game paused.');
        }

        if (playerOrder.length > 0 && isGameRunning) {
            if (disconnectedPlayerIndex < currentPlayerIndex) {
                currentPlayerIndex--;
            } else if (disconnectedPlayerIndex === currentPlayerIndex && currentPlayerIndex === playerOrder.length) {
                currentPlayerIndex = -1;
            }
        } else if (playerOrder.length === 0) {
            pot = 0;
            currentCards = [];
            currentPlayerIndex = -1;
            isGameRunning = false;
            gameAdminId = null;
        }

            broadcastGameState();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});