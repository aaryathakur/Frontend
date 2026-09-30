/**
 * =========================================================
 *  GEMINI AI CLONE — Express Backend Server
 * =========================================================
 *  This server acts as a secure proxy between the browser
 *  and the Google Gemini API.
 *
 *  Why a backend proxy?
 *  ─────────────────────
 *  If you called the Gemini API directly from the browser,
 *  your API key would be exposed in the JavaScript source
 *  — visible to anyone using DevTools. By routing all API
 *  calls through this Express server, the key stays safely
 *  in the .env file and never reaches the client.
 *
 *  Endpoints:
 *  ─────────────────────
 *  POST /api/chat        → Proxy a chat request to Gemini
 *  GET  /api/health      → Health-check (server status)
 *  GET  *                → Serve the frontend (index.html)
 *
 *  Usage:
 *  ─────────────────────
 *  npm install
 *  # Set your key in .env:  GEMINI_API_KEY=AIza...
 *  npm run dev            ← development (auto-restart)
 *  npm start              ← production
 * =========================================================
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// ── ESM __dirname shim ──────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuration ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ── Startup Guard ───────────────────────────────────────────
if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error('\n❌  ERROR: Gemini API key is missing or not set!');
    console.error('   Open the .env file and set:  GEMINI_API_KEY=AIza...\n');
    console.error('   Get your free key at: https://aistudio.google.com/app/apikey\n');
    // Don't exit — let the server run so the frontend can show the error message
}

// ── Express App Setup ───────────────────────────────────────
const app = express();

// Parse incoming JSON bodies (up to 2MB — safe for long conversations)
app.use(express.json({ limit: '2mb' }));

// CORS: allow requests from localhost during development
// In production, lock this down to your actual domain
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? false                          // same-origin only
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
}));

// Serve everything in public/ as static files (HTML, CSS, JS, assets)
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──────────────────────────────────────────────

/**
 * GET /api/health
 * Simple health-check used by the frontend to confirm the server is up.
 */
app.get('/api/health', (req, res) => {
    const keyConfigured = Boolean(GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE');
    res.json({
        status: 'ok',
        model: GEMINI_MODEL,
        keyConfigured,
        timestamp: new Date().toISOString(),
    });
});

/**
 * POST /api/chat
 *
 * Receives the full conversation history from the browser,
 * forwards it to the Gemini API (with the key added server-side),
 * and returns only the response text to the client.
 *
 * Request body:
 *   {
 *     contents: [
 *       { role: "user",  parts: [{ text: "Hello!" }] },
 *       { role: "model", parts: [{ text: "Hi there!" }] },
 *       ...
 *     ]
 *   }
 *
 * Success response:
 *   { reply: "The AI's response text" }
 *
 * Error response:
 *   { error: "Human-readable error message" }
 */
app.post('/api/chat', async (req, res) => {
    // ── Input validation ──────────────────────────────────
    const { contents } = req.body;

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ error: 'Request body must include a non-empty "contents" array.' });
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        return res.status(500).json({
            error: '⚠️ Server: Gemini API key is not configured. Edit the .env file on the server.'
        });
    }

    // ── Forward to Gemini ─────────────────────────────────
    try {
        const geminiResponse = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                },
            }),
        });

        const data = await geminiResponse.json();

        if (!geminiResponse.ok) {
            // Surface Gemini's own error message
            const apiError = data?.error?.message || `Gemini API error (HTTP ${geminiResponse.status})`;
            console.error('[Gemini API Error]', apiError);
            return res.status(geminiResponse.status).json({ error: apiError });
        }

        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!replyText) {
            console.error('[Gemini] Empty response body:', JSON.stringify(data));
            return res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
        }

        // Only return the text — the API key and raw Gemini response stay server-side
        return res.json({ reply: replyText });

    } catch (err) {
        console.error('[Server Error]', err);
        return res.status(503).json({
            error: 'Could not reach the Gemini API. Check your internet connection and try again.'
        });
    }
});

// ── Catch-all: serve index.html for any other route ────────
// (supports client-side routing if added later)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('\n──────────────────────────────────────────');
    console.log(`  ✦  Gemini AI Clone`);
    console.log(`  🚀  Server running at: http://localhost:${PORT}`);
    console.log(`  🔑  API key loaded:   ${GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' ? '✅ Yes' : '❌ No — edit .env!'}`);
    console.log('──────────────────────────────────────────\n');
});
