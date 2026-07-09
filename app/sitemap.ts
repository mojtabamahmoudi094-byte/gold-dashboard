import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'

const PUBLIC_ROUTES = [
  '',
  '/stocks',
  '/funds',
  '/monitor',
  '/analysis',
  '/valuation',
  '/trade-value',
  '/compare',
  '/signals',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: 'hourly',
    priority: route === '' ? 1 : 0.7,
  }))
}
