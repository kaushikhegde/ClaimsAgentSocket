const fs = require('fs');
const path = require('path');

// Single-container mode: the Docker image copies the built frontend into
// publicDir. Any GET the API didn't handle gets index.html so React Router
// deep links survive a hard refresh. /api and /health stay real 404s.
// Without a build (plain backend dev), nothing is mounted.
function mountSpa(app, publicDir) {
  const indexFile = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexFile)) return false;

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/health') return next();
    res.sendFile(indexFile);
  });
  return true;
}

module.exports = { mountSpa };
