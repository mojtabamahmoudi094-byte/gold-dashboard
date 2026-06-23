'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../../lib/supabase'

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = (e: any) => {
    setFile(e.target.files[0])
  }

  const upload = async () => {
    if (!file) return alert('فایل انتخاب نشده')

    setLoading(true)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: async (results: any) => {
        const formatted = results.data
          .map((row: any) => ({
            trade_date_shamsi: row.trade_date_shamsi,
            trade_value: Number(row.trade_value),
          }))
          .filter((r: any) => r.trade_date_shamsi && !isNaN(r.trade_value))

        const { error } = await supabase
          .from('gold_funds')
          .insert(formatted)

        setLoading(false)

        if (error) {
          console.log(error)
          alert('خطا در ایمپورت')
        } else {
          alert('ایمپورت موفق شد')
        }
      },

      error: () => {
        setLoading(false)
        alert('خطا در خواندن فایل')
      },
    })
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 w-full max-w-md">

        <h1 className="text-2xl font-bold mb-6 text-center">
          Import CSV
        </h1>

        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="w-full mb-4"
        />

        <button
          onClick={upload}
          disabled={loading}
          className="w-full bg-yellow-500 text-black font-bold py-3 rounded-xl"
        >
          {loading ? 'در حال آپلود...' : 'ایمپورت'}
        </button>

      </div>
    </main>
  )
}