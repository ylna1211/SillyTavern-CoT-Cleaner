// SillyTavern-CoT-Cleaner
// 版本 1.1.0 (新增模式 C)

const MODULE_NAME = 'st-coat-cleaner';
// ⚠️ 請確保這裡與你的 GitHub 倉庫資料夾名稱完全一致
const extensionName = 'SillyTavern-CoT-Cleaner'; 

// ---- 默认设置 ----
const defaultSettings = {
  enabled: true,
  hideMode: true,     // 模式 A：UI 折叠
  stripMode: false,   // 模式 B：剥离正文
  hidePreContentMode: false, // 模式 C：隐藏 content 前的字
  maxLines: 60,
  keywordsRaw: 'thinking,thought,thoughts,思维,思考,分析,内部推理,reasoning,chain of thought',
};

let settings = { ...defaultSettings };
let keywords = [];

// ---- 工具：解析关键字 ----
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

// ---- 核心：检测无标记思维链 ----
function detectCoT(text) {
  if (!text || typeof text !== 'string') {
    return { hasCoT: false, before: '', cot: '', after: text || '' };
  }

  const lines = text.split('\n');

  // 找「思维起始」：第一个非空行命中任一关键字
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

  // 找结束标记
  let endIdx = -1;
  const endMarkers = [
    /^-{3,}$/,
    /^={3,}$/,
    /^Answer\s*[:：]/i,
    /^回答\s*[:：]/,
    /^最终回复\s*[:：]/,
    /^Final\s*Answer\s*[:：]/i,
    /^结论\s*[:：]/,
  ];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (endMarkers.some(re => re.test(line))) {
      endIdx = i;
      break;
    }
  }

  // 若无结束标记，用「连续两空行」作为分界
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

// ---- 处理单一消息 DOM 节点 ----
function processMessageNode(node) {
  if (!settings.enabled) return;
  if (node.dataset.cotcProcessed === '1') return;
  node.dataset.cotcProcessed = '1';

  const mesText = node.querySelector('.mes_text');
  if (!mesText) return;

  let raw = mesText.innerText || '';

  // === 新增：模式 C 处理逻辑 ===
  // 只要开启了模式 C，最先处理前置文字
  if (settings.hidePreContentMode) {
    // 匹配 content: / content： / 正文: / 正文： / 输出: / 输出： (包含前面的换行)
    const contentRegex = /[\s\S]*?(?:content|正文|输出|回复)\s*[:：]/i;
    if (contentRegex.test(raw)) {
      // 将匹配到的 content 关键词及前面的所有内容替换为空
      raw = raw.replace(contentRegex, '');
    }
    // 如果你还想切掉开头多余的换行，可以加这行
    raw = raw.trimStart(); 
  }

  // 此时 raw 如果被模式 C 处理过，可能已经变短了
  const result = detectCoT(raw);
  if (!result.hasCoT && !settings.hidePreContentMode) return; // 如果没检测到 CoT 也没开模式 C，直接退出

  // 模式 B：剥离（剥离 CoT）
  if (settings.stripMode) {
    let cleaned = [result.before, result.after].filter(Boolean).join('\n').trim();
    mesText.innerText = cleaned;
    node.dataset.cotcStripped = '1';
    return;
  }

  // 模式 A：折叠（折叠 CoT）
  if (settings.hideMode) {
    // 如果没检测到 CoT，但开了模式 C，就不做折叠，直接更新文字
    if (!result.hasCoT) {
      mesText.innerText = raw;
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'cotc-fold';

    const header = document.createElement('div');
    header.className = 'cotc-fold-header';
    header.textContent = '🧠 思维链（点击展开）';

    const body = document.createElement('pre');
    body.className = 'cotc-fold-body';
    body.textContent = result.cot;

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    mesText.innerHTML = '';
    // 注意：如果开了模式 C，result.before 已经被清空了
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
  } else if (settings.hidePreContentMode && !settings.stripMode) {
    // 如果只开了模式 C，没开 A 也没开 B，直接更新文本
    mesText.innerText = raw;
  }
}

// ---- 扫描现有消息 ----
function scanAllMessages() {
  document.querySelectorAll('.mes').forEach(node => {
    if (node.dataset.cotcStripped === '1') return;
    processMessageNode(node);
  });
}

// ---- 重置标记 ----
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

// ---- 绑定设置 UI ----
function bindSettings() {
  const ui = {
    enabled: document.getElementById('cotc-enabled'),
    hideMode: document.getElementById('cotc-hide-mode'),
    stripMode: document.getElementById('cotc-strip-mode'),
    hidePreContentMode: document.getElementById('cotc-hide-pre-content'), // 新增
    maxLines: document.getElementById('cotc-max-lines'),
    keywords: document.getElementById('cotc-keywords'),
  };
  if (!ui.enabled) return;

  const apply = (save = true) => {
    settings.enabled = ui.enabled.checked;
    settings.hideMode = ui.hideMode.checked;
    settings.stripMode = ui.stripMode.checked;
    settings.hidePreContentMode = ui.hidePreContentMode.checked; // 新增
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
  ui.hidePreContentMode.addEventListener('change', () => apply()); // 新增
  ui.maxLines.addEventListener('change', () => apply());
  ui.keywords.addEventListener('change', () => apply());
}

// ---- 加载设置 ----
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
    hidePreContentMode: document.getElementById('cotc-hide-pre-content'), // 新增
    maxLines: document.getElementById('cotc-max-lines'),
    keywords: document.getElementById('cotc-keywords'),
  };
  if (ui.enabled) {
    ui.enabled.checked = settings.enabled;
    ui.hideMode.checked = settings.hideMode;
    ui.stripMode.checked = settings.stripMode;
    ui.hidePreContentMode.checked = settings.hidePreContentMode; // 新增
    ui.maxLines.value = settings.maxLines;
    ui.keywords.value = settings.keywordsRaw;
  }
}

// ---- 挂载 ----
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
