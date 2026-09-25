const express = require('express');
const http = require('http');
const path = require('path');
const config = require('./config');
const pool = require('./db/pool');
const logger = require('./utils/logger');
const blobStorage = require('./storage/blob');
const { mountSpa } = require('./spa');
const { getAllSessions, getSessionById, getSessionsByScenario, getAgentStats, getScoreHistory } = require('./db/sessions');

const app = express();
const server = http.createServer(app);

// CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

// Serve static files (the built frontend lives here in the Docker image)
const PUBLIC_DIR = path.join(__dirname, '../public');
app.use(express.static(PUBLIC_DIR));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Feature routers
app.use('/api/training', require('./routes/training'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/voices', require('./routes/voices').voicesRouter);
app.use('/api/elevenlabs', require('./routes/voices').elevenLabsRouter);

app.get('/api/sessions', async (req, res) => {
  try {
    const { scenario, limit = 50, offset = 0 } = req.query;
    const sessions = scenario
      ? await getSessionsByScenario(scenario, parseInt(limit))
      : await getAllSessions(parseInt(limit), parseInt(offset));
    res.json(sessions);
  } catch (err) {
    logger.error('Failed to get sessions', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const transcript = await pool.query('SELECT * FROM transcripts WHERE session_id = $1', [req.params.id]);
    const logs = await pool.query('SELECT * FROM conversation_logs WHERE session_id = $1 ORDER BY timestamp', [req.params.id]);
    res.json({ ...session, transcript: transcript.rows[0], logs: logs.rows });
  } catch (err) {
    logger.error('Failed to get session', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

const AUDIO_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

app.get('/api/sessions/:id/audio', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session || !session.audio_file_path) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    const stored = session.audio_file_path;
    const contentType = AUDIO_TYPES[path.extname(stored).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    // Audio is Azure-only and lives under claims-agent/. Anything else (legacy
    // local paths whose files are gone) no longer has a source — return 404.
    if (!stored.startsWith(`${blobStorage.PREFIX}/`) || !(await blobStorage.audioExists(stored))) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    // Proxy the blob bytes through here, honouring Range requests.
    const { contentLength } = await blobStorage.getAudioProperties(stored);
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
      const chunkSize = end - start + 1;
      const stream = await blobStorage.downloadAudio(stored, start, chunkSize);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${contentLength}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      stream.pipe(res);
    } else {
      const stream = await blobStorage.downloadAudio(stored);
      res.writeHead(200, {
        'Content-Length': contentLength,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      stream.pipe(res);
    }
  } catch (err) {
    logger.error('Failed to serve audio', err);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { agent } = req.query;
    const stats = agent ? await getAgentStats(agent) : await getAgentStats();
    const history = agent ? await getScoreHistory(agent) : await getScoreHistory();
    res.json({ stats, history });
  } catch (err) {
    logger.error('Failed to get stats', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Must come after every API route: unmatched GETs fall through to the SPA.
if (mountSpa(app, PUBLIC_DIR)) logger.info('Serving frontend build from public/');

server.listen(config.port, () => {
  logger.info(`Server running on http://localhost:${config.port}`);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await pool.end();
    logger.info('Database pool drained');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
