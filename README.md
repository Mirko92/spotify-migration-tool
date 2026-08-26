# Spotify Migration Tool

Tool frontend-only per migrare playlist, brani salvati e artisti seguiti tra due account Spotify.

## Architettura attuale

- Frontend React + Vite
- OAuth Spotify con PKCE direttamente nel browser
- Nessun backend applicativo
- Deploy statico su Firebase Hosting

## Prerequisiti

- Node.js LTS
- Un account Firebase (progetto: `spotifymigrationtool-d722b`)
- Una app su Spotify Developer Dashboard

## Configurazione Spotify

Nel dashboard Spotify configura questi Redirect URI.

### Locale

- `http://127.0.0.1:5173/auth/source`
- `http://127.0.0.1:5173/auth/destination`

### Produzione Firebase

- `https://spotifymigrationtool-d722b.web.app/auth/source`
- `https://spotifymigrationtool-d722b.web.app/auth/destination`

Nota: puoi anche usare il dominio `firebaseapp.com` se e quello che pubblichi, ma deve combaciare esattamente con l'URL effettivo.

## Variabili ambiente

### Sviluppo locale

Configura [.env.example](.env.example):

```env
VITE_SPOTIFY_CLIENT_ID=il_tuo_spotify_client_id
VITE_SPOTIFY_SOURCE_REDIRECT_URI=http://127.0.0.1:5173/auth/source
VITE_SPOTIFY_DESTINATION_REDIRECT_URI=http://127.0.0.1:5173/auth/destination
```

### Produzione

Usa [.env.production](.env.production):

```env
VITE_SPOTIFY_CLIENT_ID=il_tuo_spotify_client_id
VITE_OAUTH_BASE_URL=https://spotifymigrationtool-d722b.web.app
```

## Avvio locale

Dal root progetto:

```bash
npm install
npm start
```

Questo avvia Vite su `http://127.0.0.1:5173`.

## Build

Dal root:

```bash
npm run build
```

Output in `dist`.

## Deploy su Firebase Hosting

### Primo setup

```bash
npm install -g firebase-tools
firebase login
firebase use spotifymigrationtool-d722b
```

### Deploy

```bash
npm run build
firebase deploy --only hosting
```

## Troubleshooting

### Invalid redirect URI

Verifica che i Redirect URI su Spotify siano identici a quelli usati dall'app (schema, dominio, path e porta).

### Login locale funziona ma produzione no

Controlla che [.env.production](.env.production) abbia la base URL corretta e che su Spotify siano presenti i redirect con dominio Firebase.

### 403 durante auth

L'account va aggiunto in Spotify Developer Dashboard nella sezione User Management (se app in modalita sviluppo).
