'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      console.log(error)
      alert(error.message)
      return
    }

    alert('ورود با موفقیت انجام شد')

    router.push('/')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-md border border-slate-800">

        <h1 className="text-3xl font-bold text-center mb-8">
          ورود مدیر
        </h1>

        <div className="space-y-4">

          <input
            type="email"
            placeholder="ایمیل"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-800 p-3 rounded-xl"
          />

          <input
            type="password"
            placeholder="رمز عبور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-800 p-3 rounded-xl"
          />

          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl"
          >
            {loading ? 'در حال ورود...' : 'ورود'}
          </button>

        </div>

      </div>
    </main>
  )
}