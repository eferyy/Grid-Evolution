import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dinzdp.gridevolution',
  appName: 'Grid Evolution',
  webDir: 'dist',
  // Disable Capacitor's default splash screen to use our custom in-app loading screen
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#121212',
      emptyBackgroundColor: '#121212'
    }
  },
  // Prevent immersive/fullscreen overlay — system bars must stay visible
  android: {
    backgroundColor: '#1E1E1E'
  }
};

export default config;
