import { useState, useEffect, useRef, useCallback } from 'react'

const MODEL = 'gemini-2.0-flash'
const STORAGE_KEY = 'nutritracker_data'
const GOALS_KEY = 'nutritracker_goals'
const API_KEY = ''

function getStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '')
  const [showConfig, setShowConfig] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [goals, setGoals] = useState(() => getStorage(GOALS_KEY, { cal: 2800, protein: 150, fat: 84, carbs: 350 }))
  const [entries, setEntries] = useState(() => getStorage(STORAGE_KEY, []))
  const [analyzing, setAnalyzing] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef(null)

  const today = new Date()
  const dateStr = today.toLocaleDateString('es', { month: 'short', day: 'numeric' })
  const todayKey = today.toDateString()
  const todayEntries = entries.filter(e => new Date(e.date).toDateString() === todayKey)
  const totals = todayEntries.reduce((acc, e) => ({
    cal: acc.cal + (e.calories || 0),
    protein: acc.protein + (e.protein || 0),
    fat: acc.fat + (e.fat || 0),
    carbs: acc.carbs + (e.carbs || 0)
  }), { cal: 0, protein: 0, fat: 0, carbs: 0 })

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) }, [entries])
  useEffect(() => { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)) }, [goals])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!apiKey) { setShowConfig(true); showToast('Configura tu API key'); return }
    setAnalyzing(true)
    try {
      const base64 = await fileToBase64(file)
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { text: 'Eres nutricionista. Analiza esta comida y responde SOLO JSON:\n{"name":"Nombre del plato","calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"sugar":0,"ingredients":["x"],"vitamins":{"A":"10%"},"recommendations":["x"]}' },
            { inlineData: { mimeType: file.type, data: base64 } }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        })
      })
      if (!resp.ok) throw new Error(`Error ${resp.status}`)
      const d = await resp.json()
      const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('No se pudo analizar la imagen')
      const result = JSON.parse(m[0])
      const entry = { ...result, date: new Date().toISOString(), id: Date.now(), thumbnail: URL.createObjectURL(file) }
      setEntries(prev => [entry, ...prev].slice(0, 100))
      showToast('✅ ' + (result.name || 'Analizado'))
    } catch (e) {
      showToast('❌ ' + e.message)
    }
    setAnalyzing(false)
  }, [apiKey, showToast])

  const totalPct = (v, goal) => Math.min(100, (v / goal) * 100)
  const ring = (pct, color, size = 200, stroke = 10) => {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const off = circ - (pct / 100) * circ
    return { r, circ, off, color, size, stroke }
  }

  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-screen relative font-['Inter',sans-serif] pb-[90px]">
      {/* Toast */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-300 shadow-lg ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
        {toast}
      </div>

      {/* Header Date */}
      <div className="pt-8 pb-2 text-center">
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{dateStr}</span>
      </div>

      {/* Calorie Ring */}
      <div className="flex justify-center py-4">
        <ProgressRing pct={totalPct(totals.cal, goals.cal)} color="#E9C46A" size={200} stroke={8}>
          <div className="text-center">
            <div className="text-5xl font-bold text-gray-900 tracking-tight">{totals.cal.toFixed(0)}</div>
            <div className="text-sm text-gray-400 font-medium mt-0.5">/ {goals.cal} kcal</div>
          </div>
        </ProgressRing>
      </div>

      {/* Macro Rings */}
      <div className="flex justify-center gap-6 py-3">
        <MacroRing label="Proteína" value={totals.protein.toFixed(1)} goal={goals.protein} unit="g" color="#F26B7A" pct={totalPct(totals.protein, goals.protein)} />
        <MacroRing label="Grasa" value={totals.fat.toFixed(1)} goal={goals.fat} unit="g" color="#4FC3F7" pct={totalPct(totals.fat, goals.fat)} />
        <MacroRing label="Carbos" value={totals.carbs.toFixed(1)} goal={goals.carbs} unit="g" color="#66D17A" pct={totalPct(totals.carbs, goals.carbs)} />
      </div>

      {/* AI Card */}
      <div className="mx-4 mt-4">
        <label className="block">
          <div className="bg-[#EFCB72] rounded-2xl p-4 flex items-center justify-between shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/30 rounded-xl flex items-center justify-center text-lg">🧠</div>
              <span className="font-semibold text-gray-800 text-sm">Perspectivas de IA</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
            <span className="text-gray-600 text-lg">›</span>
          </div>
        </label>
      </div>

      {/* Analyzing */}
      {analyzing && (
        <div className="mx-4 mt-3 bg-gray-50 rounded-2xl p-4 text-center">
          <div className="w-8 h-8 border-3 border-gray-200 border-t-[#E9C46A] rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm font-medium text-gray-500">Analizando con Gemini AI...</div>
        </div>
      )}

      {/* Goal Settings */}
      <div className="mx-4 mt-4 flex gap-2 overflow-x-auto pb-1">
        {['cal', 'protein', 'fat', 'carbs'].map(k => (
          <div key={k} className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2 text-xs flex-shrink-0">
            <span className="text-gray-400 font-medium capitalize">{k === 'cal' ? 'kcal' : k === 'protein' ? 'prote' : k === 'fat' ? 'grasa' : 'carbs'}</span>
            <input
              type="number"
              className="w-14 bg-transparent text-gray-800 font-semibold text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={goals[k]}
              onChange={e => setGoals(p => ({ ...p, [k]: Math.max(1, parseFloat(e.target.value) || 1) }))}
            />
          </div>
        ))}
      </div>

      {/* Meal List */}
      <div className="px-4 mt-4 space-y-2">
        {entries.length === 0 && !analyzing && (
          <div className="text-center py-10 text-gray-300">
            <div className="text-4xl mb-3">🍽️</div>
            <div className="text-sm font-medium">Toca "Perspectivas de IA"</div>
            <div className="text-xs mt-1">y sube la foto de tu comida</div>
          </div>
        )}
        {entries.map(e => (
          <MealCard key={e.id} entry={e} goals={goals} />
        ))}
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/90 backdrop-blur-xl border-t border-gray-100 flex items-center justify-around py-2 px-6 z-40">
        <button className="p-2 text-gray-300 hover:text-gray-500 transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </button>
        <button onClick={() => fileRef.current?.click()} className="w-14 h-14 bg-[#F4A621] rounded-full flex items-center justify-center shadow-lg shadow-amber-200 -mt-4 active:scale-90 transition-transform">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button onClick={() => setShowConfig(p => !p)} className="p-2 text-gray-300 hover:text-gray-500 transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </nav>

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowConfig(false)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-6 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">Configuración</h3>
            <p className="text-sm text-gray-400 mb-5">Tu API key se guarda en el navegador</p>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Gemini API Key</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#E9C46A] transition-colors"
              placeholder={apiKey ? '✓ API configurada' : 'Ingresa tu API key'}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform"
                onClick={() => {
                  if (keyInput.trim()) { setApiKey(keyInput.trim()); localStorage.setItem('geminiApiKey', keyInput.trim()); showToast('✅ API key guardada'); setShowConfig(false) }
                  else showToast('Ingresa una API key')
                }}
              >Guardar</button>
              {apiKey && keyInput && (
                <button className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform" onClick={async () => {
                  try {
                    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${keyInput.trim()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }) })
                    showToast(r.ok ? '✅ Conexión exitosa' : '❌ Error en la clave')
                  } catch { showToast('❌ Error de conexión') }
                }}>Probar</button>
              )}
            </div>
            {!apiKey && (
              <a className="block text-center text-xs text-[#E9C46A] mt-3 font-medium" href="https://aistudio.google.com/" target="_blank" rel="noopener">Obtener API key →</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressRing({ pct, color, size, stroke, children }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F3F6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

function MacroRing({ label, value, goal, unit, color, pct }) {
  const size = 80, stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F3F6" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
            className="transition-all duration-1000 ease-out drop-shadow-sm" style={{ filter: `drop-shadow(0 2px 4px ${color}40)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-gray-900 leading-none">{value}</span>
          <span className="text-[9px] text-gray-400 font-medium">{unit}</span>
        </div>
      </div>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </div>
  )
}

function MealCard({ entry, goals }) {
  const dots = [
    { color: '#F26B7A', val: entry.protein?.toFixed(1) },
    { color: '#4FC3F7', val: entry.fat?.toFixed(1) },
    { color: '#66D17A', val: entry.carbs?.toFixed(1) }
  ]
  return (
    <div className="bg-white rounded-2xl p-3.5 flex items-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-50">
      {entry.thumbnail ? (
        <img src={entry.thumbnail} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{entry.name || 'Comida'}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-gray-700">{entry.calories?.toFixed(0) || 0} kcal</span>
          <span className="text-gray-200">·</span>
          <div className="flex items-center gap-2.5">
            {dots.map((d, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[11px] text-gray-400 font-medium">{d.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
