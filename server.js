const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Sessions store for teacher auth (token -> user info)
const sessions = new Map();

// Middleware: Require Teacher Authentication
function requireTeacherAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = authHeader;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized. Teacher login required.' });
  }
  req.user = sessions.get(token);
  next();
}

// Body parser for JSON / raw text for XML API
app.use(express.json());
app.use(express.text({ type: ['text/xml', 'application/xml', 'text/plain'], limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// XML Parser setup
const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true
};
const parser = new XMLParser(xmlParserOptions);

// Global Rooms Storage
// pin -> Room object
const rooms = new Map();

// Helper: Generate unique 6-digit numeric PIN
function generateGamePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(pin));
  return pin;
}

// Helper: Parse XML Quiz Content
function parseQuizXML(xmlText) {
  const jsonObj = parser.parse(xmlText);
  
  // Find quiz node (supports <quiz>, <test>, <questions>, or root level)
  const root = jsonObj.quiz || jsonObj.test || jsonObj.questions || jsonObj;
  const title = root.title || root['@_title'] || 'Untitled Quiz';
  const description = root.description || '';
  
  let rawQuestions = root.question || root.item || root.q || [];
  if (!Array.isArray(rawQuestions)) {
    rawQuestions = [rawQuestions];
  }

  if (rawQuestions.length === 0) {
    throw new Error('No <question> elements found in XML.');
  }

  const questions = rawQuestions.map((q, qIndex) => {
    let rawText = q.text || q.title || q['@_text'] || q['@_title'] || (typeof q === 'object' ? q['#text'] : q);
    if (rawText && typeof rawText === 'object') {
      rawText = rawText['#text'] || rawText.value || rawText.text || null;
    }
    let textStr = String(rawText || '').trim();
    if (!textStr) {
      textStr = `Question ${qIndex + 1}`;
    }

    const timeLimit = parseInt(q['@_timeLimit'] || q.timeLimit || 20, 10);

    let rawOptions = q.option || q.choice || q.answer || [];
    if (!Array.isArray(rawOptions)) {
      rawOptions = [rawOptions];
    }

    let correctFound = false;
    const options = rawOptions.map((opt, optIndex) => {
      let optText = '';
      let isCorrect = false;

      if (typeof opt === 'object') {
        optText = opt['#text'] || opt.text || opt.value || '';
        if (opt['@_correct'] === 'true' || opt['@_isCorrect'] === 'true' || opt['@_correct'] === '1' || opt.isCorrect === true) {
          isCorrect = true;
        }
      } else {
        optText = String(opt);
      }

      if (isCorrect) correctFound = true;

      return {
        text: optText,
        isCorrect: isCorrect
      };
    });

    // Fallback: If no option marked correct, default first option or check for <correctIndex>
    if (!correctFound && options.length > 0) {
      const explicitCorrectIdx = parseInt(q.correctIndex || q.correct || 0, 10);
      if (explicitCorrectIdx >= 0 && explicitCorrectIdx < options.length) {
        options[explicitCorrectIdx].isCorrect = true;
      } else {
        options[0].isCorrect = true;
      }
    }

    // Extract picture/image URL or Base64 data string if present
    let image = q.image || q.img || q.picture || q['@_image'] || q['@_img'] || q['@_picture'] || null;
    if (image && typeof image === 'object') {
      image = image['#text'] || image.url || image.src || null;
    }
    if (typeof image === 'string' && image.trim().length > 0) {
      image = image.trim();
    } else {
      image = null;
    }

    return {
      text: textStr,
      image: image,
      timeLimit: isNaN(timeLimit) || timeLimit < 5 ? 20 : timeLimit,
      options: options
    };
  });

  return { title, description, questions };
}

// API Endpoint to parse XML uploaded by client
app.post('/api/parse-xml', (req, res) => {
  try {
    const xmlContent = req.body;
    if (!xmlContent || typeof xmlContent !== 'string') {
      return res.status(400).json({ error: 'Empty or invalid XML payload.' });
    }
    const quizData = parseQuizXML(xmlContent);
    res.json({ success: true, quiz: quizData });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to parse XML quiz file.' });
  }
});

