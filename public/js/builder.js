/**
 * Takoot - Hidden Quiz Builder Client Engine (public/js/builder.js)
 * Visual question creation, local image attachments, and ZIP/XML packaging.
 */

(function () {
  'use strict';

  let questions = [];
  let currentQuizTitle = 'My Awesome Quiz';

  // Starter Questions
  function createDefaultQuestions() {
    return [
      {
        id: 'q_' + Math.random().toString(36).substr(2, 9),
        type: 'MC',
        text: 'What is the closest planet to the Sun?',
        timeLimit: 20,
        image: null,
        options: [
          { text: 'Venus', isCorrect: false },
          { text: 'Mercury', isCorrect: true },
          { text: 'Mars', isCorrect: false },
          { text: 'Jupiter', isCorrect: false }
        ]
      },
      {
        id: 'q_' + Math.random().toString(36).substr(2, 9),
        type: 'TF',
        text: 'Sound travels faster in water than in air.',
        timeLimit: 15,
        image: null,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false }
        ]
      }
    ];
  }

  // ==================== RENDER ENGINE ====================
  function renderAllQuestions() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;
    container.innerHTML = '';

    questions.forEach((q, qIndex) => {
      const card = document.createElement('div');
      card.className = 'builder-question-card';
      card.setAttribute('data-id', q.id);

      // Header
      const header = document.createElement('div');
      header.className = 'builder-q-header';
      header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <span class="builder-q-badge">#${qIndex + 1}</span>
          <span style="font-weight: 700; color: var(--text-secondary); font-size: 0.9rem;">
            ${q.type === 'TF' ? '⚖️ True / False' : '🎴 Multiple Choice'}
          </span>
          <select class="form-input q-timelimit-select" style="padding: 0.25rem 0.5rem; font-size: 0.85rem; font-weight: 700;">
            <option value="5" ${q.timeLimit === 5 ? 'selected' : ''}>5s ⚡</option>
            <option value="10" ${q.timeLimit === 10 ? 'selected' : ''}>10s</option>
            <option value="15" ${q.timeLimit === 15 ? 'selected' : ''}>15s</option>
            <option value="20" ${q.timeLimit === 20 ? 'selected' : ''}>20s</option>
            <option value="30" ${q.timeLimit === 30 ? 'selected' : ''}>30s</option>
            <option value="45" ${q.timeLimit === 45 ? 'selected' : ''}>45s</option>
            <option value="60" ${q.timeLimit === 60 ? 'selected' : ''}>60s</option>
          </select>
        </div>
        <div class="builder-q-tools">
          <button class="btn btn-sm btn-secondary btn-q-up" title="Move Up" ${qIndex === 0 ? 'disabled' : ''}>⬆️</button>
          <button class="btn btn-sm btn-secondary btn-q-down" title="Move Down" ${qIndex === questions.length - 1 ? 'disabled' : ''}>⬇️</button>
          <button class="btn btn-sm btn-secondary btn-q-duplicate" title="Duplicate Question">📋</button>
          <button class="btn btn-sm btn-secondary btn-q-delete" title="Delete Question" style="color: #ef4444;" ${questions.length <= 1 ? 'disabled' : ''}>🗑️</button>
        </div>
      `;

      // Question Text Input
      const textGroup = document.createElement('div');
      textGroup.style.marginBottom = '0.8rem';
      textGroup.innerHTML = `
        <label style="display: block; font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 0.3rem;">QUESTION TEXT</label>
        <textarea class="form-input q-text-input" rows="2" placeholder="Write your question here..." style="font-size: 1.15rem; font-weight: 700; width: 100%;">${escapeHtml(q.text)}</textarea>
      `;

      // Image Attachment Box
      const imgBox = document.createElement('div');
      imgBox.className = 'builder-img-upload-box';
      if (q.image && q.image.dataUrl) {
        imgBox.innerHTML = `
          <img src="${q.image.dataUrl}" class="builder-img-preview" alt="question image">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.3rem;">${escapeHtml(q.image.filename || 'Attached Image')}</div>
          <button type="button" class="btn btn-sm btn-secondary btn-remove-img" style="margin-top: 0.5rem; color: #ef4444;">🗑️ Remove Picture</button>
        `;
      } else {
        imgBox.innerHTML = `
          <div style="font-size: 2rem; margin-bottom: 0.2rem;">🖼️</div>
          <div style="font-weight: 700; color: var(--text-secondary); font-size: 0.95rem;">Click or Drag &amp; Drop Picture Here</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Supports PNG, JPG, WebP, GIF</div>
          <input type="file" class="q-img-file-input" accept="image/*" style="display: none;">
        `;
      }

      // Options Grid
      const choiceGrid = document.createElement('div');
      choiceGrid.className = 'builder-choice-grid';

      const shapes = ['▲', '◆', '●', '■'];
      const colorPills = ['color-red', 'color-blue', 'color-yellow', 'color-green'];

      q.options.forEach((opt, oIndex) => {
        const item = document.createElement('div');
        item.className = `builder-choice-item ${opt.isCorrect ? 'correct' : ''}`;

        // True / False follows Rule #2: Fixed positioning True (Blue) Left, False (Red) Right
        let pillClass = colorPills[oIndex % colorPills.length];
        let shape = shapes[oIndex % shapes.length];
        if (q.type === 'TF') {
          pillClass = oIndex === 0 ? 'color-blue' : 'color-red';
          shape = oIndex === 0 ? '◆' : '▲';
        }

        item.innerHTML = `
          <div class="builder-choice-color-pill ${pillClass}">${shape}</div>
          <input type="text" class="builder-choice-input opt-text-input" 
                 value="${escapeHtml(opt.text)}" 
                 placeholder="Option ${oIndex + 1}" 
                 ${q.type === 'TF' ? 'readonly' : ''}>
          <button type="button" class="btn-correct-toggle ${opt.isCorrect ? 'is-correct' : ''}" title="${opt.isCorrect ? 'Correct Answer' : 'Mark as Correct'}">
            ${opt.isCorrect ? '✓' : '○'}
          </button>
        `;

        // Correct toggle
        const toggleBtn = item.querySelector('.btn-correct-toggle');
        toggleBtn.addEventListener('click', () => {
          if (q.type === 'TF') {
            q.options.forEach((o, i) => { o.isCorrect = (i === oIndex); });
          } else {
            // For MC, can toggle
            opt.isCorrect = !opt.isCorrect;
            // Ensure at least one is correct
            const anyCorrect = q.options.some(o => o.isCorrect);
            if (!anyCorrect) opt.isCorrect = true;
          }
          renderAllQuestions();
        });

        // Input change
        const optInput = item.querySelector('.opt-text-input');
        optInput.addEventListener('input', (e) => {
          opt.text = e.target.value;
        });

        choiceGrid.appendChild(item);
      });

      // Assemble card
      card.appendChild(header);
      card.appendChild(textGroup);
      card.appendChild(imgBox);
      card.appendChild(choiceGrid);

      // Event Listeners for Question Header Tools
      const timeSelect = card.querySelector('.q-timelimit-select');
      timeSelect.addEventListener('change', (e) => {
        q.timeLimit = parseInt(e.target.value, 10);
      });

      const qTextInput = card.querySelector('.q-text-input');
      qTextInput.addEventListener('input', (e) => {
        q.text = e.target.value;
      });

      const btnUp = card.querySelector('.btn-q-up');
      if (btnUp) {
        btnUp.addEventListener('click', () => {
          if (qIndex > 0) {
            const temp = questions[qIndex - 1];
            questions[qIndex - 1] = questions[qIndex];
            questions[qIndex] = temp;
            renderAllQuestions();
          }
        });
      }

      const btnDown = card.querySelector('.btn-q-down');
      if (btnDown) {
        btnDown.addEventListener('click', () => {
          if (qIndex < questions.length - 1) {
            const temp = questions[qIndex + 1];
            questions[qIndex + 1] = questions[qIndex];
            questions[qIndex] = temp;
            renderAllQuestions();
          }
        });
      }

      const btnDuplicate = card.querySelector('.btn-q-duplicate');
      if (btnDuplicate) {
        btnDuplicate.addEventListener('click', () => {
          const clone = JSON.parse(JSON.stringify(q));
          clone.id = 'q_' + Math.random().toString(36).substr(2, 9);
          questions.splice(qIndex + 1, 0, clone);
          renderAllQuestions();
        });
      }

      const btnDelete = card.querySelector('.btn-q-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (questions.length > 1 && confirm(`Delete Question #${qIndex + 1}?`)) {
            questions.splice(qIndex, 1);
            renderAllQuestions();
          }
        });
      }

      // Image Upload Events
      const fileInput = card.querySelector('.q-img-file-input');
      const btnRemoveImg = card.querySelector('.btn-remove-img');

      if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', (e) => {
          e.stopPropagation();
          q.image = null;
          renderAllQuestions();
        });
      }

      if (fileInput) {
        imgBox.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) handleImageFile(file, q);
        });

        // Drag and drop image
        imgBox.addEventListener('dragover', (e) => {
          e.preventDefault();
          imgBox.style.borderColor = 'var(--color-accent)';
        });
        imgBox.addEventListener('dragleave', () => {
          imgBox.style.borderColor = '#cbd5e1';
        });
        imgBox.addEventListener('drop', (e) => {
          e.preventDefault();
          imgBox.style.borderColor = '#cbd5e1';
          if (e.dataTransfer.files.length > 0) {
            handleImageFile(e.dataTransfer.files[0], q);
          }
        });
      }

      container.appendChild(card);
    });
  }

  function handleImageFile(file, questionObj) {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP, GIF, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      questionObj.image = {
        filename: file.name,
        dataUrl: e.target.result
      };
      renderAllQuestions();
    };
    reader.readAsDataURL(file);
  }

  // ==================== XML GENERATOR ====================
  function generateQuizXml(forZipExport = false) {
    const title = document.getElementById('quizTitleInput').value.trim() || 'My Awesome Quiz';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<quiz title="${escapeXmlAttr(title)}">\n`;

    questions.forEach((q, idx) => {
      let imgAttr = '';
      if (q.image) {
        if (forZipExport) {
          // Point to images/ subfolder inside zip
          const ext = (q.image.filename || 'image.png').split('.').pop();
          const cleanName = `images/q${idx + 1}_img.${ext}`;
          imgAttr = ` image="${cleanName}"`;
        } else {
          // Self-contained Data URI
          imgAttr = ` image="${q.image.dataUrl}"`;
        }
      }

      xml += `  <question text="${escapeXmlAttr(q.text)}" timeLimit="${q.timeLimit || 20}"${imgAttr}>\n`;
      q.options.forEach(opt => {
        const correctAttr = opt.isCorrect ? ' correct="true"' : '';
        xml += `    <option${correctAttr}>${escapeXmlText(opt.text)}</option>\n`;
      });
      xml += `  </question>\n`;
    });

    xml += `</quiz>\n`;
    return xml;
  }

  // ==================== ZIP EXPORTER (WITH IMAGES) ====================
  async function exportAsZip() {
    if (!window.JSZip) {
      alert('JSZip library is missing.');
      return;
    }

    const title = document.getElementById('quizTitleInput').value.trim() || 'takoot_quiz';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const zip = new JSZip();
    const xmlContent = generateQuizXml(true);
    zip.file('quiz.xml', xmlContent);

    // Add images folder
    const imgFolder = zip.folder('images');
    questions.forEach((q, idx) => {
      if (q.image && q.image.dataUrl) {
        const ext = (q.image.filename || 'image.png').split('.').pop();
        const filename = `q${idx + 1}_img.${ext}`;
        // Extract base64 payload from Data URL
        const base64Index = q.image.dataUrl.indexOf(';base64,');
        if (base64Index !== -1) {
          const base64Data = q.image.dataUrl.substring(base64Index + 8);
          imgFolder.file(filename, base64Data, { base64: true });
        }
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    triggerDownload(content, `${slug}.zip`);
  }

  // ==================== XML EXPORTER MODAL ====================
  function showXmlExportModal() {
    const xml = generateQuizXml(false);
    const modal = document.getElementById('xmlExportModal');
    const codeBox = document.getElementById('xmlExportCodeBox');
    if (codeBox) codeBox.textContent = xml;
    if (modal) modal.style.display = 'flex';
  }

  function downloadXmlFile() {
    const title = document.getElementById('quizTitleInput').value.trim() || 'takoot_quiz';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const xml = generateQuizXml(false);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    triggerDownload(blob, `${slug}.xml`);
  }

  function copyXmlToClipboard() {
    const xml = generateQuizXml(false);
    navigator.clipboard.writeText(xml).then(() => {
      alert('Quiz XML copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy to clipboard.');
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ==================== HOST NOW ====================
  function hostQuizNow() {
    // Generate self-contained XML and extracted images map
    const xml = generateQuizXml(false);
    const imageMap = {};
    questions.forEach((q, idx) => {
      if (q.image && q.image.dataUrl) {
        const ext = (q.image.filename || 'image.png').split('.').pop();
        const cleanName = `images/q${idx + 1}_img.${ext}`;
        imageMap[cleanName] = q.image.dataUrl;
        imageMap[`q${idx + 1}_img.${ext}`] = q.image.dataUrl;
      }
    });

    localStorage.setItem('takoot_host_pending_quiz', JSON.stringify({
      xml: xml,
      images: imageMap
    }));

    window.location.href = '/host';
  }

  // ==================== IMPORT (.XML / .ZIP) ====================
  async function handleImportFile(file) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      await handleImportZip(file);
    } else {
      const text = await readFileAsText(file);
      await parseAndLoadXml(text);
    }
  }

  async function handleImportZip(file) {
    if (!window.JSZip) {
      alert('JSZip library required to unpack ZIP.');
      return;
    }

    try {
      const zip = await JSZip.loadAsync(file);
      const imagesMap = {};
      let xmlFile = null;

      for (const name of Object.keys(zip.files)) {
        const entry = zip.files[name];
        if (entry.dir) continue;
        const lower = name.toLowerCase();

        if (lower.endsWith('.xml') && !xmlFile) {
          xmlFile = entry;
        } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
                   lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
          const base64Data = await entry.async('base64');
          let mime = 'image/png';
          if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
          if (lower.endsWith('.webp')) mime = 'image/webp';
          if (lower.endsWith('.gif')) mime = 'image/gif';
          if (lower.endsWith('.svg')) mime = 'image/svg+xml';

          const dataUrl = `data:${mime};base64,${base64Data}`;
          imagesMap[name] = dataUrl;
          const baseName = name.split('/').pop().split('\\').pop();
          imagesMap[baseName] = dataUrl;
        }
      }

      if (!xmlFile) {
        throw new Error('No .xml quiz file found inside the ZIP package.');
      }

      const xmlText = await xmlFile.async('text');
      await parseAndLoadXml(xmlText, imagesMap);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  async function parseAndLoadXml(xmlText, imagesMap = {}) {
    try {
      const res = await fetch('/api/parse-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: xmlText
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse XML.');
      }

      const parsed = data.quiz;
      document.getElementById('quizTitleInput').value = parsed.title || 'Imported Quiz';

      questions = parsed.questions.map((q) => {
        const isTF = q.options && q.options.length === 2 &&
          (String(q.options[0].text).trim().toLowerCase() === 'true' ||
           String(q.options[0].text).trim().toLowerCase() === 'false');

        let imgObj = null;
        if (q.image) {
          const cleanRef = q.image.replace(/^images[\\/]/, '').trim();
          if (imagesMap[q.image]) {
            imgObj = { filename: q.image, dataUrl: imagesMap[q.image] };
          } else if (imagesMap[cleanRef]) {
            imgObj = { filename: cleanRef, dataUrl: imagesMap[cleanRef] };
          } else if (q.image.startsWith('data:image')) {
            imgObj = { filename: 'embedded_image.png', dataUrl: q.image };
          }
        }

        return {
          id: 'q_' + Math.random().toString(36).substr(2, 9),
          type: isTF ? 'TF' : 'MC',
          text: q.text,
          timeLimit: q.timeLimit || 20,
          image: imgObj,
          options: q.options.map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
        };
      });

      renderAllQuestions();
      alert(`Imported ${questions.length} questions successfully!`);
    } catch (err) {
      alert('Error parsing quiz XML: ' + err.message);
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // ==================== HELPERS ====================
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  function escapeXmlAttr(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m];
    });
  }

  function escapeXmlText(str) {
    return String(str || '').replace(/[&<>]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
  }

  // ==================== SETUP EVENTS ====================
  function setupBuilderEvents() {
    const btnAddMC = document.getElementById('btnAddMCQuestion');
    const btnAddTF = document.getElementById('btnAddTFQuestion');
    const btnNew = document.getElementById('btnNewQuiz');
    const btnZip = document.getElementById('btnDownloadZip');
    const btnXml = document.getElementById('btnExportXml');
    const btnHost = document.getElementById('btnHostNow');
    const importInput = document.getElementById('builderImportInput');
    const btnCloseModal = document.getElementById('btnCloseXmlModal');
    const btnCopyXml = document.getElementById('btnCopyExportXml');
    const btnDownloadXml = document.getElementById('btnDownloadXmlFile');
    const defaultTimeSelect = document.getElementById('quizDefaultTime');

    if (btnAddMC) {
      btnAddMC.addEventListener('click', () => {
        const defaultTime = defaultTimeSelect ? parseInt(defaultTimeSelect.value, 10) : 20;
        questions.push({
          id: 'q_' + Math.random().toString(36).substr(2, 9),
          type: 'MC',
          text: '',
          timeLimit: defaultTime,
          image: null,
          options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
          ]
        });
        renderAllQuestions();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
    }

    if (btnAddTF) {
      btnAddTF.addEventListener('click', () => {
        const defaultTime = defaultTimeSelect ? parseInt(defaultTimeSelect.value, 10) : 15;
        questions.push({
          id: 'q_' + Math.random().toString(36).substr(2, 9),
          type: 'TF',
          text: '',
          timeLimit: defaultTime,
          image: null,
          options: [
            { text: 'True', isCorrect: true },
            { text: 'False', isCorrect: false }
          ]
        });
        renderAllQuestions();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
    }

    if (btnNew) {
      btnNew.addEventListener('click', () => {
        if (confirm('Start a new blank quiz? Unsaved changes will be discarded.')) {
          questions = createDefaultQuestions();
          document.getElementById('quizTitleInput').value = 'My Awesome Quiz';
          renderAllQuestions();
        }
      });
    }

    if (btnZip) btnZip.addEventListener('click', exportAsZip);
    if (btnXml) btnXml.addEventListener('click', showXmlExportModal);
    if (btnHost) btnHost.addEventListener('click', hostQuizNow);

    if (importInput) {
      importInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleImportFile(e.target.files[0]);
        }
      });
    }

    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        document.getElementById('xmlExportModal').style.display = 'none';
      });
    }

    if (btnCopyXml) btnCopyXml.addEventListener('click', copyXmlToClipboard);
    if (btnDownloadXml) btnDownloadXml.addEventListener('click', downloadXmlFile);

    const logo = document.getElementById('logoHomeBtn');
    if (logo) {
      logo.addEventListener('click', () => {
        window.location.href = '/builder';
      });
    }
  }

  // ==================== INITIALIZATION ====================
  document.addEventListener('DOMContentLoaded', () => {
    questions = createDefaultQuestions();
    renderAllQuestions();
    setupBuilderEvents();
  });

})();
