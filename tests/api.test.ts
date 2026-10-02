import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDemoData } from '../src/seed.js';

const adminUrl = 'postgresql://demo:demo_local_password@127.0.0.1:5434/payroll_demo';
const testUrl = 'postgresql://demo:demo_local_password@127.0.0.1:5434/payroll_demo_test';

type ApiResult = {
  status: number;
  body: any;
  cookie?: string;
};

let db: pg.Pool;
let server: Server;
let baseUrl = '';

async function ensureTestDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const existing = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    ['payroll_demo_test']
  );
  if (!existing.rowCount) {
    await admin.query('CREATE DATABASE payroll_demo_test');
  }
  await admin.end();
}

async function api(path: string, options: { method?: string; cookie?: string; body?: unknown } = {}): Promise<ApiResult> {
  const response = await fetch(baseUrl + path, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const setCookie = response.headers.getSetCookie().find((value) => value.startsWith('demo_session='));
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: setCookie ? setCookie.split(';')[0] : undefined
  };
}

async function login(email: string): Promise<string> {
  const listed = await api('/api/demo-users');
  const user = listed.body.users.find((item: { email: string }) => item.email === email);
  const result = await api('/api/login', { method: 'POST', body: { userId: user.id } });
  if (!result.cookie) throw new Error(`No session cookie for ${email}`);
  return result.cookie;
}

async function openRunId(cookie: string): Promise<string> {
  const runs = await api('/api/payroll-runs', { cookie });
  return runs.body.payrollRuns[0].id as string;
}

beforeAll(async () => {
  await ensureTestDatabase();
  db = createPool(testUrl);
  await runMigrations(db);
  const app = createApp(db);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await seedDemoData(db, { reset: true });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await db.end();
});

describe('authorization', () => {
  test('rejects an unauthenticated read with 401', async () => {
    const result = await api('/api/employees');
    expect(result.status).toBe(401);
  });

  test('lets a viewer read employees and payroll', async () => {
    const cookie = await login('viewer@example.com');
    const employees = await api('/api/employees', { cookie });
    const runs = await api('/api/payroll-runs', { cookie });
    expect(employees.status).toBe(200);
    expect(employees.body.employees).toHaveLength(5);
    expect(runs.status).toBe(200);
    expect(runs.body.payrollRuns[0].status).toBe('open');
  });

  test('rejects payroll generation from a viewer with 403', async () => {
    const cookie = await login('viewer@example.com');
    const runId = await openRunId(cookie);
    const result = await api(`/api/payroll-runs/${runId}/generate`, { method: 'POST', cookie });
    expect(result.status).toBe(403);
  });

  test('rejects close from a processor with 403', async () => {
    const processor = await login('processor@example.com');
    const runId = await openRunId(processor);
    await api(`/api/payroll-runs/${runId}/generate`, { method: 'POST', cookie: processor });
    const payslips = await api(`/api/payroll-runs/${runId}/payslips`, { cookie: processor });
    for (const payslip of payslips.body.payslips) {
      await api(`/api/payslips/${payslip.id}/finalise`, { method: 'POST', cookie: processor });
    }
    const denied = await api(`/api/payroll-runs/${runId}/close`, { method: 'POST', cookie: processor });
    expect(denied.status).toBe(403);
  });
});

describe('payroll workflow', () => {
  test('generates draft payslips, finalises them, and lets only the closer close the run', async () => {
    const processor = await login('processor@example.com');
    const runId = await openRunId(processor);

    const generated = await api(`/api/payroll-runs/${runId}/generate`, {
      method: 'POST',
      cookie: processor
    });
    expect(generated.status).toBe(201);
    expect(generated.body.created).toBe(5);

    const drafts = await api(`/api/payroll-runs/${runId}/payslips`, { cookie: processor });
    expect(drafts.body.payslips.every((payslip: { status: string }) => payslip.status === 'draft')).toBe(true);

    const alex = drafts.body.payslips.find((payslip: { employeeName: string }) => payslip.employeeName === 'Alex Morgan');
    expect(alex).toMatchObject({
      grossPay: 38.46,
      leaveDeduction: 7.7,
      allowances: 0,
      netPay: 30.76
    });
    const taylor = drafts.body.payslips.find((payslip: { employeeName: string }) => payslip.employeeName === 'Taylor Chen');
    expect(taylor.netPay).toBe(165.38);

    const closer = await login('closer@example.com');
    const tooEarly = await api(`/api/payroll-runs/${runId}/close`, { method: 'POST', cookie: closer });
    expect(tooEarly.status).toBe(409);

    for (const payslip of drafts.body.payslips) {
      const finalised = await api(`/api/payslips/${payslip.id}/finalise`, {
        method: 'POST',
        cookie: processor
      });
      expect(finalised.status).toBe(200);
      expect(finalised.body.status).toBe('final');
    }

    const closed = await api(`/api/payroll-runs/${runId}/close`, { method: 'POST', cookie: closer });
    expect(closed.status).toBe(200);

    const after = await api('/api/payroll-runs', { cookie: closer });
    expect(after.body.payrollRuns[0].status).toBe('closed');

    const generateAgain = await api(`/api/payroll-runs/${runId}/generate`, {
      method: 'POST',
      cookie: processor
    });
    expect(generateAgain.status).toBe(409);

    const finaliseAgain = await api(`/api/payslips/${drafts.body.payslips[0].id}/finalise`, {
      method: 'POST',
      cookie: processor
    });
    expect(finaliseAgain.status).toBe(409);
  });

  test('health check does not require a session', async () => {
    const result = await api('/health');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok' });
  });
});

