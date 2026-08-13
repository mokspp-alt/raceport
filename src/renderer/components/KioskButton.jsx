export default function KioskButton({ variant = 'primary', keycap, children, onClick, type = 'button' }) {
  const isPrimary = variant === 'primary'
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 15,
        background: isPrimary ? '#f7da07' : '#151517',
        border: isPrimary ? 'none' : '2px solid rgba(136,136,171,0.48)',
        borderRadius: 100,
        padding: '17px 27px 17px 22px',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        transition: 'all 0.2s',
      }}
    >
      {keycap && (
        <span style={{
          background: isPrimary ? '#fbef92' : '#252529',
          border: '1px solid rgba(136,136,171,0.48)',
          borderRadius: 100,
          padding: '2px 7px',
          fontSize: 14,
          textTransform: 'uppercase',
          color: isPrimary ? '#514b1b' : '#8888ab',
        }}>
          {keycap}
        </span>
      )}
      <span style={{ fontSize: 20, textTransform: 'uppercase', color: isPrimary ? 'black' : '#8888ab' }}>
        {children}
      </span>
    </button>
  )
}
