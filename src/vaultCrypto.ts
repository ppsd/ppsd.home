// การเข้ารหัสคลังรหัสผ่าน — ทำทั้งหมดในเบราว์เซอร์ด้วย Web Crypto
// กุญแจ: PBKDF2(passphrase, salt, 600,000 รอบ, SHA-256) → AES-256-GCM · เซิร์ฟเวอร์เห็นแค่ ciphertext (iv.ct แบบ base64)
// passphrase และกุญแจอยู่ในหน่วยความจำของแท็บเท่านั้น ไม่เก็บลง localStorage

const te = new TextEncoder()
const td = new TextDecoder()
const PBKDF2_ITER = 600000
export const VAULT_CHECK_TEXT = 'ppsd-vault-ok' // ค่าคงที่ที่เข้ารหัสเก็บไว้ ใช้ตรวจว่า passphrase ถูกตอนปลดล็อก

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle

function b64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s)
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const u = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)))

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const raw = te.encode(passphrase.normalize('NFKC'))
  const base = await crypto.subtle.importKey('raw', raw as BufferSource, 'PBKDF2', false, ['deriveKey'])
  const params: Pbkdf2Params = { name: 'PBKDF2', salt: unb64(saltB64) as BufferSource, iterations: PBKDF2_ITER, hash: 'SHA-256' }
  return crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 } as AesKeyGenParams, false, ['encrypt', 'decrypt'] as KeyUsage[])
}

export async function encryptJson(key: CryptoKey, obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)) as BufferSource)
  return b64(iv) + '.' + b64(ct)
}

export async function decryptJson<T>(key: CryptoKey, packed: string): Promise<T> {
  const [ivB, ctB] = String(packed || '').split('.')
  if (!ivB || !ctB) throw new Error('รูปแบบข้อมูลเข้ารหัสไม่ถูกต้อง')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB) as BufferSource }, key, unb64(ctB) as BufferSource)
  return JSON.parse(td.decode(pt)) as T
}

// ตรวจ passphrase: ถอดค่าตรวจสอบได้และตรงกับค่าคงที่ = ถูกต้อง
export async function verifyKey(key: CryptoKey, check: string): Promise<boolean> {
  try { return (await decryptJson<string>(key, check)) === VAULT_CHECK_TEXT } catch { return false }
}

// ความแข็งแรงของ passphrase (คำเตือนตอนตั้งครั้งแรก)
export function passphraseStrength(p: string): { ok: boolean; msg: string } {
  if (p.length < 12) return { ok: false, msg: 'ต้องยาวอย่างน้อย 12 ตัวอักษร' }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/, /[฀-๿]/].filter((r) => r.test(p)).length
  if (kinds < 2) return { ok: false, msg: 'ควรผสมตัวอักษรหลายแบบ (ตัวเล็ก/ใหญ่/ตัวเลข/สัญลักษณ์)' }
  return { ok: true, msg: p.length >= 16 && kinds >= 3 ? 'แข็งแรงมาก' : 'ใช้ได้' }
}