async function generatedPayslips(): Promise<Array<{ id: string; employeeName: string }>> {
  const processor = await login('processor@example.com');
  const runId = await openRunId(processor);
  const generated = await api(`/api/payroll-runs/${runId}/generate`, {
    method: 'POST',
    cookie: processor
  });
  if (generated.status !== 201) {
    throw new Error(`generate failed: ${generated.status}`);
  }
  const listed = await api(`/api/payroll-runs/${runId}/payslips`, { cookie: processor });
  return listed.body.payslips;
}

describe('employee self-service', () => {
  test('rejects an unauthenticated employee endpoint with 401', async () => {
    const profile = await api('/api/my/profile');
    const payslips = await api('/api/my/payslips');
    expect(profile.status).toBe(401);
    expect(payslips.status).toBe(401);
  });

  test('lets an employee retrieve their own profile', async () => {
    const cookie = await login('alex.employee@example.com');
    const result = await api('/api/my/profile', { cookie });
    expect(result.status).toBe(200);
    expect(result.body.profile).toMatchObject({
      employeeNumber: 'E-1001',
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@example.com'
    });
    expect(result.body.employees).toBeUndefined();
  });

  test('lets an employee retrieve their own payslip list', async () => {
    const payslips = await generatedPayslips();
    const alexAdmin = payslips.find((payslip) => payslip.employeeName === 'Alex Morgan');
    const cookie = await login('alex.employee@example.com');
    const result = await api('/api/my/payslips', { cookie });
    expect(result.status).toBe(200);
    expect(result.body.payslips).toHaveLength(1);
    expect(result.body.payslips[0].id).toBe(alexAdmin?.id);
    expect(result.body.payslips[0].netPay).toBe(30.76);
  });

  test('lets an employee retrieve their own payslip', async () => {
    const payslips = await generatedPayslips();
    const alexAdmin = payslips.find((payslip) => payslip.employeeName === 'Alex Morgan');
    const cookie = await login('alex.employee@example.com');
    const result = await api(`/api/my/payslips/${alexAdmin?.id}`, { cookie });
    expect(result.status).toBe(200);
    expect(result.body.payslip).toMatchObject({
      id: alexAdmin?.id,
      employeeName: 'Alex Morgan',
      grossPay: 38.46,
      leaveDeduction: 7.7,
      netPay: 30.76,
      status: 'draft'
    });
  });

  test('hides another employee payslip with 404', async () => {
    const payslips = await generatedPayslips();
    const alexAdmin = payslips.find((payslip) => payslip.employeeName === 'Alex Morgan');
    const jamieAdmin = payslips.find((payslip) => payslip.employeeName === 'Jamie Lee');
    const alex = await login('alex.employee@example.com');
    const denied = await api(`/api/my/payslips/${jamieAdmin?.id}`, { cookie: alex });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({ error: 'Not found' });

    const jamie = await login('jamie.employee@example.com');
    const own = await api(`/api/my/payslips/${jamieAdmin?.id}`, { cookie: jamie });
    const stillDenied = await api(`/api/my/payslips/${alexAdmin?.id}`, { cookie: jamie });
    expect(own.status).toBe(200);
    expect(own.body.payslip.employeeName).toBe('Jamie Lee');
    expect(stillDenied.status).toBe(404);
  });

  test('rejects payroll generation from an employee with 403', async () => {
    const employee = await login('alex.employee@example.com');
    const processor = await login('processor@example.com');
    const runId = await openRunId(processor);
    const denied = await api(`/api/payroll-runs/${runId}/generate`, {
      method: 'POST',
      cookie: employee
    });
    expect(denied.status).toBe(403);
  });

  test('rejects payslip finalisation from an employee with 403', async () => {
    const payslips = await generatedPayslips();
    const employee = await login('alex.employee@example.com');
    const denied = await api(`/api/payslips/${payslips[0].id}/finalise`, {
      method: 'POST',
      cookie: employee
    });
    expect(denied.status).toBe(403);
  });

  test('rejects payroll close from an employee with 403', async () => {
    const employee = await login('alex.employee@example.com');
    const processor = await login('processor@example.com');
    const runId = await openRunId(processor);
    const denied = await api(`/api/payroll-runs/${runId}/close`, {
      method: 'POST',
      cookie: employee
    });
    expect(denied.status).toBe(403);
  });
});
