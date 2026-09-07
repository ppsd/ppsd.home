import Icon from './Icon'
import { phMap } from '../data'

interface PlaceholderProps {
  id: string
  pageTitle: string
}

export default function Placeholder({ id, pageTitle }: PlaceholderProps) {
  const ph = phMap[id] || { icon: 'M4 6h16', desc: '' }
  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px dashed #CFD8DF', borderRadius: 14, padding: '64px 40px', textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: 13, background: '#EDF1F4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Icon path={ph.icon} size={26} color="#30506A" width={1.7} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1C2730' }}>{pageTitle}</div>
        <div style={{ fontSize: 13.5, color: '#5C6770', marginTop: 6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>{ph.desc}</div>
        <div style={{ fontSize: 12.5, color: '#94A0A8', marginTop: 18, background: '#F7F9FB', border: '1px solid #EEF1F4', borderRadius: 9, padding: '9px 16px', display: 'inline-block' }}>
          หน้านี้อยู่ในลำดับถัดไป — เลือก "หน้าสรุป" หรือ "บ้าน" เพื่อดูที่ทำเสร็จแล้ว
        </div>
      </div>
    </div>
  )
}
