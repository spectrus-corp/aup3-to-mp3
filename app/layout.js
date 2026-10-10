export const metadata = {
  title: 'AUP3 → MP3 Converter',
  description: 'Convertisseur gratuit Audacity .aup3 vers MP3 en ligne',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  );
}
