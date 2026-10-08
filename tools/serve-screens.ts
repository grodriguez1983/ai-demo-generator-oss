/**
 * Tiny static server for animated HTML screens (the "concept" / tutorial path).
 *
 * Serves `assets/screens/` so a demo can navigate to screens instead of a real
 * app. Pair it with a demo that sets `skip_login: true` + `no_locale_prefix: true`
 * and `BASE_URL=http://127.0.0.1:5599`:
 *
 *   PORT=5599 npx tsx tools/serve-screens.ts &
 *   BASE_URL=http://127.0.0.1:5599 npx tsx src/index.ts --demo=<id> --skip-seed
 *
 * A segment then does: { type: navigate, path: /<id>/1.html }
 */
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screensDir = join(__dirname, '..', 'assets', 'screens');
const port = Number(process.env.PORT ?? 5599);

const app = express();
app.use('/', express.static(screensDir, { extensions: ['html'] }));
app.get('/health', (_req, res) => res.send('screens up'));

app.listen(port, () => {
  console.log(`[screens] serving ${screensDir} at http://127.0.0.1:${port}/`);
});
