# ReachInsta - Instagram Competitor Intelligence Platform

## Overview

ReachInsta is a production-ready SaaS platform for Instagram competitor intelligence. It allows users to track competitor Reels, analyze viral content patterns, and optimize posting strategies with data-driven insights.

## Key Features

- **Competitor Tracking**: Monitor up to 100 Instagram accounts (based on plan)
- **Viral Reel Analysis**: Proprietary viral score algorithm identifies trending content
- **Analytics Dashboard**: Posting time heatmaps, duration analysis, engagement metrics
- **Role-Based Access**: Admin and user roles with different permissions
- **Tiered Subscriptions**: Free, Plus, and Pro plans with different limits
- **Background Processing**: Asynchronous data fetching via Apify API
- **CSV Export**: Pro users can export data for external analysis

## Tech Stack

### Frontend
- React 18 with TypeScript
- Wouter for routing
- TanStack Query for data fetching
- Tailwind CSS with shadcn/ui components
- Recharts for data visualization

### Backend
- Express.js with TypeScript
- PostgreSQL with Drizzle ORM
- Custom email/password authentication with bcrypt
- Session-based auth stored in PostgreSQL
- Background worker for job processing

### External Services
- Apify API for Instagram data scraping
  - Instagram Scraper Actor for Reels data
  - Followers Scraper Actor for follower counts

## Project Structure

```
├── client/src/
│   ├── components/
│   │   ├── dashboard/       # Dashboard-specific components
│   │   ├── layouts/         # Layout wrappers
│   │   └── ui/              # shadcn/ui components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities and query client
│   └── pages/               # Route pages
├── server/
│   ├── services/            # External service integrations
│   ├── routes.ts            # API route handlers
│   ├── storage.ts           # Database operations
│   └── worker.ts            # Background job processor
└── shared/
    └── schema.ts            # Database schema and types
```

## Database Schema

- **users**: User accounts with email/password authentication
- **sessions**: PostgreSQL session storage for auth
- **profiles**: User settings, plan, and limits
- **competitors**: Tracked Instagram usernames per user
- **fetch_runs**: Data fetch job records with status
- **reels**: Analyzed reel data with metrics
- **competitor_stats**: Aggregated stats per competitor
- **raw_payloads**: Raw Apify API responses
- **jobs**: Background job queue

## Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string (auto-configured)
- `SESSION_SECRET`: Session encryption key (auto-configured)
- `APIFY_TOKEN`: Apify API token for data fetching

Optional:
- `SUPER_ADMIN_EMAIL`: Email that can assign admin roles

## Plan Limits

| Feature | Free | Plus | Pro |
|---------|------|------|-----|
| Max Competitors | 5 | 50 | 100 |
| Monthly Fetches | 1 | 2 | 4 |
| Time Range | 7 days | 28 days | 28 days |
| CSV Export | No | No | Yes |

## Running the Project

1. Ensure PostgreSQL database is available
2. Run `npm run db:push` to create database tables
3. Start with `npm run dev`
4. Application serves at http://localhost:5000

## Development Notes

- Auth redirects handled by Replit Auth integration
- Landing page at `/` for unauthenticated users
- Dashboard at `/dashboard` for authenticated users
- Admin panel at `/admin` requires admin role
- Background worker polls for jobs every 5 seconds

## API Endpoints

### Public
- `GET /api/auth/user` - Get current authenticated user

### Authenticated
- `GET /api/profile` - Get user profile with plan limits
- `GET /api/competitors` - List user's competitors
- `POST /api/competitors` - Add single competitor
- `POST /api/competitors/bulk` - Add multiple competitors
- `DELETE /api/competitors/:id` - Remove competitor
- `POST /api/fetch` - Start new data fetch job
- `GET /api/fetch/latest` - Get latest fetch run with data
- `GET /api/fetch/:id` - Get specific fetch run
- `GET /api/export/reels.csv` - Export reels data (Pro only)
- `GET /api/export/competitors.csv` - Export competitor stats (Pro only)

### Admin Only
- `GET /api/admin/users` - List all users with stats
- `POST /api/admin/users/:id/plan` - Update user plan
- `POST /api/admin/users/:id/limits` - Update user limits
- `POST /api/admin/users/:id/role` - Update user role

## Security

- All POST endpoints use Zod validation
- Role-based access control for admin endpoints
- Plan limits enforced on competitor adds and fetches
- CSV export restricted to Pro users and admins
