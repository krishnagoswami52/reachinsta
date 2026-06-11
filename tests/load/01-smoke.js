import http from 'k6/http';
import { check, sleep } from 'k6';

// Smoke test — 1 VU, 30s. Run this FIRST. Zero failures tolerated.
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://reachinsta.com';

export default function () {
  const home = http.get(`${BASE_URL}/`);
  check(home, {
    'home returns 200': (r) => r.status === 200,
    'home has content': (r) => r.body && r.body.length > 100,
  });

  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health returns 200': (r) => r.status === 200,
    'health is fast': (r) => r.timings.duration < 500,
    'health returns ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
    },
  });

  const login = http.get(`${BASE_URL}/login`);
  check(login, {
    'login page returns 200': (r) => r.status === 200,
  });

  sleep(1);
}
