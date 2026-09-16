const CHAT_API = '/api/chat';
const SS_API   = '/api/screenshare';
const LIMIT_KEY = 'celestial_prompt_limit';
const STORAGE_KEY = 'celestial_chat_sessions';
const LIMIT_TS_KEY = 'celestial_prompt_ts';
const LEGAL_KEY = 'celestial_legal_agreed';
const MODEL_KEY = 'celestial_model';
const RESET_MS = 3 * 60 * 60 * 1000;
const MAX_PROMPTS = 130;
let sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let currentSessionId = null;
let attachedImages = [];
let screenStream = null;
let screenVideo = null;
let screenCanvas = null;
let screenInterval = null;
let ssPopupWin = null;
let isStreaming = false;
let flashcards = [];
let fcIndex = 0;
let fcFlipped = false;
let currentFcMsgId = null;
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;
let currentQuizMsgId = null;
let quizEditable = false;
let pendingQuizSubject = '';
let pendingQuizType = '';
let screenShareLocked = false;
let screenShareLockTimer = null;

marked.setOptions({ breaks: true });

function readMathGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return {
          value: text.slice(start + 1, i),
          end: i + 1
        };
      }
    }
  }

  return null;
}

function replaceMathCommand(text, command, renderer, argCount = 1) {
  const needle = '\\\\' + command;
  let out = '';
  let i = 0;

  while (i < text.length) {
    const pos = text.indexOf(needle, i);

    if (pos === -1) {
      out += text.slice(i);
      break;
    }

    out += text.slice(i, pos);

    let cursor = pos + needle.length;
    const args = [];
    let valid = true;

    for (let n = 0; n < argCount; n++) {
      while (/\s/.test(text[cursor] || '')) cursor++;

      const group = readMathGroup(text, cursor);

      if (!group) {
        valid = false;
        break;
      }

      args.push(group.value);
      cursor = group.end;
    }

    if (!valid) {
      out += text.slice(pos, pos + needle.length);
      i = pos + needle.length;
      continue;
    }

    out += renderer(...args);
    i = cursor;
  }

  return out;
}

function escapeMathHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMathInner(value) {
  let out = escapeMathHtml(value);

  out = replaceMathCommand(
    out,
    'frac',
    (a, b) =>
      `<span class="math-frac"><span>${renderMathInner(a)}</span><span>${renderMathInner(b)}</span></span>`,
    2
  );

  out = replaceMathCommand(
    out,
    'dfrac',
    (a, b) =>
      `<span class="math-frac"><span>${renderMathInner(a)}</span><span>${renderMathInner(b)}</span></span>`,
    2
  );

  out = replaceMathCommand(
    out,
    'tfrac',
    (a, b) =>
      `<span class="math-frac"><span>${renderMathInner(a)}</span><span>${renderMathInner(b)}</span></span>`,
    2
  );

  out = replaceMathCommand(
    out,
    'sqrt',
    a =>
      `<span class="math-sqrt"><span class="math-radical">√</span><span class="math-radicand">${renderMathInner(a)}</span></span>`
  );

  out = replaceMathCommand(
    out,
    'boxed',
    a => `<span class="math-box">${renderMathInner(a)}</span>`
  );

  out = replaceMathCommand(
    out,
    'overline',
    a => `<span class="math-overline">${renderMathInner(a)}</span>`
  );

  out = replaceMathCommand(
    out,
    'bar',
    a => `<span class="math-overline">${renderMathInner(a)}</span>`
  );

  out = replaceMathCommand(
    out,
    'overrightarrow',
    a =>
      `<span class="math-ray"><span class="math-arrow-line">${renderMathInner(a)}</span><span class="math-arrow-head">→</span></span>`
  );

  out = replaceMathCommand(
    out,
    'overleftarrow',
    a =>
      `<span class="math-ray"><span class="math-arrow-head left">←</span><span class="math-arrow-line">${renderMathInner(a)}</span></span>`
  );

  out = replaceMathCommand(
    out,
    'overleftrightarrow',
    a =>
      `<span class="math-line"><span class="math-arrow-head left">←</span><span class="math-arrow-line">${renderMathInner(a)}</span><span class="math-arrow-head">→</span></span>`
  );

  return out;
}

function applyMath(text) {
  if (!text) return "";

  const symbols = {
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
    "\\delta": "δ",
    "\\epsilon": "ε",
    "\\varepsilon": "ϵ",
    "\\zeta": "ζ",
    "\\eta": "η",
    "\\theta": "θ",
    "\\vartheta": "ϑ",
    "\\iota": "ι",
    "\\kappa": "κ",
    "\\lambda": "λ",
    "\\mu": "μ",
    "\\nu": "ν",
    "\\xi": "ξ",
    "\\pi": "π",
    "\\varpi": "ϖ",
    "\\rho": "ρ",
    "\\varrho": "ϱ",
    "\\sigma": "σ",
    "\\varsigma": "ς",
    "\\tau": "τ",
    "\\upsilon": "υ",
    "\\phi": "φ",
    "\\varphi": "ϕ",
    "\\chi": "χ",
    "\\psi": "ψ",
    "\\omega": "ω",

    "\\Gamma": "Γ",
    "\\Delta": "Δ",
    "\\Theta": "Θ",
    "\\Lambda": "Λ",
    "\\Xi": "Ξ",
    "\\Pi": "Π",
    "\\Sigma": "Σ",
    "\\Phi": "Φ",
    "\\Psi": "Ψ",
    "\\Omega": "Ω",

    "\\infty": "∞",
    "\\pm": "±",
    "\\mp": "∓",
    "\\times": "×",
    "\\cdot": "·",
    "\\div": "÷",
    "\\ast": "∗",
    "\\star": "⋆",
    "\\circ": "∘",
    "\\bullet": "•",
    "\\degree": "°",
    "\\angle": "∠",
    "\\measuredangle": "∡",
    "\\triangle": "△",
    "\\square": "□",
    "\\diamond": "◇",

    "\\cong": "≅",
    "\\sim": "∼",
    "\\simeq": "≃",
    "\\approx": "≈",
    "\\equiv": "≡",
    "\\neq": "≠",
    "\\ne": "≠",
    "\\le": "≤",
    "\\leq": "≤",
    "\\ge": "≥",
    "\\geq": "≥",
    "\\ll": "≪",
    "\\gg": "≫",
    "\\propto": "∝",

    "\\parallel": "∥",
    "\\perp": "⊥",
    "\\mid": "∣",
    "\\nmid": "∤",

    "\\therefore": "∴",
    "\\because": "∵",

    "\\forall": "∀",
    "\\exists": "∃",
    "\\nexists": "∄",

    "\\in": "∈",
    "\\notin": "∉",
    "\\ni": "∋",

    "\\subset": "⊂",
    "\\subseteq": "⊆",
    "\\supset": "⊃",
    "\\supseteq": "⊇",
    "\\subsetneq": "⊊",
    "\\supsetneq": "⊋",

    "\\cup": "∪",
    "\\cap": "∩",
    "\\setminus": "∖",
    "\\emptyset": "∅",
    "\\varnothing": "∅",

    "\\sum": "∑",
    "\\prod": "∏",
    "\\coprod": "∐",
    "\\int": "∫",
    "\\iint": "∬",
    "\\iiint": "∭",
    "\\oint": "∮",
    "\\partial": "∂",
    "\\nabla": "∇",

    "\\rightarrow": "→",
    "\\to": "→",
    "\\leftarrow": "←",
    "\\gets": "←",
    "\\leftrightarrow": "↔",
    "\\Rightarrow": "⇒",
    "\\Longrightarrow": "⟹",
    "\\Leftarrow": "⇐",
    "\\Leftrightarrow": "⇔",
    "\\Longleftrightarrow": "⟺",
    "\\uparrow": "↑",
    "\\downarrow": "↓",
    "\\updownarrow": "↕",
    "\\mapsto": "↦",

    "\\ldots": "…",
    "\\cdots": "⋯",
    "\\vdots": "⋮",
    "\\ddots": "⋱",

    "\\neg": "¬",
    "\\land": "∧",
    "\\lor": "∨",
    "\\oplus": "⊕",
    "\\otimes": "⊗",
    "\\ominus": "⊖",
    "\\oslash": "⊘",
    "\\dagger": "†",
    "\\ddagger": "‡"
  };

  let result = String(text);
  result = result.replace(/^\s*\\\[\s*$/gm, "");
result = result.replace(/^\s*\\\]\s*$/gm, "");
result = result.replace(/^\s*\[\s*$/gm, "");
result = result.replace(/^\s*\]\s*$/gm, "");
result = result.replace(/\\\[\s*/g, "");
result = result.replace(/\s*\\\]/g, "");

  result = result.replace(
    /\\boxed\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-box">$1</span>'
  );

  result = result.replace(
    /\\fbox\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-box">$1</span>'
  );

  result = result.replace(
    /\\frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>'
  );

  result = result.replace(
    /\\dfrac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-frac math-frac-large"><span class="math-num">$1</span><span class="math-den">$2</span></span>'
  );

  result = result.replace(
    /\\tfrac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>'
  );

  result = result.replace(
    /\\sqrt\s*\[([^\]]+)\]\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '<span class="math-root"><sup>$1</sup>√<span class="math-radicand">$2</span></span>'
  );

  result = result.replace(
    /\\sqrt\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    '√<span class="math-radicand">$1</span>'
  );

  result = result.replace(
    /\\sqrt\s+([A-Za-z0-9]+)/g,
    '√<span class="math-radicand">$1</span>'
  );

  result = result.replace(
    /\\overline\s*\{([^{}]+)\}/g,
    '<span class="math-overline">$1</span>'
  );

  result = result.replace(
    /\\bar\s*\{([^{}]+)\}/g,
    '<span class="math-overline">$1</span>'
  );

  result = result.replace(
    /__([A-Za-z0-9]+)/g,
    '<span class="math-overline">$1</span>'
  );

  result = result.replace(
    /\\underline\s*\{([^{}]+)\}/g,
    '<span class="math-underline">$1</span>'
  );

  result = result.replace(
    /\\overrightarrow\s*\{([^{}]+)\}/g,
    '<span class="math-vector">$1</span>'
  );

  result = result.replace(
    /\\vec\s*\{([^{}]+)\}/g,
    '<span class="math-vector">$1</span>'
  );

  result = result.replace(
    /\\overleftrightarrow\s*\{([^{}]+)\}/g,
    '<span class="math-line">$1</span>'
  );

  result = result.replace(
    /\\overset\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
    '<span class="math-overset"><sup>$1</sup>$2</span>'
  );

  result = result.replace(
    /\\underset\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
    '<span class="math-underset">$2<sub>$1</sub></span>'
  );

  result = result.replace(
    /\^\{([^{}]+)\}/g,
    '<sup>$1</sup>'
  );

  result = result.replace(
    /\^([A-Za-z0-9])/g,
    '<sup>$1</sup>'
  );

  result = result.replace(
    /_\{([^{}]+)\}/g,
    '<sub>$1</sub>'
  );

  result = result.replace(
    /_([A-Za-z0-9])/g,
    '<sub>$1</sub>'
  );

  result = result.replace(/\\left\s*([\(\[\{])/g, "$1");
  result = result.replace(/\\right\s*([\)\]\}])/g, "$1");
  result = result.replace(/\\left\./g, "");
  result = result.replace(/\\right\./g, "");

  result = result.replace(
    /\\text\s*\{([^{}]*)\}/g,
    "$1"
  );

  result = result.replace(
    /\\mathrm\s*\{([^{}]*)\}/g,
    "$1"
  );

  result = result.replace(
    /\\mathbf\s*\{([^{}]*)\}/g,
    "<strong>$1</strong>"
  );

  result = result.replace(
    /\\mathit\s*\{([^{}]*)\}/g,
    "<i>$1</i>"
  );

  result = result.replace(
    /\\mathbb\s*\{([A-Za-z])\}/g,
    (_, char) => ({
      R: "ℝ",
      N: "ℕ",
      Z: "ℤ",
      Q: "ℚ",
      C: "ℂ"
    })[char] || char
  );

  Object.entries(symbols)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([latex, symbol]) => {
      result = result.split(latex).join(symbol);
    });

  result = result.replace(/\\degree/g, "°");
  result = result.replace(/\\,/g, " ");
  result = result.replace(/\\;/g, " ");
  result = result.replace(/\\:/g, " ");
  result = result.replace(/\\!/g, "");
  result = result.replace(/\\quad/g, "    ");
  result = result.replace(/\\qquad/g, "        ");

  result = result.replace(/\\([{}])/g, "$1");

  result = result.replace(/\\([A-Za-z]+)/g, "$1");

  return result;
}

