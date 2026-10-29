
import type { Metadata } from 'next';
import { Inter, Alegreya } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const alegreya = Alegreya({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'JimskaysAI | Digital Jimoh',
  description: 'Meet the digital version of Jimoh Jamihu—playful, intelligent, and always ready for a chat.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${alegreya.variable} antialiased`}>
        <FirebaseClientProvider>
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
