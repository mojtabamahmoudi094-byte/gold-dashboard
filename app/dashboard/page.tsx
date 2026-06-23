'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

import DatePicker from 'react-multi-date-picker'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export default function DashboardPage() {
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const safe = (v: any) => Number(v || 0)

  const loadData = async () => {
    const { data } = await supabase
      .from('gold_funds')
      .select('*')
      .order('id', { ascending: true })

    if (data) setRecords(data)
  }

  useEffect(() => {
    loadData()
  }, [])

  const saveData = async () => {
    if (!date || !value) return alert('Missing data')

    setLoading(true)

    await supabase.from('gold_funds').insert([
      {
        trade_date_shamsi: date,
        trade_value: safe(value),
      },
    ])

    setLoading(false)
    setDate('')
    setValue('')
    loadData()
  }

  const sorted = [...records]

  const last = sorted.at(-1)?.trade_value || 0
  const prev = sorted.at(-2)?.trade_value || 0
  const change = prev ? (((last - prev) / prev) * 100).toFixed(2) : '0'

  const chartData = sorted.map((i) => ({
    date: i.trade_date_shamsi,
    value: safe(i.trade_value),
  }))

  return (
    <main className="min-h-screen bg-[#070A12] text-white px-6 py-10">

      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">
              GOLD MARKET TERMINAL
            </h1>
            <p className="text-white/40 text-sm">
              live analytics dashboard
            </p>
          </div>

          <div className={`text-sm px-3 py-1 rounded-md border ${
            Number(change) >= 0
              ? 'border-green-400 text-green-400'
              : 'border-red-400 text-red-400'
          }`}>
            {change}% 24h
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-4">

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-white/40 text-xs">LAST</p>
            <p className="text-xl font-semibold">{last.toLocaleString()}</p>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-white/40 text-xs">PREVIOUS</p>
            <p className="text-xl font-semibold">{prev.toLocaleString()}</p>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-white/40 text-xs">DATA POINTS</p>
            <p className="text-xl font-semibold">{records.length}</p>
          </div>

        </div>

        {/* CHART */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 h-[380px]">
          <ResponsiveContainer>
            <AreaChart data={chartData}>
              <XAxis dataKey="date" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#facc15"
                fill="#facc1520"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* INPUT */}
        <div className="grid md:grid-cols-3 gap-3">
          <DatePicker
            calendar={persian}
            locale={persian_fa}
            value={date}
            onChange={(v: any) =>
              setDate(v?.format?.('YYYY/MM/DD') || '')
            }
            inputClass="w-full bg-white/5 border border-white/10 p-3 rounded-lg"
          />

          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-white/5 border border-white/10 p-3 rounded-lg"
            placeholder="value"
          />

          <button
            onClick={saveData}
            disabled={loading}
            className="bg-yellow-400 text-black font-semibold rounded-lg"
          >
            {loading ? '...' : 'EXECUTE'}
          </button>
        </div>

      </div>
    </main>
  )
}