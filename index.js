// SillyTavern-CoT-Cleaner
// 版本 1.1.0 (新增隱藏 Contact 前的文字)

const MODULE_NAME = 'st-coat-cleaner';
const extensionName = 'SillyTavern-CoT-Cleaner'; // 如果你改了倉庫名，這裡也要跟著改！

// ---- 預設設定 ----
const defaultSettings = {
  enabled: true,
  hideMode: true,       // 模式 A：UI 折疊
  stripMode: false,     // 模式 B：剝離正文
  stripBeforeContact: true, // 🆕 隱藏 Contact: 之前的文字
  maxLines: 60,
  keywordsRaw: 'thinking,thought,thoughts,思維,思考,分析,內部推理,reasoning,chain of thought',
};

let settings = { ...defaultSettings };
let keywords = [];

// ---- 工具：解析關鍵字 ----
function compileKeywords(raw) {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(k => {
      try { return new RegExp(k, 'i'); }
      catch { return new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    });
}

// ---- 核心：偵測無標記思維鏈 ----
function detectCoT(text) {
  if (!text || typeof text !== 'string') {
    return { hasCoT: false, before: '', cot: '', after: text || '' };
  }

  const lines = text.split('\n');

  let startIdx = -1;
  for (let i = 0; i < Math.min(lines.length, settings.maxLines); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (keywords.some(re => re.test(line))) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    return { hasCoT: false, before: '', cot: '', after: text };
  }

  let endIdx = -1;
  const endMarkers = [
    /^-{3,}$/,
    /^={3,}$/,
    /^Answer\s*[:：]/i,
    /^回答\s*[:：]/,
    /^最終回覆\s*[:：]/,
    /^Final\s*Answer\s*[:：]/i,
    /^結論\s*[:：]/,
  ];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (endMarkers.some(re => re.test(line))) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    let blankCount = 0;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        blankCount++;
        if (blankCount >= 2) { endIdx = i; break; }
      } else {
        blankCount = 0;
      }
    }
  }

  if (endIdx === -1) {
    return {
      hasCoT: true,
      before: lines.slice(0, startIdx).join('\n'),
      cot: lines.slice(startIdx).join('\n'),
      after: '',
    };
  }

  return {
    hasCoT: true,
    before: lines.slice(0, startIdx).join('\n'),
    cot: lines.slice(startIdx, endIdx).join('\n'),
    after: lines.slice(endIdx).join('\n'),
  };
}

// ---- 處理單一訊息 DOM 節點 ----
function processMessageNode(node) {
  if (!settings.enabled) return;
  if (node.dataset.cotcProcessed === '1') return;
  node.dataset.cotcProcessed = '1';

  const mesText = node.querySelector('.mes_text');
  if (!mesText) return;

  let raw = mesText.innerText || '';

  // 🆕 優先處理：隱藏 Contact: 之前的文字
  if (settings.stripBeforeContact) {
    // 尋找 Contact: 或 Contact： 的位置（忽略大小寫）
    const contactMatch = raw.match(/Contact\s*[:：]/i);
    if (contactMatch) {
      const contactIndex = contactMatch.index;
      // 只保留 Contact: 及其之後的文字
      raw = raw.substring(contactIndex);
      // 立即更新畫面上的文字
      mesText.innerText = raw;
      // 因為已經截斷了，後續的思維鏈判斷可以繼續執行
    }
  }

  // 繼續執行原有的思維鏈偵測
  const result = detectCoT(raw);
  if (!result.hasCoT) return;

  // 模式 B：剝離
  if (settings.stripMode) {
    const cleaned = [result.before, result.after].filter(Boolean).join('\n').trim();
    mesText.innerText = cleaned;
    node.dataset.cotcStripped = '1';
    return;
  }

  // 模式 A：折疊
  if (settings.hideMode) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cotc-fold';

    const header = document.createElement('div');
    header.className = 'cotc-fold-header';
    header.textContent = '🧠 思維鏈（點擊展開）';

    const body = document.createElement('pre');
    body.className = 'cotc-fold-body';
    body.textContent = result.cot;

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    mesText.innerHTML = '';
    if (result.before.trim()) {
      const pre = document.createElement('div');
      pre.className = 'cotc-pre';
      pre.textContent = result.before;
      mesText.appendChild(pre);
    }
    mesText.appendChild(wrapper);
    if (result.after.trim()) {
      const post = document.createElement('div');
      post.className = 'cotc-post';
      post.textContent = result.after;
      mesText.appendChild(post);
    }

    header.addEventListener('click', () => {
      wrapper.classList.toggle('expanded');
    });
  }
}

