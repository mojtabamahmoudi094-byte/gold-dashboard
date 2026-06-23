'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

import DatePicker from 'react-multi-date-picker'
import persian from 'react-date-object/calendars/persian'
import persian_fa from 'react-date-object/locales/persian_fa'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

export default function Home() {
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editValue, setEditValue] = useState('')

  const loadData = async () => {
    const { data, error } = await supabase
      .from('gold_funds')
      .select('*')
      .order('id', { ascending: false })

    if (!error && data) {
      setRecords(data)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const saveData = async () => {
    if (!date || !value) {
      alert('تاریخ و ارزش معاملات را وارد کنید')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('gold_funds')
      .insert([
        {
          trade_date_shamsi: date,
          trade_value: Number(value),
        },
      ])

    setLoading(false)

    if (error) {
      console.log(error)
      alert('خطا در ذخیره اطلاعات')
      return
    }

    alert('اطلاعات با موفقیت ذخیره شد')

    setDate('')
    setValue('')

    loadData()
  }

  const deleteRecord = async (id: number) => {
    const ok = confirm('آیا از حذف این رکورد مطمئن هستید؟')

    if (!ok) return

    const { error } = await supabase
      .from('gold_funds')
      .delete()
      .eq('id', id)

    if (error) {
      alert('خطا در حذف')
      return
    }

    loadData()
  }

  const startEdit = (record: any) => {
    setEditingId(record.id)
    setEditDate(record.trade_date_shamsi || '')
    setEditValue(record.trade_value?.toString() || '')
  }

  const saveEdit = async () => {
    if (!editingId) return

    const { error } = await supabase
      .from('gold_funds')
      .update({
        trade_date_shamsi: editDate,
        trade_value: Number(editValue),
      })
      .eq('id', editingId)

    if (error) {
      alert('خطا در ویرایش')
      return
    }

    setEditingId(null)
    loadData()
  }

  const chartData = [...records]
    .reverse()
    .map((item) => ({
      date: item.trade_date_shamsi,
      value: item.trade_value,
    }))

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-16">

        <h1 className="text-5xl font-bold text-center mb-3">
          شاگرد تنبل بازار
        </h1>

        <p className="text-center text-slate-400 mb-12">
          ثبت ارزش معاملات صندوق‌های طلا
        </p>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl mb-10">

          <h2 className="text-xl font-semibold mb-8 text-center">
            ثبت اطلاعات روزانه
          </h2>

          <div className="space-y-5">

            <div>
              <label className="block mb-2 text-slate-300">
                تاریخ شمسی
              </label>

              <DatePicker
                calendar={persian}
                locale={persian_fa}
                value={date}
                format="YYYY/MM/DD"
                onChange={(value: any) =>
                  setDate(value?.format?.('YYYY/MM/DD') || '')
                }
                inputClass="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white"
                placeholder="انتخاب تاریخ"
              />
            </div>

            <div>
              <label className="block mb-2 text-slate-300">
                ارزش معاملات
              </label>

              <input
                type="number"
                placeholder="مثال: 350000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white"
              />
            </div>

            <button
              onClick={saveData}
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 rounded-xl"
            >
              {loading ? 'در حال ثبت...' : 'ثبت اطلاعات'}
            </button>

          </div>

        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl mb-10">

          <h2 className="text-2xl font-bold mb-8">
            نمودار ارزش معاملات
          </h2>

          <div style={{ width: '100%', height: 400 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#eab308"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">

          <h2 className="text-2xl font-bold mb-8">
            آرشیو اطلاعات
          </h2>

          <table className="w-full">

            <thead>
              <tr className="border-b border-slate-700">
                <th className="p-3">تاریخ</th>
                <th className="p-3">ارزش معاملات</th>
                <th className="p-3">عملیات</th>
              </tr>
            </thead>

            <tbody>

              {records.map((record) => (

                <tr
                  key={record.id}
                  className="border-b border-slate-800"
                >

                  <td className="p-3 text-center">

                    {editingId === record.id ? (
                      <DatePicker
                        calendar={persian}
                        locale={persian_fa}
                        value={editDate}
                        format="YYYY/MM/DD"
                        onChange={(value: any) =>
                          setEditDate(
                            value?.format?.('YYYY/MM/DD') || ''
                          )
                        }
                        inputClass="bg-slate-800 px-2 py-1 rounded text-white"
                      />
                    ) : (
                      record.trade_date_shamsi
                    )}

                  </td>

                  <td className="p-3 text-center">

                    {editingId === record.id ? (
                      <input
                        value={editValue}
                        onChange={(e) =>
                          setEditValue(e.target.value)
                        }
                        className="bg-slate-800 px-2 py-1 rounded text-white"
                      />
                    ) : (
                      Number(record.trade_value).toLocaleString()
                    )}

                  </td>

                  <td className="p-3 text-center">

                    {editingId === record.id ? (
                      <button
                        onClick={saveEdit}
                        className="bg-green-600 px-4 py-2 rounded"
                      >
                        ذخیره
                      </button>
                    ) : (
                      <div className="flex justify-center gap-2">

                        <button
                          onClick={() => startEdit(record)}
                          className="bg-blue-700 px-4 py-2 rounded"
                        >
                          ویرایش
                        </button>

                        <button
                          onClick={() =>
                            deleteRecord(record.id)
                          }
                          className="bg-red-700 px-4 py-2 rounded"
                        >
                          حذف
                        </button>

                      </div>
                    )}

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>
    </main>
  )
}