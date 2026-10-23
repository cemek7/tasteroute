import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TasteRoute',
  description: 'A mood and a city become a three-stop outing, with reasons you can check.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