// AUTH API ROUTES
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const isValid = db.verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const sessionData = { userId: user.id, username: user.username, role: user.role, createdAt: Date.now() };
    sessions.set(token, sessionData);
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = authHeader;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (token && sessions.has(token)) {
    return res.json({ authenticated: true, user: sessions.get(token) });
  }
  res.json({ authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = authHeader;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (token && sessions.has(token)) {
    sessions.delete(token);
  }
  res.json({ success: true });
});

// QUIZ DATABASE STORAGE ROUTES
app.get('/api/quizzes', async (req, res) => {
  try {
    const list = await db.getAllQuizzes();
    res.json({ success: true, quizzes: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const quiz = await db.getQuizById(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    const parsedQuiz = parseQuizXML(quiz.xml_content);
    res.json({ success: true, quizMeta: quiz, parsedQuiz: parsedQuiz });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes', requireTeacherAuth, async (req, res) => {
  try {
    const xmlContent = req.body;
    if (!xmlContent || typeof xmlContent !== 'string') {
      return res.status(400).json({ error: 'Empty or invalid XML payload.' });
    }
    const parsed = parseQuizXML(xmlContent);
    const saved = await db.saveQuiz({
      title: parsed.title,
      description: parsed.description,
      xmlContent: xmlContent,
      questionCount: parsed.questions.length,
      createdBy: req.user.userId
    });
    res.json({ success: true, quiz: saved });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to save quiz to database.' });
  }
});

app.delete('/api/quizzes/:id', requireTeacherAuth, async (req, res) => {
  try {
    const deleted = await db.deleteQuiz(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Quiz not found or already deleted.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket Connection Handling
wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).substring(2, 9);
  ws.roomPin = null;
  ws.role = null; // 'HOST' or 'PLAYER'

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(ws, data);
    } catch (e) {
      console.error('Invalid WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (ws.roomPin && rooms.has(ws.roomPin)) {
      const room = rooms.get(ws.roomPin);
      if (ws.role === 'HOST') {
        // Broadcast to players that room is closed
        broadcastToRoom(room, { type: 'ROOM_CLOSED', reason: 'Host disconnected' });
        if (room.timer) clearInterval(room.timer);
        rooms.delete(ws.roomPin);
      } else if (ws.role === 'PLAYER') {
        room.players.delete(ws.id);
        // Send updated player list to Host
        sendPlayerListUpdate(room);
      }
    }
  });
});

// Broadcast Helper
function broadcastToRoom(room, data) {
  const jsonStr = JSON.stringify(data);
  if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
    room.hostWs.send(jsonStr);
  }
  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(jsonStr);
    }
  }
}

function sendToHost(room, data) {
  if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
    room.hostWs.send(JSON.stringify(data));
  }
}

function sendPlayerListUpdate(room) {
  const playerList = Array.from(room.players.values()).map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    score: p.score
  }));
  sendToHost(room, {
    type: 'PLAYER_LIST_UPDATE',
    payload: {
      playerCount: playerList.length,
      players: playerList
    }
  });
}

function sendToPlayer(player, data) {
  if (player.ws && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify(data));
  }
}

