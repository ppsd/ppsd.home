import { db } from './db.js'
import { verifyPin, signToken, verifyToken } from './security.js'

// ตำแหน่งของบัญชี: ใช้ที่ตั้งในผู้ใช้ ถ้าว่างใช้ "ตำแหน่ง" ของพนักงาน HR ที่ผูกอยู่ (ตั้งที่เดียวพอ)
export function effectivePosition(user) {
  if (!user) return ''
  if (user.position) return user.position
  try { return db.prepare('SELECT role FROM employees WHERE user_id=? ORDER BY id LIMIT 1').get(user.id)?.role || '' } catch { return '' }
}
export function login(username, pin) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPin(pin, user.pin)) return null
  if (user.status !== 'ใช้งาน') return { error: 'บัญชีถูกระงับการใช้งาน' }
  let deny = []
  try { deny = JSON.parse(user.deny_mods || '[]') } catch { deny = [] }
  const safe = { id: user.id, name: user.name, username: user.username, role: user.role, position: effectivePosition(user), mustChangePin: !!user.must_change_pin, deny_mods: Array.isArray(deny) ? deny : [] }
  return { token: signToken({ id: user.id }), user: safe }
}

export function logout() {
  // stateless tokens — nothing to invalidate server-side
}

// resolve a token to a fresh user record (so role/position changes take effect)
function userFromToken(token) {
  const payload = verifyToken(token)
  if (!payload) return null
  const u = db.prepare('SELECT id,name,username,role,status,position,deny_mods FROM users WHERE id = ?').get(payload.id)
  if (!u || u.status !== 'ใช้งาน') return null
  let deny = []
  try { deny = JSON.parse(u.deny_mods || '[]') } catch { deny = [] }
  return { id: u.id, name: u.name, username: u.username, role: u.role, position: effectivePosition(u), deny_mods: Array.isArray(deny) ? deny : [] }
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
// ตำแหน่งระดับผู้บริหาร = สิทธิ์อนุมัติ/เห็นกำไร/สั่งงานผ่าน LINE เท่ากับผู้จัดการ (CEO ก็อยู่ในกลุ่มนี้)
export const MANAGER_POSITIONS = ['ผู้จัดการ', 'CEO', 'ซีอีโอ', 'ประธาน', 'กรรมการผู้จัดการ', 'ผู้บริหาร', 'เจ้าของ']
export const isManagerPosition = (p) => MANAGER_POSITIONS.includes(String(p || '').trim())
export const canSeeSalary = (user) =>
  !!user && (user.role === 'admin' || user.role === 'accounting' || isManagerPosition(effectivePosition(user)) || effectivePosition(user) === 'บุคคล')
export function requireSalary(req, res, next) {
  if (!canSeeSalary(req.user)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูข้อมูลเงินเดือน' })
  next()
}

// only managers (ตำแหน่งผู้จัดการ) or admins may approve leave / OT / PR / time adjustments
export const isManager = (user) => !!user && (user.role === 'admin' || isManagerPosition(user.position) || isManagerPosition(effectivePosition(user)))
export function requireManager(req, res, next) {
  if (!isManager(req.user)) return res.status(403).json({ error: 'อนุมัติได้เฉพาะตำแหน่งผู้จัดการ/CEO เท่านั้น' })
  next()
}