function getPromptCount() {
  const startedAt = parseInt(
    localStorage.getItem(LIMIT_TS_KEY) || '0',
    10
  );

  if (startedAt && Date.now() - startedAt >= RESET_MS) {
    localStorage.setItem(LIMIT_KEY, '0');
    localStorage.removeItem(LIMIT_TS_KEY);
    screenShareLocked = false;
    updateScreenShareButton();
    return 0;
  }

  return parseInt(
    localStorage.getItem(LIMIT_KEY) || '0',
    10
  );
}

function setPromptCount(n) {
  localStorage.setItem(LIMIT_KEY, String(n));

  if (!localStorage.getItem(LIMIT_TS_KEY)) {
    localStorage.setItem(
      LIMIT_TS_KEY,
      String(Date.now())
    );
  }

  updateCounter();
  updateScreenShareButton();
}

function promptsLeft() {
  return Math.max(
    0,
    MAX_PROMPTS - getPromptCount()
  );
}

function msLeftInWindow() {
  const startedAt = parseInt(
    localStorage.getItem(LIMIT_TS_KEY) || '0',
    10
  );

  if (!startedAt) return 0;

  return Math.max(
    0,
    RESET_MS - (Date.now() - startedAt)
  );
}

function formatWait(ms) {
  const mins = Math.ceil(ms / 60000);

  if (mins <= 1) return 'less than a minute';

  if (mins < 60) {
    return mins + ' minutes';
  }

  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;

  return hrs + 'h' + (
    rem ? ' ' + rem + 'm' : ''
  );
}

function updateCounter() {
  const el = document.getElementById(
    'prompt-counter'
  );

  if (el) {
    el.textContent =
      promptsLeft() + ' prompts left';
  }
}

function updateScreenShareButton() {
  const btn = document.getElementById(
    'ss-toggle-btn'
  );

  if (!btn) return;

  const locked = promptsLeft() <= 0;

  screenShareLocked = locked;

  btn.disabled = locked;

  btn.classList.toggle(
    'disabled',
    locked
  );

  btn.title = locked
    ? 'Screen share is unavailable until your 3 hour prompt window resets.'
    : '';
}

function usePrompts(n) {
  if (getPromptCount() + n > MAX_PROMPTS) {
    setPromptCount(MAX_PROMPTS);

    showToast(
      'You reached the limit, please wait ' +
      formatWait(msLeftInWindow()) +
      '.'
    );

    return false;
  }

  const total =
    getPromptCount() + n;

  setPromptCount(total);

  if (total >= MAX_PROMPTS) {
    screenShareLocked = true;
    updateScreenShareButton();
  }

  return true;
}

function checkLimit(n) {
  if (getPromptCount() + n > MAX_PROMPTS) {
    const resetAt =
      new Date(
        Date.now() + msLeftInWindow()
      ).toLocaleTimeString();

    showToast(
      'You reached the limit, please wait until ' +
      resetAt +
      ' to prompt again.'
    );

    return false;
  }

  return true;
}

async function handleRateLimited(res) {
  let retryAfterSec = parseInt(
    res.headers.get('Retry-After') || '',
    10
  );

  if (!Number.isFinite(retryAfterSec)) {
    try {
      const body =
        await res.clone().json();

      if (
        Number.isFinite(
          body.retryAfter
        )
      ) {
        retryAfterSec =
          body.retryAfter;
      }
    } catch {}
  }

  const waitMs =
    Number.isFinite(retryAfterSec)
      ? retryAfterSec * 1000
      : msLeftInWindow();

  showToast(
    'You reached the limit, please wait ' +
    formatWait(waitMs) +
    '.'
  );
}

function startPromptWindowWatcher() {
  clearInterval(
    screenShareLockTimer
  );

  screenShareLockTimer =
    setInterval(() => {
      const before =
        screenShareLocked;

      const count =
        getPromptCount();

      updateCounter();
      updateScreenShareButton();

      if (
        before &&
        count === 0
      ) {
        screenShareLocked = false;
      }
    }, 1000);
}

function switchLegalTab(tab) {
  document.getElementById(
    'legal-tos'
  ).style.display =
    tab === 'tos' ? '' : 'none';

  document.getElementById(
    'legal-pp'
  ).style.display =
    tab === 'pp' ? '' : 'none';

  document
    .querySelectorAll('.legal-tab')
    .forEach((el, i) => {
      el.classList.toggle(
        'active',
        (tab === 'tos' && i === 0) ||
        (tab === 'pp' && i === 1)
      );
    });
}

function agreeToLegal() {
  localStorage.setItem(
    LEGAL_KEY,
    '1'
  );

  document.getElementById(
    'legal-overlay'
  ).style.display = 'none';
}

function checkLegal() {
  const agreed =
    localStorage.getItem(LEGAL_KEY);

  document.getElementById(
    'legal-overlay'
  ).style.display =
    agreed ? 'none' : 'flex';
}

function getSession(id) {
  return sessions.find(
    s => s.id === id
  );
}

function saveSession(session) {
  const idx =
    sessions.findIndex(
      s => s.id === session.id
    );

  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }

  const lean = sessions.map(s => ({
    ...s,
    messages: s.messages.map(
      m => ({
        ...m,
        images: []
      })
    )
  }));

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(lean)
    );
  } catch (e) {
    if (sessions.length > 1) {
      sessions =
        sessions.slice(
          0,
          Math.floor(
            sessions.length / 2
          )
        );

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(sessions)
      );
    }
  }

  renderHistory();
}

