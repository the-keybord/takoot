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
        renderHostLobby(payload);
        showView(views.hostLobby);
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
        break;

      case 'QUESTION_START_PLAYER':
        renderPlayerQuestion(payload);
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
        break;

      case 'QUESTION_RESULTS_HOST':
        isLastQuestion = payload.isLastQuestion;
        renderHostResultsChart(payload);
        showView(views.hostResults);
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
        } else {
          showView(views.hostPodium);
        }
        break;

      case 'ROOM_CLOSED':
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
      if (parsedQuizData) {
        sendWS('CREATE_ROOM', { quiz: parsedQuizData, token: authToken });
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
    payload.options.forEach((opt, idx) => {
      const btn = document.createElement('div');
      btn.className = `option-btn opt-${idx}`;
      btn.innerHTML = `
        <div class="option-shape">${shapeIcons[idx] || '•'}</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
      `;
      grid.appendChild(btn);
    });
  }

  function renderHostResultsChart(payload) {
    document.getElementById('hostResultsQText').textContent = `Question ${payload.questionIndex + 1} - Results`;
    const chartGrid = document.getElementById('chartBarsGrid');
    chartGrid.innerHTML = '';
    chartGrid.style.gridTemplateColumns = `repeat(${payload.optionCounts.length}, 1fr)`;

    const maxVotes = Math.max(1, ...payload.optionCounts);
    const shapeIcons = ['▲', '◆', '●', '■'];

    payload.optionCounts.forEach((count, idx) => {
      const isCorrect = idx === payload.correctOptionIndex;
      const heightPercent = Math.max(10, Math.round((count / maxVotes) * 100));

      const wrapper = document.createElement('div');
      wrapper.className = `bar-wrapper opt-${idx} ${isCorrect ? 'correct' : ''}`;
      wrapper.innerHTML = `
        <div class="bar-count">${count}</div>
        <div class="bar-column" style="height: ${heightPercent}%;"></div>
        <div style="font-weight: 800; font-size: 1.2rem; margin-top: 0.5rem;">${shapeIcons[idx]}</div>
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
    const { first, second, third } = payload;

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
    document.getElementById('playerQNumber').textContent = `Question ${payload.questionIndex + 1} / ${payload.totalQuestions}`;
    
    // Render Question Image if present
    const playerImgBox = document.getElementById('playerQImgBox');
    const playerImg = document.getElementById('playerQImage');
    if (payload.image && playerImgBox && playerImg) {
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

    payload.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = `player-btn opt-${idx}`;
      btn.setAttribute('data-index', idx);
      
      // If 2 options (True/False), show text label alongside shape icon
      if (opt.text && (opt.text.toLowerCase() === 'true' || opt.text.toLowerCase() === 'false' || payload.options.length <= 2)) {
        btn.innerHTML = `<span style="font-size: 2.2rem;">${shapeIcons[idx] || '•'}</span><span style="font-size: 1.4rem; font-weight: 800; margin-left: 0.6rem;">${escapeHtml(opt.text)}</span>`;
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

  // Run app on DOM loaded
  document.addEventListener('DOMContentLoaded', init);
})();