function scanAllMessages() {
  document.querySelectorAll('.mes').forEach(node => {
    if (node.dataset.cotcStripped === '1') return;
    processMessageNode(node);
  });
}

function resetMarks() {
  document.querySelectorAll('.mes').forEach(node => {
    delete node.dataset.cotcProcessed;
    delete node.dataset.cotcStripped;
    const mesText = node.querySelector('.mes_text');
    if (mesText) {
      const folded = mesText.querySelector('.cotc-fold');
      if (folded) {
        const txt = mesText.innerText;
        mesText.innerText = txt;
      }
    }
  });
}

function bindSettings() {
  const ui = {
    enabled: document.getElementById('cotc-enabled'),
    hideMode: document.getElementById('cotc-hide-mode'),
    stripMode: document.getElementById('cotc-strip-mode'),
    stripBeforeContact: document.getElementById('cotc-strip-before-contact'), // 🆕
    maxLines: document.getElementById('cotc-max-lines'),
    keywords: document.getElementById('cotc-keywords'),
  };
  if (!ui.enabled) return;

  const apply = (save = true) => {
    settings.enabled = ui.enabled.checked;
    settings.hideMode = ui.hideMode.checked;
    settings.stripMode = ui.stripMode.checked;
    settings.stripBeforeContact = ui.stripBeforeContact.checked; // 🆕
    settings.maxLines = Math.max(1, parseInt(ui.maxLines.value, 10) || 60);
    settings.keywordsRaw = ui.keywords.value;
    keywords = compileKeywords(settings.keywordsRaw);
    if (save) extension_settings[MODULE_NAME] = settings;
    resetMarks();
    scanAllMessages();
  };

  ui.enabled.addEventListener('change', () => apply());
  ui.hideMode.addEventListener('change', () => apply());
  ui.stripMode.addEventListener('change', () => apply());
  ui.stripBeforeContact.addEventListener('change', () => apply()); // 🆕
  ui.maxLines.addEventListener('change', () => apply());
  ui.keywords.addEventListener('change', () => apply());
}

function loadSettings() {
  if (!extension_settings[MODULE_NAME]) {
    extension_settings[MODULE_NAME] = { ...defaultSettings };
  }
  settings = { ...defaultSettings, ...extension_settings[MODULE_NAME] };
  keywords = compileKeywords(settings.keywordsRaw);

  const ui = {
    enabled: document.getElementById('cotc-enabled'),
    hideMode: document.getElementById('cotc-hide-mode'),
    stripMode: document.getElementById('cotc-strip-mode'),
    stripBeforeContact: document.getElementById('cotc-strip-before-contact'), // 🆕
    maxLines: document.getElementById('cotc-max-lines'),
    keywords: document.getElementById('cotc-keywords'),
  };
  if (ui.enabled) {
    ui.enabled.checked = settings.enabled;
    ui.hideMode.checked = settings.hideMode;
    ui.stripMode.checked = settings.stripMode;
    ui.stripBeforeContact.checked = settings.stripBeforeContact; // 🆕
    ui.maxLines.value = settings.maxLines;
    ui.keywords.value = settings.keywordsRaw;
  }
}

jQuery(async () => {
  const settingsHtml = await $.get(`/scripts/extensions/third-party/${extensionName}/settings.html`);
  $('#extensions_settings2').append(settingsHtml);

  loadSettings();
  bindSettings();
  scanAllMessages();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.classList && n.classList.contains('mes')) {
            processMessageNode(n);
          }
        });
      }
    }
  });

  const chat = document.getElementById('chat');
  if (chat) {
    observer.observe(chat, { childList: true, subtree: true });
  }
});
