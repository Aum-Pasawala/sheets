// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ===============================
   Rooms & Room-Scoped Game State
   =============================== */

const rooms = new Map(); // code -> room state

function newRoomState() {
  return {
    players: {},            // id -> { id, name, chips, totalBuyIn, disconnected? }
    playerStats: {},        // id -> { wins, losses, posts }
    waitingPlayers: {},     // id -> { playerData }
    playerOrder: [],
    currentPlayerIndex: -1,
    pot: 0,
    potRebuildAmount: 0.50,
    deck: [],
    currentCards: [],
    gameAdminId: null,
    isGameRunning: false,
    MIN_PLAYERS: 3,

    // Flow flags
    isWaitingForAceChoice: false,

    // 6–7 challenge
    is67ChallengeActive: false,
    sixSevenPresses: [],     // array of socket ids who pressed
    challengeTimer: null,

    spectators: {}
  };
}

function getSocketRoomState(socket) {
  const code = socket.data?.roomCode;
  if (!code) return null;
  const S = rooms.get(code);
  if (!S) return null;
  return { code, S };
}

function generatePlayerName(existingNames = new Set()) {
  let name;
  do {
    const num = Math.floor(1000 + Math.random() * 9000);
    name = `Player ${num}`;
  } while (existingNames.has(name));
  return name;
}

