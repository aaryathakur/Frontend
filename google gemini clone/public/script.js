/**
 * =========================================================
 *  GEMINI AI CHATBOT — Frontend Application Logic
 * =========================================================
 *  This script runs in the browser.
 *
 *  KEY DIFFERENCE from a direct-API approach:
 *  ────────────────────────────────────────────
 *  Instead of calling the Gemini API directly (which would
 *  expose the API key in source code), all requests go to
 *  our Express backend at /api/chat.
 *
 *  The server adds the API key and forwards to Gemini.
 *  The browser never sees the key. ✅
 *
 *  Features:
 *  ────────────────────────────────────────────
 *  • Multi-turn conversation (full history sent each turn)
 *  • Word-by-word typing animation for AI responses
 *  • Animated shimmer loading indicator
 *  • Markdown + syntax highlighted code blocks
 *  • Copy-to-clipboard for messages and code blocks
 *  • Light / Dark theme toggle (persisted in localStorage)
 *  • Chat persisted in localStorage across page refreshes
 *  • Textarea auto-resize + Enter to send, Shift+Enter = newline
 * =========================================================
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Our Express backend endpoint — the API key is added by the server.
 * Using a relative URL means this works on any host/port automatically.
 */
const BACKEND_CHAT_URL = '/api/chat';

// LocalStorage keys
const STORAGE_CHATS = 'gemini-chat-history';    // persisted chat bubbles
const STORAGE_THEME = 'gemini-theme';            // "light" or "dark"
const STORAGE_HISTORY = 'gemini-api-history';      // multi-turn API history

// ─── DOM References ────────────────────────────────────────────────────────────

const messageForm = document.getElementById('messageForm');
const promptInput = document.getElementById('promptInput');
const chatHistoryContainer = document.getElementById('chatContainer');
const themeToggleButton = document.getElementById('themeToggler');
const clearChatButton = document.getElementById('deleteButton');
const newChatButton = document.getElementById('newChatButton');

// ─── Application State ─────────────────────────────────────────────────────────

let currentUserMessage = null;   // latest message being processed
let isGeneratingResponse = false;  // prevents double-sends during generation

/**
 * Rolling multi-turn conversation history.
 * Format: [{ role: "user"|"model", parts: [{ text: "..." }] }, ...]
 * Sent to the backend on every request to maintain conversation context.
 */
let apiConversationHistory = JSON.parse(localStorage.getItem(STORAGE_HISTORY)) || [];

// ─── Initialization ────────────────────────────────────────────────────────────

const initializeApp = () => {
    // Restore theme preference
    const isLight = localStorage.getItem(STORAGE_THEME) === 'light';
    document.body.classList.toggle('light_mode', isLight);
    themeToggleButton.innerHTML = isLight
        ? `<i class="bx bx-moon"></i>`
        : `<i class="bx bx-sun"></i>`;

    // Restore previous chat session
    restoreChatHistory();
};

// ─── Chat History ──────────────────────────────────────────────────────────────

/**
 * Re-render all previously saved chat bubbles from localStorage.
 * Uses skipAnimation=true so content appears instantly (no re-typing).
 */
const restoreChatHistory = () => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_CHATS)) || [];
    chatHistoryContainer.innerHTML = '';

    saved.forEach(({ userMessage, botResponse }) => {
        chatHistoryContainer.appendChild(
            buildMessageElement(buildUserBubbleHTML(userMessage), 'message--outgoing')
        );
        const botEl = buildMessageElement(buildBotBubbleHTML(), 'message--incoming');
        chatHistoryContainer.appendChild(botEl);
        renderBotResponse(botResponse, botEl.querySelector('.message__text'), botEl, true);
    });

    document.body.classList.toggle('hide-header', saved.length > 0);
};

/** Persist a completed conversation turn to localStorage. */
const saveChatToStorage = (userMessage, botResponse) => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_CHATS)) || [];
    saved.push({ userMessage, botResponse });
    localStorage.setItem(STORAGE_CHATS, JSON.stringify(saved));
};

/** Persist the multi-turn API history (survives page refresh). */
const saveApiHistory = () =>
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(apiConversationHistory));

// ─── DOM Builders ──────────────────────────────────────────────────────────────

const buildMessageElement = (htmlContent, ...cssClasses) => {
    const el = document.createElement('div');
    el.classList.add('message', ...cssClasses);
    el.innerHTML = htmlContent;
    return el;
};

