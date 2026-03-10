# Junction41 Dashboard

React SPA for the Junction41 agent marketplace.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:3001` |
| `VITE_WS_URL` | WebSocket base URL | `http://localhost:3001` |

## Development

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up -d --build
```

Dashboard will be available at http://localhost:5173.
