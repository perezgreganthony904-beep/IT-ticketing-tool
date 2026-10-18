import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const categories = new Set(['Hardware', 'Software', 'Network', 'Account']);
const priorities = new Set(['Low', 'Medium', 'High', 'Critical']);
let limiter;

function json(res, status, value) {
  res.status(status).json(value);
}

function getLimiter() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!limiter) {
    limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'fieldnote:public-ticket'
    });
  }
  return limiter;
}

function normalizeTicket(body) {
  if (!body || typeof body !== 'object') return null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const requester = typeof body.requester === 'string' ? body.requester.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = body.category;
  const priority = body.priority;
  if (!title || title.length > 100 || !requester || requester.length > 80) return null;
  if (description.length > 500 || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!categories.has(category) || !priorities.has(priority)) return null;
  return { title, description, requester, email, category, priority, assignee: 'Unassigned', status: 'open' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const env = process.env;
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  if (required.some(key => !env[key]) || !getLimiter()) return json(res, 503, { error: 'Ticket submission is temporarily unavailable.' });

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 10000) return json(res, 413, { error: 'Request is too large.' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid request.' }); }
  }
  const ticket = normalizeTicket(body);
  if (!ticket) return json(res, 400, { error: 'Check the form fields and try again.' });

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = req.headers['x-real-ip'] || (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') || req.socket?.remoteAddress;
  if (!ip) return json(res, 400, { error: 'Unable to verify this request.' });

  try {
    const rate = await getLimiter().limit(`ip:${ip}`);
    if (!rate.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000))));
      return json(res, 429, { error: 'Too many requests. Please try again later.' });
    }

    const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, '');
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/tickets`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(ticket),
      signal: AbortSignal.timeout(8000)
    });
    if (!insertResponse.ok) {
      console.error('Public ticket insert failed with status', insertResponse.status);
      return json(res, 500, { error: 'Could not submit your request. Please try again later or contact your IT team directly.' });
    }
    return json(res, 201, { submitted: true });
  } catch (error) {
    console.error('Public ticket endpoint failed:', error.message);
    return json(res, 503, { error: 'Ticket submission is temporarily unavailable.' });
  }
}