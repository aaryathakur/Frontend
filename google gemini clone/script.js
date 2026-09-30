/**
 * =========================================================
 *  GEMINI AI CHATBOT — Main Application Logic
 * =========================================================
 *  Features:
 *    • Multi-turn conversation with full chat history
 *    • Typing/streaming effect for AI responses
 *    • Animated loading indicator while fetching
 *    • Markdown + code syntax highlighting (via marked + hljs)
 *    • Copy-to-clipboard for messages & code blocks
 *    • Light / Dark theme toggle (persisted in localStorage)
 *    • Chat history persisted in localStorage
 *    • Friendly error messages on API failure
 *    • Textarea auto-resize as user types
 *    • Keyboard shortcut: Enter to send, Shift+Enter for newline
 * =========================================================
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Google Gemini API endpoint.
 * Uses gemini-2.0-flash for fast, high-quality responses.
 * The GOOGLE_API_KEY is loaded from GOOGLE_API_KEY.js (loaded before this file).
 */
const API_REQUEST_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`;

// Local storage keys
const STORAGE_KEY_CHATS = "gemini-chat-history";   // saved conversations
const STORAGE_KEY_THEME = "gemini-theme";           // "light" or "dark"
const STORAGE_KEY_HISTORY = "gemini-api-history";    // multi-turn API history

// ─── DOM References ────────────────────────────────────────────────────────────

const messageForm = document.getElementById("messageForm");
const promptInput = document.getElementById("promptInput");
const chatHistoryContainer = document.getElementById("chatContainer");
const themeToggleButton = document.getElementById("themeToggler");
const clearChatButton = document.getElementById("deleteButton");
const newChatButton = document.getElementById("newChatButton");

// ─── Application State ─────────────────────────────────────────────────────────

let currentUserMessage = null;   // the message being sent right now
let isGeneratingResponse = false;  // lock to prevent double-sends

/**
 * Multi-turn API chat history array.
 * Each entry is: { role: "user"|"model", parts: [{ text: "..." }] }
 * This is sent with every API request so Gemini remembers context.
 */
let apiConversationHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];

// ─── Initialization ────────────────────────────────────────────────────────────

/**
 * Restore theme & saved chat messages from localStorage on page load.
 */
const initializeApp = () => {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    const isLight = savedTheme === "light";

    document.body.classList.toggle("light_mode", isLight);
    themeToggleButton.innerHTML = isLight
        ? `<i class="bx bx-moon"></i>`
        : `<i class="bx bx-sun"></i>`;

    restoreChatHistory();
};

// ─── Chat History (Saved to localStorage) ─────────────────────────────────────

/**
 * Restore previously saved chat bubbles from localStorage.
 * Skips the typing animation — shows content immediately.
 */
const restoreChatHistory = () => {
    const savedChats = JSON.parse(localStorage.getItem(STORAGE_KEY_CHATS)) || [];

    chatHistoryContainer.innerHTML = "";

    savedChats.forEach(({ userMessage, botResponse }) => {
        // User bubble
        chatHistoryContainer.appendChild(
            buildMessageElement(buildUserBubbleHTML(userMessage), "message--outgoing")
        );

        // Bot bubble (no typing animation)
        const botEl = buildMessageElement(buildBotBubbleHTML(), "message--incoming");
        chatHistoryContainer.appendChild(botEl);
        renderBotResponse(botResponse, botEl.querySelector(".message__text"), botEl, true);
    });

    // Hide welcome header if there are existing chats
    document.body.classList.toggle("hide-header", savedChats.length > 0);
};

/**
 * Append one conversation entry to localStorage.
 * @param {string} userMessage  - what the user typed
 * @param {string} botResponse  - raw text response from the API
 */
const saveChatToStorage = (userMessage, botResponse) => {
    const savedChats = JSON.parse(localStorage.getItem(STORAGE_KEY_CHATS)) || [];
    savedChats.push({ userMessage, botResponse });
    localStorage.setItem(STORAGE_KEY_CHATS, JSON.stringify(savedChats));
};

/**
 * Persist the multi-turn API history so conversations survive page refresh.
 */
const saveApiHistory = () => {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(apiConversationHistory));
};

// ─── DOM Builders ──────────────────────────────────────────────────────────────

/**
 * Create a chat message wrapper <div> element.
 * @param {string}    htmlContent - inner HTML for the bubble
 * @param {...string} cssClasses  - additional CSS classes (e.g. "message--outgoing")
 * @returns {HTMLDivElement}
 */
const buildMessageElement = (htmlContent, ...cssClasses) => {
    const el = document.createElement("div");
    el.classList.add("message", ...cssClasses);
    el.innerHTML = htmlContent;
    return el;
};

/**
 * HTML template for a user's outgoing message bubble.
 * @param {string} text - the user's message text
 */
const buildUserBubbleHTML = (text) => `
    <div class="message__content">
        <img class="message__avatar" src="assets/profile.png" alt="Your avatar">
        <p class="message__text">${escapeHTML(text)}</p>
    </div>