function newChat() {
  currentSessionId =
    'sess_' + Date.now();

  const session = {
    id: currentSessionId,
    title: 'New conversation',
    messages: [],
    model: getModel(),
    systemPrompt: getSystemPrompt(),
    created: Date.now()
  };

  sessions.unshift(session);

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions)
  );

  renderHistory();
  renderMessages([]);

  document.getElementById(
    'chat-title'
  ).textContent =
    'New conversation';

  attachedImages = [];

  renderAttachPreview();
}

function loadSession(id) {
  currentSessionId = id;

  const session =
    getSession(id);

  if (!session) return;

  document.getElementById(
    'chat-title'
  ).textContent =
    session.title;

  const sel =
    document.getElementById(
      'model-select'
    );

  const savedModel =
    session.model ||
    localStorage.getItem(
      MODEL_KEY
    );

  if (savedModel) {
    const exists =
      Array.from(
        sel.options
      ).some(
        o => o.value === savedModel
      );

    if (exists) {
      sel.value = savedModel;

      localStorage.setItem(
        MODEL_KEY,
        savedModel
      );
    }
  }

  renderMessages(
    session.messages
  );

  renderHistory();
}

function deleteSession(id) {
  sessions =
    sessions.filter(
      s => s.id !== id
    );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions)
  );

  if (
    currentSessionId === id
  ) {
    newChat();
  } else {
    renderHistory();
  }
}

function clearHistory() {
  sessions = [];

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions)
  );

  newChat();
}

function getModel() {
  return document.getElementById(
    'model-select'
  ).value;
}

function getSystemPrompt() {
  return document.getElementById(
    'system-prompt'
  ).value.trim();
}

function renderHistory() {
  const wrap =
    document.getElementById(
      'history-wrap'
    );

  if (!sessions.length) {
    wrap.innerHTML =
      '<div style="padding:12px 10px;font-size:12px;color:var(--color);opacity:0.4">No history yet</div>';

    return;
  }

  wrap.innerHTML =
    sessions.map(session => {
      const badge =
        session.cardType
          ? '<span class="history-badge">' +
            (
              session.cardType ===
              'flashcard'
                ? '🃏'
                : '📝'
            ) +
            '</span>'
          : '';

      const activeClass =
        session.id ===
        currentSessionId
          ? ' active'
          : '';

      return `<div class="history-item${activeClass}" onclick="loadSession('${session.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="history-title">${escHtml(session.title)}</span>
        ${badge}
        <span class="history-del" onclick="event.stopPropagation();deleteSession('${session.id}')">✕</span>
      </div>`;
    }).join('');
}

function renderMessages(msgs) {
  const el =
    document.getElementById(
      'messages'
    );

  if (!msgs.length) {
    el.innerHTML =
      `<div id="empty-state">
        <div class="ehead">hey, i'm celestial AI.</div>
        <div class="esub">celestial AI can help with homework, studying, and more.</div>
        <div class="suggestion-chips">
          <span class="chip" onclick="sendSuggestion('explain quadratic equations simply')">Explain quadratic equations</span>
          <span class="chip" onclick="sendSuggestion('write a Python web scraper')">Write a Python scraper</span>
          <span class="chip" onclick="sendSuggestion('write an essay on the cold war simply')">Write an essay on the cold war</span>
          <span class="chip" onclick="sendSuggestion('how does photosynthesis happen?')">Explain photosynthesis</span>
        </div>
      </div>`;

    return;
  }

  el.innerHTML =
    msgs.map(
      m => buildMsgHTML(m)
    ).join('');

  el.scrollTop =
    el.scrollHeight;

  attachCodeCopyBtns(el);
}

function buildMsgHTML(msg) {
  const isUser =
    msg.role === 'user';

  const avatar =
    isUser
      ? '<div class="avatar user-av">U</div>'
      : '<div class="avatar ai-av">AI</div>';

  let body = '';

  if (isUser) {
    if (
      msg.images &&
      msg.images.length
    ) {
      body +=
        msg.images.map(
          src =>
            `<img class="img-preview" src="${src}" alt=""/>`
        ).join('');
    }

    body +=
      '<p>' +
      escHtml(msg.content) +
      '</p>';
  } else if (msg.cardData) {
    const isQuiz =
      msg.cardData[0] &&
      msg.cardData[0].answer !==
        undefined;

    const btnText =
      isQuiz
        ? 'Open Quiz'
        : 'Open Flashcards';

    const icon =
      isQuiz
        ? '📝'
        : '🃏';

    body =
      `<p>Done! ${icon}</p><button class="open-cards-btn" onclick="openCardsFromMsg('${msg.id}')">${btnText}</button>`;
  } else {
    body =
      marked.parse(
        applyMath(
          msg.content || ''
        )
      );
  }

  const timeStr =
    msg.ts
      ? new Date(
          msg.ts
        ).toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        )
      : '';

  const copyBtn =
    !isUser
      ? `<button class="msg-copy-btn" onclick="copyMsg(this)" data-text="${escHtml(msg.content || '')}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>`
      : '';

  return `<div class="msg-row ${msg.role}" id="msg-${msg.id}">
    ${isUser ? '' : avatar}
    <div>
      <div class="bubble">
        ${body}
      </div>
      <div class="bubble-meta">${timeStr}${copyBtn}</div>
    </div>
    ${isUser ? avatar : ''}
  </div>`;
}

function attachCodeCopyBtns(root) {
  root
    .querySelectorAll('pre code')
    .forEach(codeEl => {
      hljs.highlightElement(
        codeEl
      );

      const pre =
        codeEl.parentElement;

      if (
        pre.querySelector(
          '.code-copy-btn'
        )
      ) {
        return;
      }

      const btn =
        document.createElement(
          'button'
        );

      btn.className =
        'code-copy-btn';

      btn.textContent =
        'Copy';

      btn.onclick = () => {
        navigator.clipboard.writeText(
          codeEl.innerText
        );

        btn.textContent =
          'Copied!';

        setTimeout(
          () =>
            (btn.textContent =
              'Copy'),
          1500
        );
      };

      pre.style.position =
        'relative';

      pre.appendChild(btn);
    });
}

function appendMsg(msg) {
  const emptyState =
    document.getElementById(
      'empty-state'
    );

  const container =
    document.getElementById(
      'messages'
    );

  const typingRow =
    document.getElementById(
      'typing-row'
    );

  if (emptyState) {
    emptyState.remove();
  }

  if (typingRow) {
    typingRow.remove();
  }

  const wrapper =
    document.createElement(
      'div'
    );

  wrapper.innerHTML =
    buildMsgHTML(msg);

  const node =
    wrapper.firstElementChild;

  container.appendChild(node);

  container.scrollTop =
    container.scrollHeight;

  attachCodeCopyBtns(node);
}

function appendTyping() {
  const container =
    document.getElementById(
      'messages'
    );

  const row =
    document.createElement(
      'div'
    );

  row.className =
    'msg-row assistant';

  row.id =
    'typing-row';

  row.innerHTML =
    `<div class="avatar ai-av">AI</div>
    <div>
      <div class="bubble">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    </div>`;

  container.appendChild(row);

  container.scrollTop =
    container.scrollHeight;
}

function removeTyping() {
  const row =
    document.getElementById(
      'typing-row'
    );

  if (row) {
    row.remove();
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    );
}

