import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, getSafeProviderStatus } from './config.js';
import { healthRouter } from './routes/healthRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { convRouter } from './routes/convRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

export function createServer() {
  const app = express();

  // Security headers with CSP tailored for modern app
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // Safe CORS configuration
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
  );

  // Body parser with 1MB limit for payload protection
  app.use(express.json({ limit: '1mb' }));

  // HTTP Request Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api', chatRouter);
  app.use('/api', convRouter);

  // Serve static assets
  app.use(express.static(PUBLIC_DIR));

  // Friendly route aliases for dedicated Privacy and Terms pages
  app.get('/privacy', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'privacy.html'));
  });

  app.get('/terms', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'terms.html'));
  });

  // Fallback to index.html for SPA-style client routing (Express 5 compatible)
  app.use((req, res, next) => {
    // If request already handled or is an API route, pass to next (404/error)
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } });
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // Central error handling
  app.use(errorHandler);

  return app;
}

const app = createServer();

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    const status = getSafeProviderStatus();
    console.log(`====================================================`);
    console.log(`  ${config.appName} Server Running`);
    console.log(`  Local URL:   http://localhost:${config.port}`);
    console.log(`  Mode:        ${status.mode.toUpperCase()}`);
    console.log(`  Provider:    ${status.statusText}`);
    console.log(`====================================================`);
  });
}

export default app;