const buildUserBubbleHTML = (text) => `
    <div class="message__content">
        <img class="message__avatar" src="assets/profile.png" alt="Your avatar">
        <p class="message__text">${escapeHTML(text)}</p>
    </div>
`;

const buildBotBubbleHTML = () => `
    <div class="message__content">
        <img class="message__avatar" src="assets/gemini.png" alt="Gemini avatar">
        <p class="message__text"></p>
        <div class="message__loading-indicator">
            <div class="message__loading-bar"></div>
            <div class="message__loading-bar"></div>
            <div class="message__loading-bar"></div>
        </div>
    </div>
    <button onclick="copyMessageToClipboard(this)" class="message__icon hide"
            title="Copy response" aria-label="Copy response">
        <i class='bx bx-copy-alt'></i>
    </button>
`;

/** Safely escape user input to prevent XSS. */
const escapeHTML = (text) => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
};

// ─── Response Rendering ────────────────────────────────────────────────────────

/**
 * Render the AI reply into the bot bubble.
 *
 * @param {string}      rawText          - plain text from the server
 * @param {HTMLElement} messageTextEl    - the <p class="message__text"> to fill
 * @param {HTMLElement} incomingMsgEl    - the parent .message wrapper
 * @param {boolean}     skipAnimation    - true when restoring from localStorage
 */
const renderBotResponse = (rawText, messageTextEl, incomingMsgEl, skipAnimation = false) => {
    const parsedHTML = marked.parse(rawText);
    const copyIconBtn = incomingMsgEl.querySelector('.message__icon');
    copyIconBtn.classList.add('hide');

    if (skipAnimation) {
        messageTextEl.innerHTML = parsedHTML;
        applySyntaxHighlighting();
        addCopyButtonToCodeBlocks();
        copyIconBtn.classList.remove('hide');
        isGeneratingResponse = false;
        return;
    }

    // Word-by-word typing effect
    const words = rawText.split(' ');
    let wordIndex = 0;

    const typingInterval = setInterval(() => {
        messageTextEl.textContent += (wordIndex === 0 ? '' : ' ') + words[wordIndex++];
        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;

        if (wordIndex === words.length) {
            clearInterval(typingInterval);
            messageTextEl.innerHTML = parsedHTML;   // swap to full HTML
            applySyntaxHighlighting();
            addCopyButtonToCodeBlocks();
            copyIconBtn.classList.remove('hide');
            isGeneratingResponse = false;
        }
    }, 40); // ms per word — decrease for faster typing
};

// ─── Backend API Call ──────────────────────────────────────────────────────────

/**
 * POST to our Express /api/chat endpoint.
 * The server holds the API key and forwards the conversation to Gemini.
 *
 * @param {HTMLElement} incomingMsgEl - the loading placeholder bot bubble
 */