function copyMsg(btn) {
  navigator.clipboard.writeText(
    btn.dataset.text
  );

  btn.textContent =
    'Copied!';

  setTimeout(() => {
    btn.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg> Copy`;
  }, 1500);
}

function autoResize(textarea) {
  textarea.style.height =
    'auto';

  textarea.style.height =
    Math.min(
      textarea.scrollHeight,
      100
    ) + 'px';

  document.getElementById(
    'send-btn'
  ).disabled =
    !textarea.value.trim() &&
    !attachedImages.length;
}

function handleKey(e) {
  if (
    e.key === 'Enter' &&
    !e.shiftKey
  ) {
    e.preventDefault();
    sendMessage();
  }
}

function sendSuggestion(text) {
  document.getElementById(
    'msg-input'
  ).value = text;

  sendMessage();
}

function showToast(msg) {
  const el =
    document.getElementById(
      'toast'
    );

  el.textContent = msg;
  el.style.opacity = '1';

  clearTimeout(
    el._timer
  );

  el._timer =
    setTimeout(
      () =>
        (el.style.opacity =
          '0'),
      2800
    );
}

function toggleSidebar() {
  document.getElementById(
    'sidebar'
  ).classList.toggle(
    'open'
  );
}

async function generateTitle(
  session,
  firstMsg
) {
  try {
    const res =
      await fetch(
        CHAT_API,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            model: getModel(),
            messages: [
              {
                role: 'user',
                content:
                  'Summarize this message in 4 words or less, no punctuation: "' +
                  firstMsg +
                  '"'
              }
            ],
            max_tokens: 20
          })
        }
      );

    if (res.status === 429) {
      session.title =
        firstMsg.slice(
          0,
          30
        );

      saveSession(
        session
      );

      document.getElementById(
        'chat-title'
      ).textContent =
        session.title;

      renderHistory();

      return;
    }

    const data =
      await res.json();

    const title =
      data.choices?.[0]
        ?.message
        ?.content ||
      data.content?.[0]
        ?.text ||
      firstMsg.slice(
        0,
        30
      );

    session.title =
      title.trim();
  } catch {
    session.title =
      firstMsg.slice(
        0,
        30
      );
  }

  saveSession(
    session
  );

  document.getElementById(
    'chat-title'
  ).textContent =
    session.title;

  renderHistory();
}

function parseCards(raw) {
  const match =
    raw.match(
      /\[[\s\S]*\]/
    );

  if (!match) {
    return null;
  }

  try {
    const arr =
      JSON.parse(
        match[0]
      );

    if (
      !Array.isArray(arr) ||
      !arr.length
    ) {
      return null;
    }

    return arr;
  } catch {
    return null;
  }
}

function openCardsFromMsg(msgId) {
  const session =
    getSession(
      currentSessionId
    );

  if (!session) return;

  const msg =
    session.messages.find(
      m => m.id === msgId
    );

  if (
    !msg ||
    !msg.cardData
  ) {
    return;
  }

  const isQuiz =
    msg.cardData[0] &&
    msg.cardData[0].answer !==
      undefined;

  isQuiz
    ? launchQuiz(
        msg.cardData,
        msgId,
        true
      )
    : launchFlashcards(
        msg.cardData,
        msgId
      );
}

function openCardsFromHistory() {
  const session =
    getSession(
      currentSessionId
    );

  if (
    !session ||
    !session.messages.length
  ) {
    showToast(
      'Ask me to make flashcards or a quiz first'
    );

    return;
  }

  const msg =
    [...session.messages]
      .reverse()
      .find(
        m =>
          m.role ===
            'assistant' &&
          m.cardData
      );

  if (!msg) {
    showToast(
      'No cards found in this chat'
    );

    return;
  }

  openCardsFromMsg(
    msg.id
  );
}

async function sendMessage() {
  const input =
    document.getElementById(
      'msg-input'
    );

  const text =
    input.value.trim();

  if (
    (!text &&
      !attachedImages.length) ||
    isStreaming
  ) {
    return;
  }

  if (
    getPromptCount() >=
    MAX_PROMPTS
  ) {
    showToast(
      'You reached the limit, please wait ' +
      formatWait(
        msLeftInWindow()
      ) +
      '.'
    );

    return;
  }

  const promptCost =
    attachedImages.length
      ? 5
      : 1;

  if (!currentSessionId) {
    newChat();
  }

  const session =
    getSession(
      currentSessionId
    );

  if (!session) return;

  const wantsQuiz =
    /\bquiz\b|test me|make.*quiz/i.test(
      text
    );

  const wantsFlashcard =
    /flashcard|flash card/i.test(
      text
    );

  if (wantsQuiz) {
    pendingQuizSubject =
      text;

    const hasContext =
      session.messages.length >
      2;

    const ctxBtn =
      document.getElementById(
        'quiz-context-btn'
      );

    ctxBtn.style.opacity =
      hasContext
        ? '1'
        : '0';

    ctxBtn.style.pointerEvents =
      hasContext
        ? 'auto'
        : 'none';

    document.getElementById(
      'quiz-type-overlay'
    ).classList.add(
      'open'
    );

    return;
  }

  const userMsg = {
    id: 'u_' + Date.now(),
    role: 'user',
    content: text,
    images: [
      ...attachedImages
    ],
    ts: Date.now()
  };

  session.messages.push(
    userMsg
  );

  if (
    session.title ===
      'New conversation' &&
    text
  ) {
    generateTitle(
      session,
      text
    );
  }

  saveSession(
    session
  );

  appendMsg(
    userMsg
  );

  input.value = '';
  input.style.height =
    'auto';

  attachedImages = [];

  renderAttachPreview();

  document.getElementById(
    'send-btn'
  ).disabled = true;

  appendTyping();

  isStreaming = true;

  usePrompts(
    wantsFlashcard
      ? 5
      : promptCost
  );

  const systemPromptText =
    getSystemPrompt();

  const apiMessages = [];

  if (wantsFlashcard) {
    const isTemplate =
      /template/i.test(
        text
      );

    apiMessages.push({
      role: 'system',
      content:
        isTemplate
          ? 'Respond ONLY with a valid JSON array of flashcard objects with "q" and "a" keys. Create a template with 3 example cards showing the format. No markdown, no backticks, no explanation. Start directly with [.'
          : 'Respond ONLY with a valid JSON array of flashcard objects. Each must have "q" (question) and "a" (answer) as strings. No other text, no markdown, no backticks. Start directly with [.'
    });
  } else if (
    systemPromptText
  ) {
    apiMessages.push({
      role: 'system',
      content:
        systemPromptText
    });
  }

  session.messages
    .slice(0, -1)
    .forEach(m => {
      if (!m.cardData) {
        apiMessages.push({
          role: m.role,
          content: m.content
        });
      }
    });

  const msgContent =
    userMsg.images.length
      ? [
          ...userMsg.images.map(
            src => ({
              type:
                'image_url',
              image_url: {
                url: src
              }
            })
          ),
          {
            type: 'text',
            text:
              text ||
              'What is in this image?'
          }
        ]
      : text;

  apiMessages.push({
    role: 'user',
    content: msgContent
  });

  const aiMsgId =
    'a_' + Date.now();

  try {
    const res =
      await fetch(
        CHAT_API,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            model: getModel(),
            messages:
              apiMessages,
            temperature:
              0.8,
            max_tokens:
              2048
          })
        }
      );

    removeTyping();

    if (
      res.status ===
      429
    ) {
      await handleRateLimited(
        res
      );

      isStreaming = false;

      document.getElementById(
        'send-btn'
      ).disabled = false;

      return;
    }

    if (!res.ok) {
      throw new Error(
        'API error ' +
          res.status
      );
    }

    const data =
      await res.json();

    const content =
      data.choices?.[0]
        ?.message
        ?.content ||
      data.content?.[0]
        ?.text ||
      JSON.stringify(
        data
      );

    if (wantsFlashcard) {
      const cards =
        parseCards(
          content
        );

      if (cards) {
        const aiMsg = {
          id: aiMsgId,
          role: 'assistant',
          content:
            '<p>Flashcards made, proposing..</p>',
          cardData:
            cards,
          cardType:
            'flashcard',
          ts: Date.now()
        };

        session.messages.push(
          aiMsg
        );

        session.cardType =
          'flashcard';

        saveSession(
          session
        );

        appendMsg(
          aiMsg
        );

        launchFlashcards(
          cards,
          aiMsgId
        );
      } else {
        const errMsg = {
          id: aiMsgId,
          role: 'assistant',
          content:
            'Sorry, I had trouble generating the cards. Please try again.',
          ts: Date.now()
        };

        session.messages.push(
          errMsg
        );

        saveSession(
          session
        );

        appendMsg(
          errMsg
        );
      }
    } else {
      const aiMsg = {
        id: aiMsgId,
        role: 'assistant',
        content,
        ts: Date.now()
      };

      session.messages.push(
        aiMsg
      );

      saveSession(
        session
      );

      appendMsg(
        aiMsg
      );
    }
  } catch (err) {
    removeTyping();

    const errMsg = {
      id: aiMsgId,
      role: 'assistant',
      content:
        '**Error:** ' +
        err.message,
      ts: Date.now()
    };

    const s =
      getSession(
        currentSessionId
      );

    if (s) {
      s.messages.push(
        errMsg
      );

      saveSession(
        s
      );
    }

    appendMsg(
      errMsg
    );
  } finally {
    isStreaming = false;

    document.getElementById(
      'send-btn'
    ).disabled = false;
  }
}

function cancelQuizType() {
  document.getElementById(
    'quiz-type-overlay'
  ).classList.remove(
    'open'
  );

  pendingQuizSubject =
    '';
}

async function pickQuizType(
  type
) {
  document.getElementById(
    'quiz-type-overlay'
  ).classList.remove(
    'open'
  );

  const session =
    getSession(
      currentSessionId
    );

  if (!session) return;

  usePrompts(5);

  const QUIZ_SYSTEM =
    'Respond ONLY with a valid JSON array. Each item must have exactly: "q" (question string), "options" (array of exactly 4 strings), "answer" (integer index 0-3 of correct option). No other text, no markdown, no backticks. Start directly with [.]';

  const isCustom =
    type === 'custom';

  let userContent =
    '';

  if (type === 'context') {
    userContent =
      'Generate a 15-question quiz about: ' +
      pendingQuizSubject;
  } else if (
    type === 'chat'
  ) {
    const history =
      session.messages
        .filter(
          m => !m.cardData
        )
        .slice(-10)
        .map(
          m =>
            m.role +
            ': ' +
            m.content
        )
        .join('\n');

    userContent =
      'Generate a 15-question quiz based on this conversation:\n' +
      history;
  } else if (
    type === 'custom'
  ) {
    const customText =
      document.getElementById(
        'quiz-type-custom-input'
      ).value.trim();

    if (!customText) {
      showToast(
        'Please describe your quiz first'
      );

      document.getElementById(
        'quiz-type-overlay'
      ).classList.add(
        'open'
      );

      return;
    }

    userContent =
      customText;
  }

  const userMsg = {
    id: 'u_' + Date.now(),
    role: 'user',
    content:
      pendingQuizSubject,
    images: [],
    ts: Date.now()
  };

  session.messages.push(
    userMsg
  );

  if (
    session.title ===
    'New conversation'
  ) {
    generateTitle(
      session,
      pendingQuizSubject
    );
  }

  saveSession(
    session
  );

  appendMsg(
    userMsg
  );

  appendTyping();

  isStreaming = true;

  const aiMsgId =
    'a_' + Date.now();

  try {
    const res =
      await fetch(
        CHAT_API,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            model: getModel(),
            messages: [
              {
                role: 'system',
                content:
                  QUIZ_SYSTEM
              },
              {
                role: 'user',
                content:
                  userContent
              }
            ],
            temperature:
              0.8,
            max_tokens:
              2048
          })
        }
      );

    removeTyping();

    if (
      res.status ===
      429
    ) {
      await handleRateLimited(
        res
      );

      isStreaming = false;

      document.getElementById(
        'send-btn'
      ).disabled = false;

      pendingQuizSubject =
        '';

      return;
    }

    if (!res.ok) {
      throw new Error(
        'API error ' +
          res.status
      );
    }

    const data =
      await res.json();

    const content =
      data.choices?.[0]
        ?.message
        ?.content ||
      data.content?.[0]
        ?.text ||
      '';

    const cards =
      parseCards(
        content
      );

    if (cards) {
      const aiMsg = {
        id: aiMsgId,
        role: 'assistant',
        content:
          '<p>Quiz made! Proposing..</p>',
        cardData:
          cards,
        cardType:
          'quiz',
        ts: Date.now()
      };

      session.messages.push(
        aiMsg
      );

      session.cardType =
        'quiz';

      saveSession(
        session
      );

      appendMsg(
        aiMsg
      );

      launchQuiz(
        cards,
        aiMsgId,
        isCustom
      );
    } else {
      const errMsg = {
        id: aiMsgId,
        role: 'assistant',
        content:
          'Sorry, I had trouble generating the quiz. Please try again.',
        ts: Date.now()
      };

      session.messages.push(
        errMsg
      );

      saveSession(
        session
      );

      appendMsg(
        errMsg
      );
    }
  } catch (err) {
    removeTyping();

    appendMsg({
      id: aiMsgId,
      role: 'assistant',
      content:
        '**Error:** ' +
        err.message,
      ts: Date.now()
    });
  } finally {
    isStreaming = false;

    document.getElementById(
      'send-btn'
    ).disabled = false;

    pendingQuizSubject =
      '';
  }
}

function handleFiles(files) {
  Array.from(files).forEach(
    file => {
      if (
        !file.type.startsWith(
          'image/'
        )
      ) {
        return;
      }

      const reader =
        new FileReader();

      reader.onload =
        e => {
          attachedImages.push(
            e.target.result
          );

          renderAttachPreview();

          document.getElementById(
            'send-btn'
          ).disabled = false;
        };

      reader.readAsDataURL(
        file
      );
    }
  );
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();

  const hasImage =
    Array.from(
      e.dataTransfer.items
    ).some(
      i =>
        i.kind ===
          'file' &&
        i.type.startsWith(
          'image/'
        )
    );

  if (hasImage) {
    e.dataTransfer.dropEffect =
      'copy';

    document.getElementById(
      'drop-overlay'
    ).classList.add(
      'active'
    );
  }
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();

  if (
    !e.currentTarget.contains(
      e.relatedTarget
    )
  ) {
    document.getElementById(
      'drop-overlay'
    ).classList.remove(
      'active'
    );
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  document.getElementById(
    'drop-overlay'
  ).classList.remove(
    'active'
  );

  const images =
    Array.from(
      e.dataTransfer.files
    ).filter(
      f =>
        f.type.startsWith(
          'image/'
        )
    );

  if (images.length) {
    handleFiles(
      images
    );
  }
}

function renderAttachPreview() {
  document.getElementById(
    'attach-preview'
  ).innerHTML =
    attachedImages.map(
      (src, i) =>
        `<div class="attach-thumb">
          <img src="${src}" alt=""/>
          <button class="rm-attach" onclick="removeAttach(${i})">×</button>
        </div>`
    ).join('');
}

function removeAttach(idx) {
  attachedImages.splice(
    idx,
    1
  );

  renderAttachPreview();

  const isEmpty =
    !document.getElementById(
      'msg-input'
    ).value.trim();

  if (
    !attachedImages.length &&
    isEmpty
  ) {
    document.getElementById(
      'send-btn'
    ).disabled = true;
  }
}

function launchFlashcards(
  cards,
  msgId
) {
  flashcards = [
    ...cards
  ];

  currentFcMsgId =
    msgId || null;

  fcIndex = 0;
  fcFlipped = false;

  renderFCCard();

  document.getElementById(
    'flashcard-overlay'
  ).classList.add(
    'open'
  );
}

function renderFCCard() {
  const card =
    flashcards[fcIndex];

  document.getElementById(
    'fc-front'
  ).textContent =
    card.q;

  document.getElementById(
    'fc-back'
  ).textContent =
    card.a;

  document.getElementById(
    'fc-progress'
  ).textContent =
    fcIndex +
    1 +
    ' / ' +
    flashcards.length;

  document.getElementById(
    'fc-prev'
  ).disabled =
    fcIndex === 0;

  document.getElementById(
    'fc-next'
  ).disabled =
    fcIndex ===
    flashcards.length - 1;

  document.getElementById(
    'fc-edit-q'
  ).value =
    card.q;

  document.getElementById(
    'fc-edit-a'
  ).value =
    card.a;

  document.getElementById(
    'fc-card-inner'
  ).classList.remove(
    'flipped'
  );

  fcFlipped = false;

  const answerInput =
    document.getElementById(
      'fc-edit-a'
    );

  const toggleBtn =
    document.getElementById(
      'fc-toggle-answer-btn'
    );

  if (
    answerInput &&
    toggleBtn
  ) {
    answerInput.style.display =
      'none';

    toggleBtn.textContent =
      'Show Answer';
  }
}

function fcToggleAnswer() {
  const answerInput =
    document.getElementById(
      'fc-edit-a'
    );

  const toggleBtn =
    document.getElementById(
      'fc-toggle-answer-btn'
    );

  if (
    !answerInput ||
    !toggleBtn
  ) {
    return;
  }

  const isHidden =
    answerInput.style.display ===
    'none';

  answerInput.style.display =
    isHidden ? '' : 'none';

  toggleBtn.textContent =
    isHidden
      ? 'Hide Answer'
      : 'Show Answer';
}

function flipCard() {
  fcFlipped =
    !fcFlipped;

  document.getElementById(
    'fc-card-inner'
  ).classList.toggle(
    'flipped',
    fcFlipped
  );
}

function fcNav(dir) {
  fcIndex =
    Math.max(
      0,
      Math.min(
        flashcards.length - 1,
        fcIndex + dir
      )
    );

  renderFCCard();
}

function fcSaveEdit() {
  const q =
    document.getElementById(
      'fc-edit-q'
    ).value.trim();

  const a =
    document.getElementById(
      'fc-edit-a'
    ).value.trim();

  if (!q || !a) {
    showToast(
      'Both fields required'
    );

    return;
  }

  flashcards[fcIndex] = {
    q,
    a
  };

  renderFCCard();
  persistCardEdit();

  showToast(
    'Saved!'
  );
}

function fcAddCard() {
  flashcards.push({
    q: 'New Question',
    a: 'New Answer'
  });

  fcIndex =
    flashcards.length - 1;

  renderFCCard();
  persistCardEdit();
}

function fcDeleteCard() {
  if (
    flashcards.length <= 1
  ) {
    showToast(
      'Cannot delete last card'
    );

    return;
  }

  flashcards.splice(
    fcIndex,
    1
  );

  fcIndex =
    Math.max(
      0,
      fcIndex - 1
    );

  renderFCCard();
  persistCardEdit();
}

function persistCardEdit() {
  if (!currentFcMsgId) {
    return;
  }

  const session =
    getSession(
      currentSessionId
    );

  if (!session) {
    return;
  }

  const msg =
    session.messages.find(
      m =>
        m.id ===
        currentFcMsgId
    );

  if (msg) {
    msg.cardData = [
      ...flashcards
    ];
  }

  saveSession(
    session
  );
}

function closeFlashcards() {
  document.getElementById(
    'flashcard-overlay'
  ).classList.remove(
    'open'
  );
}

function launchQuiz(
  questions,
  msgId,
  editable
) {
  quizQuestions = [
    ...questions
  ];

  currentQuizMsgId =
    msgId || null;

  quizEditable =
    !!editable;

  quizIndex = 0;
  quizScore = 0;
  quizAnswered = false;

  document.getElementById(
    'quiz-customize-bar'
  ).style.display =
    quizEditable
      ? 'flex'
      : 'none';

  document.getElementById(
    'quiz-result'
  ).style.display =
    'none';

  document.getElementById(
    'quiz-question'
  ).style.display =
    '';

  document.getElementById(
    'quiz-options'
  ).style.display =
    '';

  document.getElementById(
    'quiz-feedback'
  ).style.display =
    '';

  document.getElementById(
    'quiz-next-btn'
  ).style.display =
    'none';

  renderQuizQuestion();

  document.getElementById(
    'quiz-overlay'
  ).classList.add(
    'open'
  );
}

function renderQuizQuestion() {
  const q =
    quizQuestions[
      quizIndex
    ];

  document.getElementById(
    'quiz-progress'
  ).textContent =
    'Question ' +
    (quizIndex + 1) +
    ' / ' +
    quizQuestions.length;

  document.getElementById(
    'quiz-score-display'
  ).textContent =
    'Score: ' +
    quizScore;

  document.getElementById(
    'quiz-question'
  ).textContent =
    q.q;

  document.getElementById(
    'quiz-feedback'
  ).textContent =
    '';

  document.getElementById(
    'quiz-next-btn'
  ).style.display =
    'none';

  if (quizEditable) {
    document.getElementById(
      'quiz-edit-q'
    ).value =
      q.q;
  }

  quizAnswered =
    false;

  document.getElementById(
    'quiz-options'
  ).innerHTML =
    q.options
      .map(
        (opt, i) =>
          `<button class="quiz-option" onclick="answerQuiz(${i})">${escHtml(opt)}</button>`
      )
      .join('');
}

function answerQuiz(chosen) {
  if (quizAnswered) {
    return;
  }

  quizAnswered =
    true;

  const q =
    quizQuestions[
      quizIndex
    ];

  const correct =
    parseInt(
      q.answer,
      10
    );

  const btns =
    document.querySelectorAll(
      '.quiz-option'
    );

  btns.forEach(
    b =>
      (b.disabled =
        true)
  );

  if (
    chosen ===
    correct
  ) {
    btns[
      chosen
    ].classList.add(
      'correct'
    );

    document.getElementById(
      'quiz-feedback'
    ).textContent =
      '✓ Correct!';

    quizScore++;
  } else {
    btns[
      chosen
    ].classList.add(
      'wrong'
    );

    btns[
      correct
    ].classList.add(
      'correct'
    );

    document.getElementById(
      'quiz-feedback'
    ).textContent =
      '✗ Correct answer: ' +
      q.options[
        correct
      ];
  }

  document.getElementById(
    'quiz-score-display'
  ).textContent =
    'Score: ' +
    quizScore;

  const nextBtn =
    document.getElementById(
      'quiz-next-btn'
    );

  nextBtn.style.display =
    'block';

  nextBtn.textContent =
    quizIndex ===
    quizQuestions.length - 1
      ? 'See Results'
      : 'Next →';
}

function quizNext() {
  quizIndex++;

  if (
    quizIndex >=
    quizQuestions.length
  ) {
    document.getElementById(
      'quiz-question'
    ).style.display =
      'none';

    document.getElementById(
      'quiz-options'
    ).style.display =
      'none';

    document.getElementById(
      'quiz-feedback'
    ).style.display =
      'none';

    document.getElementById(
      'quiz-next-btn'
    ).style.display =
      'none';

    const pct =
      Math.round(
        quizScore /
          quizQuestions.length *
          100
      );

    document.getElementById(
      'quiz-final-score'
    ).textContent =
      quizScore +
      ' / ' +
      quizQuestions.length;

    document.getElementById(
      'quiz-final-label'
    ).textContent =
      pct >= 80
        ? 'Great job! 🎉'
        : pct >= 50
          ? 'Good effort!'
          : 'Keep practicing!';

    document.getElementById(
      'quiz-result'
    ).style.display =
      'flex';
  } else {
    renderQuizQuestion();
  }
}

function quizRestart() {
  quizIndex = 0;
  quizScore = 0;
  quizAnswered = false;

  document.getElementById(
    'quiz-result'
  ).style.display =
    'none';

  document.getElementById(
    'quiz-question'
  ).style.display =
    '';

  document.getElementById(
    'quiz-options'
  ).style.display =
    '';

  document.getElementById(
    'quiz-feedback'
  ).style.display =
    '';

  renderQuizQuestion();
}

function quizSaveEdit() {
  if (!quizEditable) {
    return;
  }

  const q =
    document.getElementById(
      'quiz-edit-q'
    ).value.trim();

  if (!q) {
    showToast(
      'Question required'
    );

    return;
  }

  quizQuestions[
    quizIndex
  ].q = q;

  renderQuizQuestion();
  persistQuizEdit();

  showToast(
    'Saved!'
  );
}

function quizDeleteQ() {
  if (!quizEditable) {
    return;
  }

  if (
    quizQuestions.length <=
    1
  ) {
    showToast(
      'Cannot delete last question'
    );

    return;
  }

  quizQuestions.splice(
    quizIndex,
    1
  );

  quizIndex =
    Math.max(
      0,
      quizIndex - 1
    );

  renderQuizQuestion();
  persistQuizEdit();
}

function quizAddQ() {
  if (!quizEditable) {
    return;
  }

  quizQuestions.push({
    q: 'New Question',
    options: [
      'Option A',
      'Option B',
      'Option C',
      'Option D'
    ],
    answer: 0
  });

  quizIndex =
    quizQuestions.length - 1;

  renderQuizQuestion();
  persistQuizEdit();
}

function persistQuizEdit() {
  if (!currentQuizMsgId) {
    return;
  }

  const session =
    getSession(
      currentSessionId
    );

  if (!session) {
    return;
  }

  const msg =
    session.messages.find(
      m =>
        m.id ===
        currentQuizMsgId
    );

  if (msg) {
    msg.cardData = [
      ...quizQuestions
    ];
  }

  saveSession(
    session
  );
}

function closeQuiz() {
  document.getElementById(
    'quiz-overlay'
  ).classList.remove(
    'open'
  );
}

async function toggleScreenShare() {
  if (
    !screenStream &&
    getPromptCount() >=
      MAX_PROMPTS
  ) {
    updateScreenShareButton();

    showToast(
      'Screen share is locked until your 3 hour prompt window resets.'
    );

    return;
  }

  screenStream
    ? stopScreenShare(
        false
      )
    : await startScreenShare();
}

async function startScreenShare() {
  if (
    getPromptCount() >=
    MAX_PROMPTS
  ) {
    updateScreenShareButton();

    showToast(
      'Screen share is locked until your 3 hour prompt window resets.'
    );

    return;
  }

  try {
    screenStream =
      await navigator.mediaDevices.getDisplayMedia(
        {
          video: true
        }
      );

    screenVideo =
      document.createElement(
        'video'
      );

    screenVideo.srcObject =
      screenStream;

    screenVideo.play();

    screenCanvas =
      document.createElement(
        'canvas'
      );

    screenVideo.addEventListener(
      'loadedmetadata',
      () => {
        screenCanvas.width =
          screenVideo.videoWidth;

        screenCanvas.height =
          screenVideo.videoHeight;
      }
    );

    screenStream
      .getVideoTracks()[0]
      .addEventListener(
        'ended',
        () =>
          stopScreenShare(
            false
          )
      );

    openSsWindow();

    document.getElementById(
      'ss-toggle-btn'
    ).classList.add(
      'active'
    );
  } catch {
    showToast(
      'Screen share cancelled'
    );
  }
}

async function openSsWindow() {
  if (
    !(
      'documentPictureInPicture' in
      window
    )
  ) {
    const w = 480;
    const h = 170;

    const left =
      Math.max(
        0,
        screen.availWidth -
          w -
          20
      );

    const top =
      Math.max(
        0,
        screen.availHeight -
          h -
          60
      );

    ssPopupWin =
      window.open(
        '',
        'ss_win',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`
      );

    if (!ssPopupWin) {
      showToast(
        'Allow popups to use screen share'
      );

      return;
    }

    buildSsUI(
      ssPopupWin
    );

    setTimeout(() => {
      screenInterval =
        setInterval(() => {
          if (
            ssPopupWin &&
            ssPopupWin.closed
          ) {
            stopScreenShare(
              false
            );

            return;
          }

          if (
            screenCanvas &&
            screenVideo.readyState >=
              2 &&
            screenCanvas.width >
              0
          ) {
            screenCanvas
              .getContext(
                '2d'
              )
              .drawImage(
                screenVideo,
                0,
                0,
                screenCanvas.width,
                screenCanvas.height
              );
          }
        }, 200);
    }, 500);

    return;
  }

  const pipWin =
    await window
      .documentPictureInPicture
      .requestWindow({
        width: 480,
        height: 170
      });

  ssPopupWin =
    pipWin;

  buildSsUI(
    pipWin
  );

  pipWin.addEventListener(
    'pagehide',
    () =>
      stopScreenShare(
        false
      )
  );

  screenInterval =
    setInterval(() => {
      if (
        screenCanvas &&
        screenVideo.readyState >=
          2 &&
        screenCanvas.width >
          0
      ) {
        screenCanvas
          .getContext(
            '2d'
          )
          .drawImage(
            screenVideo,
            0,
            0,
            screenCanvas.width,
            screenCanvas.height
          );
      }
    }, 200);
}

