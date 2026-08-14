/**
 * Takoot - Real-Time Quiz Application Engine
 */

(function () {
  'use strict';

  // State Management
  let socket = null;
  let currentRole = null; // 'HOST' or 'PLAYER'
  let roomPin = null;
  let parsedQuizData = null;
  let currentXmlText = null;
  let selectedAvatar = '🐱';
  let currentQuestionOptionsCount = 4;
  let currentQIndex = 0;
  let isLastQuestion = false;

  // Teacher Authentication State
  let authToken = localStorage.getItem('takoot_token') || null;
  let currentUser = null;

  // DOM Element References
  const views = {
    landing: document.getElementById('landingView'),
    playerJoin: document.getElementById('playerJoinView'),
    playerLobby: document.getElementById('playerLobbyView'),
    playerQuestion: document.getElementById('playerQuestionView'),
    playerSubmitted: document.getElementById('playerSubmittedView'),
    playerResult: document.getElementById('playerResultView'),
    hostUpload: document.getElementById('hostUploadView'),
    hostLobby: document.getElementById('hostLobbyView'),
    hostQuestion: document.getElementById('hostQuestionView'),
    hostResults: document.getElementById('hostResultsView'),
    hostLeaderboard: document.getElementById('hostLeaderboardView'),
    hostPodium: document.getElementById('hostPodiumView')
  };

  const navResetBtn = document.getElementById('navResetBtn');
  const logoHomeBtn = document.getElementById('logoHomeBtn');
  const btnToggleSound = document.getElementById('btnToggleSound');

  // ==================== AUDIO ENGINE & SOUND CONTROLLER ====================
  let audioCtx = null;
  let isMuted = false;
  let masterVolume = 0.4;
  let activeBgmOscillators = [];
  let bgmInterval = null;
  let externalAudioElements = {};

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
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
    if (isMuted) {
      stopAllMusic();
    }
  }

  function stopAllMusic() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
    activeBgmOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (e) {}
    });
    activeBgmOscillators = [];

    // Stop external HTML5 audio elements if active
    Object.values(externalAudioElements).forEach(aud => {
      if (aud) {
        aud.pause();
        aud.currentTime = 0;
      }
    });
  }

  // Play custom file from public/audio/ if present, otherwise fall back to Web Audio synth
  function playAudioFileOrFallback(filename, fallbackFn) {
    if (isMuted) return;
    initAudio();

    const audioPath = `/audio/${filename}`;
    if (!externalAudioElements[filename]) {
      const aud = new Audio(audioPath);
      aud.volume = masterVolume;
      externalAudioElements[filename] = aud;
    }

    const aud = externalAudioElements[filename];
    aud.currentTime = 0;
    aud.play().then(() => {
      // Playing custom audio file from public/audio/
    }).catch(() => {
      // Audio file not found or blocked, use Web Audio API synth fallback!
      if (fallbackFn) fallbackFn();
    });
  }

  // 1. QUESTION START BEEP (Soft, friendly two-tone chime beep)
  function playGongSound() {
    if (isMuted) return;
    playAudioFileOrFallback('beep.mp3', () => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Soft, warm two-tone chime beep (880Hz -> 1046.5Hz)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1046.5, now + 0.07);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15 * masterVolume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  // 2. LOBBY THINKING MUSIC (Upbeat Kahoot-style Waiting Loop)
  function startLobbyMusic() {
    stopAllMusic();
    if (isMuted) return;

    playAudioFileOrFallback('lobby.mp3', () => {
      if (!audioCtx) return;
      let step = 0;
      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];

      bgmInterval = setInterval(() => {
        if (isMuted || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const noteFreq = notes[step % notes.length];
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(noteFreq, now);

        gain.gain.setValueAtTime(0.1 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.25);

        step++;
      }, 300);
    });
  }

  // 3. QUESTION COUNTDOWN MUSIC (6 Distinct Melodies per Question Index)
  function startQuestionMusic(qIndex) {
    stopAllMusic();
    if (isMuted) return;

    // Trigger soft two-tone chime beep on question start
    playGongSound();

    const melodyIdx = ((qIndex || 0) % 6) + 1;
    const mp3File = `question${melodyIdx}.mp3`;

    // Check custom audio file question1.mp3, question2.mp3... fallback to question.mp3, fallback to Web Audio synth!
    playAudioFileOrFallback(mp3File, () => {
      playAudioFileOrFallback('question.mp3', () => {
        if (!audioCtx) return;
        let step = 0;

        // 6 distinct melodic note patterns and synth timbre configurations per question index
        const melodies = [
          // 1. Classic Pentatonic Bounce (Square)
          { wave: 'square', tempo: 220, seq: [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 196.00] },
          // 2. Funky Minor Groove (Sawtooth)
          { wave: 'sawtooth', tempo: 200, seq: [220.00, 261.63, 293.66, 329.63, 392.00, 329.63, 293.66, 261.63] },
          // 3. Pop Arpeggio Sparkle (Triangle)
          { wave: 'triangle', tempo: 240, seq: [349.23, 440.00, 523.25, 698.46, 523.25, 440.00, 349.23, 261.63] },
          // 4. Retro Synthwave Pulse (Square)
          { wave: 'square', tempo: 210, seq: [146.83, 146.83, 174.61, 220.00, 293.66, 220.00, 174.61, 146.83] },
          // 5. Salsa Rhythm Jam (Sine)
          { wave: 'sine', tempo: 190, seq: [392.00, 493.88, 587.33, 659.25, 587.33, 493.88, 392.00, 293.66] },
          // 6. EDM Driving Beat (Sawtooth)
          { wave: 'sawtooth', tempo: 230, seq: [164.81, 196.00, 246.94, 329.63, 293.66, 246.94, 196.00, 164.81] }
        ];

        const activeMelody = melodies[(qIndex || 0) % melodies.length];

        bgmInterval = setInterval(() => {
          if (isMuted || !audioCtx) return;
          const now = audioCtx.currentTime;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();

          const freq = activeMelody.seq[step % activeMelody.seq.length];
          osc.type = activeMelody.wave;
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.08 * masterVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(now);
          osc.stop(now + 0.18);

          step++;
        }, activeMelody.tempo);
      });
    });
  }

  // 4. RESULTS REVEAL FANFARE
  function playResultsSound() {
    stopAllMusic();
    if (isMuted) return;

    playAudioFileOrFallback('results.mp3', () => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];

      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const startTime = now + (idx * 0.12);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.18 * masterVolume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });
    });
  }

  // 5. PODIUM VICTORY MUSIC
  function playPodiumMusic() {
    stopAllMusic();
    if (isMuted) return;

    playAudioFileOrFallback('podium.mp3', () => {
      if (!audioCtx) return;
      let step = 0;
      const fanfare = [523.25, 523.25, 523.25, 659.25, 783.99, 1046.50];

      bgmInterval = setInterval(() => {
        if (isMuted || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        const freq = fanfare[step % fanfare.length];
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.22 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.4);

        step++;
        if (step >= fanfare.length * 4) {
          clearInterval(bgmInterval);
          bgmInterval = null;
        }
      }, 200);
    });
  }

  // Initialize App
  function init() {
    setupNavigation();
    setupAuthEvents();
    setupXmlReviewEvents();
    setupHostUploadEvents();
    setupPlayerJoinEvents();
    setupHostGameEvents();
    connectWebSocket();
    checkAuthStatus();

    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', toggleSoundMute);
    }
    document.addEventListener('click', initAudio, { once: true });
    checkAuthStatus();

    // Check for QR code direct join parameter (?pin=XXXXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    if (pinParam) {
      const inputPin = document.getElementById('inputPin');
      if (inputPin) inputPin.value = pinParam;
      document.getElementById('joinStepPin').style.display = 'none';
      document.getElementById('joinStepNick').style.display = 'block';
      hideError('joinErrorMsg');
      showView(views.playerJoin);
      setTimeout(() => {
        const inputNick = document.getElementById('inputNickname');
        if (inputNick) inputNick.focus();
      }, 150);
    }
  }

  // View Switching Helper
  function showView(targetView) {
    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });
    if (targetView) {
      targetView.classList.add('active');
    }

    if (targetView === views.landing) {
      navResetBtn.style.display = 'none';
    } else {
      navResetBtn.style.display = 'inline-flex';
    }
  }

  function setupNavigation() {
    document.getElementById('btnGoJoin').addEventListener('click', () => {
      document.getElementById('joinStepPin').style.display = 'block';
      document.getElementById('joinStepNick').style.display = 'none';
      hideError('joinErrorMsg');
      showView(views.playerJoin);

      // Auto-fill PIN if query string contains pin
      const urlParams = new URLSearchParams(window.location.search);
      const pinParam = urlParams.get('pin');
      if (pinParam) {
        document.getElementById('inputPin').value = pinParam;
      }
      setTimeout(() => document.getElementById('inputPin').focus(), 100);
    });

    document.getElementById('btnGoHost').addEventListener('click', () => {
      if (!currentUser || !authToken) {
        hideError('loginErrorMsg');
        document.getElementById('loginModal').style.display = 'flex';
        return;
      }
      showView(views.hostUpload);
      fetchSavedQuizzes();
    });

    logoHomeBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      window.location.href = '/';
    });

    navResetBtn.addEventListener('click', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      window.location.href = '/';
    });
  }

  let isReconnecting = false;

  // WebSocket Connection with Auto-Reconnection & Session Recovery
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('⚡ Connected to Takoot WebSocket Server');
      isReconnecting = false;

      // Auto-reconnect session check
      const savedSession = sessionStorage.getItem('takoot_player_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          if (session.pin && session.playerId) {
            console.log('🔄 Attempting player session recovery for room:', session.pin);
            sendWS('RECONNECT_PLAYER', { pin: session.pin, playerId: session.playerId });
          }
        } catch (e) {}
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    socket.onclose = () => {
      console.warn('WebSocket connection closed. Attempting auto-reconnect in 2s...');
      if (!isReconnecting) {
        isReconnecting = true;
        setTimeout(connectWebSocket, 2000);
      }
    };

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  function sendWS(type, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    } else {
      alert('Connection lost. Reconnecting...');
      connectWebSocket();
    }
  }

  // Server Message Router
  function handleServerMessage(data) {
    const { type, payload, message } = data;

    switch (type) {
      case 'ROOM_CREATED':
        currentRole = 'HOST';
        roomPin = payload.pin;
        if (btnToggleSound) btnToggleSound.style.display = 'inline-flex';
        renderHostLobby(payload);
        showView(views.hostLobby);
        startLobbyMusic();
        break;

      case 'JOIN_SUCCESS':
        currentRole = 'PLAYER';
        roomPin = payload.pin;
        if (payload.playerId) {
          sessionStorage.setItem('takoot_player_session', JSON.stringify({
            pin: payload.pin,
            playerId: payload.playerId,
            nickname: payload.nickname,
            avatar: payload.avatar
          }));
        }
        document.getElementById('playerLobbyName').textContent = payload.nickname;
        document.getElementById('playerLobbyAvatar').textContent = payload.avatar;
        showView(views.playerLobby);
        break;

      case 'JOIN_ERROR':
        showError('joinErrorMsg', message || 'Failed to join game.');
        break;

      case 'PLAYER_JOINED':
      case 'PLAYER_LIST_UPDATE':
        const playersList = (payload && payload.players) ? payload.players : (data.players ? data.players : []);
        updateHostPlayerGrid(playersList);
        break;

      case 'QUESTION_START_HOST':
        currentQIndex = payload.questionIndex;
        renderHostQuestion(payload);
        showView(views.hostQuestion);
        startQuestionMusic();
        break;

      case 'QUESTION_START_PLAYER':
        currentQIndex = payload.questionIndex;
        try {
          renderPlayerQuestion(payload);
        } catch (err) {
          console.error('Error rendering player question:', err);
        }
        showView(views.playerQuestion);
        break;

      case 'ANSWER_RECEIVED_UPDATE':
        document.getElementById('hostAnswerCountBadge').textContent = `Answers: ${payload.answersReceived}/${payload.totalPlayers}`;
        break;

      case 'ANSWER_SUBMITTED_CONFIRM':
        showView(views.playerSubmitted);
        break;

      case 'TIMER_TICK':
        const timerCircle = document.getElementById('hostTimerDisplay');
        if (timerCircle) {
          timerCircle.textContent = payload.timeLeft;
          if (payload.timeLeft <= 5) {
            timerCircle.classList.add('warning');
          } else {
            timerCircle.classList.remove('warning');
          }
        }

        // Player Auto-Recovery Check:
        // If player missed QUESTION_START_PLAYER due to network drop and is stuck on a result/lobby view during a question
        if (currentRole === 'PLAYER' && payload.questionIndex !== undefined) {
          if (views.playerQuestion && !views.playerQuestion.classList.contains('active') && !views.playerSubmitted.classList.contains('active')) {
            console.warn('⚠️ Player missed QUESTION_START_PLAYER event! Auto-recovering screen to select mode...');
            showView(views.playerQuestion);
          }
        }
        break;

      case 'QUESTION_RESULTS_HOST':
        isLastQuestion = payload.isLastQuestion;
        renderHostResultsChart(payload);
        showView(views.hostResults);
        playResultsSound();
        break;

      case 'QUESTION_RESULTS_PLAYER':
        renderPlayerResult(payload);
        showView(views.playerResult);
        break;

      case 'LEADERBOARD_UPDATE_HOST':
        renderHostLeaderboard(payload);
        showView(views.hostLeaderboard);
        break;

      case 'LEADERBOARD_UPDATE_PLAYER':
        // Player sees position feedback inside current view
        break;

      case 'GAME_OVER':
        renderPodium(payload);
        if (currentRole === 'HOST') {
          showView(views.hostPodium);
          playPodiumMusic();
        } else {
          showView(views.hostPodium);
        }
        break;

      case 'ROOM_CLOSED':
        stopAllMusic();
        alert(data.reason || 'Game room closed by host.');
        location.reload();
        break;

      case 'ERROR':
        alert(message || 'An error occurred.');
        break;
    }
  }

  // ==================== HOST SETUP LOGIC ====================
  function setupHostUploadEvents() {
    const dropZone = document.getElementById('dropZone');
    const xmlFileInput = document.getElementById('xmlFileInput');
    const btnCreateRoom = document.getElementById('btnCreateRoom');

    dropZone.addEventListener('click', () => xmlFileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleXmlFile(e.dataTransfer.files[0]);
      }
    });

    xmlFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleXmlFile(e.target.files[0]);
      }
    });

    btnCreateRoom.addEventListener('click', () => {
      if (!currentUser || !authToken) {
        alert('Teacher login required to host a quiz room.');
        document.getElementById('loginModal').style.display = 'flex';
        return;
      }
      const chkQ = document.getElementById('chkShuffleQuestions');
      const chkO = document.getElementById('chkShuffleOptions');
      const selectTimeLimit = document.getElementById('selectTimeLimit');

      const shuffleQuestions = chkQ ? chkQ.checked : true;
      const shuffleOptions = chkO ? chkO.checked : true;
      const customTimeLimit = selectTimeLimit ? selectTimeLimit.value : '20';

      if (parsedQuizData) {
        sendWS('CREATE_ROOM', {
          quiz: parsedQuizData,
          token: authToken,
          shuffleQuestions: shuffleQuestions,
          shuffleOptions: shuffleOptions,
          customTimeLimit: customTimeLimit
        });
      }
    });

    const btnSaveXmlToDb = document.getElementById('btnSaveXmlToDb');
    if (btnSaveXmlToDb) {
      btnSaveXmlToDb.addEventListener('click', () => {
        if (currentXmlText) {
          saveXmlToDb(currentXmlText);
        }
      });
    }

    const btnRefreshQuizDb = document.getElementById('btnRefreshQuizDb');
    if (btnRefreshQuizDb) {
      btnRefreshQuizDb.addEventListener('click', () => {
        fetchSavedQuizzes();
      });
    }
  }

  function handleXmlFile(file) {
    hideError('xmlErrorMsg');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const xmlText = e.target.result;
      currentXmlText = xmlText;
      try {
        const response = await fetch('/api/parse-xml', {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml' },
          body: xmlText
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to parse XML file.');
        }

        parsedQuizData = result.quiz;
        document.getElementById('previewTitle').textContent = parsedQuizData.title;
        document.getElementById('previewMeta').textContent = `✓ ${parsedQuizData.questions.length} Questions Loaded`;
        document.getElementById('quizPreviewBox').style.display = 'block';
        document.getElementById('btnCreateRoom').disabled = false;

        const saveBtn = document.getElementById('btnSaveXmlToDb');
        if (saveBtn) {
          saveBtn.style.display = currentUser ? 'inline-flex' : 'none';
        }
      } catch (err) {
        showError('xmlErrorMsg', err.message);
        document.getElementById('btnCreateRoom').disabled = true;
      }
    };
    reader.readAsText(file);
  }

  // TEACHER AUTHENTICATION & DATABASE SYSTEM
  function setupAuthEvents() {
    const loginModal = document.getElementById('loginModal');
    const btnLoginModalOpen = document.getElementById('btnLoginModalOpen');
    const btnCloseLoginModal = document.getElementById('btnCloseLoginModal');
    const btnPromptLogin = document.getElementById('btnPromptLogin');
    const loginForm = document.getElementById('loginForm');
    const btnLogoutBtn = document.getElementById('btnLogoutBtn');

    if (btnLoginModalOpen) {
      btnLoginModalOpen.addEventListener('click', () => {
        hideError('loginErrorMsg');
        loginModal.style.display = 'flex';
      });
    }

    if (btnPromptLogin) {
      btnPromptLogin.addEventListener('click', () => {
        hideError('loginErrorMsg');
        loginModal.style.display = 'flex';
      });
    }

    if (btnCloseLoginModal) {
      btnCloseLoginModal.addEventListener('click', () => {
        loginModal.style.display = 'none';
      });
    }

    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        loginModal.style.display = 'none';
      }
    });

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('loginErrorMsg');

        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Invalid login credentials.');
          }

          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem('takoot_token', authToken);

          loginModal.style.display = 'none';
          updateAuthUI();
          fetchSavedQuizzes();
        } catch (err) {
          showError('loginErrorMsg', err.message);
        }
      });
    }

    if (btnLogoutBtn) {
      btnLogoutBtn.addEventListener('click', async () => {
        if (authToken) {
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${authToken}` }
            });
          } catch (e) {}
        }
        authToken = null;
        currentUser = null;
        localStorage.removeItem('takoot_token');
        updateAuthUI();
      });
    }
  }

  async function checkAuthStatus() {
    if (!authToken) {
      updateAuthUI();
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.authenticated && data.user) {
        currentUser = data.user;
      } else {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('takoot_token');
      }
    } catch (e) {
      currentUser = null;
    }
    updateAuthUI();
  }

  function updateAuthUI() {
    const authStatusBox = document.getElementById('authStatusBox');
    const authUsernameDisplay = document.getElementById('authUsernameDisplay');
    const btnLoginModalOpen = document.getElementById('btnLoginModalOpen');
    const btnLogoutBtn = document.getElementById('btnLogoutBtn');
    const teacherAuthBanner = document.getElementById('teacherAuthBanner');
    const teacherHostPanel = document.getElementById('teacherHostPanel');

    if (currentUser) {
      if (authStatusBox) authStatusBox.style.display = 'block';
      if (authUsernameDisplay) authUsernameDisplay.textContent = currentUser.username;
      if (btnLoginModalOpen) btnLoginModalOpen.style.display = 'none';
      if (btnLogoutBtn) btnLogoutBtn.style.display = 'inline-flex';
      if (teacherAuthBanner) teacherAuthBanner.style.display = 'none';
      if (teacherHostPanel) teacherHostPanel.style.display = 'block';
    } else {
      if (authStatusBox) authStatusBox.style.display = 'none';
      if (btnLoginModalOpen) btnLoginModalOpen.style.display = 'inline-flex';
      if (btnLogoutBtn) btnLogoutBtn.style.display = 'none';
      if (teacherAuthBanner) teacherAuthBanner.style.display = 'block';
      if (teacherHostPanel) teacherHostPanel.style.display = 'none';
    }
  }

  // SAVED QUIZZES DATABASE MANAGERS
  async function fetchSavedQuizzes() {
    const listContainer = document.getElementById('savedQuizzesList');
    if (!listContainer) return;

    try {
      listContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem; padding: 0.8rem; text-align: center;">Loading library...</div>`;
      const res = await fetch('/api/quizzes');
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch saved quizzes.');
      }

      if (!data.quizzes || data.quizzes.length === 0) {
        listContainer.innerHTML = `<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 0.8rem; text-align: center; border: 1px dashed var(--surface-glass-border); border-radius: var(--radius-sm);">No saved quizzes found in database yet. Upload an XML file below and click "Save to DB".</div>`;
        return;
      }

      listContainer.innerHTML = '';
      data.quizzes.forEach(q => {
        const card = document.createElement('div');
        card.className = 'saved-quiz-card';
        card.innerHTML = `
          <div>
            <div style="font-weight: 800; font-size: 1rem; color: #0f172a;">${escapeHtml(q.title)}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
              ❓ ${q.question_count} Questions ${q.author ? `• By ${escapeHtml(q.author)}` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.8rem;">
            <button class="btn btn-sm btn-primary btn-select-quiz" data-id="${q.id}" style="flex: 1;">Select 🎯</button>
            ${currentUser ? `<button class="btn btn-sm btn-secondary btn-delete-quiz" data-id="${q.id}" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.4);">🗑️</button>` : ''}
          </div>
        `;
        listContainer.appendChild(card);
      });

      // Attach Select Event Listeners
      listContainer.querySelectorAll('.btn-select-quiz').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          await loadQuizFromDb(id);
        });
      });

      // Attach Delete Event Listeners
      listContainer.querySelectorAll('.btn-delete-quiz').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this quiz from the database?')) {
            await deleteQuizFromDb(id);
          }
        });
      });
    } catch (err) {
      listContainer.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem; padding: 0.8rem; text-align: center;">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadQuizFromDb(id) {
    hideError('xmlErrorMsg');
    try {
      const res = await fetch(`/api/quizzes/${id}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load quiz from database.');
      }

      parsedQuizData = data.parsedQuiz;
      currentXmlText = data.quizMeta.xml_content;

      document.getElementById('previewTitle').textContent = parsedQuizData.title;
      document.getElementById('previewMeta').textContent = `✓ ${parsedQuizData.questions.length} Questions Loaded from Database`;
      document.getElementById('quizPreviewBox').style.display = 'block';
      document.getElementById('btnCreateRoom').disabled = false;

      const saveBtn = document.getElementById('btnSaveXmlToDb');
      if (saveBtn) saveBtn.style.display = 'none'; // Already saved in DB
    } catch (err) {
      showError('xmlErrorMsg', err.message);
    }
  }

  async function saveXmlToDb(xmlText) {
    if (!authToken) {
      alert('Teacher login required to save quizzes to database.');
      document.getElementById('loginModal').style.display = 'flex';
      return;
    }

    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Authorization': `Bearer ${authToken}`
        },
        body: xmlText
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save quiz to database.');
      }

      alert('🎉 Quiz saved to SQLite Database library successfully!');
      fetchSavedQuizzes();
    } catch (err) {
      alert('Save Failed: ' + err.message);
    }
  }

  async function deleteQuizFromDb(id) {
    if (!authToken) return;
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete quiz.');
      }
      fetchSavedQuizzes();
    } catch (err) {
      alert('Delete Failed: ' + err.message);
    }
  }

  function renderHostLobby(payload) {
    const hostJoinUrl = `${window.location.protocol}//${window.location.host}`;
    document.getElementById('hostJoinUrlText').textContent = hostJoinUrl;
    
    // Format PIN with space for readability (e.g. 123 456)
    const formattedPin = payload.pin.replace(/(\d{3})(\d{3})/, '$1 $2');
    document.getElementById('hostPinDisplay').textContent = formattedPin;

    // Render QR Code
    const qrContainer = document.getElementById('qrcodeCanvas');
    qrContainer.innerHTML = '';
    const joinLink = `${hostJoinUrl}/?pin=${payload.pin}`;

    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: joinLink,
        width: 90,
        height: 90,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // Fallback Google Chart QR API
      const qrImg = document.createElement('img');
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(joinLink)}`;
      qrContainer.appendChild(qrImg);
    }
  }

  function updateHostPlayerGrid(players) {
    const grid = document.getElementById('hostPlayerGrid');
    grid.innerHTML = '';
    const count = players ? players.length : 0;
    document.getElementById('hostPlayerCountBadge').textContent = `👥 ${count} ${count === 1 ? 'Player' : 'Players'}`;

    if (players) {
      players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        chip.innerHTML = `<span class="avatar">${p.avatar}</span> <span>${escapeHtml(p.nickname)}</span>`;
        grid.appendChild(chip);
      });
    }
  }

  function setupHostGameEvents() {
    document.getElementById('btnStartGame').addEventListener('click', () => {
      sendWS('START_GAME', {});
    });

    document.getElementById('btnEndTimerEarly').addEventListener('click', () => {
      sendWS('REVEAL_RESULTS', {});
    });

    const btnShowLd = document.getElementById('btnShowLeaderboard');
    if (btnShowLd) {
      btnShowLd.addEventListener('click', () => {
        sendWS('SHOW_LEADERBOARD', {});
      });
    }

    const btnNext = document.getElementById('btnNextQuestion');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        sendWS('NEXT_QUESTION', {});
      });
    }

    document.getElementById('btnPlayAgain').addEventListener('click', () => {
      location.reload();
    });
  }

  function renderHostQuestion(payload) {
    document.getElementById('hostQCounter').textContent = `Question ${payload.questionIndex + 1} / ${payload.totalQuestions}`;
    document.getElementById('hostQText').textContent = payload.text;
    document.getElementById('hostTimerDisplay').textContent = payload.timeLimit;
    document.getElementById('hostTimerDisplay').classList.remove('warning');
    document.getElementById('hostAnswerCountBadge').textContent = `Answers: 0/${payload.totalPlayers}`;

    // Render Question Image if present
    const hostImgBox = document.getElementById('hostQImgBox');
    const hostImg = document.getElementById('hostQImage');
    if (payload.image && hostImgBox && hostImg) {
      hostImg.src = payload.image;
      hostImgBox.style.display = 'flex';
    } else if (hostImgBox) {
      hostImgBox.style.display = 'none';
      if (hostImg) hostImg.src = '';
    }

    const grid = document.getElementById('hostOptionsGrid');
    grid.innerHTML = '';

    const shapeIcons = ['▲', '◆', '●', '■'];
    const isTF = payload.options && payload.options.length === 2 &&
      String(payload.options[0].text).trim().toLowerCase() === 'true';

    payload.options.forEach((opt, idx) => {
      const btn = document.createElement('div');
      let colorClass = `opt-${idx}`;
      if (isTF) {
        // True (idx 0) is Blue (opt-1), False (idx 1) is Red (opt-0)
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }
      btn.className = `option-btn ${colorClass}`;
      btn.innerHTML = `
        <div class="option-shape">${shapeIcons[idx] || '•'}</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
      `;
      grid.appendChild(btn);
    });
  }

  function renderHostResultsChart(payload) {
    // Populate Question Details Header
    const fullQText = document.getElementById('hostResultsFullQText');
    const qCounter = document.getElementById('hostResultsQCounter');
    const imgBox = document.getElementById('hostResultsQImgBox');
    const qImg = document.getElementById('hostResultsQImage');

    if (fullQText) fullQText.textContent = payload.text || 'Question Results';
    if (qCounter) qCounter.textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;

    if (payload.image && imgBox && qImg) {
      qImg.src = payload.image;
      imgBox.style.display = 'flex';
    } else if (imgBox) {
      imgBox.style.display = 'none';
      if (qImg) qImg.src = '';
    }

    document.getElementById('hostResultsQText').textContent = `Answer Distribution`;
    const chartGrid = document.getElementById('chartBarsGrid');
    chartGrid.innerHTML = '';
    chartGrid.style.gridTemplateColumns = `repeat(${payload.optionCounts.length}, 1fr)`;

    const maxVotes = Math.max(1, ...payload.optionCounts);
    const shapeIcons = ['▲', '◆', '●', '■'];
    const isTF = payload.options && payload.options.length === 2 &&
      String(payload.options[0].text).trim().toLowerCase() === 'true';

    payload.optionCounts.forEach((count, idx) => {
      const isCorrect = idx === payload.correctOptionIndex;
      const heightPercent = Math.max(10, Math.round((count / maxVotes) * 100));
      const currentOpt = payload.options ? payload.options[idx] : null;
      const optText = currentOpt ? currentOpt.text : '';

      let colorClass = `opt-${idx}`;
      if (isTF) {
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }

      const wrapper = document.createElement('div');
      wrapper.className = `bar-wrapper ${colorClass} ${isCorrect ? 'correct' : ''}`;
      wrapper.innerHTML = `
        <div class="bar-count" style="display: flex; align-items: center; justify-content: center; gap: 0.3rem;">
          <span>${count}</span>
          ${isCorrect ? '<span style="display: inline-flex; width: 22px; height: 22px; background: #22c55e; color: #ffffff; border-radius: 50%; font-size: 0.8rem; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);">✓</span>' : ''}
        </div>
        <div class="bar-column" style="height: ${heightPercent}%;"></div>
        <div style="font-weight: 800; font-size: 1.1rem; margin-top: 0.5rem;">${shapeIcons[idx]}</div>
        <div style="font-size: 0.9rem; font-weight: 800; color: ${isCorrect ? '#16a34a' : 'var(--text-secondary)'}; max-width: 140px; text-align: center; word-break: break-word; margin-top: 0.2rem;">
          ${escapeHtml(optText)} ${isCorrect ? '✓' : ''}
        </div>
      `;
      chartGrid.appendChild(wrapper);
    });

    // Render integrated leaderboard rows
    const list = document.getElementById('resultsLeaderboardRows');
    if (list && payload.topPlayers) {
      list.innerHTML = '';
      payload.topPlayers.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.innerHTML = `
          <div class="rank">#${idx + 1}</div>
          <div class="player-info">
            <span>${p.avatar}</span>
            <span>${escapeHtml(p.nickname)}</span>
            ${p.streak >= 2 ? `<span style="font-size: 0.9rem; color: #fde047;">🔥 ${p.streak}</span>` : ''}
          </div>
          <div class="score">${p.score} pts</div>
        `;
        list.appendChild(row);
      });
    }

    // Update next button label if last question
    const nextBtn = document.getElementById('btnNextQuestion');
    if (nextBtn) {
      if (payload.isLastQuestion) {
        nextBtn.textContent = 'View Final Winners 🎉';
        nextBtn.className = 'btn btn-primary btn-lg';
      } else {
        nextBtn.textContent = 'Next Question ⏩';
        nextBtn.className = 'btn btn-success btn-lg';
      }
    }
  }

  function renderHostLeaderboard(payload) {
    const list = document.getElementById('leaderboardRows');
    list.innerHTML = '';

    payload.topPlayers.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      row.innerHTML = `
        <div class="rank">#${idx + 1}</div>
        <div class="player-info">
          <span>${p.avatar}</span>
          <span>${escapeHtml(p.nickname)}</span>
          ${p.streak >= 2 ? `<span style="font-size: 0.9rem; color: #fde047;">🔥 ${p.streak}</span>` : ''}
        </div>
        <div class="score">${p.score} pts</div>
      `;
      list.appendChild(row);
    });

    const nextBtn = document.getElementById('btnNextQuestion');
    if (payload.isLastQuestion) {
      nextBtn.textContent = 'Crown Winner 👑';
    } else {
      nextBtn.textContent = 'Next Question ⏩';
    }
  }

  function renderPodium(payload) {
    const { first, second, third, allPlayers, totalQuestions } = payload;

    const setPodiumSlot = (elementId, data) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      if (data) {
        el.querySelector('div:nth-child(2)').textContent = `${data.avatar} ${data.nickname}`;
        el.querySelector('div:nth-child(3)').textContent = `${data.score} pts`;
      } else {
        el.querySelector('div:nth-child(2)').textContent = '---';
        el.querySelector('div:nth-child(3)').textContent = '0 pts';
      }
    };

    setPodiumSlot('podium1st', first);
    setPodiumSlot('podium2nd', second);
    setPodiumSlot('podium3rd', third);

    // Render Full Players Standings List
    const standingsList = document.getElementById('fullPodiumStandingsList');
    if (standingsList && Array.isArray(allPlayers)) {
      standingsList.innerHTML = '';
      allPlayers.forEach(p => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';

        const correctCount = p.correctAnswersCount !== undefined ? p.correctAnswersCount : 0;
        const totalQ = totalQuestions || p.totalQuestions || '?';

        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.8rem;">
            <div class="rank" style="min-width: 32px;">#${p.rank}</div>
            <div style="font-size: 1.4rem;">${p.avatar}</div>
            <div style="font-weight: 800; font-size: 1.1rem; color: #0f172a;">${escapeHtml(p.nickname)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 1.2rem;">
            <div style="font-weight: 800; font-size: 0.95rem; color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.35rem 0.8rem; border-radius: var(--radius-full);">
              🎯 ${correctCount}/${totalQ} Correct
            </div>
            <div class="score" style="font-weight: 900; font-size: 1.2rem; color: #0284c7; min-width: 80px; text-align: right;">${p.score} pts</div>
          </div>
        `;
        standingsList.appendChild(row);
      });
    }
  }

  // ==================== PLAYER LOGIC ====================
  function setupPlayerJoinEvents() {
    // Avatar Selector
    const avatarOpts = document.querySelectorAll('.avatar-opt');
    avatarOpts.forEach(opt => {
      opt.addEventListener('click', () => {
        avatarOpts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedAvatar = opt.getAttribute('data-avatar');
      });
    });

    // Step 1: PIN Next Button
    const btnNextPin = document.getElementById('btnNextPin');
    const inputPin = document.getElementById('inputPin');

    const goToStepNick = () => {
      hideError('joinErrorMsg');
      const pin = inputPin.value.trim();
      if (!pin || pin.length < 4) {
        return showError('joinErrorMsg', 'Please enter a valid Game PIN.');
      }
      document.getElementById('joinStepPin').style.display = 'none';
      document.getElementById('joinStepNick').style.display = 'block';
      setTimeout(() => document.getElementById('inputNickname').focus(), 100);
    };

    btnNextPin.addEventListener('click', goToStepNick);
    inputPin.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') goToStepNick();
    });

    // Step 2: Nickname Submit
    const btnSubmitJoin = document.getElementById('btnSubmitJoin');
    const inputNickname = document.getElementById('inputNickname');

    const submitPlayerJoin = () => {
      hideError('joinErrorMsg');
      const pin = inputPin.value.trim();
      const nickname = inputNickname.value.trim();

      if (!pin || pin.length < 4) {
        document.getElementById('joinStepPin').style.display = 'block';
        document.getElementById('joinStepNick').style.display = 'none';
        return showError('joinErrorMsg', 'Please enter a valid Game PIN.');
      }
      if (!nickname) {
        return showError('joinErrorMsg', 'Please enter a nickname.');
      }

      sendWS('JOIN_ROOM', { pin, nickname, avatar: selectedAvatar });
    };

    btnSubmitJoin.addEventListener('click', submitPlayerJoin);
    inputNickname.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitPlayerJoin();
    });
  }

  function renderPlayerQuestion(payload) {
    if (!payload || !Array.isArray(payload.options)) return;

    document.getElementById('playerQNumber').textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;
    
    // Render Question Image if present
    const playerImgBox = document.getElementById('playerQImgBox');
    const playerImg = document.getElementById('playerQImage');
    if (payload.image && typeof payload.image === 'string' && playerImgBox && playerImg) {
      playerImg.src = payload.image;
      playerImgBox.style.display = 'flex';
    } else if (playerImgBox) {
      playerImgBox.style.display = 'none';
      if (playerImg) playerImg.src = '';
    }
    
    const pad = document.getElementById('playerPad');
    pad.innerHTML = '';

    const shapeIcons = ['▲', '◆', '●', '■'];
    currentQuestionOptionsCount = payload.options.length;

    const isTF = payload.options && payload.options.length === 2 &&
      (String(payload.options[0].text).trim().toLowerCase() === 'true' ||
       String(payload.options[0].text).trim().toLowerCase() === 'false');

    payload.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      let colorClass = `opt-${idx}`;
      if (isTF) {
        // True (idx 0) is Blue (opt-1), False (idx 1) is Red (opt-0)
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }
      btn.className = `player-btn ${colorClass}`;
      btn.setAttribute('data-index', idx);
      
      const optText = (opt && opt.text != null) ? String(opt.text).trim() : '';

      // If 2 options (True/False) or text is True/False, show text label alongside shape icon
      if (optText && (optText.toLowerCase() === 'true' || optText.toLowerCase() === 'false' || payload.options.length <= 2)) {
        btn.innerHTML = `<span style="font-size: 2.2rem;">${shapeIcons[idx] || '•'}</span><span style="font-size: 1.4rem; font-weight: 800; margin-left: 0.6rem;">${escapeHtml(optText)}</span>`;
      } else {
        btn.textContent = shapeIcons[idx] || '•';
      }

      btn.addEventListener('click', () => {
        sendWS('SUBMIT_ANSWER', { choiceIndex: idx });
      });

      pad.appendChild(btn);
    });
  }

  function renderPlayerResult(payload) {
    const card = document.getElementById('outcomeCard');
    const icon = document.getElementById('outcomeIcon');
    const title = document.getElementById('outcomeTitle');
    const points = document.getElementById('outcomePoints');
    const streak = document.getElementById('outcomeStreak');

    if (payload.isCorrect) {
      card.className = 'outcome-card correct';
      icon.textContent = '🎉';
      title.textContent = 'Correct!';
      points.textContent = `+${payload.pointsAwarded} pts`;
      if (payload.streak >= 2) {
        streak.style.display = 'block';
        streak.textContent = `🔥 Streak: ${payload.streak} in a row!`;
      } else {
        streak.style.display = 'none';
      }
    } else {
      card.className = 'outcome-card wrong';
      icon.textContent = '❌';
      title.textContent = payload.answered ? 'Incorrect' : 'Time Up!';
      points.textContent = `Total: ${payload.totalScore} pts`;
      streak.style.display = 'none';
    }

    // Render Question & Correct Answer Breakdown for Player
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

  // Helpers
  function showError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  function hideError(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.style.display = 'none';
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // DUAL-MODE QUIZ INSPECTOR & VISUAL PREVIEWER
  function setupXmlReviewEvents() {
    const btnReviewXml = document.getElementById('btnReviewXml');
    const xmlReviewModal = document.getElementById('xmlReviewModal');
    const btnCloseXmlReviewModal = document.getElementById('btnCloseXmlReviewModal');
    const btnCloseXmlReviewBtn = document.getElementById('btnCloseXmlReviewBtn');
    const xmlReviewCodeBox = document.getElementById('xmlReviewCodeBox');
    const btnCopyXmlText = document.getElementById('btnCopyXmlText');
    const tabBtnVisual = document.getElementById('tabBtnVisual');
    const tabBtnXml = document.getElementById('tabBtnXml');
    const tabVisualContent = document.getElementById('tabVisualContent');
    const tabXmlContent = document.getElementById('tabXmlContent');

    function switchTab(mode) {
      if (mode === 'visual') {
        tabBtnVisual.classList.add('active');
        tabBtnXml.classList.remove('active');
        tabVisualContent.style.display = 'block';
        tabXmlContent.style.display = 'none';
        btnCopyXmlText.style.display = 'none';
      } else {
        tabBtnXml.classList.add('active');
        tabBtnVisual.classList.remove('active');
        tabXmlContent.style.display = 'block';
        tabVisualContent.style.display = 'none';
        btnCopyXmlText.style.display = 'inline-flex';
      }
    }

    if (tabBtnVisual) tabBtnVisual.addEventListener('click', () => switchTab('visual'));
    if (tabBtnXml) tabBtnXml.addEventListener('click', () => switchTab('xml'));

    if (btnReviewXml) {
      btnReviewXml.addEventListener('click', () => {
        if (currentXmlText) {
          xmlReviewCodeBox.textContent = currentXmlText;
        } else {
          xmlReviewCodeBox.textContent = 'No XML content loaded yet.';
        }
        renderVisualQuestionsPreview();
        switchTab('visual');
        xmlReviewModal.style.display = 'flex';
      });
    }

    function renderVisualQuestionsPreview() {
      const visualList = document.getElementById('visualQuestionsList');
      if (!visualList) return;

      if (!parsedQuizData || !parsedQuizData.questions || parsedQuizData.questions.length === 0) {
        visualList.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 1.5rem;">No questions parsed in quiz data yet. Upload or select a quiz.</div>`;
        return;
      }

      const shapeIcons = ['▲', '◆', '●', '■'];
      visualList.innerHTML = '';

      parsedQuizData.questions.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'preview-question-card';

        let imgHtml = '';
        if (q.image) {
          imgHtml = `<div class="question-img-box" style="max-height: 140px; margin: 0.4rem 0;"><img src="${q.image}" class="question-img" style="max-height: 140px;" alt="Question image"></div>`;
        }

        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
          optionsHtml = '<div class="preview-options-grid">';
          q.options.forEach((opt, optIdx) => {
            const isCorrect = opt.isCorrect === true;
            optionsHtml += `
              <div class="preview-opt-item ${isCorrect ? 'correct' : ''}">
                <span>${shapeIcons[optIdx] || '•'}</span>
                <span>${escapeHtml(opt.text)}</span>
                ${isCorrect ? '<span style="margin-left: auto; font-weight: 800;">✓ Correct</span>' : ''}
              </div>
            `;
          });
          optionsHtml += '</div>';
        }

        card.innerHTML = `
          <div class="preview-q-header">
            <div class="preview-q-title">Question ${idx + 1}: ${escapeHtml(q.text)}</div>
            <div class="preview-q-badge">⏱️ ${q.timeLimit || 20}s</div>
          </div>
          ${imgHtml}
          ${optionsHtml}
        `;
        visualList.appendChild(card);
      });
    }

    const closeModal = () => {
      xmlReviewModal.style.display = 'none';
    };

    if (btnCloseXmlReviewModal) btnCloseXmlReviewModal.addEventListener('click', closeModal);
    if (btnCloseXmlReviewBtn) btnCloseXmlReviewBtn.addEventListener('click', closeModal);
    if (xmlReviewModal) {
      xmlReviewModal.addEventListener('click', (e) => {
        if (e.target === xmlReviewModal) closeModal();
      });
    }

    if (btnCopyXmlText) {
      btnCopyXmlText.addEventListener('click', () => {
        if (currentXmlText) {
          navigator.clipboard.writeText(currentXmlText).then(() => {
            btnCopyXmlText.textContent = '✓ Copied!';
            setTimeout(() => btnCopyXmlText.textContent = '📋 Copy XML', 2000);
          }).catch(() => {
            alert('Failed to copy XML text');
          });
        }
      });
    }
  }

  // Global Spacebar Hotkey for Host Main Actions
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

      if (currentRole === 'HOST') {
        if (views.hostLobby && views.hostLobby.classList.contains('active')) {
          e.preventDefault();
          const btn = document.getElementById('btnStartGame');
          if (btn) btn.click();
        } else if (views.hostQuestion && views.hostQuestion.classList.contains('active')) {
          e.preventDefault();
          const btn = document.getElementById('btnEndTimerEarly');
          if (btn) btn.click();
        } else if (views.hostResults && views.hostResults.classList.contains('active')) {
          e.preventDefault();
          const btn = document.getElementById('btnNextQuestion');
          if (btn) btn.click();
        } else if (views.hostLeaderboard && views.hostLeaderboard.classList.contains('active')) {
          e.preventDefault();
          const btn = document.getElementById('btnNextQuestion');
          if (btn) btn.click();
        } else if (views.hostPodium && views.hostPodium.classList.contains('active')) {
          e.preventDefault();
          const btn = document.getElementById('btnPlayAgain');
          if (btn) btn.click();
        }
      }
    }
  });

  // Run app on DOM loaded
  document.addEventListener('DOMContentLoaded', init);
})();
