import { useState } from 'react'
import { api, setToken, AuthUser } from '../api'

interface Props {
  needsSetup: boolean
  onAuth: (user: AuthUser) => void
}

export default function LoginScreen({ needsSetup, onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(needsSetup ? 'register' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Username and password required'); return }
    setLoading(true); setError('')
    try {
      const res = mode === 'login'
        ? await api.login(username.trim(), password)
        : await api.register(username.trim(), password)
      setToken(res.token)
      onAuth({ id: res.id, username: res.username })
    } catch (err) {
      setError(String(err).replace('Error: ', ''))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center p-4" style={{ background: '#FFE500' }}>
      <div className="bg-white border-4 border-black p-8 w-full max-w-sm" style={{ boxShadow: '8px 8px 0 #000' }}>
        <div className="mb-6">
          <h1 className="text-2xl font-black uppercase tracking-widest">◈ ATOMIC</h1>
          <p className="text-xs font-mono opacity-50 mt-1">// task dependency graph</p>
        </div>

        <h2 className="font-black uppercase tracking-widest text-sm mb-4 border-b-4 border-black pb-2">
          {needsSetup ? 'CREATE ADMIN ACCOUNT' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-black uppercase tracking-widest block mb-1">Username</label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              className="w-full border-4 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50"
              placeholder="username"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest block mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border-4 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs font-black text-red-600 bg-red-50 border-2 border-red-300 px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="bg-black text-white font-black uppercase tracking-widest py-3 border-4 border-black hover:bg-yellow-300 hover:text-black transition-colors disabled:opacity-40 mt-1"
            style={{ boxShadow: '4px 4px 0 #000' }}>
            {loading ? '…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>

        {!needsSetup && (
          <p className="text-xs font-mono text-center mt-4 opacity-60">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}
              className="font-black underline"
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
