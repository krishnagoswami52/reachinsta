import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';

// Tests all public-facing pages under 20 concurrent users.
// No auth, no DB writes. Simulates anonymous visitors.
// Total duration: ~5 minutes.

const publicPageTrend = new Trend('public_page_duration', true);

export const options = {
  scenarios: {
    public_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
    public_page_duration: ['p(95)<1500'],
    'checks{check:returns 200}': ['rate>0.98'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://reachinsta.com';

// SPA routes — all served by the Vite build's index.html catch-all
const PAGES = [
  '/',
  '/login',
  '/signup',
  '/features',
  '/pricing',
  '/contact',
  '/terms',
  '/privacy',
];

export default function () {
  const page = PAGES[Math.floor(Math.random() * PAGES.length)];

  group(`GET ${page}`, () => {
    const res = http.get(`${BASE_URL}${page}`);
    publicPageTrend.add(res.timings.duration);

    check(res, {
      'returns 200': (r) => r.status === 200,
      'not server error': (r) => r.status < 500,
      'has body': (r) => r.body && r.body.length > 100,
    });
  });

  // Also check the health API on each iteration
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health ok': (r) => r.status === 200,
  });

  sleep(Math.random() * 3 + 1); // 1–4 seconds think time
}

export function handleSummary(data) {
  return {
    'tests/load/results/02-public-pages.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const reqs = m.http_reqs?.values?.count ?? 'n/a';
  const failRate = m.http_req_failed?.values?.rate ?? 0;
  const avg = m.http_req_duration?.values?.avg?.toFixed(0) ?? 'n/a';
  const p95 = m.http_req_duration?.values?.['p(95)']?.toFixed(0) ?? 'n/a';
  const maxMs = m.http_req_duration?.values?.max?.toFixed(0) ?? 'n/a';
  const iters = m.iterations?.values?.count ?? 'n/a';
  return `
═══════════════════════════════════════════════════════
 PUBLIC PAGES LOAD TEST RESULTS
═══════════════════════════════════════════════════════
  Total requests:  ${reqs}
  Failed requests: ${(failRate * 100).toFixed(2)}%
  Avg response:    ${avg}ms
  p95 response:    ${p95}ms
  Max response:    ${maxMs}ms
  Iterations:      ${iters}
═══════════════════════════════════════════════════════
`;
}
