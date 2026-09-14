/**
 * Takoot - Player Client Engine (public/js/player.js)
 * Clean, kid-friendly player join and gameplay client.
 */

(function () {
  'use strict';

  let socket = null;
  let roomPin = null;
  let selectedAvatar = '🐱';
  let myPlayerId = null;

  // DOM Views
  const views = {
    join: document.getElementById('playerJoinView'),
    lobby: document.getElementById('playerLobbyView'),
    question: document.getElementById('playerQuestionView'),
    submitted: document.getElementById('playerSubmittedView'),
    result: document.getElementById('playerResultView')
  };

  const navResetBtn = document.getElementById('navResetBtn');
  const logoHomeBtn = document.getElementById('logoHomeBtn');
  const btnToggleSound = document.getElementById('btnToggleSound');

  // ==================== AUDIO ENGINE & SOUND EFFECTS ====================
  let audioCtx = null;
  let isMuted = false;
  let masterVolume = 0.4;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function toggleSoundMute() {
    isMuted = !isMuted;
    if (btnToggleSound) {
      btnToggleSound.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
      btnToggleSound.className = isMuted ? 'btn btn-sm btn-secondary muted' : 'btn btn-sm btn-primary';
    }
  }

  function playBeep() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1046.5, now + 0.08);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15 * masterVolume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  function playClick() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    gain.gain.setValueAtTime(0.1 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  function playCorrectDing() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.1);
    osc.frequency.setValueAtTime(783.99, now + 0.2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * masterVolume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  function playWrongBuzzer() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.setValueAtTime(120, now + 0.15);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12 * masterVolume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  // ==================== VIEW MANAGEMENT ====================
  function showView(target) {
    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });
    if (target) target.classList.add('active');
    if (navResetBtn) {
      navResetBtn.style.display = (target === views.join) ? 'none' : 'inline-flex';
    }
  }

  // ==================== WEBSOCKET ====================
  let pendingWSMessage = null;

  function connectWebSocket(onConnected) {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      if (onConnected && socket.readyState === WebSocket.OPEN) onConnected();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
      if (pendingWSMessage) {
        socket.send(JSON.stringify(pendingWSMessage));
        pendingWSMessage = null;
      }
      if (onConnected) onConnected();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    socket.onclose = () => {
      console.warn('Player WebSocket closed.');
    };
  }

  function sendWS(type, payload) {
    const data = { type, payload };
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      pendingWSMessage = data;
      connectWebSocket();
    }
  }

  // ==================== MESSAGE HANDLER ====================
  function handleServerMessage(data) {
    const { type, payload, message } = data;

    switch (type) {
      case 'JOIN_SUCCESS':
        myPlayerId = payload.playerId;
        const lobbyAvatar = document.getElementById('playerLobbyAvatar');
        const lobbyName = document.getElementById('playerLobbyName');
        if (lobbyAvatar) lobbyAvatar.textContent = payload.avatar || selectedAvatar;
        if (lobbyName) lobbyName.textContent = payload.nickname;
        showView(views.lobby);
        break;

      case 'QUESTION_START':
        playBeep();
        renderPlayerQuestion(payload);
        showView(views.question);
        break;

      case 'QUESTION_RESULTS':
        renderPlayerResult(payload);
        showView(views.result);
        break;

      case 'LEADERBOARD_UPDATE_PLAYER':
        const rankEl = document.getElementById('playerRankDisplay');
        if (rankEl) {
          rankEl.textContent = `Rank #${payload.rank} of ${payload.totalPlayers || 1}`;
        }
        break;

      case 'GAME_OVER':
        renderGameOver(payload);
        break;

      case 'ROOM_CLOSED':
        alert(data.reason || 'Game room closed by host.');
        window.location.href = '/';
        break;

      case 'ERROR':
        showError(message || 'An error occurred.');
        break;
    }
  }

  // ==================== QUESTION & PAD ====================
  function renderPlayerQuestion(payload) {
    const qNum = document.getElementById('playerQNumber');
    const imgBox = document.getElementById('playerQImgBox');
    const img = document.getElementById('playerQImage');
    const pad = document.getElementById('playerPad');

    if (qNum) {
      qNum.textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;
    }

    if (payload.image && imgBox && img) {
      img.src = payload.image;
      imgBox.style.display = 'flex';
    } else if (imgBox) {
      imgBox.style.display = 'none';
      if (img) img.src = '';
    }

    if (!pad) return;
    pad.innerHTML = '';

    const shapeIcons = ['▲', '◆', '●', '■'];
    const isTF = payload.options && payload.options.length === 2 &&
      (String(payload.options[0].text).trim().toLowerCase() === 'true' ||
       String(payload.options[0].text).trim().toLowerCase() === 'false');

    (payload.options || []).forEach((opt, idx) => {
      const btn = document.createElement('button');
      let colorClass = `opt-${idx}`;
      if (isTF) {
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }
      btn.className = `player-btn ${colorClass}`;
      btn.setAttribute('data-index', idx);

      const optText = (opt && opt.text != null) ? String(opt.text).trim() : '';
      if (optText && (optText.toLowerCase() === 'true' || optText.toLowerCase() === 'false' || payload.options.length <= 2)) {
        btn.innerHTML = `<span style="font-size: 2.2rem;">${shapeIcons[idx] || '•'}</span><span style="font-size: 1.4rem; font-weight: 800; margin-left: 0.6rem;">${escapeHtml(optText)}</span>`;
      } else {
        btn.textContent = shapeIcons[idx] || '•';
      }

      btn.addEventListener('click', () => {
        playClick();
        sendWS('SUBMIT_ANSWER', { choiceIndex: idx });
        showView(views.submitted);
      });

      pad.appendChild(btn);
    });
  }

  // ==================== PLAYER RESULT ====================
  function renderPlayerResult(payload) {
    const card = document.getElementById('outcomeCard');
    const icon = document.getElementById('outcomeIcon');
    const title = document.getElementById('outcomeTitle');
    const points = document.getElementById('outcomePoints');
    const streak = document.getElementById('outcomeStreak');

    if (payload.isCorrect) {
      playCorrectDing();
      if (card) card.className = 'outcome-card correct';
      if (icon) icon.textContent = '🎉';
      if (title) title.textContent = 'Correct!';
      if (points) points.textContent = `+${payload.pointsAwarded || 0} pts`;
      if (streak) {
        if (payload.streak >= 2) {
          streak.style.display = 'block';
          streak.textContent = `🔥 Streak: ${payload.streak} in a row!`;
        } else {
          streak.style.display = 'none';
        }
      }
    } else {
      playWrongBuzzer();
      if (card) card.className = 'outcome-card wrong';
      if (icon) icon.textContent = '❌';
      if (title) title.textContent = payload.answered ? 'Incorrect' : 'Time Up!';
      if (points) points.textContent = `Score: ${payload.totalScore || 0} pts`;
      if (streak) streak.style.display = 'none';
    }

    // Question breakdown
    const qBox = document.getElementById('playerResultQuestionBox');
    const qNum = document.getElementById('playerResultQNumber');
    const qText = document.getElementById('playerResultQText');
    const correctText = document.getElementById('playerResultCorrectText');

    if (qBox && payload.questionText) {
      if (qNum) qNum.textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;
      if (qText) qText.textContent = payload.questionText;
      if (correctText) correctText.textContent = payload.correctOptionText || '---';
      qBox.style.display = 'block';
    } else if (qBox) {
      qBox.style.display = 'none';
    }
  }

  function renderGameOver(payload) {
    const card = document.getElementById('outcomeCard');
    const icon = document.getElementById('outcomeIcon');
    const title = document.getElementById('outcomeTitle');
    const points = document.getElementById('outcomePoints');
    const streak = document.getElementById('outcomeStreak');
    const rankEl = document.getElementById('playerRankDisplay');

    if (card) card.className = 'outcome-card';
    if (icon) icon.textContent = '🏆';
    if (title) title.textContent = 'Game Over!';

    // Find my rank
    let myRecord = null;
    if (payload.allPlayers && myPlayerId) {
      myRecord = payload.allPlayers.find(p => p.id === myPlayerId);
    }

    if (myRecord) {
      if (points) points.textContent = `Final Score: ${myRecord.score} pts`;
      if (rankEl) rankEl.textContent = `Final Standing: #${myRecord.rank} of ${payload.allPlayers.length}`;
    } else {
      if (points) points.textContent = 'Thanks for playing!';
    }
    if (streak) streak.style.display = 'none';

    showView(views.result);
  }

  // ==================== ERROR BANNER ====================
  function showError(msg) {
    const banner = document.getElementById('joinErrorMsg');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  function hideError() {
    const banner = document.getElementById('joinErrorMsg');
    if (banner) banner.style.display = 'none';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // ==================== SETUP & INITIALIZATION ====================
  function setupJoinFlow() {
    const inputPin = document.getElementById('inputPin');
    const btnNextPin = document.getElementById('btnNextPin');
    const joinStepPin = document.getElementById('joinStepPin');
    const joinStepNick = document.getElementById('joinStepNick');
    const inputNick = document.getElementById('inputNickname');
    const btnSubmitJoin = document.getElementById('btnSubmitJoin');
    const avatarOpts = document.querySelectorAll('.avatar-opt');

    // Avatar Selection
    avatarOpts.forEach(opt => {
      opt.addEventListener('click', () => {
        avatarOpts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedAvatar = opt.getAttribute('data-avatar') || '🐱';
      });
    });

    const proceedToNickname = () => {
      hideError();
      const pin = inputPin.value.trim().replace(/\s+/g, '');
      if (!pin || pin.length < 4) {
        showError('Please enter a valid 6-digit Game PIN.');
        return;
      }
      roomPin = pin;
      if (joinStepPin) joinStepPin.style.display = 'none';
      if (joinStepNick) joinStepNick.style.display = 'block';
      setTimeout(() => {
        if (inputNick) inputNick.focus();
      }, 100);
    };

    if (btnNextPin) btnNextPin.addEventListener('click', proceedToNickname);
    if (inputPin) {
      inputPin.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') proceedToNickname();
      });
    }

    const submitJoin = () => {
      hideError();
      const pin = (roomPin || (inputPin ? inputPin.value.trim() : '')).replace(/\s+/g, '');
      const nick = inputNick ? inputNick.value.trim() : '';

      if (!pin || pin.length < 4) {
        if (joinStepPin) joinStepPin.style.display = 'block';
        if (joinStepNick) joinStepNick.style.display = 'none';
        showError('Please enter a valid Game PIN.');
        return;
      }
      if (!nick) {
        showError('Please enter a nickname.');
        return;
      }

      connectWebSocket(() => {
        sendWS('JOIN_ROOM', {
          pin: pin,
          nickname: nick,
          avatar: selectedAvatar
        });
      });
    };

    if (btnSubmitJoin) btnSubmitJoin.addEventListener('click', submitJoin);
    if (inputNick) {
      inputNick.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitJoin();
      });
    }

    // Check for ?pin=XXXXXX query parameter (e.g. from mobile QR code)
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    if (pinParam) {
      if (inputPin) inputPin.value = pinParam;
      proceedToNickname();
    }

    // Sound toggle
    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', toggleSoundMute);
    }

    // Nav Reset / Leave Game Button
    if (navResetBtn) {
      navResetBtn.addEventListener('click', () => {
        if (confirm('Leave this game?')) {
          if (socket && socket.readyState === WebSocket.OPEN) socket.close();
          window.location.href = '/';
        }
      });
    }

    // Brand logo
    if (logoHomeBtn) {
      logoHomeBtn.addEventListener('click', () => {
        if (confirm('Return to Join screen?')) {
          if (socket && socket.readyState === WebSocket.OPEN) socket.close();
          window.location.href = '/';
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupJoinFlow();
  });

})();