function shuffleArray(array) {
  if (!Array.isArray(array)) return array;
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// WebSocket Event Router
function handleClientMessage(ws, data) {
  const { type, payload } = data;

  switch (type) {
    case 'CREATE_ROOM': {
      const { quiz, token, shuffleQuestions = true, shuffleOptions = true } = payload || {};

      // Require teacher authentication for room hosting
      if (!token || !sessions.has(token)) {
        return ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Teacher login required to host a quiz room.'
        }));
      }

      if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid quiz data' }));
      }

      // Deep clone quiz to avoid mutating original structure
      const processedQuiz = JSON.parse(JSON.stringify(quiz));

      // Randomize options order per question
      if (shuffleOptions) {
        processedQuiz.questions.forEach(q => {
          if (q.options && q.options.length > 1) {
            shuffleArray(q.options);
          }
        });
      }

      // Randomize question order
      if (shuffleQuestions) {
        shuffleArray(processedQuiz.questions);
      }

      const pin = generateGamePin();
      const room = {
        pin: pin,
        hostWs: ws,
        quiz: processedQuiz,
        players: new Map(),
        state: 'LOBBY',
        currentQuestionIndex: -1,
        timer: null,
        timeLeft: 0,
        questionStartTime: 0,
        answersReceived: 0
      };

      rooms.set(pin, room);
      ws.roomPin = pin;
      ws.role = 'HOST';

      ws.send(JSON.stringify({
        type: 'ROOM_CREATED',
        payload: {
          pin: pin,
          title: quiz.title,
          questionCount: quiz.questions.length
        }
      }));
      break;
    }

    case 'JOIN_ROOM': {
      const { pin, nickname, avatar } = payload;
      const room = rooms.get(String(pin).trim());

      if (!room) {
        return ws.send(JSON.stringify({ type: 'JOIN_ERROR', message: 'Game PIN not found. Please check the code.' }));
      }

      if (room.state !== 'LOBBY') {
        return ws.send(JSON.stringify({ type: 'JOIN_ERROR', message: 'Game has already started!' }));
      }

      const cleanName = (nickname || 'Player').substring(0, 18).trim();
      
      // Check for duplicate name in room
      for (const p of room.players.values()) {
        if (p.nickname.toLowerCase() === cleanName.toLowerCase()) {
          return ws.send(JSON.stringify({ type: 'JOIN_ERROR', message: 'Nickname already taken in this room.' }));
        }
      }

      ws.roomPin = room.pin;
      ws.role = 'PLAYER';

      const playerObj = {
        id: ws.id,
        ws: ws,
        nickname: cleanName,
        avatar: avatar || '🐱',
        score: 0,
        streak: 0,
        lastAnswer: null
      };

      room.players.set(ws.id, playerObj);

      ws.send(JSON.stringify({
        type: 'JOIN_SUCCESS',
        payload: {
          pin: room.pin,
          nickname: cleanName,
          avatar: playerObj.avatar,
          playerId: playerObj.id,
          quizTitle: room.quiz.title
        }
      }));

      // Send updated player list to host
      sendPlayerListUpdate(room);
      break;
    }

    case 'RECONNECT_PLAYER': {
      const { pin, playerId } = payload;
      const room = rooms.get(String(pin).trim());
      if (!room) {
        return ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', message: 'Game session expired or PIN invalid.' }));
      }
      const player = room.players.get(playerId);
      if (!player) {
        return ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', message: 'Player session not found.' }));
      }

      // Re-bind new WebSocket connection to existing player object
      ws.id = playerId;
      ws.roomPin = room.pin;
      ws.role = 'PLAYER';
      player.ws = ws;
      player.online = true;

      console.log(`[Reconnection] Player "${player.nickname}" (${playerId}) reconnected to Room ${pin}`);

      ws.send(JSON.stringify({
        type: 'JOIN_SUCCESS',
        payload: {
          pin: room.pin,
          nickname: player.nickname,
          avatar: player.avatar,
          playerId: player.id,
          quizTitle: room.quiz.title
        }
      }));

      sendPlayerListUpdate(room);

      // Sync active state to reconnected player
      if (room.state === 'QUESTION') {
        const q = room.quiz.questions[room.currentQuestionIndex];
        if (player.lastAnswer && player.lastAnswer.questionIndex === room.currentQuestionIndex) {
          sendToPlayer(player, { type: 'ANSWER_SUBMITTED_CONFIRM' });
        } else {
          sendToPlayer(player, {
            type: 'QUESTION_START_PLAYER',
            payload: {
              questionIndex: room.currentQuestionIndex,
              totalQuestions: room.quiz.questions.length,
              text: q.text,
              timeLimit: q.timeLimit,
              options: q.options.map(o => ({ text: o.text }))
            }
          });
        }
      } else if (room.state === 'LEADERBOARD') {
        sendToPlayer(player, {
          type: 'LEADERBOARD_UPDATE_PLAYER',
          payload: {
            score: player.score,
            totalPlayers: room.players.size
          }
        });
      }
      break;
    }

    case 'START_GAME': {
      const room = rooms.get(ws.roomPin);
      if (!room || room.hostWs !== ws) return;

      if (room.players.size === 0) {
        return ws.send(JSON.stringify({ type: 'ERROR', message: 'Cannot start game without players!' }));
      }

      room.currentQuestionIndex = 0;
      startQuestion(room);
      break;
    }

    case 'NEXT_QUESTION': {
      const room = rooms.get(ws.roomPin);
      if (!room || room.hostWs !== ws) return;

      room.currentQuestionIndex++;
      if (room.currentQuestionIndex >= room.quiz.questions.length) {
        endGame(room);
      } else {
        startQuestion(room);
      }
      break;
    }

    case 'SUBMIT_ANSWER': {
      const room = rooms.get(ws.roomPin);
      if (!room || room.state !== 'QUESTION') return;

      const player = room.players.get(ws.id);
      if (!player) return;

      // Don't allow multiple answers for same question
      if (player.lastAnswer && player.lastAnswer.questionIndex === room.currentQuestionIndex) {
        return;
      }

      const { choiceIndex } = payload;
      const currentQ = room.quiz.questions[room.currentQuestionIndex];
      const isCorrect = currentQ.options[choiceIndex] ? currentQ.options[choiceIndex].isCorrect : false;

      const timeTakenSec = Math.max(0.1, (Date.now() - room.questionStartTime) / 1000);
      let pointsAwarded = 0;

      if (isCorrect) {
        player.streak += 1;
        // Speed scoring: Instant = 1000 pts, last second = 500 pts
        const timeFactor = Math.max(0, 1 - (timeTakenSec / currentQ.timeLimit) / 2);
        pointsAwarded = Math.round(1000 * timeFactor);
        
        // Add streak bonus if streak >= 2
        if (player.streak >= 2) {
          pointsAwarded += Math.min(500, (player.streak - 1) * 100);
        }
        player.score += pointsAwarded;
      } else {
        player.streak = 0;
      }

      player.lastAnswer = {
        questionIndex: room.currentQuestionIndex,
        choiceIndex: choiceIndex,
        isCorrect: isCorrect,
        pointsAwarded: pointsAwarded,
        timeTakenSec: timeTakenSec
      };

      room.answersReceived++;

      // Send confirmation to player
      sendToPlayer(player, {
        type: 'ANSWER_SUBMITTED_CONFIRM',
        payload: {
          choiceIndex: choiceIndex
        }
      });

      // Update host with live answer counter
      sendToHost(room, {
        type: 'ANSWER_RECEIVED_UPDATE',
        payload: {
          answersReceived: room.answersReceived,
          totalPlayers: room.players.size
        }
      });

      // If all players answered, trigger question end early!
      if (room.answersReceived >= room.players.size) {
        finishQuestion(room);
      }
      break;
    }

    case 'REVEAL_RESULTS': {
      const room = rooms.get(ws.roomPin);
      if (!room || room.hostWs !== ws) return;
      finishQuestion(room);
      break;
    }

    case 'SHOW_LEADERBOARD': {
      const room = rooms.get(ws.roomPin);
      if (!room || room.hostWs !== ws) return;
      sendLeaderboard(room);
      break;
    }
  }
}

