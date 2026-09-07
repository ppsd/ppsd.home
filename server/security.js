import { createHmac, createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, 'data')
const secretFile = join(dataDir, 'secret.key')

// a persistent server secret (created once) so signed tokens survive restarts
let SECRET
if (existsSync(secretFile)) SECRET = readFileSync(secretFile, 'utf8').trim()
else {
  mkdirSync(dataDir, { recursive: true }) // ensure server/data exists on a fresh install
  SECRET = randomBytes(32).toString('hex')
  writeFileSync(secretFile, SECRET)
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')

// ---- PIN / password hashing (salted SHA-256; salt is the server secret) ----
export function hashPin(pin) {
  return createHash('sha256').update(SECRET + ':' + String(pin)).digest('hex')
}
export const isHashed = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
export function verifyPin(plain, stored) {
  if (stored == null) return false
  return isHashed(stored) ? hashPin(plain) === stored : String(plain) === String(stored)
}

// ---- stateless signed token: base64url(payload).hmac, with expiry ----
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
export function signToken(payload) {
  const now = Date.now()
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL }))
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url')
  if (sig !== expect) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.exp && Date.now() > payload.exp) return null // expired
    return payload
  } catch {
    return null
  }
}
