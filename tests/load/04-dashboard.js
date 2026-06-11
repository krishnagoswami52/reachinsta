import http from 'k6/http';
import { check, sleep, group } from 'k6';

// Authenticated dashboard load test.
// Logs in ONCE in setup(), shares the session cookie across all VUs.
// Does NOT trigger Apify fetches — only reads existing DB data.
// Total duration: ~3 minutes.
//
// Usage:
//   $env:TEST_EMAIL="krishna+loadtest@reachinsta.com"
//   $env:TEST_PASSWORD="your-password-here"
//   k6 run tests/load/04-dashboard.js

export const options = {
  scenarios: {
    dashboard_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
    'checks{check:user fetch ok}': ['rate>0.95'],
    'checks{check:competitors fetch ok}': ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://reachinsta.com';
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    'Missing env vars. Set TEST_EMAIL and TEST_PASSWORD before running:\n' +
    '  $env:TEST_EMAIL="you@example.com"\n' +
    '  $env:TEST_PASSWORD="yourpassword"'
  );
}

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    throw new Error(
      `Setup login failed with status ${res.status}: ${res.body}`
    );
  }

  // Session is stored in the connect.sid cookie
  const sessionCookie = res.cookies['connect.sid'];
  if (!sessionCookie || !sessionCookie[0]) {
    throw new Error('Login succeeded but no connect.sid cookie returned');
  }

  return { sessionCookie: sessionCookie[0].value };
}

export default function (data) {
  const params = {
    headers: { Cookie: `connect.sid=${data.sessionCookie}` },
  };

  group('Dashboard endpoints', () => {
    // Current user info
    const user = http.get(`${BASE_URL}/api/auth/user`, params);
    check(user, {
      'user fetch ok': (r) => r.status === 200,
    });

    // Competitor list (reads from DB, fast)
    const competitors = http.get(`${BASE_URL}/api/competitors`, params);
    check(competitors, {
      'competitors fetch ok': (r) => r.status === 200,
    });

    // Profile info (plan, limits)
    const profile = http.get(`${BASE_URL}/api/profile`, params);
    check(profile, {
      'profile fetch ok': (r) => r.status === 200,
    });

    // Latest fetch run — 404 is fine if no runs exist yet
    const latest = http.get(`${BASE_URL}/api/fetch/latest`, params);
    check(latest, {
      'latest fetch ok': (r) => r.status === 200 || r.status === 404,
    });

    // Fetch history list
    const history = http.get(`${BASE_URL}/api/fetch/history`, params);
    check(history, {
      'history fetch ok': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 3 + 1);
}