// Question Controller
function startQuestion(room) {
  if (room.timer) clearInterval(room.timer);

  room.state = 'QUESTION';
  room.answersReceived = 0;
  
  // Reset players answer state for new question
  for (const player of room.players.values()) {
    if (player.lastAnswer && player.lastAnswer.questionIndex < room.currentQuestionIndex) {
      player.lastAnswer = null;
    }
  }

  const currentQ = room.quiz.questions[room.currentQuestionIndex];
  room.timeLeft = currentQ.timeLimit;
  room.questionStartTime = Date.now();

  // Send to Host (includes correct flag)
  sendToHost(room, {
    type: 'QUESTION_START_HOST',
    payload: {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.quiz.questions.length,
      text: currentQ.text,
      timeLimit: currentQ.timeLimit,
      options: currentQ.options,
      totalPlayers: room.players.size
    }
  });

  // Send to Players (without exposing correct flags)
  const playerOptions = currentQ.options.map(opt => ({ text: opt.text }));
  for (const player of room.players.values()) {
    sendToPlayer(player, {
      type: 'QUESTION_START_PLAYER',
      payload: {
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.quiz.questions.length,
        text: currentQ.text,
        timeLimit: currentQ.timeLimit,
        options: playerOptions
      }
    });
  }

  // Timer Tick
  room.timer = setInterval(() => {
    room.timeLeft--;
    
    broadcastToRoom(room, {
      type: 'TIMER_TICK',
      payload: { timeLeft: room.timeLeft }
    });

    if (room.timeLeft <= 0) {
      finishQuestion(room);
    }
  }, 1000);
}

