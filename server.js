// Production static server for the built SPA.
//
// Azure App Service (Linux/Node) runs `npm start`, which runs this file. It just
// serves the Vite build output in dist/ and falls back to index.html so client
// side routes (React Router) work on hard refresh. The app talks to the backend
// directly (see src/api.js + VITE_BACKEND_URL), so no proxy is needed here.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

const app = express();
app.use(express.static(dist));

// SPA fallback for any route the static middleware didn't match.
app.use((req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Frontend listening on ${port}`));
