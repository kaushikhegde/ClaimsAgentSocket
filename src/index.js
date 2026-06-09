const express = require('express');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const path = require('path');
const config = require('./config');
const { handleConnection } = require('./ws/handler');
const pool = require('./db/pool');
const logger = require('./utils/logger');
const blobStorage = require('./storage/blob');
const { getAllSessions, getSessionById, getSessionsByScenario, getAgentStats, getScoreHistory } = require('./db/sessions');
const { getAllScenarios: getScenarioDefinitions } = require('./training/scenarios');

const MAX_CONNECTIONS = 20;
const MAX_PAYLOAD_BYTES = 512 * 1024; // 512KB per message

const app = express();
const server = http.createServer(app);

// CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve static files (HTML client)
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', connections: wss.clients.size, timestamp: new Date().toISOString() });
});

// API Routes
app.get('/api/scenarios', async (req, res) => {
  try {
    const scenarios = getScenarioDefinitions();
    res.json(scenarios);
  } catch (err) {
    logger.error('Failed to get scenarios', err);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

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
    // Also get transcript and conversation logs
    const transcript = await pool.query('SELECT * FROM transcripts WHERE session_id = $1', [req.params.id]);
    const logs = await pool.query('SELECT * FROM conversation_logs WHERE session_id = $1 ORDER BY timestamp', [req.params.id]);
    res.json({ ...session, transcript: transcript.rows[0], logs: logs.rows });
  } catch (err) {
    logger.error('Failed to get session', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.get('/api/sessions/:id/audio', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session || !session.audio_file_path) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    const stored = session.audio_file_path;
    const range = req.headers.range;

    // Audio kept in Azure Blob (claims-agent/...) — proxy the bytes through here.
    if (stored.startsWith(`${blobStorage.PREFIX}/`)) {
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
          'Content-Type': 'audio/wav',
        });
        stream.pipe(res);
      } else {
        const stream = await blobStorage.downloadAudio(stored);
        res.writeHead(200, {
          'Content-Length': contentLength,
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
        });
        stream.pipe(res);
      }
      return;
    }

    // Local file (dev fallback)
    const audioPath = path.join(__dirname, '..', stored);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ error: 'Audio file missing' });
    }
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(audioPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/wav',
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(audioPath).pipe(res);
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

// C2: WebSocket server with maxPayload limit
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD_BYTES });

wss.on('connection', (ws) => {
  // C2: Reject if too many connections
  if (wss.clients.size > MAX_CONNECTIONS) {
    logger.warn(`Connection rejected: limit of ${MAX_CONNECTIONS} reached`);
    ws.close(1013, 'Server is at capacity');
    return;
  }
  handleConnection(ws);
});

server.listen(config.port, () => {
  logger.info(`Server running on http://localhost:${config.port}`);
  logger.info('WebSocket endpoint: ws://localhost:' + config.port + '/ws');
});

// M6: Graceful shutdown
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Stop accepting new connections
  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close all existing WS connections
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }

  server.close(async () => {
    logger.info('HTTP server closed');
    await pool.end();
    logger.info('Database pool drained');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