function generateRoomCode() {
  // Avoid ambiguous chars: no I/O/1/0
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/* ==========
   Utilities
   ========== */

function initializeDeck(numDecks = 5) {
  const suits = ['♥', '♦', '♣', '♠'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
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
  return deck;
}

function serializeState(S) {
  return {
    players: S.players,
    playerStats: S.playerStats,
    playerOrder: S.playerOrder,
    currentPlayerIndex: S.currentPlayerIndex,
    pot: S.pot,
    potRebuildAmount: S.potRebuildAmount,
    currentCards: S.currentCards,
    isGameRunning: S.isGameRunning,
    isWaitingForAceChoice: S.isWaitingForAceChoice,
    is67ChallengeActive: S.is67ChallengeActive,
    sixSevenPresses: S.sixSevenPresses,
    gameAdminId: S.gameAdminId,
    currentPlayerId:
      (S.playerOrder.length > 0 && S.currentPlayerIndex >= 0)
        ? S.playerOrder[S.currentPlayerIndex]
        : null,
    spectatorsCount: Object.keys(S.spectators || {}).length
  };
}

function roomBroadcastGameState(io, code) {
  const S = rooms.get(code);
  if (!S) return;
  io.to(code).emit('gameState', serializeState(S));
}
function roomBroadcastMessage(io, code, text, isEmphasis = false, actorId = null, outcome = null, betAmount = null) {
  io.to(code).emit('message', { text, isEmphasis, actorId, outcome, betAmount });
}
function roomBroadcastSystemMessage(io, code, text) {
  io.to(code).emit('newChatMessage', { isSystem: true, message: text });
}

/* ==========================
   Turn Flow (room-scoped)
   ========================== */

async function startNewTurnRoom(io, code, S) {
  if (!rooms.has(code)) return;
  if (!S.isGameRunning || S.playerOrder.length < S.MIN_PLAYERS) {
    S.isGameRunning = false;
    roomBroadcastMessage(io, code, 'Game paused. Waiting for more players...');
    roomBroadcastGameState(io, code);
    return;
  }

  io.to(code).emit('clearResult');

  // Pot rebuild (and move waiting players) when pot is empty/non-positive
  if (S.pot <= 0) {
    let playersInGame = 0;
    S.playerOrder.forEach(pid => {
      if (S.players[pid] && S.players[pid].chips > 0) {
        S.players[pid].chips -= S.potRebuildAmount;
        S.pot += S.potRebuildAmount;
        playersInGame++;
      }
    });
    roomBroadcastMessage(io, code, `Pot rebuilt! ${playersInGame} players add $${S.potRebuildAmount.toFixed(2)}.`);

    // Move waiting players in
    if (Object.keys(S.waitingPlayers).length > 0) {
      for (const pid in S.waitingPlayers) {
        const w = S.waitingPlayers[pid];
        S.players[pid] = w.playerData;
        S.playerStats[pid] = { wins: 0, losses: 0, posts: 0 };
        S.playerOrder.push(pid);
        // charge rebuild upon joining
        S.players[pid].chips -= S.potRebuildAmount;
        S.pot += S.potRebuildAmount;
        roomBroadcastSystemMessage(io, code, `${S.players[pid].name} has joined the game from the waiting list.`);
      }
      S.waitingPlayers = {};
    }
  }

  // Maintain deck size
  if (S.deck.length < 20) {
    S.deck = initializeDeck();
    roomBroadcastMessage(io, code, "Deck is low, creating a fresh shuffle...");
  }

  S.currentCards = [];
  S.currentPlayerIndex = (S.currentPlayerIndex + 1) % S.playerOrder.length;
  const currentPlayerId = S.playerOrder[S.currentPlayerIndex];

  roomBroadcastGameState(io, code);
  roomBroadcastMessage(io, code, `${S.players[currentPlayerId].name}'s turn.`);

  // First card
  await new Promise(r => setTimeout(r, 500));
  const card1 = S.deck.pop();
  S.currentCards.push(card1);
  io.to(code).emit('dealCard', { card: card1, cardSlot: 1 });

  // Ace choice prompt
  if (card1.value === 14) {
    S.isWaitingForAceChoice = true;
    roomBroadcastGameState(io, code);
    io.to(currentPlayerId).emit('promptAceChoice');
    return;
  }

  // Second card (non-Ace first)
  await new Promise(r => setTimeout(r, 400));
  dealSecondCardRoom(io, code, S);
}

async function dealSecondCardRoom(io, code, S) {
  // Draw second card
  let card2 = S.deck.pop();
  if (card2.value === 14) card2.rank = 'A (High)';
  S.currentCards.push(card2);
  io.to(code).emit('dealCard', { card: card2, cardSlot: 2 });
  S.currentCards.sort((a, b) => a.value - b.value);

  // Placeholder middle slot
  await new Promise(r => setTimeout(r, 300));
  io.to(code).emit('dealMiddleCardPlaceholder');

  // Same-card penalty (auto pass)
  if (S.currentCards[0].value === S.currentCards[1].value) {
    const pid = S.playerOrder[S.currentPlayerIndex];
    const penalty = 1.00;
    S.players[pid].chips -= penalty;
    S.pot += penalty;
    roomBroadcastMessage(io, code, `Same cards! ${S.players[pid].name} pays $${penalty.toFixed(2)} and passes.`, true);
    setTimeout(() => startNewTurnRoom(io, code, S), 1000);
    return;
  }

  // 6–7 challenge
  const values = new Set(S.currentCards.map(c => c.value));
  if (values.has(6) && values.has(7)) {
    S.is67ChallengeActive = true;
    S.sixSevenPresses = [];
    roomBroadcastMessage(io, code, "6-7 CHALLENGE! Last to press pays a fine!", true);
    io.to(code).emit('start67Challenge');

    if (S.challengeTimer) clearTimeout(S.challengeTimer);
    S.challengeTimer = setTimeout(() => {
      if (!S.is67ChallengeActive) return;
      S.is67ChallengeActive = false;
      io.to(code).emit('end67Challenge');

      let loserId = null;
      if (S.sixSevenPresses.length < S.playerOrder.length) {
        const didNotPress = S.playerOrder.filter(id => S.players[id] && !S.sixSevenPresses.includes(id));
        if (didNotPress.length > 0) loserId = didNotPress[didNotPress.length - 1];
      } else if (S.sixSevenPresses.length > 0) {
        loserId = S.sixSevenPresses[S.sixSevenPresses.length - 1];
      }

      if (loserId) {
        const fine = 2.00;
        S.players[loserId].chips -= fine;
        S.pot += fine;
        roomBroadcastMessage(io, code, `${S.players[loserId].name} was last and is fined $${fine.toFixed(2)}!`, true);
        roomBroadcastSystemMessage(io, code, `${S.players[loserId].name} was too slow on the 6-7 challenge and paid $${fine.toFixed(2)}.`);
        roomBroadcastGameState(io, code);
      } else {
        roomBroadcastMessage(io, code, "6-7 challenge ended with no loser.");
      }
    }, 5000);
  }

  roomBroadcastGameState(io, code);
}

/* ==========================
   Socket.IO: Room Handlers
   ========================== */

io.on('connection', (socket) => {

  /* ---------- Room creation/join ---------- */
  socket.on('createRoom', ({ name, buyIn }) => {
    const parsedBuyIn = parseFloat(buyIn);
    if (!Number.isFinite(parsedBuyIn) || parsedBuyIn <= 0) {
        socket.emit('roomError', 'Enter a valid buy-in.');
        return;
    }

    let code;
    do { code = generateRoomCode(); } while (rooms.has(code));

    const S = newRoomState();
    rooms.set(code, S);

    socket.join(code);
    socket.data.roomCode = code;

    // optional name -> random fallback
    const existingNames = new Set(Object.values(S.players).map(p => p.name));
    const finalName = (name && name.trim()) ? name.trim() : generatePlayerName(existingNames);

    // seat creator and make admin
    S.gameAdminId = socket.id;
    S.players[socket.id] = { id: socket.id, name: finalName, chips: parsedBuyIn, totalBuyIn: parsedBuyIn };
    S.playerStats[socket.id] = { wins: 0, losses: 0, posts: 0 };
    S.playerOrder.push(socket.id);

    roomBroadcastSystemMessage(io, code, `${finalName} created the game (code ${code}).`);
    socket.emit('roomCreated', { code, state: serializeState(S) });
    roomBroadcastGameState(io, code);

    // 👉 Do NOT set S.isGameRunning and do NOT deduct pot here.
    // Wait for Start Game (or for enough players if you auto-start there).
    });

  socket.on('joinRoom', ({ code, name, buyIn }) => {
    code = String(code || '').toUpperCase();
    if (!rooms.has(code)) {
        socket.emit('roomError', 'Room code not found.');
        return;
    }
    const parsedBuyIn = parseFloat(buyIn);
    if (!Number.isFinite(parsedBuyIn) || parsedBuyIn <= 0) {
        socket.emit('roomError', 'Enter a valid buy-in.');
        return;
    }
    const S = rooms.get(code);

    socket.join(code);
    socket.data.roomCode = code;

    // 15-player active cap -> spectator queue
    if (S.playerOrder.length >= 15) {
        const existingNames = new Set(Object.values(S.players).map(p => p.name));
        const finalName = (name && name.trim()) ? name.trim() : generatePlayerName(existingNames);
        S.waitingPlayers[socket.id] = { playerData: { id: socket.id, name: finalName, chips: parsedBuyIn, totalBuyIn: parsedBuyIn } };
        socket.emit('joinedRoom', { code, state: serializeState(S) });
        roomBroadcastSystemMessage(io, code, `${finalName} is spectating (table full) and will auto-join when a seat opens.`);
        roomBroadcastGameState(io, code);
        return;
    }

    // Active player seat
    const existingNames = new Set(Object.values(S.players).map(p => p.name));
    const finalName = (name && name.trim()) ? name.trim() : generatePlayerName(existingNames);

    S.players[socket.id] = { id: socket.id, name: finalName, chips: parsedBuyIn, totalBuyIn: parsedBuyIn };
    S.playerStats[socket.id] = { wins: 0, losses: 0, posts: 0 };
    S.playerOrder.push(socket.id);
    if (!S.gameAdminId) S.gameAdminId = socket.id;

    roomBroadcastSystemMessage(io, code, `${finalName} has joined the game.`);
    socket.emit('joinedRoom', { code, state: serializeState(S) });

    const needed = S.MIN_PLAYERS - S.playerOrder.length;
    if (needed > 0) {
        roomBroadcastMessage(io, code, `Waiting for ${needed} more player(s)...`);
    } else if (!S.isGameRunning) {
        roomBroadcastMessage(io, code, `Ready to start when the admin clicks 'Start Game'.`);
    }
    roomBroadcastGameState(io, code);
    });

  /* ---------- Game admin & settings ---------- */
  socket.on('startGame', () => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (socket.id !== S.gameAdminId) return;
    if (S.isGameRunning || S.playerOrder.length < S.MIN_PLAYERS) return;

    S.isGameRunning = true;

    // build starting pot once, at start
    S.pot = 0;
    S.playerOrder.forEach(pid => {
        if (S.players[pid]) {
        S.players[pid].chips -= S.potRebuildAmount;
        S.pot += S.potRebuildAmount;
        }
    });

    roomBroadcastMessage(io, code, `Game started. Each player contributes $${S.potRebuildAmount.toFixed(2)} to the pot.`, true);
    S.deck = initializeDeck();
    startNewTurnRoom(io, code, S);
    });

  socket.on('setPotRebuild', (amount) => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (socket.id !== S.gameAdminId) return;
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val < 0) return;
    S.potRebuildAmount = val;
    roomBroadcastMessage(io, code, `Admin set pot rebuild amount to $${val.toFixed(2)}.`);
    roomBroadcastGameState(io, code);
  });

  socket.on('adminAddToPot', (amount) => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (socket.id !== S.gameAdminId) return;
    if (S.isGameRunning) {
      socket.emit('message', { text: "You can only add to the pot before the game starts." });
      return;
    }
    const addAmount = parseFloat(amount);
    if (!Number.isFinite(addAmount) || addAmount <= 0) {
      socket.emit('message', { text: "Invalid pot amount." });
      return;
    }
    S.pot += addAmount;
    roomBroadcastSystemMessage(io, code, `💰 Admin added $${addAmount.toFixed(2)} to the pot.`);
    roomBroadcastGameState(io, code);
  });

  socket.on('endGameSplit', () => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (socket.id !== S.gameAdminId) return;
    if (!S.isGameRunning || S.playerOrder.length === 0 || S.pot <= 0) return;

    const cents = Math.round(S.pot * 100);
    const n = S.playerOrder.length;
    const share = Math.floor(cents / n);
    let rem = cents % n;

    S.playerOrder.forEach(pid => {
      if (!S.players[pid]) return;
      let add = share;
      if (rem > 0) { add += 1; rem -= 1; }
      S.players[pid].chips += add / 100;
    });

    roomBroadcastSystemMessage(io, code, `Admin ended the game. Pot split evenly among ${n} player(s).`);

    S.pot = 0;
    S.isGameRunning = false;
    S.currentCards = [];
    S.currentPlayerIndex = -1;
    S.isWaitingForAceChoice = false;

    roomBroadcastGameState(io, code);
  });

  /* ---------- Player actions ---------- */
  socket.on('addCredit', (amount) => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    const p = S.players[socket.id];
    const a = parseFloat(amount);
    if (!p || !Number.isFinite(a) || a <= 0) return;
    p.chips += a;
    p.totalBuyIn += a;
    roomBroadcastSystemMessage(io, code, `${p.name} added $${a.toFixed(2)} in credit.`);
    roomBroadcastGameState(io, code);
  });

  socket.on('aceChoice', (choice) => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (!S.isWaitingForAceChoice || socket.id !== S.playerOrder[S.currentPlayerIndex]) return;
    if (choice === 'low') {
      // find the Ace that was first card
      const ace = S.currentCards.find(c => c.rank === 'A' || c.rank === 'A (High)');
      if (ace) ace.value = 1;
    }
    S.isWaitingForAceChoice = false;
    dealSecondCardRoom(io, code, S);
  });

  socket.on('playerBet', (betAmount) => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    const player = S.players[socket.id];
    if (!S.isGameRunning || !player) return;
    if (socket.id !== S.playerOrder[S.currentPlayerIndex]) return;
    if (S.isWaitingForAceChoice) return;

    const amt = parseFloat(betAmount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > player.chips || amt > S.pot) {
      socket.emit('message', { text: "Invalid bet." });
      return;
    }

    io.to(code).emit('playerBetPlaced', { playerId: socket.id, amount: amt });

    const nextCard = S.deck.pop();
    const [lowCard, highCard] = S.currentCards;
    let isPost = false, outcome, messageText;

    if (nextCard.value > lowCard.value && nextCard.value < highCard.value) {
      // Win
      player.chips += amt;
      S.pot -= amt;
      outcome = "win";
      messageText = `Winner! ${player.name} wins $${amt.toFixed(2)}.`;
      if (S.playerStats[player.id]) S.playerStats[player.id].wins++;
    } else if (nextCard.value === lowCard.value || nextCard.value === highCard.value) {
      // Post = pay double
      const penalty = amt * 2;
      player.chips -= penalty;
      S.pot += penalty;
      isPost = true;
      outcome = "post";
      messageText = `Hit the post! ${player.name} pays double ($${penalty.toFixed(2)}).`;
      if (S.playerStats[player.id]) S.playerStats[player.id].posts++;
    } else {
      // Loss
      player.chips -= amt;
      S.pot += amt;
      outcome = "loss";
      messageText = `Outside. ${player.name} loses $${amt.toFixed(2)}.`;
      if (S.playerStats[player.id]) S.playerStats[player.id].losses++;
    }

    const isDramatic = amt >= 40;
    io.to(code).emit('cardResult', { card: nextCard, isPost, isDramatic, betAmount: amt });

    setTimeout(() => {
      roomBroadcastMessage(io, code, messageText, true, player.id, outcome, amt);
      setTimeout(() => startNewTurnRoom(io, code, S), isDramatic ? 1500 : 700);
    }, isDramatic ? 1500 : 700);
  });

  socket.on('playerPass', () => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    const player = S.players[socket.id];
    if (!S.isGameRunning || !player) return;
    if (socket.id !== S.playerOrder[S.currentPlayerIndex]) return;
    if (S.isWaitingForAceChoice) return;

    roomBroadcastMessage(io, code, `${player.name} passes.`, false, socket.id);
    setTimeout(() => startNewTurnRoom(io, code, S), 600);
  });

  socket.on('pressed67', () => {
    const ctx = getSocketRoomState(socket);
    if (!ctx) return;
    const { code, S } = ctx;

    if (S.is67ChallengeActive && !S.sixSevenPresses.includes(socket.id)) {
      S.sixSevenPresses.push(socket.id);
      roomBroadcastMessage(io, code, `${S.players[socket.id].name} pressed the button!`);
    }
  });

    socket.on('chatMessage', (msg) => {
        const ctx = getSocketRoomState(socket);
        if (!ctx) return;
        const { code, S } = ctx;

        const name =
            (S.players[socket.id]    && S.players[socket.id].name) ||
            (S.spectators?.[socket.id] && S.spectators[socket.id].name);

        if (!name) return; // not in the room
        io.to(code).emit('newChatMessage', { name, message: msg });
    });

  /* ---------- Disconnect handling (auto-advance if current player leaves) ---------- */
  socket.on('disconnect', () => {
    const code = socket.data?.roomCode;
    if (!code || !rooms.has(code)) return;
    const S = rooms.get(code);

    // Leaving from waiting queue?
    if (S.waitingPlayers[socket.id]) {
      roomBroadcastSystemMessage(io, code, `${S.waitingPlayers[socket.id].playerData.name} left the waiting queue.`);
      delete S.waitingPlayers[socket.id];
      return;
    }

    if (S.players[socket.id]) {
      const wasAdmin = (socket.id === S.gameAdminId);
      const idx = S.playerOrder.indexOf(socket.id);
      const name = S.players[socket.id].name;

      // mark & remove from order
      S.players[socket.id].disconnected = true;
      S.playerOrder = S.playerOrder.filter(id => id !== socket.id);

      roomBroadcastSystemMessage(io, code, `${name} has left the game.`);

      // reassign admin if needed
      if (wasAdmin && S.playerOrder.length > 0) {
        S.gameAdminId = S.playerOrder[0];
        if (S.players[S.gameAdminId]) {
          roomBroadcastSystemMessage(io, code, `${S.players[S.gameAdminId].name} is the new game admin.`);
        }
        roomBroadcastGameState(io, code);
      } else if (S.playerOrder.length === 0) {
        // room now empty of active players -> clear volatile state; if fully empty, delete room
        S.gameAdminId = null;
        S.players = {};
        S.playerStats = {};
        S.pot = 0;
        S.currentCards = [];
        S.currentPlayerIndex = -1;
        S.isGameRunning = false;
        roomBroadcastGameState(io, code);

        // If truly no members left in room, delete it
        if (Object.keys(S.players).length === 0 && Object.keys(S.waitingPlayers).length === 0) {
          rooms.delete(code);
        }
        return;
      }

      // Turn/index handling
      const wasTurn = (S.isGameRunning && idx === S.currentPlayerIndex);

      if (S.isGameRunning) {
        // Not enough players -> pause
        if (S.playerOrder.length < S.MIN_PLAYERS) {
          S.isGameRunning = false;
          roomBroadcastMessage(io, code, 'Not enough players. Game paused.');
          roomBroadcastGameState(io, code);
          return;
        }

        // If someone before the current index left, pull index back one
        if (idx > -1 && idx < S.currentPlayerIndex) {
          S.currentPlayerIndex = Math.max(0, S.currentPlayerIndex - 1);
        }

        if (wasTurn) {
          if (S.isWaitingForAceChoice) {
            S.isWaitingForAceChoice = false;
            if (S.playerOrder.length > 0) {
              dealSecondCardRoom(io, code, S);
            } else {
              roomBroadcastGameState(io, code);
            }
          } else {
            if (S.playerOrder.length > 0) {
              // startNewTurnRoom increments first; step back so next seat after leaver gets turn
              S.currentPlayerIndex = (S.currentPlayerIndex - 1 + S.playerOrder.length) % S.playerOrder.length;
              setTimeout(() => startNewTurnRoom(io, code, S), 150);
            } else {
              S.currentPlayerIndex = -1;
              roomBroadcastGameState(io, code);
            }
          }
        } else {
          roomBroadcastGameState(io, code);
        }
      } else {
        roomBroadcastGameState(io, code);
      }

      if (S.spectators && S.spectators[socket.id]) {
        const name = S.spectators[socket.id].name;
        delete S.spectators[socket.id];
        roomBroadcastSystemMessage(io, code, `${name} stopped spectating.`);
        // optional: if room becomes totally empty of players & spectators, delete it (you may already do this)
        if (S.playerOrder.length === 0 && Object.keys(S.players).length === 0 && Object.keys(S.spectators).length === 0) {
            rooms.delete(code);
        } else {
            roomBroadcastGameState(io, code);
        }
        return; // done
    }

      // Remove records for the disconnected socket (optional keep stats if you want)
      delete S.players[socket.id];
      delete S.playerStats[socket.id];
      delete S.waitingPlayers[socket.id];
    }
  });

  socket.on('spectateRoom', ({ code, name }) => {
    code = String(code || '').toUpperCase();
    if (!rooms.has(code)) {
        socket.emit('roomError', 'Room code not found.');
        return;
    }
    const S = rooms.get(code);
    socket.join(code);
    socket.data.roomCode = code;

    // optional name → fallback to random like players use
    const existingNames = new Set([
        ...Object.values(S.players).map(p => p.name),
        ...Object.values(S.spectators).map(s => s.name)
    ]);
    const finalName = (name && name.trim()) ? name.trim() : generatePlayerName(existingNames);

    S.spectators[socket.id] = { id: socket.id, name: finalName };

    roomBroadcastSystemMessage(io, code, `${finalName} is spectating.`);
    socket.emit('joinedRoomSpectator', { code, state: serializeState(S) });
    roomBroadcastGameState(io, code);
    });
});

/* =========
   Startup
   ========= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
