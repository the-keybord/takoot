/**
 * Takoot - Hidden Quiz Builder Client Engine (public/js/builder.js)
 * Dual-Mode Studio:
 * Mode 1: Visual Form Builder
 * Mode 2: XML & Paste-Image Studio (Direct clipboard Ctrl+V image pasting & visual assignment)
 */

(function () {
  'use strict';

  let currentMode = 'visual'; // 'visual' or 'xml_images'
  let questions = [];
  let mediaPool = []; // Array of { id, filename, dataUrl }

  // Default Starter Questions
  function createDefaultQuestions() {
    return [
      {
        id: 'q_' + Math.random().toString(36).substring(2, 9),
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
        id: 'q_' + Math.random().toString(36).substring(2, 9),
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

  // ==================== MODE SWITCHING ====================
  function switchMode(mode) {
    currentMode = mode;
    const btnVisual = document.getElementById('btnModeVisual');
    const btnXml = document.getElementById('btnModeXmlImages');
    const secVisual = document.getElementById('modeVisualSection');
    const secXml = document.getElementById('modeXmlImagesSection');

    if (mode === 'visual') {
      if (btnVisual) btnVisual.classList.add('active');
      if (btnXml) btnXml.classList.remove('active');
      if (secVisual) secVisual.style.display = 'block';
      if (secXml) secXml.style.display = 'none';
      renderAllQuestionsVisual();
    } else {
      if (btnVisual) btnVisual.classList.remove('active');
      if (btnXml) btnXml.classList.add('active');
      if (secVisual) secVisual.style.display = 'none';
      if (secXml) secXml.style.display = 'block';

      // Update XML textarea from current questions
      const textarea = document.getElementById('xmlStudioTextarea');
      if (textarea) {
        textarea.value = generateQuizXml(false);
      }
      renderMode2XmlStudio();
    }
  }

  // ==================== MODE 1: VISUAL FORM BUILDER ====================
  function renderAllQuestionsVisual() {
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
          <select class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.85rem; font-weight: 700;" onchange="window.TakootBuilder.updateTimeLimit(${qIndex}, this.value)">
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
          <button type="button" class="btn btn-sm btn-secondary" title="Move Up" ${qIndex === 0 ? 'disabled' : ''} onclick="window.TakootBuilder.moveUp(${qIndex})">⬆️</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Move Down" ${qIndex === questions.length - 1 ? 'disabled' : ''} onclick="window.TakootBuilder.moveDown(${qIndex})">⬇️</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Duplicate Question" onclick="window.TakootBuilder.duplicate(${qIndex})">📋</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Delete Question" style="color: #ef4444;" ${questions.length <= 1 ? 'disabled' : ''} onclick="window.TakootBuilder.deleteQuestion(${qIndex})">🗑️</button>
        </div>
      `;

      // Question Text Input
      const textGroup = document.createElement('div');
      textGroup.style.marginBottom = '0.8rem';
      textGroup.innerHTML = `
        <label style="display: block; font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 0.3rem;">QUESTION TEXT</label>
        <textarea class="form-input q-text-input" rows="2" placeholder="Write your question here..." style="font-size: 1.15rem; font-weight: 700; width: 100%;" oninput="window.TakootBuilder.updateQuestionText(${qIndex}, this.value)">${escapeHtml(q.text)}</textarea>
      `;

      // Image Attachment Box
      const imgBox = document.createElement('div');
      imgBox.className = 'builder-img-upload-box';
      if (q.image && q.image.dataUrl) {
        imgBox.innerHTML = `
          <img src="${q.image.dataUrl}" class="builder-img-preview" alt="question image">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.3rem;">${escapeHtml(q.image.filename || 'Attached Image')}</div>
          <button type="button" class="btn btn-sm btn-secondary" style="margin-top: 0.5rem; color: #ef4444;" onclick="event.stopPropagation(); window.TakootBuilder.removeImage(${qIndex})">🗑️ Remove Picture</button>
        `;
      } else {
        imgBox.innerHTML = `
          <div style="font-size: 2rem; margin-bottom: 0.2rem;">🖼️</div>
          <div style="font-weight: 700; color: var(--text-secondary); font-size: 0.95rem;">Click to Browse or Paste (<kbd style="background: #e2e8f0; padding: 2px 5px; border-radius: 4px;">Ctrl+V</kbd>) Picture</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Supports PNG, JPG, WebP, GIF</div>
          <input type="file" class="q-img-file-input" accept="image/*" style="display: none;" onchange="if(this.files.length) window.TakootBuilder.handleQuestionFile(this.files[0], ${qIndex})">
        `;
        imgBox.onclick = () => {
          const fi = imgBox.querySelector('.q-img-file-input');
          if (fi) fi.click();
        };
      }

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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleImageFileForQuestion(e.dataTransfer.files[0], q);
        }
      });

      // Options Grid
      const choiceGrid = document.createElement('div');
      choiceGrid.className = 'builder-choice-grid';

      const shapes = ['▲', '◆', '●', '■'];
      const colorPills = ['color-red', 'color-blue', 'color-yellow', 'color-green'];

      q.options.forEach((opt, oIndex) => {
        const item = document.createElement('div');
        item.className = `builder-choice-item ${opt.isCorrect ? 'correct' : ''}`;

        // True / False follows Rule #2: True (Blue) Left, False (Red) Right
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
                 ${q.type === 'TF' ? 'readonly' : ''}
                 oninput="window.TakootBuilder.updateOptionText(${qIndex}, ${oIndex}, this.value)">
          <button type="button" class="btn-correct-toggle ${opt.isCorrect ? 'is-correct' : ''}" 
                  title="${opt.isCorrect ? 'Correct Answer' : 'Mark as Correct'}"
                  onclick="window.TakootBuilder.toggleCorrect(${qIndex}, ${oIndex})">
            ${opt.isCorrect ? '✓' : '○'}
          </button>
        `;

        choiceGrid.appendChild(item);
      });

      card.appendChild(header);
      card.appendChild(textGroup);
      card.appendChild(imgBox);
      card.appendChild(choiceGrid);

      container.appendChild(card);
    });
  }

  // ==================== MODE 2: XML & PASTE-IMAGE STUDIO ====================
  function renderMode2XmlStudio() {
    updateMode2StatusBadges();
    renderMediaPoolGrid();
    renderXmlQuestionsAttachList();
  }

  function updateMode2StatusBadges() {
    const badgeCount = document.getElementById('xmlModeBadgeCount');
    const badgeTitle = document.getElementById('xmlModeBadgeTitle');
    const badgeImages = document.getElementById('xmlModeBadgeImages');
    const titleInput = document.getElementById('quizTitleInput');

    const totalQ = questions.length;
    const title = (titleInput ? titleInput.value.trim() : '') || 'Untitled Quiz';
    const totalAttached = questions.filter(q => q.image && q.image.dataUrl).length;

    if (badgeCount) {
      badgeCount.textContent = `❓ ${totalQ} Questions Detected`;
      badgeCount.className = totalQ > 0 ? 'status-badge active' : 'status-badge';
    }
    if (badgeTitle) {
      badgeTitle.textContent = title;
      badgeTitle.style.display = title ? 'inline-flex' : 'none';
    }
    if (badgeImages) {
      badgeImages.textContent = `🖼️ ${totalAttached} Images Attached`;
      badgeImages.style.display = totalAttached > 0 ? 'inline-flex' : 'none';
    }
  }

  function renderMediaPoolGrid() {
    const grid = document.getElementById('mediaPoolGrid');
    const countEl = document.getElementById('mediaPoolCount');
    if (!grid) return;

    if (countEl) countEl.textContent = mediaPool.length;

    if (mediaPool.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.9rem;">
          No images in pool yet. Copy any picture to clipboard and press <strong>Ctrl+V</strong>, or drop files above!
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    mediaPool.forEach((media, mIndex) => {
      const item = document.createElement('div');
      item.className = 'media-item';

      const currentAssignedQIndex = questions.findIndex(q => q.image && q.image.dataUrl === media.dataUrl);

      let optionsHtml = `<option value="-1">-- Unassigned --</option>`;
      questions.forEach((q, qIndex) => {
        const isSelected = (currentAssignedQIndex === qIndex);
        const qShortText = q.text ? (q.text.length > 25 ? q.text.substring(0, 25) + '...' : q.text) : `Question ${qIndex + 1}`;
        optionsHtml += `<option value="${qIndex}" ${isSelected ? 'selected' : ''}>Q${qIndex + 1}: ${escapeHtml(qShortText)}</option>`;
      });

      item.innerHTML = `
        <img src="${media.dataUrl}" class="media-thumb" alt="media">
        <div style="font-size: 0.75rem; font-weight: 700; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; text-align: center;">
          ${escapeHtml(media.filename || `Pasted Image #${mIndex + 1}`)}
        </div>
        <select class="media-item-assign-select" onchange="window.TakootBuilder.assignMediaToQuestion(${mIndex}, parseInt(this.value, 10))">
          ${optionsHtml}
        </select>
        <button type="button" class="btn btn-sm btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; color: #ef4444; width: 100%;" onclick="window.TakootBuilder.deleteMedia(${mIndex})">
          🗑️ Delete
        </button>
      `;

      grid.appendChild(item);
    });
  }

  function renderXmlQuestionsAttachList() {
    const list = document.getElementById('xmlQuestionsAttachList');
    if (!list) return;

    if (questions.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No questions found in XML. Write or paste XML above to begin.</div>`;
      return;
    }

    list.innerHTML = '';
    questions.forEach((q, qIndex) => {
      const row = document.createElement('div');
      row.className = `xml-attach-row ${q.image && q.image.dataUrl ? 'has-img' : ''}`;
      row.setAttribute('data-qindex', qIndex);

      const info = document.createElement('div');
      info.className = 'xml-attach-info';

      let optionsPreview = '<div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.4rem;">';
      (q.options || []).forEach((opt, oIdx) => {
        optionsPreview += `<span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; ${opt.isCorrect ? 'background: #dcfce7; color: #15803d; font-weight: 800;' : 'background: #f1f5f9; color: #64748b;'}">${opt.isCorrect ? '✓ ' : ''}${escapeHtml(opt.text || `Choice ${oIdx + 1}`)}</span>`;
      });
      optionsPreview += '</div>';

      info.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; font-weight: 800; color: var(--color-accent);">
          <span>Question #${qIndex + 1}</span>
          <span style="color: var(--text-muted); font-size: 0.8rem;">⏱️ ${q.timeLimit || 20}s</span>
          <span style="color: var(--text-muted); font-size: 0.8rem;">(${q.type === 'TF' ? 'True/False' : `${q.options.length} Choices`})</span>
        </div>
        <div style="font-size: 1.05rem; font-weight: 700; color: #0f172a; margin-top: 0.3rem;">
          ${escapeHtml(q.text || '(Empty question text)')}
        </div>
        ${optionsPreview}
      `;

      const slot = document.createElement('div');
      slot.className = 'xml-attach-slot';

      if (q.image && q.image.dataUrl) {
        slot.innerHTML = `
          <div style="width: 100%; text-align: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: var(--radius-sm); padding: 0.4rem;">
            <img src="${q.image.dataUrl}" class="xml-slot-thumb" alt="attached image">
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(q.image.filename || 'Attached image')}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; color: #ef4444; width: 100%;" onclick="window.TakootBuilder.removeImage(${qIndex})">
            🗑️ Remove Picture
          </button>
        `;
      } else {
        let quickSelectHtml = `<option value="">-- Choose from Pool --</option>`;
        mediaPool.forEach((m, mIdx) => {
          quickSelectHtml += `<option value="${mIdx}">Image #${mIdx + 1} (${escapeHtml(m.filename)})</option>`;
        });

        slot.innerHTML = `
          <div class="xml-slot-box" tabindex="0" title="Click and press Ctrl+V to paste screenshot for this question!" onclick="document.getElementById('poolFileHidden_${qIndex}').click()">
            <span style="font-size: 1.5rem;">🖼️</span>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-top: 0.2rem;">
              Click / Paste <kbd style="background: #e2e8f0; padding: 1px 4px; border-radius: 3px;">Ctrl+V</kbd>
            </span>
            <input type="file" id="poolFileHidden_${qIndex}" accept="image/*" style="display: none;" onchange="if(this.files.length) window.TakootBuilder.handleQuestionFile(this.files[0], ${qIndex})">
          </div>
          ${mediaPool.length > 0 ? `
            <select class="form-input quick-pool-select" style="font-size: 0.75rem; padding: 0.25rem; width: 100%;" onchange="window.TakootBuilder.assignMediaToQuestion(parseInt(this.value, 10), ${qIndex})">
              ${quickSelectHtml}
            </select>
          ` : ''}
        `;

        const slotBox = slot.querySelector('.xml-slot-box');
        if (slotBox) {
          slotBox.addEventListener('paste', (e) => {
            e.stopPropagation();
            handlePasteEvent(e, q);
          });
        }
      }

      row.appendChild(info);
      row.appendChild(slot);
      list.appendChild(row);
    });
  }

  // ==================== CLIPBOARD & IMAGE PASTE ====================
  function handlePasteEvent(event, targetQuestion = null) {
    const items = (event.clipboardData || window.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        event.preventDefault();
        const blob = items[i].getAsFile();
        if (!blob) continue;
        const reader = new FileReader();

        reader.onload = (e) => {
          const dataUrl = e.target.result;
          const ext = blob.type.split('/')[1] || 'png';
          const filename = `Pasted_Image_${mediaPool.length + 1}.${ext}`;

          const mediaObj = {
            id: 'img_' + Math.random().toString(36).substring(2, 9),
            filename: filename,
            dataUrl: dataUrl
          };

          mediaPool.push(mediaObj);

          if (targetQuestion) {
            targetQuestion.image = {
              filename: filename,
              dataUrl: dataUrl
            };
          }

          if (currentMode === 'xml_images') {
            renderMode2XmlStudio();
          } else {
            renderAllQuestionsVisual();
          }
        };

        reader.readAsDataURL(blob);
        break;
      }
    }
  }

  function handleImageFileForQuestion(file, questionObj) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP, GIF, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      questionObj.image = {
        filename: file.name,
        dataUrl: dataUrl
      };

      if (!mediaPool.some(m => m.dataUrl === dataUrl)) {
        mediaPool.push({
          id: 'img_' + Math.random().toString(36).substring(2, 9),
          filename: file.name,
          dataUrl: dataUrl
        });
      }

      if (currentMode === 'visual') {
        renderAllQuestionsVisual();
      } else {
        renderMode2XmlStudio();
      }
    };
    reader.readAsDataURL(file);
  }

  // ==================== XML PARSER & GENERATOR ====================
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
      const titleInput = document.getElementById('quizTitleInput');
      if (titleInput && parsed.title) {
        titleInput.value = parsed.title;
      }

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

          if (imgObj && !mediaPool.some(m => m.dataUrl === imgObj.dataUrl)) {
            mediaPool.push({
              id: 'img_' + Math.random().toString(36).substring(2, 9),
              filename: imgObj.filename,
              dataUrl: imgObj.dataUrl
            });
          }
        }

        return {
          id: 'q_' + Math.random().toString(36).substring(2, 9),
          type: isTF ? 'TF' : 'MC',
          text: q.text,
          timeLimit: q.timeLimit || 20,
          image: imgObj,
          options: q.options.map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
        };
      });

      if (currentMode === 'visual') {
        renderAllQuestionsVisual();
      } else {
        renderMode2XmlStudio();
      }
    } catch (err) {
      alert('Error parsing XML: ' + err.message);
    }
  }

  function generateQuizXml(forZipExport = false) {
    const title = (document.getElementById('quizTitleInput') ? document.getElementById('quizTitleInput').value.trim() : '') || 'My Awesome Quiz';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<quiz title="${escapeXmlAttr(title)}">\n`;

    questions.forEach((q, idx) => {
      let imgAttr = '';
      if (q.image && q.image.dataUrl) {
        if (forZipExport) {
          const ext = (q.image.filename || 'image.png').split('.').pop();
          const cleanName = `images/q${idx + 1}_img.${ext}`;
          imgAttr = ` image="${cleanName}"`;
        } else {
          imgAttr = ` image="${q.image.dataUrl}"`;
        }
      }

      xml += `  <question text="${escapeXmlAttr(q.text)}" timeLimit="${q.timeLimit || 20}"${imgAttr}>\n`;
      (q.options || []).forEach(opt => {
        const correctAttr = opt.isCorrect ? ' correct="true"' : '';
        xml += `    <option${correctAttr}>${escapeXmlText(opt.text)}</option>\n`;
      });
      xml += `  </question>\n`;
    });

    xml += `</quiz>\n`;
    return xml;
  }

  // ==================== EXPORT ACTIONS ====================
  async function exportAsZip() {
    if (!window.JSZip) {
      alert('JSZip library is missing.');
      return;
    }

    const title = (document.getElementById('quizTitleInput') ? document.getElementById('quizTitleInput').value.trim() : '') || 'takoot_quiz';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    const zip = new JSZip();
    const xmlContent = generateQuizXml(true);
    zip.file('quiz.xml', xmlContent);

    const imgFolder = zip.folder('images');
    questions.forEach((q, idx) => {
      if (q.image && q.image.dataUrl) {
        const ext = (q.image.filename || 'image.png').split('.').pop();
        const filename = `q${idx + 1}_img.${ext}`;
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

  function showXmlExportModal() {
    const xml = generateQuizXml(false);
    const modal = document.getElementById('xmlExportModal');
    const codeBox = document.getElementById('xmlExportCodeBox');
    if (codeBox) codeBox.textContent = xml;
    if (modal) modal.style.display = 'flex';
  }

  function downloadXmlFile() {
    const title = (document.getElementById('quizTitleInput') ? document.getElementById('quizTitleInput').value.trim() : '') || 'takoot_quiz';
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

  function hostQuizNow() {
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

  // ==================== IMPORT (.XML / .ZIP) ====================
  async function handleImportFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (file.name.toLowerCase().endsWith('.zip')) {
      await handleImportZip(file);
    } else {
      const reader = new FileReader();
      reader.onload = async () => {
        await parseAndLoadXml(reader.result);
      };
      reader.readAsText(file);
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

          if (!mediaPool.some(m => m.dataUrl === dataUrl)) {
            mediaPool.push({
              id: 'img_' + Math.random().toString(36).substring(2, 9),
              filename: baseName,
              dataUrl: dataUrl
            });
          }
        }
      }

      if (!xmlFile) {
        throw new Error('No .xml quiz file found inside the ZIP package.');
      }

      const xmlText = await xmlFile.async('text');
      await parseAndLoadXml(xmlText, imagesMap);
      alert(`ZIP imported successfully with ${questions.length} questions and images!`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
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

  // ==================== EXPOSE GLOBAL API ====================
  window.TakootBuilder = {
    switchMode: (mode) => switchMode(mode),
    
    addMC: () => {
      const defaultTimeSelect = document.getElementById('quizDefaultTime');
      const defaultTime = defaultTimeSelect ? parseInt(defaultTimeSelect.value, 10) : 20;
      questions.push({
        id: 'q_' + Math.random().toString(36).substring(2, 9),
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
      renderAllQuestionsVisual();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    },

    addTF: () => {
      const defaultTimeSelect = document.getElementById('quizDefaultTime');
      const defaultTime = defaultTimeSelect ? parseInt(defaultTimeSelect.value, 10) : 15;
      questions.push({
        id: 'q_' + Math.random().toString(36).substring(2, 9),
        type: 'TF',
        text: '',
        timeLimit: defaultTime,
        image: null,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false }
        ]
      });
      renderAllQuestionsVisual();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    },

    newQuiz: () => {
      if (confirm('Start a new blank quiz? Current changes will be reset.')) {
        questions = createDefaultQuestions();
        mediaPool = [];
        const titleInput = document.getElementById('quizTitleInput');
        if (titleInput) titleInput.value = 'My Awesome Quiz';
        if (currentMode === 'visual') renderAllQuestionsVisual();
        else renderMode2XmlStudio();
      }
    },

    downloadZip: () => exportAsZip(),
    exportXml: () => showXmlExportModal(),
    hostNow: () => hostQuizNow(),
    copyXml: () => copyXmlToClipboard(),
    downloadXml: () => downloadXmlFile(),
    closeModal: () => {
      const modal = document.getElementById('xmlExportModal');
      if (modal) modal.style.display = 'none';
    },

    handleImport: (files) => handleImportFiles(files),

    handleMediaPoolFiles: (files) => {
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          const reader = new FileReader();
          const f = files[i];
          reader.onload = (ev) => {
            mediaPool.push({
              id: 'img_' + Math.random().toString(36).substring(2, 9),
              filename: f.name,
              dataUrl: ev.target.result
            });
            renderMode2XmlStudio();
          };
          reader.readAsDataURL(f);
        }
      }
    },

    clearMediaPool: () => {
      if (confirm('Clear all images from the Media Pool?')) {
        mediaPool = [];
        questions.forEach(q => q.image = null);
        renderMode2XmlStudio();
      }
    },

    deleteMedia: (mIndex) => {
      if (mediaPool[mIndex]) {
        const targetDataUrl = mediaPool[mIndex].dataUrl;
        questions.forEach(q => {
          if (q.image && q.image.dataUrl === targetDataUrl) q.image = null;
        });
        mediaPool.splice(mIndex, 1);
        renderMode2XmlStudio();
      }
    },

    assignMediaToQuestion: (mIndex, qIndex) => {
      if (isNaN(mIndex) || mIndex < 0 || !mediaPool[mIndex]) return;
      const media = mediaPool[mIndex];

      questions.forEach(q => {
        if (q.image && q.image.dataUrl === media.dataUrl) q.image = null;
      });

      if (qIndex >= 0 && questions[qIndex]) {
        questions[qIndex].image = {
          filename: media.filename,
          dataUrl: media.dataUrl
        };
      }

      renderMode2XmlStudio();
    },

    moveUp: (qIndex) => {
      if (qIndex > 0) {
        const temp = questions[qIndex - 1];
        questions[qIndex - 1] = questions[qIndex];
        questions[qIndex] = temp;
        renderAllQuestionsVisual();
      }
    },

    moveDown: (qIndex) => {
      if (qIndex < questions.length - 1) {
        const temp = questions[qIndex + 1];
        questions[qIndex + 1] = questions[qIndex];
        questions[qIndex] = temp;
        renderAllQuestionsVisual();
      }
    },

    duplicate: (qIndex) => {
      const clone = JSON.parse(JSON.stringify(questions[qIndex]));
      clone.id = 'q_' + Math.random().toString(36).substring(2, 9);
      questions.splice(qIndex + 1, 0, clone);
      renderAllQuestionsVisual();
    },

    deleteQuestion: (qIndex) => {
      if (questions.length > 1 && confirm(`Delete Question #${qIndex + 1}?`)) {
        questions.splice(qIndex, 1);
        renderAllQuestionsVisual();
      }
    },

    updateTimeLimit: (qIndex, val) => {
      if (questions[qIndex]) {
        questions[qIndex].timeLimit = parseInt(val, 10);
      }
    },

    updateQuestionText: (qIndex, val) => {
      if (questions[qIndex]) {
        questions[qIndex].text = val;
      }
    },

    updateOptionText: (qIndex, oIndex, val) => {
      if (questions[qIndex] && questions[qIndex].options[oIndex]) {
        questions[qIndex].options[oIndex].text = val;
      }
    },

    toggleCorrect: (qIndex, oIndex) => {
      const q = questions[qIndex];
      if (!q) return;
      if (q.type === 'TF') {
        q.options.forEach((o, i) => { o.isCorrect = (i === oIndex); });
      } else {
        q.options[oIndex].isCorrect = !q.options[oIndex].isCorrect;
        const anyCorrect = q.options.some(o => o.isCorrect);
        if (!anyCorrect) q.options[oIndex].isCorrect = true;
      }
      renderAllQuestionsVisual();
    },

    removeImage: (qIndex) => {
      if (questions[qIndex]) {
        questions[qIndex].image = null;
        if (currentMode === 'visual') renderAllQuestionsVisual();
        else renderMode2XmlStudio();
      }
    },

    handleQuestionFile: (file, qIndex) => {
      if (questions[qIndex] && file) {
        handleImageFileForQuestion(file, questions[qIndex]);
      }
    },

    xmlClear: () => {
      const xmlTextarea = document.getElementById('xmlStudioTextarea');
      if (xmlTextarea) xmlTextarea.value = '';
      questions = [];
      renderMode2XmlStudio();
    },

    xmlInsertTemplate: () => {
      const template = `<?xml version="1.0" encoding="UTF-8"?>
<quiz title="Science & World Challenge">
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
      const xmlTextarea = document.getElementById('xmlStudioTextarea');
      if (xmlTextarea) {
        xmlTextarea.value = template;
        parseAndLoadXml(template);
      }
    }
  };

  // ==================== EVENT LISTENERS SETUP ====================
  function setupBuilderEvents() {
    // Mode 2 XML text editor live parser
    const xmlTextarea = document.getElementById('xmlStudioTextarea');
    let xmlDebounce = null;
    if (xmlTextarea) {
      xmlTextarea.addEventListener('input', () => {
        clearTimeout(xmlDebounce);
        xmlDebounce = setTimeout(() => {
          const val = xmlTextarea.value.trim();
          if (val.length > 15) {
            parseAndLoadXml(val);
          }
        }, 400);
      });
    }

    // Global Paste Listener for window (press Ctrl+V anywhere!)
    window.addEventListener('paste', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') {
        const items = (e.clipboardData || window.clipboardData)?.items;
        let hasImg = false;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image') !== -1) hasImg = true;
          }
        }
        if (!hasImg) return;
      }

      handlePasteEvent(e);
    });

    // Global Paste Dropzone dragover
    const pasteZone = document.getElementById('globalPasteZone');
    if (pasteZone) {
      ['dragenter', 'dragover'].forEach(name => {
        pasteZone.addEventListener(name, (e) => {
          e.preventDefault();
          pasteZone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        pasteZone.addEventListener(name, (e) => {
          e.preventDefault();
          pasteZone.classList.remove('dragover');
        });
      });
      pasteZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (!files) return;
        window.TakootBuilder.handleMediaPoolFiles(files);
      });
    }
  }

  // ==================== BULLETPROOF INITIALIZATION ====================
  function init() {
    if (questions.length === 0) {
      questions = createDefaultQuestions();
    }
    renderAllQuestionsVisual();
    setupBuilderEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
