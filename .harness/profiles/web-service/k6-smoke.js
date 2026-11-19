import http from 'k6/http';
import { check, sleep } from 'k6';

const thresholdsCfg = JSON.parse(open('./thresholds.json'));
const BASE_URL = __ENV.TARGET_URL || 'http://127.0.0.1:3000';

export const options = {
  stages: [
    { duration: '15s', target: 20 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: [
      `p(95)<${thresholdsCfg.p95LatencyMs}`,
      `p(99)<${thresholdsCfg.p99LatencyMs}`,
    ],
    http_req_failed: [`rate<${thresholdsCfg.maxErrorRate}`],
  },
};

export default function () {
  const healthRes = http.get(`${BASE_URL}/healthz`);
  check(healthRes, {
    'healthz status 200': (r) => r.status === 200,
  });

  if (__ENV.API_SMOKE_PATH) {
    const apiRes = http.get(`${BASE_URL}${__ENV.API_SMOKE_PATH}`);
    check(apiRes, {
      'api smoke status < 400': (r) => r.status >= 200 && r.status < 400,
    });
  }

  sleep(0.1);
}
