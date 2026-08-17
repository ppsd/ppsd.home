import { db } from './db.js'
import { verifyPin, signToken, verifyToken } from './security.js'

export function login(username, pin) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPin(pin, user.pin)) return null
  if (user.status !== 'ใช้งาน') return { error: 'บัญชีถูกระงับการใช้งาน' }
  const safe = { id: user.id, name: user.name, username: user.username, role: user.role, position: user.position || '', mustChangePin: !!user.must_change_pin }
  return { token: signToken({ id: user.id }), user: safe }
}

export function logout() {
  // stateless tokens — nothing to invalidate server-side
}

// resolve a token to a fresh user record (so role/position changes take effect)
function userFromToken(token) {
  const payload = verifyToken(token)
  if (!payload) return null
  const u = db.prepare('SELECT id,name,username,role,status,position FROM users WHERE id = ?').get(payload.id)
  if (!u || u.status !== 'ใช้งาน') return null
  return { id: u.id, name: u.name, username: u.username, role: u.role, position: u.position || '' }
}

// Express middleware: attaches req.user or 401s
export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const user = userFromToken(token)
  if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' })
  req.user = user
  next()
}

// Express middleware factory: only allow the listed roles
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'บทบาทของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้' })
    }
    next()
  }
}

// salary/payroll data is restricted to บัญชี + ผู้จัดการ + HR (บุคคล) + admin
export const canSeeSalary = (user) =>
  !!user && (user.role === 'admin' || user.role === 'accounting' || user.position === 'ผู้จัดการ' || user.position === 'บุคคล')
export function requireSalary(req, res, next) {
  if (!canSeeSalary(req.user)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูข้อมูลเงินเดือน' })
  next()
}

// only managers (ตำแหน่งผู้จัดการ) or admins may approve leave / OT / PR / time adjustments
export const isManager = (user) => !!user && (user.role === 'admin' || user.position === 'ผู้จัดการ')
export function requireManager(req, res, next) {
  if (!isManager(req.user)) return res.status(403).json({ error: 'อนุมัติได้เฉพาะตำแหน่งผู้จัดการเท่านั้น' })
  next()
}
