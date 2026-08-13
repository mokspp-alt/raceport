import logo from '../assets/brand/logo.png'

export default function KioskScreen({ children, footer, backgroundImage }) {
  return (
    <div className="screen fade-in" style={{
      background: '#151518',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 100,
      paddingBottom: 50,
      paddingLeft: 50,
      paddingRight: 50,
      gap: 40,
      fontFamily: 'var(--font-display)',
    }}>
      {backgroundImage && (
        <div style={{
          position: 'absolute', top: 100, left: 0, right: 0, height: '52%', zIndex: 0,
          WebkitMaskImage: 'radial-gradient(ellipse 44% 34% at 50% 30%, black 0%, rgba(0,0,0,0.6) 45%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 44% 34% at 50% 30%, black 0%, rgba(0,0,0,0.6) 45%, transparent 100%)',
        }}>
          <img src={backgroundImage} alt="" style={{
            position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '288%', height: '180%', objectFit: 'contain', opacity: 0.8,
          }} />
        </div>
      )}
      <img src={logo} alt="Raceport" style={{ height: 84, objectFit: 'contain', position: 'relative', zIndex: 1 }} />
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, position: 'relative', zIndex: 1 }}>
        {children}
      </div>
      {footer && <div style={{ position: 'relative', zIndex: 1 }}>{footer}</div>}
    </div>
  )
}