const fetchResponseFromServer = async (incomingMsgEl) => {
    const messageTextEl = incomingMsgEl.querySelector('.message__text');

    // Add the user's latest message to the rolling history
    apiConversationHistory.push({
        role: 'user',
        parts: [{ text: currentUserMessage }],
    });

    try {
        const response = await fetch(BACKEND_CHAT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Send the full conversation history for multi-turn context
                contents: apiConversationHistory,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Server error (HTTP ${response.status})`);
        }

        const replyText = data.reply;
        if (!replyText) throw new Error('Empty response from server. Please try again.');

        // Add the model's reply to history so future turns have full context
        apiConversationHistory.push({
            role: 'model',
            parts: [{ text: replyText }],
        });
        saveApiHistory();

        // Persist and render the reply
        saveChatToStorage(currentUserMessage, replyText);
        renderBotResponse(replyText, messageTextEl, incomingMsgEl);

    } catch (err) {
        // If request failed, remove the user message we just pushed
        // so the history stays accurate
        apiConversationHistory.pop();
        showError(messageTextEl, incomingMsgEl, `❌ ${err.message}`);
    } finally {
        incomingMsgEl.classList.remove('message--loading');
    }
};

// ─── Error Handling ────────────────────────────────────────────────────────────

const showError = (messageTextEl, incomingMsgEl, errorText) => {
    isGeneratingResponse = false;
    messageTextEl.innerHTML = `<span class="error-text">${escapeHTML(errorText)}</span>`;
    incomingMsgEl.classList.add('message--error');
    incomingMsgEl.classList.remove('message--loading');
};

// ─── Loading Indicator ─────────────────────────────────────────────────────────

/** Append the animated loading bubble and start the server request. */
const showLoadingAndFetch = () => {
    const loadingEl = buildMessageElement(
        buildBotBubbleHTML(), 'message--incoming', 'message--loading'
    );
    chatHistoryContainer.appendChild(loadingEl);
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    fetchResponseFromServer(loadingEl);
};

// ─── Outgoing Message ──────────────────────────────────────────────────────────

const handleOutgoingMessage = () => {
    const inputText = promptInput.value.trim();
    currentUserMessage = inputText || currentUserMessage;
    if (!currentUserMessage || isGeneratingResponse) return;

    isGeneratingResponse = true;

    // Render user bubble immediately
    chatHistoryContainer.appendChild(
        buildMessageElement(buildUserBubbleHTML(currentUserMessage), 'message--outgoing')
    );

    // Reset textarea
    promptInput.value = '';
    promptInput.style.height = 'auto';
    messageForm.reset();

    document.body.classList.add('hide-header');
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    setTimeout(showLoadingAndFetch, 400);
};

// ─── Code Block Enhancements ───────────────────────────────────────────────────

const applySyntaxHighlighting = () => {
    document.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
};

const addCopyButtonToCodeBlocks = () => {
    document.querySelectorAll('pre').forEach(preEl => {
        if (preEl.querySelector('.code__copy-btn')) return; // already added

        const codeEl = preEl.querySelector('code');
        if (!codeEl) return;

        const langClass = [...codeEl.classList].find(c => c.startsWith('language-'));
        const langName = langClass ? langClass.replace('language-', '') : 'code';

        const label = document.createElement('div');
        label.className = 'code__language-label';
        label.textContent = langName.charAt(0).toUpperCase() + langName.slice(1);
        preEl.appendChild(label);

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = `<i class='bx bx-copy'></i>`;
        copyBtn.className = 'code__copy-btn';
        copyBtn.title = 'Copy code';
        copyBtn.setAttribute('aria-label', 'Copy code block');
        preEl.appendChild(copyBtn);

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeEl.innerText)
                .then(() => {
                    copyBtn.innerHTML = `<i class='bx bx-check'></i>`;
                    setTimeout(() => (copyBtn.innerHTML = `<i class='bx bx-copy'></i>`), 2000);
                })
                .catch(() => alert('Unable to copy code.'));
        });
    });
};

// ─── Copy Full Message ─────────────────────────────────────────────────────────

window.copyMessageToClipboard = (iconBtn) => {
    const text = iconBtn.parentElement.querySelector('.message__text')?.innerText || '';
    navigator.clipboard.writeText(text)
        .then(() => {
            iconBtn.innerHTML = `<i class='bx bx-check'></i>`;
            setTimeout(() => (iconBtn.innerHTML = `<i class='bx bx-copy-alt'></i>`), 2000);
        })
        .catch(() => alert('Unable to copy message.'));
};

// ─── Event Listeners ───────────────────────────────────────────────────────────

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleOutgoingMessage();
});

// Enter = send | Shift+Enter = newline
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleOutgoingMessage();
    }
});

// Auto-resize textarea as user types
promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
});

themeToggleButton.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light_mode');
    localStorage.setItem(STORAGE_THEME, isLight ? 'light' : 'dark');
    themeToggleButton.innerHTML = isLight
        ? `<i class="bx bx-moon"></i>`
        : `<i class="bx bx-sun"></i>`;
});

clearChatButton.addEventListener('click', () => {
    if (!confirm('Clear all chat history? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_CHATS);
    localStorage.removeItem(STORAGE_HISTORY);
    apiConversationHistory = [];
    currentUserMessage = null;
    isGeneratingResponse = false;
    restoreChatHistory();
});

newChatButton.addEventListener('click', () => {
    if (chatHistoryContainer.children.length === 0) return;
    if (!confirm('Start a new chat? Your current conversation will be cleared.')) return;
    localStorage.removeItem(STORAGE_CHATS);
    localStorage.removeItem(STORAGE_HISTORY);
    apiConversationHistory = [];
    currentUserMessage = null;
    isGeneratingResponse = false;
    restoreChatHistory();
});

document.querySelectorAll('.suggests__item').forEach(card => {
    card.addEventListener('click', () => {
        currentUserMessage = card.querySelector('.suggests__item-text').innerText.trim();
        handleOutgoingMessage();
    });
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

initializeApp();
