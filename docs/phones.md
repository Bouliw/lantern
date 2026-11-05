# Phones

Lantern works in the phone's browser and can be added to the home screen. For offline viewing (downloads), use the free official-ecosystem apps alongside it.

## Lantern on the home screen

1. Make sure the phone is on the same network as the computer that serves Lantern.
2. Open `http://<computer>:8097`.
3. iPhone (Safari): Share › **Add to Home Screen**. Android (Chrome): menu › **Add to home screen**.

## Offline: Swiftfin (iPhone)

1. Install **Swiftfin** from the App Store.
2. Add a server: `http://<jellyfin-host>:8096`, then sign in with your profile.
3. On a title, use **Download** to keep it on the phone.
4. Settings › Video Player: keep the native player for the best battery life on direct-play files.

## Offline: Findroid (Android)

1. Install **Obtainium**, then add `https://github.com/jarnedemeulemeester/findroid` as an app source and install Findroid from it (updates then arrive through Obtainium).
2. Add the server `http://<jellyfin-host>:8096` and sign in.
3. On a title, tap the download button to keep it on the phone.

Both apps use the same Jellyfin account, so watched status and resume positions stay in sync with Lantern.
