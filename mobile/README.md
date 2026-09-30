# Evidence Locker Mobile App

This directory contains the Capacitor mobile wrapper for **Evidence Locker**, integrating the React frontend (`../frontend`) into a native Android application.

## Prerequisites

- Node.js & npm
- Android Studio (with Android SDK and Android Emulator)

## Available Scripts

- **Build Frontend & Sync**: `npm run build:android`
- **Sync Web Assets**: `npx cap sync`
- **Open in Android Studio**: `npx cap open android`

## Getting Started

1. Install mobile dependencies:
   ```bash
   npm install
   ```

2. Build the frontend and sync with Android:
   ```bash
   npm run build:android
   ```

3. Open the Android project in Android Studio:
   ```bash
   npx cap open android
   ```

4. Run the app on an Android emulator or physical device from Android Studio.

## API Connection

The Android emulator reaches the development computer through `http://10.0.2.2:5000`. For a
physical Android device, create `frontend/.env.local` before building and set the computer's
LAN address:

```env
VITE_API_URL=http://192.168.1.25:5000
```

Replace `192.168.1.25` with the computer's current LAN IP. Keep the phone and computer on the
same network, allow port `5000` through the firewall, and ensure the backend is running
(`npm run dev:backend` from the repository root). Rebuild and sync after changing the URL:
`npm run build:android`.