function buildSsUI(win) {
  win.document.head.innerHTML = `
    <meta charset="UTF-8"/>
    <link rel="preconnect" href="https://fonts.googleapis.com"/>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      :root {
        --bg: #0e0e0f;
        --surface: #161618;
        --border: rgba(255,255,255,0.08);
        --border-bright: rgba(255,255,255,0.18);
        --text: #e8e8e8;
        --muted: rgba(255,255,255,0.35);
        --accent: #e05c5c;
        --accent-dim: rgba(224,92,92,0.12);
        --user-bg: rgba(255,255,255,0.06);
        --ai-bg: #161618;
        --font-mono: 'IBM Plex Mono', monospace;
        --font-sans: 'IBM Plex Sans', sans-serif;
      }

      html,
      body {
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: var(--font-sans);
        font-size: 13px;
        overflow: hidden;
      }

      #app {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }

      #bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }

      #dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: lightgreen;
        animation: pulse 1.6s ease-in-out infinite;
        flex-shrink: 0;
      }

      @keyframes pulse {
        0%,100% {
          opacity: 1;
          box-shadow: 0 0 0 0 rgba(224,92,92,0.4);
        }

        50% {
          opacity: 0.5;
          box-shadow: 0 0 0 4px rgba(224,92,92,0);
        }
      }

      #bar-label {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 500;
        color: var(--muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        flex: 1;
      }

      #stop {
        background: var(--accent-dim);
        border: 1px solid var(--accent);
        color: var(--accent);
        border-radius: 5px;
        padding: 4px 11px;
        font-size: 11px;
        font-family: var(--font-mono);
        cursor: pointer;
        transition: background 0.15s;
      }

      #stop:hover {
        background: rgba(224,92,92,0.22);
      }

      #preview {
        flex: 0 0 190px;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-bottom: 1px solid var(--border);
      }

      #preview-placeholder {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.05em;
      }

      #ss-canvas {
        max-width: 100%;
        max-height: 100%;
        display: none;
      }

      #chat-area {
        flex: 1;
        overflow-y: auto;
        padding: 2px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
      }

      #bottom {
        padding: 4px 14px;
        border-top: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
        background: var(--surface);
      }

      #chat-area::-webkit-scrollbar {
        width: 3px;
      }

      #chat-area::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 2px;
      }

      .ss-msg {
        padding: 9px 12px;
        border-radius: 7px;
        font-size: 13px;
        line-height: 1.55;
        max-width: 88%;
        animation: fadeUp 0.18s ease;
      }

      @keyframes fadeUp {
        from {
          opacity: 0;
          transform: translateY(4px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .ss-msg.user {
        background: var(--user-bg);
        border: 1px solid var(--border-bright);
        align-self: flex-end;
      }

      .ss-msg.ai {
        background: var(--ai-bg);
        border: 1px solid var(--border);
        align-self: flex-start;
      }

      .ss-msg h1,
      .ss-msg h2,
      .ss-msg h3 {
        font-weight: 600;
        line-height: 1.25;
        margin: .7em 0 .35em;
      }

      .ss-msg h1 {
        font-size: 1.35em;
      }

      .ss-msg h2 {
        font-size: 1.15em;
      }

      .ss-msg h3 {
        font-size: 1em;
      }

      .ss-msg h4,
      .ss-msg h5,
      .ss-msg h6 {
        font-size: 1em;
        font-weight: 400;
        margin: 0;
      }

      .math-frac {
        display: inline-flex;
        flex-direction: column;
        vertical-align: middle;
        text-align: center;
        line-height: 1.05;
        margin: 0 2px;
        font-size: .95em;
      }

      .math-frac > span:first-child {
        border-bottom: 1px solid currentColor;
        padding: 0 3px 2px;
      }

      .math-frac > span:last-child {
        padding: 2px 3px 0;
      }

      .math-box {
        display: inline-block;
        border: 1px solid currentColor;
        padding: 0 4px;
        border-radius: 2px;
      }

      .math-sqrt {
        display: inline-flex;
        align-items: flex-start;
        vertical-align: middle;
        margin: 0 1px;
      }

      .math-radical {
        font-size: 1.15em;
        line-height: 1;
      }

      .math-radicand {
        border-top: 1px solid currentColor;
        padding: 1px 2px 0;
        line-height: 1.05;
      }

      .math-overline {
        display: inline-block;
        border-top: 1px solid currentColor;
        padding: 1px 1px 0;
        line-height: 1;
      }

      .math-ray,
      .math-line {
        display: inline-flex;
        align-items: flex-end;
        vertical-align: middle;
        margin: 0 2px;
      }

      .math-arrow-line {
        border-top: 1px solid currentColor;
        padding: 1px 1px 0;
        line-height: 1;
      }

      .math-arrow-head {
        line-height: .8;
        margin-left: -2px;
      }

      .math-arrow-head.left {
        margin-left: 0;
        margin-right: -2px;
      }

      .math-angle {
        white-space: nowrap;
      }

      .ss-msg sup,
      .ss-msg sub {
        line-height: 0;
        font-size: .75em;
      }

      #prompt-lock {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.86);
        padding: 24px;
      }

      #prompt-lock-card {
        width: 100%;
        max-width: 330px;
        padding: 24px;
        border: 1px solid var(--border-bright);
        border-radius: 10px;
        background: var(--surface);
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,.45);
      }

      #prompt-lock-title {
        font-size: 17px;
        font-weight: 600;
        margin-bottom: 9px;
      }

      #prompt-lock-text {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
        font-family: var(--font-mono);
      }

      #inp {
        width: 100%;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border-bright);
        color: var(--text);
        border-radius: 6px;
        padding: 9px 12px;
        font-size: 13px;
        font-family: var(--font-sans);
        outline: none;
        transition: border-color 0.15s;
      }

      #inp:focus {
        border-color: rgba(255,255,255,0.35);
      }

      #inp::placeholder {
        color: var(--muted);
      }

      #row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      #msel {
        flex: 1;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border-bright);
        color: var(--text);
        border-radius: 5px;
        padding: 5px 8px;
        font-size: 11px;
        font-family: var(--font-mono);
        cursor: pointer;
        outline: none;
      }

      #hint {
        font-size: 11px;
        font-family: var(--font-mono);
        color: var(--muted);
        white-space: nowrap;
        letter-spacing: 0.03em;
      }

      #preview-toggle {
        background: rgba(255,255,255,0.06);
        border: 1px solid var(--border-bright);
        color: var(--muted);
        border-radius: 5px;
        padding: 4px 11px;
        font-size: 11px;
        font-family: var(--font-mono);
        cursor: pointer;
        transition: background 0.15s;
      }

      #preview-toggle:hover {
        background: rgba(255,255,255,0.12);
      }
    </style>`;

  win.document.body.innerHTML = `
    <div id="app">
      <div id="bar">
        <div id="dot"></div>
        <button id="preview-toggle">show preview</button>
        <button id="stop">stop sharing</button>
      </div>

      <div id="preview" style="display:none">
        <span id="preview-placeholder">waiting for stream...</span>
        <canvas id="ss-canvas" width="1" height="1"></canvas>
      </div>

      <div id="chat-area"></div>

      <div id="bottom">
        <input
          id="inp"
          type="text"
          placeholder="Ask about what's on your screen..."
          autocomplete="off"
        />

        <div id="row">
          <select id="msel"></select>
          <div id="hint">uses 7 tokens per msg</div>
        </div>
      </div>

      <div id="prompt-lock" style="display:none">
        <div id="prompt-lock-card">
          <div id="prompt-lock-title">
            YOU RAN OUT OF PROMPTS!
          </div>

          <div id="prompt-lock-text">
            closing in 5 seconds...
          </div>
        </div>
      </div>
    </div>`;

  const msel =
    win.document.getElementById(
      'msel'
    );

  const mainSel =
    document.getElementById(
      'model-select'
    );

  Array.from(
    mainSel.options
  ).forEach(o => {
    const opt =
      win.document.createElement(
        'option'
      );

    opt.value =
      o.value;

    opt.textContent =
      o.textContent;

    msel.appendChild(
      opt
    );
  });

  msel.value =
    mainSel.value;

  const pipCanvas =
    win.document.getElementById(
      'ss-canvas'
    );

  const placeholder =
    win.document.getElementById(
      'preview-placeholder'
    );

  function drawFrame() {
    if (
      !screenVideo ||
      screenVideo.readyState <
        2 ||
      screenVideo.videoWidth ===
        0
    ) {
      win.requestAnimationFrame(
        drawFrame
      );

      return;
    }

    if (
      pipCanvas.width !==
      screenVideo.videoWidth
    ) {
      pipCanvas.width =
        screenVideo.videoWidth;

      pipCanvas.height =
        screenVideo.videoHeight;
    }

    pipCanvas
      .getContext('2d')
      .drawImage(
        screenVideo,
        0,
        0,
        pipCanvas.width,
        pipCanvas.height
      );

    if (
      pipCanvas.style.display !==
      'block'
    ) {
      pipCanvas.style.display =
        'block';

      placeholder.style.display =
        'none';
    }

    win.requestAnimationFrame(
      drawFrame
    );
  }

  win.requestAnimationFrame(
    drawFrame
  );

  const preview =
    win.document.getElementById(
      'preview'
    );

  const previewToggle =
    win.document.getElementById(
      'preview-toggle'
    );

  previewToggle.addEventListener(
    'click',
    () => {
      const shown =
        preview.style.display !==
        'none';

      preview.style.display =
        shown
          ? 'none'
          : '';

      previewToggle.textContent =
        shown
          ? 'show preview'
          : 'hide preview';

      win.resizeTo(
        400,
        400
      );
    }
  );

  win.document
    .getElementById(
      'stop'
    )
    .addEventListener(
      'click',
      () => {
        stopScreenShare(
          true
        );

        if (
          window.documentPictureInPicture
            ?.window
        ) {
          window
            .documentPictureInPicture
            .window
            .close();
        }
      }
    );

  const inp =
    win.document.getElementById(
      'inp'
    );

  inp.focus();

  const chatArea =
    win.document.getElementById(
      'chat-area'
    );

  const promptLock =
    win.document.getElementById(
      'prompt-lock'
    );

  function renderSsMessage(
    text
  ) {
    return marked.parse(
      applyMath(
        text || ''
      )
    );
  }

  function addMsg(
    text,
    role
  ) {
    const d =
      win.document.createElement(
        'div'
      );

    d.className =
      'ss-msg ' +
      role;

    d.innerHTML =
      renderSsMessage(
        text
      );

    chatArea.appendChild(
      d
    );

    chatArea.scrollTop =
      chatArea.scrollHeight;

    return d;
  }

  function showSsPromptLock() {
    promptLock.style.display =
      'flex';

    inp.disabled =
      true;

    const timerText =
      win.document.getElementById(
        'prompt-lock-text'
      );

    let seconds = 5;

    timerText.textContent =
      'closing in ' +
      seconds +
      ' seconds...';

    clearInterval(
      win.__promptLockTimer
    );

    win.__promptLockTimer =
      setInterval(
        () => {
          seconds--;

          if (
            seconds <=
            0
          ) {
            clearInterval(
              win.__promptLockTimer
            );

            if (
              !win.closed
            ) {
              win.close();
            }

            return;
          }

          timerText.textContent =
            'closing in ' +
            seconds +
            ' seconds...';
        },
        1000
      );
  }

  inp.addEventListener(
    'keydown',
    e => {
      if (
        e.key !==
        'Enter'
      ) {
        return;
      }

      const t =
        inp.value.trim();

      if (!t) {
        return;
      }

      if (
        getPromptCount() +
          7 >
        MAX_PROMPTS
      ) {
        showSsPromptLock();
        updateScreenShareButton();
        return;
      }

      inp.value = '';

      addMsg(
        t,
        'user'
      );

      const typing =
        addMsg(
          '...',
          'ai'
        );

      if (
        !usePrompts(
          7
        )
      ) {
        showSsPromptLock();
        return;
      }

      sendScreenQuestion(
        t,
        msel.value,
        reply => {
          typing.innerHTML =
            renderSsMessage(
              reply
            );

          chatArea.scrollTop =
            chatArea.scrollHeight;
        }
      );
    }
  );
}

