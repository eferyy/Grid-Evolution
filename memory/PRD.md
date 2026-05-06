# Grid Evolution — Mobile Port PRD

## Overview
Grid Evolution, 2048 türevi minimalist ve karanlık temalı bir bulmaca oyunudur. Bu proje, mevcut Vite/React tabanlı web oyununu Expo (React Native) WebView sarmalayıcısı kullanarak Google Play Store'a yayınlanmaya hazır tamamen offline bir Android uygulamasına port eder.

## Build Stack
- **Wrapper**: Expo SDK 54 + expo-router + react-native-webview 13.15
- **Game Core**: Vite 6 ile tek dosyalı HTML (`vite-plugin-singlefile`) olarak build edilir, base64 ile `src/gameHtml.ts` içine gömülür — tamamen offline çalışır, hiçbir ağ isteği yapmaz.
- **Haptics Bridge**: Oyun içindeki `navigator.vibrate` çağrıları WebView üzerinden React Native `expo-haptics` API'sine yönlendirilir (Android WebView'ın zayıf titreşim desteğini atlar).

## App Identity (Play Store)
- **Package name (Android)**: `com.dinzdp.gridevolution`
- **Bundle ID (iOS)**: `com.dinzdp.gridevolution`
- **Version**: `1.0.2`
- **versionCode / buildNumber**: `3`
- **App name**: `Grid Evolution`
- **Primary color**: `#6366F1`
- **Background / theme**: `#121212` (dark)
- **Orientation**: Portrait (kilitli)

## Permissions (Zero)
Uygulama **hiçbir izin istemez** (kullanıcı seçimi: offline, izinsiz). `android.permission.INTERNET` dahi talep edilmez. Aşağıdaki izinler AndroidManifest'e eklenmesin diye `blockedPermissions` listesinde:
- CAMERA, RECORD_AUDIO
- ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION
- READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE
- READ_MEDIA_IMAGES / VIDEO / AUDIO
- READ_CONTACTS
- SYSTEM_ALERT_WINDOW

## Key Mobile Optimizations
- ✅ Portrait lock (`orientation: "portrait"`)
- ✅ SafeAreaView + SafeAreaProvider (notch/edge-to-edge)
- ✅ Dark status bar + navigation bar
- ✅ Android hardware back button: önce oyun içi modal'ları kapatır, sonra "Çıkış" onayı sorar
- ✅ Pinch-to-zoom, pull-to-refresh, overscroll devre dışı
- ✅ Haptics köprüsü (expo-haptics, intensity-aware)
- ✅ Adaptive icon (foreground + background) + splash screen
- ✅ WebView hardware accelerated layer, cache enabled
- ✅ Tüm oyun verileri cihazda localStorage (IndexedDB) içinde tutulur
- ✅ **In-App Review prompt**: yüksek skor 50'yi geçtiğinde bir kez (`expo-store-review`) native Play Store rating pop-up'ı, fallback olarak `market://details?id=com.dinzdp.gridevolution` deep link.

## Store Assets (hazırlandı)
- `assets/images/icon.png` — 1024×1024 masked icon
- `assets/images/adaptive-icon.png` — 1024×1024 Android foreground
- `assets/images/splash-icon.png` — 512×512 splash center
- `assets/images/favicon.png` — 48×48 web favicon

## Store Copy & Legal
- `store/description_tr.md`, `store/description_en.md` — açıklama metinleri
- `store/privacy_policy.md` — gizlilik politikası (veri toplamaz)
- `store/data_safety.md` — Play Console Data safety form cevapları

## Next Action Items
1. Publish → Emergent "Publish" butonuyla Android AAB oluştur (veya EAS Build).
2. Play Console'a yükle, data safety formunu `store/data_safety.md`'deki cevaplarla doldur.
3. Gizlilik politikası linkini hostla (GitHub Pages veya kendi domaininde) ve Play Console'a ekle.
