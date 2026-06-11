import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Auth stress test — concurrent signups + logins.
// ⚠️  Creates REAL users in the database. Run cleanup SQL after testing:
//
//   DELETE FROM profiles WHERE email LIKE 'loadtest+%@reachinsta-test.local';
//   DELETE FROM users    WHERE email LIKE 'loadtest+%@reachinsta-test.local';
//
// Total duration: ~3 minutes.

export const options = {
  scenarios: {
    auth_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 15 },
        { duration: '1m', target: 15 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'], // bcrypt is CPU-bound; allow 3s
    'checks{check:register success}': ['rate>0.90'],
    'checks{check:login success}': ['rate>0.90'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://reachinsta.com';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function () {
  const uid = uuidv4();
  const email = `loadtest+${uid.slice(0, 8)}@reachinsta-test.local`;
  const password = 'LoadTest123!@#';

  group('Register flow', () => {
    const res = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        email,
        password,
        firstName: 'Load',
        lastName: `Test${uid.slice(0, 4)}`,
      }),
      { headers: JSON_HEADERS }
    );

    // 200 = registered; 409 = email already taken (race collision — rare but ok)
    check(res, {
      'register success': (r) => r.status === 200 || r.status === 409,
      'register fast': (r) => r.timings.duration < 5000,
    });
  });

  sleep(1);

  group('Login flow', () => {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email, password }),
      { headers: JSON_HEADERS }
    );

    check(res, {
      'login success': (r) => r.status === 200,
      'login sets session cookie': (r) =>
        r.cookies['connect.sid'] !== undefined,
    });
  });

  sleep(2);
}
