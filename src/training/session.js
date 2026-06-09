const WebSocket = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const { getScriptedPrompt, getFreestylePrompt } = require('./prompts');
const { SessionTimer } = require('./timer');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// Regex to detect non-Latin script characters (Devanagari, Tamil, etc.)
const NON_LATIN_RE = /[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\s\d\p{P}]/u;

async function translateToEnglish(text) {
  try {
    const model = genAI.getGenerativeModel({ model: config.geminiTextModel });
    const result = await model.generateContent(
      `Translate the following text to English. Return ONLY the English translation, nothing else. Do not add quotes or explanations.\n\n${text}`,
    );
    return result.response.text().trim();
  } catch (err) {
    logger.warn('Translation failed, using original text:', err.message);
    return text;
  }
}

const GEMINI_LIVE_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const CONNECTION_TIMEOUT_MS = 10000;
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

class TrainingSession {
  /**
   * @param {WebSocket} browserWs - WebSocket connection to the browser client
   * @param {object} scenario - Scenario object from scenarios.js
   * @param {string} mode - 'scripted' or 'freestyle'
   */
  constructor(browserWs, scenario, mode = 'scripted') {
    this.browserWs = browserWs;
    this.scenario = scenario;
    this.mode = mode;
    this.geminiWs = null;
    this.transcript = [];
    this.audioChunks = [];      // Gemini (customer) audio at 24kHz
    this.agentAudioChunks = []; // Agent (human) audio at 16kHz
    this.audioTimeline = [];    // Ordered timeline: { role, data } for sequential WAV
    this.startTime = null;
    this.isConnected = false;
    this.isReady = false;
    this.greetingComplete = false;
    // Streaming transcript state
    this._currentRole = null;
    this._currentBuffer = '';

    // Build the system prompt based on mode
    this.systemPrompt = mode === 'freestyle'
      ? getFreestylePrompt(scenario.claimType)
      : getScriptedPrompt(scenario);

    // Timer setup
    this.timer = new SessionTimer(
      scenario.maxDurationSeconds || 180,
      (remainingSeconds) => {
        logger.info(`Time warning: ${remainingSeconds}s remaining`);
        this._sendToBrowser({ type: 'time_warning', remainingSeconds });
      },
      () => {
        logger.info('Session time expired');
        this._sendToBrowser({ type: 'time_expired' });
        this.end();
      },
    );
  }