`;

/**
 * HTML template for an incoming bot message bubble (starts empty).
 */
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
    <button onclick="copyMessageToClipboard(this)" class="message__icon hide" title="Copy response" aria-label="Copy response">
        <i class='bx bx-copy-alt'></i>
    </button>
`;

/**
 * Escape HTML special characters to prevent XSS when injecting user text.
 * @param {string} text
 * @returns {string}
 */
const escapeHTML = (text) => {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
};

// ─── Response Rendering ────────────────────────────────────────────────────────

/**
 * Display the bot response in the message element.
 * If skipAnimation is false, renders a smooth word-by-word typing effect.
 *
 * @param {string}      rawText              - plain text from the API
 * @param {HTMLElement} messageTextElement   - the <p> to fill
 * @param {HTMLElement} incomingMsgEl        - the parent message wrapper
 * @param {boolean}     skipAnimation        - true when restoring from localStorage
 */
const renderBotResponse = (rawText, messageTextElement, incomingMsgEl, skipAnimation = false) => {
    const parsedHTML = marked.parse(rawText);
    const copyIconBtn = incomingMsgEl.querySelector(".message__icon");
    copyIconBtn.classList.add("hide");

    if (skipAnimation) {
        messageTextElement.innerHTML = parsedHTML;
        applySyntaxHighlighting();
        addCopyButtonToCodeBlocks();
        copyIconBtn.classList.remove("hide");
        isGeneratingResponse = false;
        return;
    }

    // Word-by-word typing effect
    const words = rawText.split(" ");
    let wordIndex = 0;

    const typingInterval = setInterval(() => {
        messageTextElement.textContent +=
            (wordIndex === 0 ? "" : " ") + words[wordIndex++];

        // Auto-scroll to bottom during typing
        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;

        if (wordIndex === words.length) {
            clearInterval(typingInterval);
            // Swap plain text for full rendered HTML
            messageTextElement.innerHTML = parsedHTML;
            applySyntaxHighlighting();
            addCopyButtonToCodeBlocks();
            copyIconBtn.classList.remove("hide");
            isGeneratingResponse = false;
        }
    }, 40); // speed in ms per word — lower = faster
};

// ─── API Communication ─────────────────────────────────────────────────────────

/**
 * Sends the user's message to the Gemini API and fills the bot bubble.
 * Maintains a rolling multi-turn conversation via apiConversationHistory.
 *
 * @param {HTMLElement} incomingMsgEl - the loading bot message element
 */
const fetchGeminiResponse = async (incomingMsgEl) => {
    const messageTextElement = incomingMsgEl.querySelector(".message__text");

    // Guard: API key must be configured
    if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        showError(
            messageTextElement,
            incomingMsgEl,
            "⚠️ No API key found. Open GOOGLE_API_KEY.js and paste your Gemini API key. Get one free at https://aistudio.google.com/app/apikey"
        );
        return;
    }

    // Add the user's message to the rolling history
    apiConversationHistory.push({
        role: "user",
        parts: [{ text: currentUserMessage }]
    });

    try {
        const response = await fetch(API_REQUEST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // Send the complete conversation history for multi-turn context
                contents: apiConversationHistory,
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Surface the API's own error message if available
            throw new Error(data?.error?.message || `HTTP error ${response.status}`);
        }

        const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!botText) throw new Error("Received an empty response from Gemini. Please try again.");

        // Add model reply to history (keeps context for next turn)
        apiConversationHistory.push({
            role: "model",
            parts: [{ text: botText }]
        });
        saveApiHistory();

        // Persist and render
        saveChatToStorage(currentUserMessage, botText);
        renderBotResponse(botText, messageTextElement, incomingMsgEl);

    } catch (error) {
        // Remove last user message from history if request failed
        apiConversationHistory.pop();
        showError(messageTextElement, incomingMsgEl, `❌ ${error.message}`);
    } finally {
        // Always remove the loading animation class
        incomingMsgEl.classList.remove("message--loading");
    }
};

/**
 * Display a styled error message inside the bot bubble.
 */
const showError = (messageTextEl, incomingMsgEl, errorText) => {
    isGeneratingResponse = false;
    messageTextEl.innerHTML = `<span class="error-text">${escapeHTML(errorText)}</span>`;
    incomingMsgEl.classList.add("message--error");
    incomingMsgEl.classList.remove("message--loading");
};

// ─── Loading Indicator ─────────────────────────────────────────────────────────

/**
 * Append a loading bot bubble and kick off the API fetch.
 */
const showLoadingAndFetch = () => {
    const loadingEl = buildMessageElement(buildBotBubbleHTML(), "message--incoming", "message--loading");
    chatHistoryContainer.appendChild(loadingEl);
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;

    fetchGeminiResponse(loadingEl);
};

// ─── Sending a Message ─────────────────────────────────────────────────────────

/**
 * Handle outgoing user message:
 * 1. Capture and validate input
 * 2. Render user bubble immediately
 * 3. Clear input and hide header
 * 4. After short delay, show loading + fetch AI response
 */
