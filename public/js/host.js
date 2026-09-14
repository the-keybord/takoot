/**
 * Takoot - Host Studio Engine (public/js/host.js)
 * Manages XML/ZIP loading, room lifecycle, Web Audio, and real-time host game events.
 */

(function () {
  'use strict';

  let socket = null;
  let roomPin = null;
  let parsedQuizData = null;
  let currentXmlText = null;
  let extractedImages = {}; // filename -> dataURL
  let isLastQuestion = false;

  // DOM Views
  const views = {
    studio: document.getElementById('studioView'),
    hostLobby: document.getElementById('hostLobbyView'),
    hostQuestion: document.getElementById('hostQuestionView'),
    hostResults: document.getElementById('hostResultsView'),
    hostLeaderboard: document.getElementById('hostLeaderboardView'),
    hostPodium: document.getElementById('hostPodiumView')
  };

  const navResetBtn = document.getElementById('navResetBtn');
  const logoHomeBtn = document.getElementById('logoHomeBtn');
  const btnToggleSound = document.getElementById('btnToggleSound');

  // ==================== AUDIO ENGINE & SOUND EFFECTS ====================
  let audioCtx = null;
  let isMuted = false;
  let masterVolume = 0.4;
  let activeBgmOscillators = [];
  let bgmInterval = null;

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
    if (isMuted) stopAllMusic();
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
  }

  function playGongSound() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
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
  }

  function startLobbyMusic() {
    stopAllMusic();
    if (isMuted) return;
    initAudio();
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
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08 * masterVolume, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
      step++;
    }, 450);
  }

  function startQuestionMelody() {
    stopAllMusic();
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const scales = [
      [261.63, 329.63, 392.00, 493.88],
      [293.66, 369.99, 440.00, 554.37],
      [349.23, 440.00, 523.25, 659.25]
    ];
    const chosenScale = scales[Math.floor(Math.random() * scales.length)];
    let step = 0;
    bgmInterval = setInterval(() => {
      if (isMuted || !audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(chosenScale[step % chosenScale.length], now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09 * masterVolume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
      step++;
    }, 380);
  }

  function playTickSound() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    gain.gain.setValueAtTime(0.05 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  function playFanfareSound() {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const now = audioCtx.currentTime + idx * 0.14;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18 * masterVolume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.65);
    });
  }

  // ==================== VIEW MANAGEMENT ====================
  function showView(target) {
    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });
    if (target) target.classList.add('active');
    if (navResetBtn) {
      navResetBtn.style.display = (target === views.studio) ? 'none' : 'inline-flex';
    }
  }

  // ==================== WEBSOCKET DISPATCHER ====================
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
      console.warn('WebSocket closed.');
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
      case 'ROOM_CREATED':
        roomPin = payload.pin;
        renderHostLobby(payload);
        showView(views.hostLobby);
        startLobbyMusic();
        break;

      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_LIST_UPDATE':
        renderHostPlayerList(payload);
        break;

      case 'QUESTION_START':
        playGongSound();
        renderHostQuestion(payload);
        showView(views.hostQuestion);
        startQuestionMelody();
        break;

      case 'TIMER_TICK':
        updateHostTimer(payload.timeLeft);
        break;

      case 'ANSWER_SUBMITTED_HOST':
        updateAnswerCount(payload.answersReceived, payload.totalPlayers);
        break;

      case 'QUESTION_RESULTS':
        stopAllMusic();
        renderHostResults(payload);
        showView(views.hostResults);
        break;

      case 'LEADERBOARD_UPDATE_HOST':
        isLastQuestion = payload.isLastQuestion;
        renderHostLeaderboard(payload.topPlayers);
        showView(views.hostLeaderboard);
        break;

      case 'GAME_OVER':
        stopAllMusic();
        playFanfareSound();
        renderHostPodium(payload);
        showView(views.hostPodium);
        break;

      case 'ROOM_CLOSED':
        stopAllMusic();
        alert(data.reason || 'Game room closed.');
        window.location.reload();
        break;

      case 'ERROR':
        alert(message || 'An error occurred.');
        break;
    }
  }

  // ==================== HOST LOBBY ====================
  function renderHostLobby(payload) {
    // Join URL is the main root page
    const hostJoinUrl = `${window.location.protocol}//${window.location.host}/?pin=${payload.pin}`;
    const urlDisplay = document.getElementById('hostJoinUrlText');
    if (urlDisplay) urlDisplay.textContent = `${window.location.protocol}//${window.location.host}`;

    const pinDisplay = document.getElementById('hostPinDisplay');
    if (pinDisplay) {
      pinDisplay.textContent = payload.pin.replace(/(\d{3})(\d{3})/, '$1 $2');
    }

    // Generate QR Code
    const qrcodeCanvas = document.getElementById('qrcodeCanvas');
    if (qrcodeCanvas && window.QRCode) {
      qrcodeCanvas.innerHTML = '';
      new QRCode(qrcodeCanvas, {
        text: hostJoinUrl,
        width: 140,
        height: 140,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    renderHostPlayerList({ players: [] });
  }

  function renderHostPlayerList(payload) {
    const list = payload.players || [];
    const grid = document.getElementById('hostPlayerGrid');
    const badge = document.getElementById('hostPlayerCountBadge');
    if (!grid) return;

    if (badge) badge.textContent = `👥 ${list.length} Player${list.length === 1 ? '' : 's'}`;

    grid.innerHTML = '';
    list.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.innerHTML = `<span class="player-chip-avatar">${p.avatar || '🐱'}</span><span class="player-chip-name">${escapeHtml(p.nickname)}</span>`;
      grid.appendChild(chip);
    });

    const startBtn = document.getElementById('btnStartGame');
    if (startBtn) {
      startBtn.disabled = list.length === 0;
    }
  }

  // ==================== HOST QUESTION ====================
  function renderHostQuestion(payload) {
    const qCounter = document.getElementById('hostQCounter');
    const qText = document.getElementById('hostQText');
    const timerDisplay = document.getElementById('hostTimerDisplay');
    const answerBadge = document.getElementById('hostAnswerCountBadge');
    const imgBox = document.getElementById('hostQImgBox');
    const img = document.getElementById('hostQImage');
    const optionsGrid = document.getElementById('hostOptionsGrid');

    if (qCounter) qCounter.textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;
    if (qText) qText.textContent = payload.questionText;
    if (timerDisplay) {
      timerDisplay.textContent = payload.timeLimit;
      timerDisplay.classList.remove('warning');
    }
    if (answerBadge) answerBadge.textContent = `Answers: 0/${payload.totalPlayers || 0}`;

    // Question Image Handling
    if (payload.image && imgBox && img) {
      img.src = payload.image;
      imgBox.style.display = 'flex';
    } else if (imgBox) {
      imgBox.style.display = 'none';
      if (img) img.src = '';
    }

    if (!optionsGrid) return;
    optionsGrid.innerHTML = '';

    const shapes = ['▲', '◆', '●', '■'];
    const isTF = payload.options && payload.options.length === 2 &&
      (String(payload.options[0].text).trim().toLowerCase() === 'true' ||
       String(payload.options[0].text).trim().toLowerCase() === 'false');

    payload.options.forEach((opt, idx) => {
      const card = document.createElement('div');
      let colorClass = `opt-${idx}`;
      if (isTF) {
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }
      card.className = `option-card ${colorClass}`;
      card.innerHTML = `
        <div class="option-icon">${shapes[idx] || '•'}</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
      `;
      optionsGrid.appendChild(card);
    });
  }

  function updateHostTimer(timeLeft) {
    const timerDisplay = document.getElementById('hostTimerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = timeLeft;
      if (timeLeft <= 5) {
        timerDisplay.classList.add('warning');
        playTickSound();
      }
    }
  }

  function updateAnswerCount(answered, total) {
    const badge = document.getElementById('hostAnswerCountBadge');
    if (badge) badge.textContent = `Answers: ${answered}/${total}`;
  }

  // ==================== HOST RESULTS ====================
  function renderHostResults(payload) {
    const fullText = document.getElementById('hostResultsFullQText');
    const resultsQCounter = document.getElementById('hostResultsQCounter');
    const resultsImgBox = document.getElementById('hostResultsQImgBox');
    const resultsImg = document.getElementById('hostResultsQImage');
    const chartGrid = document.getElementById('chartBarsGrid');

    if (fullText) fullText.textContent = payload.questionText || '';
    if (resultsQCounter) resultsQCounter.textContent = `Question ${(payload.questionIndex || 0) + 1} / ${payload.totalQuestions || 1}`;

    if (payload.image && resultsImgBox && resultsImg) {
      resultsImg.src = payload.image;
      resultsImgBox.style.display = 'flex';
    } else if (resultsImgBox) {
      resultsImgBox.style.display = 'none';
      if (resultsImg) resultsImg.src = '';
    }

    if (!chartGrid) return;
    chartGrid.innerHTML = '';

    const shapes = ['▲', '◆', '●', '■'];
    const totalVotes = payload.totalVotes || 1;
    const isTF = payload.options && payload.options.length === 2 &&
      (String(payload.options[0].text).trim().toLowerCase() === 'true' ||
       String(payload.options[0].text).trim().toLowerCase() === 'false');

    payload.options.forEach((opt, idx) => {
      const votes = opt.votes || 0;
      const pct = Math.max(5, Math.round((votes / totalVotes) * 100));
      let colorClass = `opt-${idx}`;
      if (isTF) {
        colorClass = idx === 0 ? 'opt-1' : 'opt-0';
      }

      const col = document.createElement('div');
      col.className = 'chart-col';
      col.innerHTML = `
        <div class="chart-vote-count">${votes}</div>
        <div class="chart-bar ${colorClass} ${opt.isCorrect ? 'correct' : ''}" style="height: ${pct}%;">
          ${opt.isCorrect ? '<span class="correct-badge">✓</span>' : ''}
        </div>
        <div class="chart-shape ${colorClass}">${shapes[idx] || '•'}</div>
      `;
      chartGrid.appendChild(col);
    });

    // Integrated Leaderboard
    const lbRows = document.getElementById('resultsLeaderboardRows');
    if (lbRows && payload.topPlayers) {
      lbRows.innerHTML = '';
      payload.topPlayers.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.8rem;">
            <span class="leaderboard-rank">#${idx + 1}</span>
            <span style="font-size: 1.4rem;">${p.avatar || '🐱'}</span>
            <span class="leaderboard-name">${escapeHtml(p.nickname)}</span>
          </div>
          <div class="leaderboard-score">${p.score} pts</div>
        `;
        lbRows.appendChild(row);
      });
    }

    const nextBtn = document.getElementById('btnNextQuestion');
    if (nextBtn) {
      nextBtn.textContent = payload.isLastQuestion ? 'View Final Results 🏆' : 'Next Question ⏩';
    }
  }

  // ==================== HOST LEADERBOARD ====================
  function renderHostLeaderboard(topPlayers) {
    const rows = document.getElementById('leaderboardRows');
    if (!rows) return;
    rows.innerHTML = '';

    (topPlayers || []).forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <span class="leaderboard-rank">#${idx + 1}</span>
          <span style="font-size: 1.6rem;">${p.avatar || '🐱'}</span>
          <span class="leaderboard-name">${escapeHtml(p.nickname)}</span>
        </div>
        <div class="leaderboard-score">${p.score} pts</div>
      `;
      rows.appendChild(row);
    });
  }

  // ==================== HOST PODIUM ====================
  function renderHostPodium(payload) {
    const p1 = payload.first;
    const p2 = payload.second;
    const p3 = payload.third;

    const fillPodium = (elId, player, medal) => {
      const el = document.getElementById(elId);
      if (!el) return;
      if (player) {
        el.innerHTML = `
          <div style="font-size: 2.5rem;">${player.avatar || medal}</div>
          <div style="font-weight: 900; font-size: 1.3rem;">${escapeHtml(player.nickname)}</div>
          <div style="color: #38bdf8; font-weight: 800;">${player.score} pts</div>
        `;
      } else {
        el.innerHTML = `
          <div style="font-size: 2rem;">${medal}</div>
          <div style="color: #94a3b8;">-</div>
        `;
      }
    };

    fillPodium('podium1st', p1, '👑');
    fillPodium('podium2nd', p2, '🥈');
    fillPodium('podium3rd', p3, '🥉');

    // Standings table
    const standingsList = document.getElementById('fullPodiumStandingsList');
    if (standingsList && payload.allPlayers) {
      standingsList.innerHTML = '';
      payload.allPlayers.forEach(p => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.8rem;">
            <span class="leaderboard-rank">#${p.rank}</span>
            <span style="font-size: 1.4rem;">${p.avatar || '🐱'}</span>
            <span class="leaderboard-name">${escapeHtml(p.nickname)}</span>
          </div>
          <div style="display: flex; gap: 1.5rem; align-items: center;">
            <span style="font-size: 0.85rem; color: #64748b;">${p.correctAnswersCount || 0}/${payload.totalQuestions || 0} Correct</span>
            <span class="leaderboard-score">${p.score} pts</span>
          </div>
        `;
        standingsList.appendChild(row);
      });
    }
  }

  // ==================== ZIP & XML PARSING ENGINE ====================
  async function handleXmlText(xmlString) {
    const errorBanner = document.getElementById('studioErrorMsg');
    const badgeQCount = document.getElementById('badgeQCount');
    const badgeTitle = document.getElementById('badgeQuizTitle');
    const badgeImages = document.getElementById('badgeImagesCount');
    const btnLaunch = document.getElementById('btnLaunchHost');
    const btnPreview = document.getElementById('btnPreviewQuiz');

    if (errorBanner) errorBanner.style.display = 'none';

    try {
      const res = await fetch('/api/parse-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: xmlString
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse XML.');
      }

      parsedQuizData = data.quiz;
      currentXmlText = xmlString;

      // Link any extracted images from ZIP or Builder to questions
      let imageCount = 0;
      if (parsedQuizData && parsedQuizData.questions) {
        parsedQuizData.questions.forEach((q) => {
          if (q.image) {
            const cleanImgRef = q.image.replace(/^images[\\/]/, '').trim();
            if (extractedImages[q.image]) {
              q.image = extractedImages[q.image];
              imageCount++;
            } else if (extractedImages[cleanImgRef]) {
              q.image = extractedImages[cleanImgRef];
              imageCount++;
            } else if (q.image.startsWith('data:image')) {
              imageCount++;
            }
          }
        });
      }

      const qTotal = parsedQuizData.questions.length;
      if (badgeQCount) {
        badgeQCount.textContent = `❓ ${qTotal} Question${qTotal === 1 ? '' : 's'} Ready`;
        badgeQCount.className = 'status-badge active';
      }
      if (badgeTitle) {
        badgeTitle.textContent = parsedQuizData.title || 'Untitled Quiz';
        badgeTitle.style.display = 'inline-flex';
      }
      if (badgeImages) {
        badgeImages.textContent = `🖼️ ${imageCount} Image${imageCount === 1 ? '' : 's'}`;
        badgeImages.style.display = imageCount > 0 ? 'inline-flex' : 'none';
      }

      if (btnLaunch) btnLaunch.disabled = false;
      if (btnPreview) btnPreview.disabled = false;
    } catch (err) {
      parsedQuizData = null;
      if (badgeQCount) {
        badgeQCount.textContent = '❌ Invalid XML';
        badgeQCount.className = 'status-badge error';
      }
      if (badgeTitle) badgeTitle.style.display = 'none';
      if (badgeImages) badgeImages.style.display = 'none';
      if (btnLaunch) btnLaunch.disabled = true;
      if (btnPreview) btnPreview.disabled = true;
      if (errorBanner) {
        errorBanner.textContent = err.message;
        errorBanner.style.display = 'block';
      }
    }
  }

  // Unpack ZIP file containing XML + images
  async function handleZipFile(file) {
    if (!window.JSZip) {
      alert('JSZip library is required to open ZIP files.');
      return;
    }

    try {
      const zip = await JSZip.loadAsync(file);
      extractedImages = {};
      let xmlFileFound = null;

      // Extract images first
      const fileNames = Object.keys(zip.files);
      for (const name of fileNames) {
        const zipEntry = zip.files[name];
        if (zipEntry.dir) continue;

        const lower = name.toLowerCase();
        if (lower.endsWith('.xml') && !xmlFileFound) {
          xmlFileFound = zipEntry;
        } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
                   lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
          const base64Data = await zipEntry.async('base64');
          let mime = 'image/png';
          if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
          if (lower.endsWith('.webp')) mime = 'image/webp';
          if (lower.endsWith('.gif')) mime = 'image/gif';
          if (lower.endsWith('.svg')) mime = 'image/svg+xml';

          const dataUrl = `data:${mime};base64,${base64Data}`;
          extractedImages[name] = dataUrl;
          // Also save by filename without directory prefix
          const baseName = name.split('/').pop().split('\\').pop();
          extractedImages[baseName] = dataUrl;
        }
      }

      if (!xmlFileFound) {
        throw new Error('No .xml quiz file found inside the ZIP package.');
      }

      const xmlText = await xmlFileFound.async('text');
      const textarea = document.getElementById('xmlEditorArea');
      if (textarea) textarea.value = xmlText;
      await handleXmlText(xmlText);
    } catch (err) {
      alert('Error unpacking ZIP: ' + err.message);
    }
  }

  // Handle uploaded folder of XML + images
  async function handleFolderFiles(fileList) {
    extractedImages = {};
    let xmlFile = null;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xml') && !xmlFile) {
        xmlFile = file;
      } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
                 lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
        const dataUrl = await readFileAsDataURL(file);
        extractedImages[file.name] = dataUrl;
        if (file.webkitRelativePath) {
          extractedImages[file.webkitRelativePath] = dataUrl;
        }
      }
    }

    if (!xmlFile) {
      alert('No .xml file found in selected folder.');
      return;
    }

    const xmlText = await readFileAsText(xmlFile);
    const textarea = document.getElementById('xmlEditorArea');
    if (textarea) textarea.value = xmlText;
    await handleXmlText(xmlText);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ==================== EVENT LISTENERS & SETUP ====================
  function setupStudioEvents() {
    const textarea = document.getElementById('xmlEditorArea');
    const dropZone = document.getElementById('editorDropZone');
    const fileInput = document.getElementById('studioFileInput');
    const folderInput = document.getElementById('studioFolderInput');
    const btnTemplate = document.getElementById('btnInsertTemplate');
    const btnClear = document.getElementById('btnClearEditor');
    const btnLaunch = document.getElementById('btnLaunchHost');

    // Debounced textarea live parser
    let debounceTimer = null;
    if (textarea) {
      textarea.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const val = textarea.value.trim();
          if (val.length > 10) {
            handleXmlText(val);
          } else {
            parsedQuizData = null;
            document.getElementById('badgeQCount').textContent = '❓ 0 Questions Detected';
            document.getElementById('badgeQCount').className = 'status-badge';
            document.getElementById('badgeQuizTitle').style.display = 'none';
            document.getElementById('btnLaunchHost').disabled = true;
            document.getElementById('btnPreviewQuiz').disabled = true;
          }
        }, 400);
      });
    }

    // Drag & Drop
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropZone.classList.remove('dragover');
        });
      });
      dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.zip')) {
          handleZipFile(file);
        } else if (file.name.toLowerCase().endsWith('.xml')) {
          readFileAsText(file).then(txt => {
            if (textarea) textarea.value = txt;
            handleXmlText(txt);
          });
        }
      });
    }

    // File Input
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith('.zip')) {
          handleZipFile(file);
        } else {
          readFileAsText(file).then(txt => {
            if (textarea) textarea.value = txt;
            handleXmlText(txt);
          });
        }
      });
    }

    // Folder Input
    if (folderInput) {
      folderInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFolderFiles(e.target.files);
        }
      });
    }

    // Starter XML Template
    if (btnTemplate) {
      btnTemplate.addEventListener('click', () => {
        const template = `<?xml version="1.0" encoding="UTF-8"?>
<quiz title="General Knowledge Blitz">
  <question text="What is the chemical symbol for Gold?" timeLimit="20">
    <option>Ag</option>
    <option correct="true">Au</option>
    <option>Fe</option>
    <option>Cu</option>
  </question>
  <question text="The Pacific Ocean is the largest ocean on Earth." timeLimit="15">
    <option correct="true">True</option>
    <option>False</option>
  </question>
  <question text="How many planets are in our Solar System?" timeLimit="20">
    <option>7</option>
    <option correct="true">8</option>
    <option>9</option>
    <option>10</option>
  </question>
</quiz>`;
        if (textarea) {
          textarea.value = template;
          handleXmlText(template);
        }
      });
    }

    // Clear Button
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (textarea) textarea.value = '';
        extractedImages = {};
        parsedQuizData = null;
        document.getElementById('badgeQCount').textContent = '❓ 0 Questions Detected';
        document.getElementById('badgeQCount').className = 'status-badge';
        document.getElementById('badgeQuizTitle').style.display = 'none';
        document.getElementById('badgeImagesCount').style.display = 'none';
        document.getElementById('btnLaunchHost').disabled = true;
        document.getElementById('btnPreviewQuiz').disabled = true;
      });
    }

    // Launch Host Room Button
    if (btnLaunch) {
      btnLaunch.addEventListener('click', () => {
        if (!parsedQuizData) {
          alert('Please enter or upload a valid quiz XML first.');
          return;
        }

        const chkQ = document.getElementById('chkShuffleQuestions');
        const chkO = document.getElementById('chkShuffleOptions');
        const selectTimeLimit = document.getElementById('selectTimeLimit');

        const shuffleQuestions = chkQ ? chkQ.checked : true;
        const shuffleOptions = chkO ? chkO.checked : true;
        const customTimeLimit = selectTimeLimit ? selectTimeLimit.value : '20';

        connectWebSocket(() => {
          sendWS('CREATE_ROOM', {
            quiz: parsedQuizData,
            shuffleQuestions: shuffleQuestions,
            shuffleOptions: shuffleOptions,
            customTimeLimit: customTimeLimit
          });
        });
      });
    }

    // Start Game Button
    const btnStart = document.getElementById('btnStartGame');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        sendWS('START_GAME', {});
      });
    }

    // Skip Timer Button
    const btnSkip = document.getElementById('btnEndTimerEarly');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        sendWS('SKIP_QUESTION', {});
      });
    }

    // Next Question Buttons
    const btnNext = document.getElementById('btnNextQuestion');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        sendWS('NEXT_QUESTION', {});
      });
    }

    const btnNext2 = document.getElementById('btnNextQuestion2');
    if (btnNext2) {
      btnNext2.addEventListener('click', () => {
        sendWS('NEXT_QUESTION', {});
      });
    }

    // Play Again Button
    const btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
      btnPlayAgain.addEventListener('click', () => {
        window.location.reload();
      });
    }

    // Nav Reset / Leave Game Button
    if (navResetBtn) {
      navResetBtn.addEventListener('click', () => {
        if (confirm('Leave game and return to studio?')) {
          if (socket && socket.readyState === WebSocket.OPEN) socket.close();
          window.location.reload();
        }
      });
    }

    // Logo click returns to host studio
    if (logoHomeBtn) {
      logoHomeBtn.addEventListener('click', () => {
        if (confirm('Return to Host Studio?')) {
          if (socket && socket.readyState === WebSocket.OPEN) socket.close();
          window.location.reload();
        }
      });
    }

    // Sound toggle
    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', toggleSoundMute);
    }
  }

  // ==================== QUIZ INSPECTOR / PREVIEW MODAL ====================
  function setupPreviewModal() {
    const btnPreview = document.getElementById('btnPreviewQuiz');
    const modal = document.getElementById('xmlReviewModal');
    const btnClose1 = document.getElementById('btnCloseXmlReviewModal');
    const btnClose2 = document.getElementById('btnCloseXmlReviewBtn');
    const tabVisual = document.getElementById('tabBtnVisual');
    const tabXml = document.getElementById('tabBtnXml');
    const contentVisual = document.getElementById('tabVisualContent');
    const contentXml = document.getElementById('tabXmlContent');
    const visualList = document.getElementById('visualQuestionsList');
    const xmlBox = document.getElementById('xmlReviewCodeBox');

    const openModal = () => {
      if (!parsedQuizData) return;
      if (modal) modal.style.display = 'flex';
      if (xmlBox) xmlBox.textContent = currentXmlText || '';

      if (visualList && parsedQuizData.questions) {
        visualList.innerHTML = '';
        parsedQuizData.questions.forEach((q, idx) => {
          const card = document.createElement('div');
          card.className = 'visual-q-card';
          let imageHtml = '';
          if (q.image) {
            imageHtml = `<div style="text-align: center; margin: 0.5rem 0;"><img src="${q.image}" style="max-height: 120px; border-radius: 8px;" alt="preview"></div>`;
          }
          let optionsHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.5rem;">';
          (q.options || []).forEach(o => {
            optionsHtml += `<div style="padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.85rem; font-weight: 700; ${o.isCorrect ? 'background: rgba(38,137,12,0.15); border: 1px solid #26890c; color: #26890c;' : 'background: #f1f5f9; color: #475569;'}">${o.isCorrect ? '✓ ' : ''}${escapeHtml(o.text)}</div>`;
          });
          optionsHtml += '</div>';

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.95rem; color: #0284c7;">
              <span>Question ${idx + 1}</span>
              <span>⏱️ ${q.timeLimit || 20}s</span>
            </div>
            <div style="font-weight: 700; margin-top: 0.3rem; color: #0f172a;">${escapeHtml(q.text)}</div>
            ${imageHtml}
            ${optionsHtml}
          `;
          visualList.appendChild(card);
        });
      }
    };

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (btnPreview) btnPreview.addEventListener('click', openModal);
    if (btnClose1) btnClose1.addEventListener('click', closeModal);
    if (btnClose2) btnClose2.addEventListener('click', closeModal);

    if (tabVisual && tabXml && contentVisual && contentXml) {
      tabVisual.addEventListener('click', () => {
        tabVisual.classList.add('active');
        tabXml.classList.remove('active');
        contentVisual.style.display = 'block';
        contentXml.style.display = 'none';
      });
      tabXml.addEventListener('click', () => {
        tabXml.classList.add('active');
        tabVisual.classList.remove('active');
        contentVisual.style.display = 'none';
        contentXml.style.display = 'block';
      });
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // ==================== INITIALIZATION ====================
  document.addEventListener('DOMContentLoaded', () => {
    setupStudioEvents();
    setupPreviewModal();

    // Check if Quiz Builder sent a pending quiz via localStorage
    const pendingQuizJson = localStorage.getItem('takoot_host_pending_quiz');
    if (pendingQuizJson) {
      try {
        const data = JSON.parse(pendingQuizJson);
        localStorage.removeItem('takoot_host_pending_quiz');
        if (data.images) {
          extractedImages = data.images;
        }
        if (data.xml) {
          const textarea = document.getElementById('xmlEditorArea');
          if (textarea) textarea.value = data.xml;
          handleXmlText(data.xml);
        }
      } catch (e) {
        console.error('Error loading pending quiz from builder:', e);
      }
    }
  });

})();
