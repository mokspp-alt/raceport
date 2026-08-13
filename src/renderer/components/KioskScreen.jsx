import logo from '../assets/brand/logo.png'

export default function KioskScreen({ children, footer }) {
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
      <img src={logo} alt="Raceport" style={{ height: 84, objectFit: 'contain' }} />
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
        {children}
      </div>
      {footer}
    </div>
  )
}
