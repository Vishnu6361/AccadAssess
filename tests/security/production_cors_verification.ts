/**
 * ==============================================================================
 * ACADASSESS: PRODUCTION CORS CONFIGURATION & SECURITY VERIFICATION SUITE
 * ==============================================================================
 * 
 * Verifies:
 * 1. Origin normalization: Strips trailing slashes, surrounding quotes, paths, and converts to lowercase.
 * 2. Multi-variable resolution: Supports CORS_ORIGIN, CORS_ORIGINS, FRONTEND_URL, CLIENT_URL, ALLOWED_ORIGINS.
 * 3. Default production trusted origin: https://acad-assess.vercel.app is accepted by default.
 * 4. Exact origin matching with trailing-slash resilience.
 * 5. Strict rejection of untrusted origins (zero wildcard in production).
 * 6. Live Express app HTTP preflight (OPTIONS) and GET requests verification.
 * ==============================================================================
 */

import http from 'http';
import app, { normalizeOrigin, isOriginAllowed, getAllowedOrigins } from '../../apps/api/src/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string>
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  const addr = server.address() as { port: number };
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('\n================================================================');
  console.log('   ACADASSESS: PRODUCTION CORS CONFIGURATION VERIFICATION        ');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Origin Normalization Unit Tests
  // -------------------------------------------------------------------------
  console.log('--- 1. Origin Normalization Tests ---');

  assert(
    normalizeOrigin('https://acad-assess.vercel.app') === 'https://acad-assess.vercel.app',
    'Normalizes clean HTTPS origin correctly'
  );

  assert(
    normalizeOrigin('https://acad-assess.vercel.app/') === 'https://acad-assess.vercel.app',
    'Strips trailing slash from origin'
  );

  assert(
    normalizeOrigin('https://acad-assess.vercel.app///') === 'https://acad-assess.vercel.app',
    'Strips multiple trailing slashes'
  );

  assert(
    normalizeOrigin('"https://acad-assess.vercel.app"') === 'https://acad-assess.vercel.app',
    'Strips enclosing double quotes'
  );

  assert(
    normalizeOrigin("'https://acad-assess.vercel.app'") === 'https://acad-assess.vercel.app',
    'Strips enclosing single quotes'
  );

  assert(
    normalizeOrigin('  "https://acad-assess.vercel.app/"  ') === 'https://acad-assess.vercel.app',
    'Strips quotes, trailing slashes, and whitespace simultaneously'
  );

  assert(
    normalizeOrigin('https://acad-assess.vercel.app/student/login') === 'https://acad-assess.vercel.app',
    'Strips URL paths to extract pure origin'
  );

  assert(
    normalizeOrigin('https://ACAD-ASSESS.Vercel.App') === 'https://acad-assess.vercel.app',
    'Converts origin to lowercase'
  );

  // -------------------------------------------------------------------------
  // 2. Production Whitelist & Environment Variable Resolution
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Production Whitelist & Dynamic Resolution Tests ---');

  // Verify default inclusion of production frontend URL
  const origins = getAllowedOrigins();
  assert(
    origins.has('https://acad-assess.vercel.app'),
    'Default whitelist includes https://acad-assess.vercel.app'
  );
  assert(
    origins.has('https://acadassess.vercel.app'),
    'Default whitelist includes legacy alias https://acadassess.vercel.app'
  );

  // Test isOriginAllowed with default production domain
  assert(
    isOriginAllowed('https://acad-assess.vercel.app'),
    'Accepts exact production frontend origin'
  );

  // Test trailing slash in incoming origin
  assert(
    isOriginAllowed('https://acad-assess.vercel.app/'),
    'Accepts production frontend origin with trailing slash'
  );

  // Test custom environment variables
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // Simulate Render environment with trailing slash and plural CORS_ORIGINS
    process.env.CORS_ORIGINS = 'https://custom-institution.edu/, "https://portal.university.edu"';
    assert(
      isOriginAllowed('https://custom-institution.edu'),
      'Accepts origins from CORS_ORIGINS with trailing slash stripped'
    );
    assert(
      isOriginAllowed('https://portal.university.edu'),
      'Accepts origins from CORS_ORIGINS with quotes stripped'
    );

    // Simulate strict production environment
    process.env.NODE_ENV = 'production';

    // Untrusted origins must be rejected
    assert(
      !isOriginAllowed('https://malicious-attacker.com'),
      'Strictly rejects untrusted origin: https://malicious-attacker.com'
    );
    assert(
      !isOriginAllowed('https://evil-phishing.xyz'),
      'Strictly rejects untrusted origin: https://evil-phishing.xyz'
    );
    assert(
      !isOriginAllowed('http://acad-assess.vercel.app'),
      'Strictly rejects insecure HTTP protocol on production domain'
    );
    assert(
      !isOriginAllowed('https://fake-acad-assess.vercel.app.attacker.com'),
      'Strictly rejects spoofed suffix domain'
    );
  } finally {
    process.env.CORS_ORIGIN = originalCorsOrigin;
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.CORS_ORIGINS;
  }

  // -------------------------------------------------------------------------
  // 3. Live Express HTTP Request & Preflight (OPTIONS) Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Live Express HTTP Preflight & Request Tests ---');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    // Test A: Health check with Production Origin
    const healthRes = await makeRequest(server, 'GET', '/health', {
      Origin: 'https://acad-assess.vercel.app'
    });
    assert(
      healthRes.statusCode === 200,
      'GET /health with production origin returns HTTP 200'
    );
    assert(
      healthRes.headers['access-control-allow-origin'] === 'https://acad-assess.vercel.app',
      'GET /health includes Access-Control-Allow-Origin: https://acad-assess.vercel.app'
    );
    assert(
      healthRes.headers['access-control-allow-credentials'] === 'true',
      'GET /health includes Access-Control-Allow-Credentials: true'
    );

    // Test B: Preflight OPTIONS request with headers (x-active-role, authorization)
    const preflightRes = await makeRequest(server, 'OPTIONS', '/api/v1/auth/verify-portal', {
      Origin: 'https://acad-assess.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,x-active-role'
    });
    assert(
      preflightRes.statusCode === 204 || preflightRes.statusCode === 200,
      `OPTIONS preflight returns successful status ${preflightRes.statusCode}`
    );
    assert(
      preflightRes.headers['access-control-allow-origin'] === 'https://acad-assess.vercel.app',
      'OPTIONS preflight includes Access-Control-Allow-Origin header'
    );
    assert(
      Boolean(preflightRes.headers['access-control-allow-methods']),
      'OPTIONS preflight includes Access-Control-Allow-Methods'
    );
    const allowedHeaders = String(preflightRes.headers['access-control-allow-headers'] || '').toLowerCase();
    assert(
      allowedHeaders.includes('x-active-role'),
      'OPTIONS preflight includes x-active-role in allowed headers'
    );
    assert(
      allowedHeaders.includes('authorization'),
      'OPTIONS preflight includes authorization in allowed headers'
    );

    // Test C: Untrusted origin request
    const untrustedRes = await makeRequest(server, 'GET', '/health', {
      Origin: 'https://malicious-attacker.com'
    });
    assert(
      !untrustedRes.headers['access-control-allow-origin'],
      'Untrusted origin request does NOT receive Access-Control-Allow-Origin header'
    );

    // Test D: Untrusted origin preflight request
    const untrustedPreflight = await makeRequest(server, 'OPTIONS', '/api/v1/auth/verify-portal', {
      Origin: 'https://malicious-attacker.com',
      'Access-Control-Request-Method': 'POST'
    });
    assert(
      !untrustedPreflight.headers['access-control-allow-origin'],
      'Untrusted preflight does NOT receive Access-Control-Allow-Origin header'
    );
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('   ALL PRODUCTION CORS VERIFICATION CHECKS PASSED SUCCESSFULLY  ');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});

