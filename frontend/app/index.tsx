import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { GAME_HTML_B64 } from '../src/gameHtmlLoader';

// Play Store package id — kept in sync with app.json android.package.
const ANDROID_PACKAGE_ID = 'com.dinzdp.gridevolution';
// Score threshold above which we ask for an in-app rating (one time only).
const RATING_HIGH_SCORE_THRESHOLD = 50;

// Pure-JS base64 decoder that works in React Native (no atob/Buffer needed).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64Html(input: string): string {
  const str = input.replace(/=+$/, '');
  // Build via array-join; faster than repeated string concatenation for large inputs.
  const chars: string[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = B64_CHARS.indexOf(str.charAt(i));
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      chars.push(String.fromCharCode((buffer >> bits) & 0xff));
    }
  }
  const latin1 = chars.join('');
  // Convert latin-1 byte string to UTF-8 string.
  try {
    return decodeURIComponent(escape(latin1));
  } catch {
    return latin1;
  }
}

// Decode the embedded game HTML once at module load (not per render).
const GAME_HTML: string = decodeBase64Html(GAME_HTML_B64);

// Bridge script injected into the WebView before the page loads.
// - Forwards Android back-button presses from RN to the game (via postMessage).
// - Routes haptic feedback through React Native (more reliable than navigator.vibrate on Android WebView).
// - Prevents default touch gestures (pinch zoom, pull to refresh).
// - Watches localStorage 'grid-evo-highscore-pastel' and asks RN for a Play Store review prompt
//   the first time the high score crosses RATING_HIGH_SCORE_THRESHOLD (one-shot, persisted).
const INJECTED_JS = `
(function() {
  try {
    var REVIEW_THRESHOLD = ${RATING_HIGH_SCORE_THRESHOLD};
    var REVIEW_KEY = 'grid-evo-review-asked';
    var HS_KEY = 'grid-evo-highscore-pastel';

    function rnPost(payload) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      } catch (e) {}
    }

    function maybeAskReview() {
      try {
        if (localStorage.getItem(REVIEW_KEY) === '1') return;
        var hs = parseInt(localStorage.getItem(HS_KEY) || '0', 10);
        if (!isNaN(hs) && hs >= REVIEW_THRESHOLD) {
          localStorage.setItem(REVIEW_KEY, '1');
          // Slight delay so the user finishes celebrating their score.
          setTimeout(function() { rnPost({ type: 'requestReview' }); }, 1500);
        }
      } catch (e) {}
    }

    // Expose a bridge so the game can route vibrations through RN.
    var origVibrate = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
    navigator.vibrate = function(pattern) {
      try { rnPost({ type: 'haptic', pattern: pattern }); } catch (e) {}
      if (origVibrate) { try { origVibrate(pattern); } catch(e) {} }
      return true;
    };

    // Listen for RN back-button events and dispatch synthetic events the game listens to.
    document.addEventListener('message', function(ev) { handleRnMessage(ev); });
    window.addEventListener('message', function(ev) { handleRnMessage(ev); });

    function handleRnMessage(ev) {
      try {
        var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (data && data.type === 'backPress') {
          var evt = new Event('backbutton');
          document.dispatchEvent(evt);
        }
      } catch(e) {}
    }

    // Patch localStorage.setItem to detect high-score updates synchronously.
    try {
      var origSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(k, v) {
        var r = origSet(k, v);
        if (k === HS_KEY) maybeAskReview();
        return r;
      };
    } catch(e) {}

    // Prevent pinch-zoom.
    document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive: false });

    // Tell RN the game is ready.
    window.addEventListener('load', function() {
      rnPost({ type: 'ready' });
      // Also evaluate once on load in case the high score was already above threshold previously.
      maybeAskReview();
    });
  } catch(e) {}
})();
true;
`;

export default function Index() {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const exitingRef = useRef(false);

  // Fallback: hide loader after 4s in case onLoadEnd never fires on a particular platform.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Android hardware back button: let the game handle it first, then exit on second tap.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        if (exitingRef.current) return false; // allow default exit
        // Forward to WebView so in-game modals can close first.
        webRef.current?.postMessage(JSON.stringify({ type: 'backPress' }));
        // Second tap within 2 seconds exits.
        exitingRef.current = true;
        setTimeout(() => { exitingRef.current = false; }, 2000);
        // Prompt the user once they've cleared all modals.
        Alert.alert(
          'Çıkış',
          'Grid Evolution kapatılsın mı?',
          [
            { text: 'İptal', style: 'cancel', onPress: () => { exitingRef.current = false; } },
            { text: 'Çık', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true, onDismiss: () => { exitingRef.current = false; } }
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [])
  );

  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'haptic' && Platform.OS !== 'web') {
        const p = data.pattern;
        const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
        const intensity = Array.isArray(p) ? sum(p) : Number(p) || 0;
        if (intensity >= 100) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (intensity >= 50) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (intensity > 0) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } else if (data.type === 'requestReview') {
        // Triggered by the in-WebView script when the high score first crosses
        // RATING_HIGH_SCORE_THRESHOLD. Prefer the in-app review prompt; fall back
        // to opening the Play Store listing.
        try {
          const available =
            (await StoreReview.isAvailableAsync?.()) === true &&
            (await StoreReview.hasAction?.()) === true;
          if (available) {
            await StoreReview.requestReview();
          } else if (Platform.OS === 'android') {
            await Linking.openURL(`market://details?id=${ANDROID_PACKAGE_ID}`).catch(() =>
              Linking.openURL(
                `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`
              )
            );
          }
        } catch {
          // Ignore — never block the game on a review prompt failure.
        }
      }
    } catch (err) {
      // ignore malformed messages
    }
  }, []);

  // HTML is decoded once at module load time.
  const html = GAME_HTML;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" translucent={false} />
      <View style={styles.container} testID="grid-evolution-webview-container">
        <WebView
          ref={webRef}
          testID="grid-evolution-webview"
          source={{ html: html, baseUrl: 'about:blank' }}
          originWhitelist={['*']}
          style={styles.webview}
          containerStyle={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          bounces={false}
          overScrollMode="never"
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          cacheEnabled
          androidLayerType="hardware"
          textZoom={100}
        />
        {loading && (
          <View style={[styles.loader, { pointerEvents: 'none' }]} testID="grid-evolution-loader">
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, backgroundColor: '#121212' },
  webview: { flex: 1, backgroundColor: '#121212' },
  loader: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
});