  async start() {
    this.startTime = Date.now();

    const url = `${GEMINI_LIVE_BASE}?key=${config.geminiApiKey}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.geminiWs) {
          this.geminiWs.close();
          this.geminiWs = null;
        }
        reject(new Error('Gemini connection timed out'));
      }, CONNECTION_TIMEOUT_MS);

      let resolved = false;

      this.geminiWs = new WebSocket(url);

      this.geminiWs.on('open', () => {
        logger.info('Connected to Gemini Live API (training session)');
        this.isConnected = true;

        const setupMessage = {
          setup: {
            model: config.geminiLiveModel,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: GEMINI_VOICES[Math.floor(Math.random() * GEMINI_VOICES.length)],
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: this.systemPrompt }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                silenceDurationMs: 500,
              },
            },
          },
        };

        this.geminiWs.send(JSON.stringify(setupMessage));
        clearTimeout(timeout);
        resolved = true;
        resolve();
      });

      this.geminiWs.on('message', (data) => {
        this._handleGeminiMessage(data);
      });

      this.geminiWs.on('error', (err) => {
        logger.error('Gemini WebSocket error:', err.message);
        this._sendToBrowser({ type: 'error', message: 'Connection to AI service failed' });
        if (!resolved) {
          clearTimeout(timeout);
          reject(err);
        } else {
          this.end();
        }
      });

      this.geminiWs.on('close', (code, reason) => {
        logger.info(`Gemini WebSocket closed: ${code} ${reason}`);
        this.isConnected = false;
        this.isReady = false;
        this._sendToBrowser({ type: 'session_end' });
      });
    });
  }

  /**
   * Trigger the customer's opening statement.
   * In training mode, we prompt Gemini (the customer) to start the call.
   */
  sendInitialGreeting() {
    if (!this.isConnected || !this.geminiWs) return;

    const message = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: 'The phone is ringing and you just picked up. The claims agent has answered. Start the conversation as the customer — tell them why you are calling.' }],
          },
        ],
        turnComplete: true,
      },
    };

    this.geminiWs.send(JSON.stringify(message));
    logger.info('Sent initial greeting trigger to Gemini (customer opening)');
  }

  sendAudio(audioData) {
    if (!this.isReady || !this.geminiWs) return;
    if (!this.greetingComplete) return;

    this.agentAudioChunks.push(audioData);
    this.audioTimeline.push({ role: 'agent', data: audioData });

    const message = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: audioData,
        },
      },
    };

    this.geminiWs.send(JSON.stringify(message));
  }

  _handleGeminiMessage(rawData) {
    try {
      const msg = JSON.parse(rawData.toString());

      // Handle setup complete
      if (msg.setupComplete) {
        logger.info('Gemini training session setup complete');
        this.isReady = true;
        this._sendToBrowser({ type: 'ready' });
        return;
      }

      if (msg.serverContent) {
        const parts = msg.serverContent.modelTurn?.parts || [];

        for (const part of parts) {
          if (part.inlineData) {
            this.audioChunks.push(part.inlineData.data);
            this.audioTimeline.push({ role: 'customer', data: part.inlineData.data });
            this._sendToBrowser({
              type: 'audio',
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
            });
          }
        }

        // Stream customer (Gemini output) transcription chunks live
        if (msg.serverContent.outputTranscription?.text) {
          const chunk = msg.serverContent.outputTranscription.text;
          if (this._currentRole !== 'customer') {
            this._finalizeCurrentMessage();
            this._currentRole = 'customer';
            this._currentBuffer = '';
          }
          this._currentBuffer += chunk;
          const elapsed = this.getDurationSeconds();
          const ts = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
          this._sendToBrowser({ type: 'transcript_delta', role: 'customer', text: chunk, timestamp: ts });
        }

        // Stream agent (human trainee input) transcription chunks live
        if (msg.serverContent.inputTranscription?.text) {
          const chunk = msg.serverContent.inputTranscription.text;
          if (this._currentRole !== 'agent') {
            this._finalizeCurrentMessage();
            this._currentRole = 'agent';
            this._currentBuffer = '';
          }
          this._currentBuffer += chunk;
          const elapsed = this.getDurationSeconds();
          const ts = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
          this._sendToBrowser({ type: 'transcript_delta', role: 'agent', text: chunk, timestamp: ts });
        }

        if (msg.serverContent.turnComplete) {
          this._finalizeCurrentMessage();

          if (!this.greetingComplete) {
            this.greetingComplete = true;
            this._sendToBrowser({ type: 'greeting_done' });
            // Start the timer once the customer's opening statement is done
            this.timer.start();
          }

          // Detect if customer is wrapping up the conversation
          const lastCustomerMsg = this._getLastCustomerMessage();
          if (lastCustomerMsg && this._isConversationEnding(lastCustomerMsg)) {
            this._sendToBrowser({ type: 'turn_complete' });
            this._sendToBrowser({ type: 'conversation_ended' });
          } else {
            this._sendToBrowser({ type: 'turn_complete' });
          }
        }
      }
    } catch (err) {
      logger.error('Failed to parse Gemini message:', err.message);
    }
  }

  _finalizeCurrentMessage() {
    if (this._currentBuffer && this._currentBuffer.trim()) {
      const text = this._currentBuffer.trim();
      const role = this._currentRole;
      const elapsed = this.getDurationSeconds();

      if (role === 'agent' && NON_LATIN_RE.test(text)) {
        // Non-Latin script detected — translate to English before saving
        logger.info(`Non-Latin agent transcript detected, translating: "${text.substring(0, 50)}..."`);
        translateToEnglish(text).then((translated) => {
          this.transcript.push({ role, message: translated, elapsed });
          // Send corrected transcript to replace the streamed non-Latin chunks
          this._sendToBrowser({ type: 'transcript_replace', role, text: translated });
          this._sendToBrowser({ type: 'transcript_done', role });
        });
      } else {
        this.transcript.push({ role, message: text, elapsed });
        this._sendToBrowser({ type: 'transcript_done', role });
      }
    }
    this._currentBuffer = '';
    this._currentRole = null;
  }

  _getLastCustomerMessage() {
    for (let i = this.transcript.length - 1; i >= 0; i--) {
      if (this.transcript[i].role === 'customer') return this.transcript[i].message;
    }
    return null;
  }

  _isConversationEnding(text) {
    const lower = text.toLowerCase();
    const farewellPatterns = [
      'goodbye', 'good bye', 'take care', 'have a good day',
      'thank you so much', 'thanks for your help', 'appreciate your help',
      'that covers everything', 'nothing else', 'that\'s all i need',
      'i think that\'s it', 'okay bye', 'alright bye', 'thanks bye',
    ];
    return farewellPatterns.some((p) => lower.includes(p));
  }

  _sendToBrowser(message) {
    try {
      if (this.browserWs.readyState === WebSocket.OPEN) {
        this.browserWs.send(JSON.stringify(message));
      }
    } catch (err) {
      logger.error('Failed to send to browser:', err.message);
    }
  }

  getTranscript() {
    return this.transcript
      .map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.message}`)
      .join('\n');
  }

  getTranscriptEntries() {
    return this.transcript;
  }

  getAudioChunks() {
    return this.audioChunks;
  }

  getAgentAudioChunks() {
    return this.agentAudioChunks;
  }

  getAudioTimeline() {
    return this.audioTimeline;
  }

  getDurationSeconds() {
    if (!this.startTime) return 0;
    return Math.round((Date.now() - this.startTime) / 1000);
  }

  end() {
    this.timer.stop();
    if (this.geminiWs) {
      this.geminiWs.close();
      this.geminiWs = null;
    }
    this.isConnected = false;
    this.isReady = false;
  }
}

module.exports = { TrainingSession };
