# AUP3 → MP3 Converter

Convertisseur **gratuit** et **100 % privé** de projets Audacity (`.aup3`) vers MP3.

- Traitement entièrement dans le navigateur (aucun fichier n’est envoyé sur un serveur)
- Sortie : MP3 mono 192 kbps @ 44.1 kHz (parfait pour podcast)
- Open source

## Utilisation

1. Ouvrez le site
2. Sélectionnez votre fichier `.aup3`
3. Téléchargez le MP3 généré

## Technologie

- Next.js
- sql.js (lecture de la base SQLite .aup3)
- lamejs (encodage MP3)

## Développement

```bash
npm install
npm run dev
```

## Licence

MIT
