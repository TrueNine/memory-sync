import {ImageResponse} from 'next/og'

export const alt = 'memory-sync 文档'
export const size = {
  width: 1200,
  height: 630
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          padding: '48px',
          background:
            'linear-gradient(135deg, #090909 0%, #171717 52%, #2b1105 100%)',
          color: '#f6efe7',
          fontFamily: 'sans-serif'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            border: '4px solid #cf5d29',
            padding: '42px'
          }}
        >
          <div style={{fontSize: 24, letterSpacing: 4}}>RUST-FIRST / TOOL-RAT DOCS</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
            <div style={{fontSize: 84, fontWeight: 900}}>memory-sync</div>
            <div style={{fontSize: 32, maxWidth: 920}}>
              为多 AI 工具同步规则、命令、技能与记忆的中文优先文档站
            </div>
          </div>
          <div style={{fontSize: 22, color: '#f1ae8d'}}>
            manifesto homepage + /docs reference system
          </div>
        </div>
      </div>
    ),
    size
  )
}