function stopScreenShare(
  closePopup
) {
  if (screenStream) {
    screenStream
      .getTracks()
      .forEach(
        t =>
          t.stop()
      );

    screenStream =
      null;
  }

  clearInterval(
    screenInterval
  );

  screenCanvas =
    null;

  if (
    !closePopup &&
    ssPopupWin &&
    !ssPopupWin.closed
  ) {
    ssPopupWin.close();
  }

  ssPopupWin =
    null;

  document.getElementById(
    'ss-toggle-btn'
  ).classList.remove(
    'active'
  );

  updateScreenShareButton();
}

async function sendScreenQuestion(
  text,
  model,
  callback
) {
  if (
    !text ||
    !screenVideo ||
    screenVideo.readyState <
      2
  ) {
    return;
  }

  const tmpCanvas =
    document.createElement(
      'canvas'
    );

  tmpCanvas.width =
    screenVideo.videoWidth;

  tmpCanvas.height =
    screenVideo.videoHeight;

  tmpCanvas
    .getContext('2d')
    .drawImage(
      screenVideo,
      0,
      0
    );

  const imageData =
    tmpCanvas.toDataURL(
      'image/jpeg',
      0.7
    );

  if (!currentSessionId) {
    newChat();
  }

  const session =
    getSession(
      currentSessionId
    );

  if (!session) {
    return;
  }

  const userMsg = {
    id: 'u_' + Date.now(),
    role: 'user',
    content:
      '[Screen] ' +
      text,
    images: [
      imageData
    ],
    ts: Date.now()
  };

  session.messages.push(
    userMsg
  );

  saveSession(
    session
  );

  appendMsg(
    userMsg
  );

  appendTyping();

  isStreaming =
    true;

  const aiMsgId =
    'a_' + Date.now();

  try {
    const res =
      await fetch(
        SS_API,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            model:
              model ||
              getModel(),

            messages: [
              {
                role: 'user',
                content: [
                  {
                    type:
                      'image_url',
                    image_url: {
                      url:
                        imageData
                    }
                  },
                  {
                    type: 'text',
                    text
                  }
                ]
              }
            ],

            max_tokens:
              1024
          })
        }
      );

    removeTyping();

    if (
      res.status ===
      429
    ) {
      await handleRateLimited(
        res
      );

      const errText =
        'Rate limited — try again shortly.';

      appendMsg({
        id: aiMsgId,
        role:
          'assistant',
        content:
          '**' +
          errText +
          '**',
        ts:
          Date.now()
      });

      if (callback) {
        callback(
          errText
        );
      }

      isStreaming =
        false;

      document.getElementById(
        'send-btn'
      ).disabled =
        false;

      return;
    }

    if (!res.ok) {
      throw new Error(
        'API error ' +
        res.status
      );
    }

    const data =
      await res.json();

    const content =
      data.choices?.[0]
        ?.message
        ?.content ||
      data.content?.[0]
        ?.text ||
      JSON.stringify(
        data
      );

    const aiMsg = {
      id: aiMsgId,
      role:
        'assistant',
      content,
      ts:
        Date.now()
    };

    session.messages.push(
      aiMsg
    );

    saveSession(
      session
    );

    appendMsg(
      aiMsg
    );

    if (callback) {
      callback(
        content
      );
    }

    if (
      getPromptCount() >=
        MAX_PROMPTS &&
      ssPopupWin &&
      !ssPopupWin.closed
    ) {
      const lock =
        ssPopupWin.document.getElementById(
          'prompt-lock'
        );

      const input =
        ssPopupWin.document.getElementById(
          'inp'
        );

      if (
        lock &&
        input
      ) {
        lock.style.display =
          'flex';

        input.disabled =
          true;

        let seconds = 5;

        const timerText =
          ssPopupWin.document.getElementById(
            'prompt-lock-text'
          );

        timerText.textContent =
          'closing in ' +
          seconds +
          ' seconds...';

        clearInterval(
          ssPopupWin.__promptLockTimer
        );

        ssPopupWin.__promptLockTimer =
          setInterval(
            () => {
              seconds--;

              if (
                seconds <=
                0
              ) {
                clearInterval(
                  ssPopupWin.__promptLockTimer
                );

                if (
                  !ssPopupWin.closed
                ) {
                  ssPopupWin.close();
                }

                return;
              }

              timerText.textContent =
                'closing in ' +
                seconds +
                ' seconds...';
            },
            1000
          );
      }
    }
  } catch (err) {
    removeTyping();

    const errText =
      'Error: ' +
      err.message;

    appendMsg({
      id: aiMsgId,
      role:
        'assistant',
      content:
        '**' +
        errText +
        '**',
      ts:
        Date.now()
    });

    if (callback) {
      callback(
        errText
      );
    }
  } finally {
    isStreaming =
      false;

    document.getElementById(
      'send-btn'
    ).disabled =
      false;
  }
}