const handleOutgoingMessage = () => {
    const inputText = promptInput.value.trim();
    currentUserMessage = inputText || currentUserMessage;

    if (!currentUserMessage || isGeneratingResponse) return;

    isGeneratingResponse = true;

    // Build and append user bubble
    const userBubble = buildMessageElement(
        buildUserBubbleHTML(currentUserMessage),
        "message--outgoing"
    );
    chatHistoryContainer.appendChild(userBubble);

    // Reset textarea
    promptInput.value = "";
    promptInput.style.height = "auto";
    messageForm.reset();

    // Hide welcome header, show loading after brief delay
    document.body.classList.add("hide-header");
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    setTimeout(showLoadingAndFetch, 400);
};

// ─── Code Block Enhancements ───────────────────────────────────────────────────

/**
 * Run Highlight.js on all <pre><code> blocks in the document.
 */
const applySyntaxHighlighting = () => {
    document.querySelectorAll("pre code").forEach(block => {
        hljs.highlightElement(block);
    });
};

/**
 * Inject language label + copy button into every code block that doesn't already have one.
 */
const addCopyButtonToCodeBlocks = () => {
    document.querySelectorAll("pre").forEach(preEl => {
        // Avoid duplicating if already added
        if (preEl.querySelector(".code__copy-btn")) return;

        const codeEl = preEl.querySelector("code");
        if (!codeEl) return;

        // Language label
        const langClass = [...codeEl.classList].find(c => c.startsWith("language-"));
        const langName = langClass ? langClass.replace("language-", "") : "code";

        const label = document.createElement("div");
        label.className = "code__language-label";
        label.textContent = langName.charAt(0).toUpperCase() + langName.slice(1);
        preEl.appendChild(label);

        // Copy button
        const copyBtn = document.createElement("button");
        copyBtn.innerHTML = `<i class='bx bx-copy'></i>`;
        copyBtn.className = "code__copy-btn";
        copyBtn.title = "Copy code";
        copyBtn.setAttribute("aria-label", "Copy code block");
        preEl.appendChild(copyBtn);

        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(codeEl.innerText)
                .then(() => {
                    copyBtn.innerHTML = `<i class='bx bx-check'></i>`;
                    setTimeout(() => (copyBtn.innerHTML = `<i class='bx bx-copy'></i>`), 2000);
                })
                .catch(() => alert("Unable to copy code."));
        });
    });
};

// ─── Copy Full Message ─────────────────────────────────────────────────────────

/**
 * Copy the full rendered text of a bot message to the clipboard.
 * Called via the inline onclick on the copy icon button.
 * @param {HTMLElement} iconBtn - the clicked copy icon button
 */
window.copyMessageToClipboard = (iconBtn) => {
    const messageText = iconBtn.parentElement.querySelector(".message__text")?.innerText || "";
    navigator.clipboard.writeText(messageText)
        .then(() => {
            iconBtn.innerHTML = `<i class='bx bx-check'></i>`;
            setTimeout(() => (iconBtn.innerHTML = `<i class='bx bx-copy-alt'></i>`), 2000);
        })
        .catch(() => alert("Unable to copy message."));
};

// ─── Event Listeners ───────────────────────────────────────────────────────────

/** Submit form → send message */
messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleOutgoingMessage();
});

/** Shift+Enter = newline in textarea, plain Enter = send */
promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleOutgoingMessage();
    }
});

/** Auto-resize textarea as user types */
promptInput.addEventListener("input", () => {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
});

/** Theme toggle */
themeToggleButton.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light_mode");
    localStorage.setItem(STORAGE_KEY_THEME, isLight ? "light" : "dark");
    themeToggleButton.innerHTML = isLight
        ? `<i class="bx bx-moon"></i>`
        : `<i class="bx bx-sun"></i>`;
});

/** Clear chat history */
clearChatButton.addEventListener("click", () => {
    if (!confirm("Clear all chat history? This cannot be undone.")) return;

    localStorage.removeItem(STORAGE_KEY_CHATS);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    apiConversationHistory = [];
    currentUserMessage = null;
    isGeneratingResponse = false;

    restoreChatHistory();
});

/** New chat button — same as clearing but no confirmation needed if empty */
newChatButton.addEventListener("click", () => {
    if (chatHistoryContainer.children.length === 0) return;
    if (!confirm("Start a new chat? Your current conversation will be cleared.")) return;

    localStorage.removeItem(STORAGE_KEY_CHATS);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    apiConversationHistory = [];
    currentUserMessage = null;
    isGeneratingResponse = false;

    restoreChatHistory();
});

/** Suggestion cards — clicking them pre-fills & sends the message */
document.querySelectorAll(".suggests__item").forEach(card => {
    card.addEventListener("click", () => {
        currentUserMessage = card.querySelector(".suggests__item-text").innerText.trim();
        handleOutgoingMessage();
    });

    // Allow keyboard (Enter/Space) activation for accessibility
    card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            card.click();
        }
    });
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

initializeApp();