import type { Metadata } from 'next'
import { SITE_URL } from './site'

export function pageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string
  description: string
  path: string
  image?: string
}): Metadata {
  const url = `${SITE_URL}${path}`
  const images = [{ url: image || '/icon.jpeg', width: 256, height: 256, alt: title }]
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url,
      siteName: 'بورس سنج',
      locale: 'fa_IR',
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: images.map((i) => i.url),
    },
  }
}