(function initModelPersistence() {
  const sel =
    document.getElementById(
      'model-select'
    );

  if (!sel) {
    return;
  }

  const saved =
    localStorage.getItem(
      MODEL_KEY
    );

  if (saved) {
    const exists =
      Array.from(
        sel.options
      ).some(
        o =>
          o.value ===
          saved
      );

    if (exists) {
      sel.value =
        saved;
    }
  }

  sel.addEventListener(
    'change',
    function () {
      localStorage.setItem(
        MODEL_KEY,
        this.value
      );

      if (
        currentSessionId
      ) {
        const session =
          getSession(
            currentSessionId
          );

        if (session) {
          session.model =
            this.value;

          saveSession(
            session
          );
        }
      }
    }
  );
})();

document.getElementById(
  'msg-input'
).addEventListener(
  'input',
  function () {
    document.getElementById(
      'send-btn'
    ).disabled =
      !this.value.trim() &&
      !attachedImages.length;
  }
);

checkLegal();
updateCounter();
updateScreenShareButton();
startPromptWindowWatcher();
renderHistory();

if (sessions.length) {
  loadSession(
    sessions[0].id
  );
} else {
  newChat();
}

const dropZone =
  document.getElementById(
    'chat-container'
  ) ||
  document.body;

dropZone.addEventListener(
  'dragover',
  handleDragOver
);

dropZone.addEventListener(
  'dragleave',
  handleDragLeave
);

dropZone.addEventListener(
  'drop',
  handleDrop
);