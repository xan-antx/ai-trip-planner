import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email)) return { error: 'A valid email is required' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters' };

  return { email, password };
}

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  const { email, password, error } = validateCredentials(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, password_hash]
    );

    const user = rows[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    // 23505 = unique_violation on users.email
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { email, password, error } = validateCredentials(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = await query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];

    // Same response whether the email is unknown or the password is wrong,
    // so the endpoint can't be used to enumerate accounts.
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, created_at: user.created_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — example protected route, proves the middleware works
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
