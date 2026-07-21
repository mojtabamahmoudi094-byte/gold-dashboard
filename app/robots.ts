import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'

const DISALLOW = ['/admin', '/api', '/auth', '/dashboard', '/portfolio']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      // اجازه صریح به کراولرهای AI — محتوا برای دیده‌شدن در AI Overviews/ChatGPT/Perplexity طراحی شده
      { userAgent: 'GPTBot', allow: '/', disallow: DISALLOW },
      { userAgent: 'ClaudeBot', allow: '/', disallow: DISALLOW },
      { userAgent: 'PerplexityBot', allow: '/', disallow: DISALLOW },
      { userAgent: 'Google-Extended', allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
