import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dinzdp.gridevolution',
  appName: 'Grid Evolution',
  webDir: 'dist',
  // Disable Capacitor's default splash screen to use our custom in-app loading screen
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,        // Hide native splash immediately (0ms)
      launchAutoHide: true,
      backgroundColor: '#1E1E1E',   // Match our loading screen bg — no white flash
      splashFullScreen: true,       // Cover the entire screen during transition
      splashImmersive: false        // Keep system bars visible (no immersive mode)
    }
  },
  // Prevent immersive/fullscreen overlay — system bars must stay visible
  android: {
    backgroundColor: '#1E1E1E'
  }
};

export default config;