// End Question & Summarize Results
function finishQuestion(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  if (room.state === 'RESULTS' || room.state === 'LEADERBOARD') return;
  room.state = 'RESULTS';

  const currentQ = room.quiz.questions[room.currentQuestionIndex];
  const optionCounts = new Array(currentQ.options.length).fill(0);
  
  // Find correct option index
  const correctOptionIndex = currentQ.options.findIndex(o => o.isCorrect);

  for (const player of room.players.values()) {
    if (player.lastAnswer && player.lastAnswer.questionIndex === room.currentQuestionIndex) {
      if (player.lastAnswer.choiceIndex >= 0 && player.lastAnswer.choiceIndex < optionCounts.length) {
        optionCounts[player.lastAnswer.choiceIndex]++;
      }
    }
  }

  // Sort players by score descending for top 5 leaderboard
  const sortedPlayers = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, rank) => ({
      rank: rank + 1,
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak
    }));

  const top5 = sortedPlayers.slice(0, 5);

  // Send Host results breakdown & leaderboard
  sendToHost(room, {
    type: 'QUESTION_RESULTS_HOST',
    payload: {
      questionIndex: room.currentQuestionIndex,
      correctOptionIndex: correctOptionIndex,
      optionCounts: optionCounts,
      answersReceived: room.answersReceived,
      totalPlayers: room.players.size,
      topPlayers: top5,
      isLastQuestion: room.currentQuestionIndex >= room.quiz.questions.length - 1
    }
  });

  // Send Player personal outcome
  for (const player of room.players.values()) {
    const ans = player.lastAnswer && player.lastAnswer.questionIndex === room.currentQuestionIndex ? player.lastAnswer : null;
    sendToPlayer(player, {
      type: 'QUESTION_RESULTS_PLAYER',
      payload: {
        isCorrect: ans ? ans.isCorrect : false,
        pointsAwarded: ans ? ans.pointsAwarded : 0,
        totalScore: player.score,
        streak: player.streak,
        answered: ans !== null,
        correctOptionIndex: correctOptionIndex
      }
    });
  }
}

// Send Leaderboard
function sendLeaderboard(room) {
  room.state = 'LEADERBOARD';

  // Sort players by score descending
  const sortedPlayers = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, rank) => ({
      rank: rank + 1,
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak
    }));

  const top5 = sortedPlayers.slice(0, 5);
  const isLastQuestion = room.currentQuestionIndex >= room.quiz.questions.length - 1;

  sendToHost(room, {
    type: 'LEADERBOARD_UPDATE_HOST',
    payload: {
      topPlayers: top5,
      isLastQuestion: isLastQuestion
    }
  });

  // Notify players of their individual current rank
  sortedPlayers.forEach(p => {
    const playerObj = room.players.get(p.id);
    if (playerObj) {
      sendToPlayer(playerObj, {
        type: 'LEADERBOARD_UPDATE_PLAYER',
        payload: {
          rank: p.rank,
          score: p.score,
          totalPlayers: sortedPlayers.length
        }
      });
    }
  });
}

// Final Game Podium
function endGame(room) {
  room.state = 'FINISHED';

  const sortedPlayers = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, rank) => ({
      rank: rank + 1,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score
    }));

  const podium = {
    first: sortedPlayers[0] || null,
    second: sortedPlayers[1] || null,
    third: sortedPlayers[2] || null,
    allPlayers: sortedPlayers
  };

  broadcastToRoom(room, {
    type: 'GAME_OVER',
    payload: podium
  });
}

db.initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`🚀 Takoot Quiz Server running on port ${PORT}`);
    console.log(`👉 Host & Join Web App: http://localhost:${PORT}`);
    console.log(`🔑 Embedded single-file DB active & ready`);
    console.log(`================================================`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
