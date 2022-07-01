# Scrapers Visualizer

Snapshot date: 1 July 2022.

Admin dashboard for monitoring and managing distributed scrapers. Built with Vue 3, TypeScript, Vite, and Naive UI.

## Features

- **Real-time Dashboard**: Live view of all connected scrapers and workers
- **Scraper Management**: Start, pause, resume, abort scrapers
- **Worker Details**: Individual worker status, metrics, and logs
- **Log Viewer**: Streaming logs with filtering and search
- **Configuration Editor**: Update scraper settings on-the-fly
- **WebSocket Updates**: Instant UI updates via WebSocket connection

## Tech Stack

- **Vue 3** - Composition API with TypeScript
- **Vite** - Fast build tool
- **Pinia** - State management
- **Vue Router 4** - Navigation
- **Naive UI** - Component library
- **Tailwind CSS 3.1** - Utility-first styling
- **VueUse** - Composable utilities

## Project Structure

```
scrapers-visualizer/
├── src/
│   ├── api/              # API client
│   ├── components/       # Reusable components
│   │   ├── commands/     # Command buttons, timeline
│   │   ├── config/       # Config editor
│   │   ├── dashboard/    # Stats overview
│   │   ├── layout/       # App layout, navigation
│   │   ├── logs/         # Log viewer
│   │   ├── metrics/      # Metrics cards
│   │   ├── scrapers/     # Scraper table, cards
│   │   └── workers/      # Worker table, cards
│   ├── composables/      # Reusable composition functions
│   ├── router/           # Vue Router config
│   ├── stores/           # Pinia stores
│   ├── styles/           # Global CSS
│   ├── types/            # TypeScript types
│   └── views/            # Page components
├── public/               # Static assets
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The dev server runs on **http://localhost:3000** and proxies API requests to the Manager at **http://localhost:8090**.

## Views

### Dashboard (`/`)
- Overview statistics (scrapers, workers, progress)
- Active scrapers table
- Recent activity logs

### Scrapers (`/scrapers`)
- List of all scrapers with status
- Quick actions

### Scraper Detail (`/scrapers/:id`)
- Scraper info and metrics
- Workers table with selection
- Logs viewer
- Configuration editor
- Command buttons (start/pause/resume/abort)

### Worker Detail (`/scrapers/:scraperId/workers/:workerId`)
- Worker info and metrics
- Worker-specific logs
- Command buttons for single worker

### Logs (`/logs`)
- Global log viewer
- Filter by scraper and worker
- Level filtering and search

### Config (`/config`)
- Configuration editor per scraper

## State Management (Pinia Stores)

### `useScrapersStore`
- Scraper registry
- Fetch, update, remove scrapers
- Computed: connected, running counts

### `useWorkersStore`
- Workers grouped by scraper
- Fetch workers for scraper

### `useLogsStore`
- Log entries per scraper
- Filtering and pagination
- Max 5000 logs in memory

### `useCommandsStore`
- Command history per scraper
- Send commands
- Track pending commands

## WebSocket Connection

The app connects to `ws://localhost:8090/api/ws` for real-time updates:

```typescript
// Handled message types
CONNECTED           // Initial connection
SCRAPER_STATUS_CHANGE  // Status updates
HEALTH_UPDATE       // Metrics refresh
LOGS                // New log entries
COMMANDS_QUEUED     // Command sent
COMMANDS_DELIVERED  // Command received by scraper
COMMAND_ACKNOWLEDGED // Command result
CONFIG_UPDATE       // Config changed
SCRAPER_REMOVED     // Scraper unregistered
```

## Composables

### `useWebSocket()`
- WebSocket connection management
- Auto-reconnect
- Message handling

### `useStatusColors()`
- Status-to-color mapping
- Consistent color scheme

### `useFormatters()`
- `formatBytes()` - Size formatting
- `formatNumber()` - Large number formatting
- `formatDuration()` - Time formatting
- `formatTimestamp()` - Date/time formatting
- `formatRelativeTime()` - "5m ago" style

## Configuration

### Vite Config (`vite.config.ts`)

```typescript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8090',
      changeOrigin: true,
    },
    '/ws': {
      target: 'ws://localhost:8090',
      ws: true,
    }
  }
}
```

## Environment Variables

Create `.env.local` for local overrides:

```env
VITE_API_BASE_URL=http://localhost:8090
VITE_WS_URL=ws://localhost:8090/api/ws
```

## Building for Production

```bash
npm run build
```

Output is in `dist/` folder. Serve with any static file server or nginx.

### Nginx Config Example

```nginx
server {
    listen 80;
    server_name visualizer.example.com;

    location / {
        root /var/www/scrapers-visualizer;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://manager:8090;
        proxy_http_version 1.1;
    }

    location /api/ws {
        proxy_pass http://manager:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Screenshots

```
┌────────────────────────────────────────────────────────────┐
│  Scrapers Visualizer                    Connected  │ 3/5   │
├──────────┬─────────────────────────────────────────────────┤
│ Dashboard│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐   │
│ Scrapers │  │  5   │ │  3   │ │ 15   │ │   54.32%    │   │
│ Logs     │  │Scrape│ │Runnin│ │Worker│ │ ▓▓▓▓▓▓░░░░░ │   │
│ Config   │  └──────┘ └──────┘ └──────┘ └──────────────┘   │
│          │                                                  │
│          │  Active Scrapers                                 │
│          │  ┌────────────────────────────────────────────┐ │
│          │  │ Name      │ Status  │ Workers │ Progress   │ │
│          │  │ Idealista │ RUNNING │  5/5    │ ▓▓▓▓░ 54% │ │
│          │  │ Rightmove │ PAUSED  │  3/5    │ ▓▓░░░ 23% │ │
│          │  │ Fotocasa  │ IDLE    │  0/3    │ ░░░░░  0% │ │
│          │  └────────────────────────────────────────────┘ │
└──────────┴─────────────────────────────────────────────────┘
```
