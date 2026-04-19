import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Derive an origin (scheme + host[:port]) from a URL string, or null if unparseable.
function toOrigin(url) {
  try { return url ? new URL(url).origin : null; } catch { return null; }
}

// Build a Content-Security-Policy string for the given mode.
// In production, connect-src is locked to 'self' + the production API origin.
// In dev/preview, we also include the configured VITE_API_URL/VITE_WS_URL origins
// (so self-hosters pointing at a staging / local backend can use `vite preview`)
// and allow `ws:`/`wss:` so arbitrary dev WebSocket endpoints still work.
function buildCsp(mode, env) {
  const apiOrigin = toOrigin(env.VITE_API_URL);
  const wsOrigin = toOrigin(env.VITE_WS_URL);
  const isProd = mode === 'production';

  const connectSrc = ["'self'"];
  if (isProd) {
    connectSrc.push('https://api.junction41.io', 'wss://api.junction41.io');
  } else {
    // Dev/preview: permit configured backends + any ws(s) host for flexibility.
    if (apiOrigin) {
      connectSrc.push(apiOrigin);
      // Mirror http→ws for the same host so Socket.IO fallback works without extra config.
      connectSrc.push(apiOrigin.replace(/^http/, 'ws'));
    }
    if (wsOrigin) connectSrc.push(wsOrigin);
    connectSrc.push('ws:', 'wss:');
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

function buildHeaders(mode, env) {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': buildCsp(mode, env),
  };
}

// Plugin to inject security headers in both dev and preview modes
function securityHeadersPlugin(headers) {
  const apply = (server) => {
    server.middlewares.use((_req, res, next) => {
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      next();
    });
  };
  return {
    name: 'security-headers',
    configureServer: apply,
    configurePreviewServer: apply,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const headers = buildHeaders(mode, env);

  return {
    plugins: [react(), securityHeadersPlugin(headers)],
    build: {
      sourcemap: false,
    },
    server: {
      port: 5173,
      proxy: {
        '/auth': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/v1': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
