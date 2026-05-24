package com.dinzdp.gridevolution;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();

        // Force solid dark gray status bar and navigation bar
        // This prevents nav buttons from camouflaging into the game background
        // on old tablets, Custom ROMs, and AOSP-based Android 7-9 devices
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.setStatusBarColor(0xFF1E1E1E);
            window.setNavigationBarColor(0xFF1E1E1E);
        }

        // Disable immersive/fullscreen mode — keep system bars always visible
        // Also explicitly clear SYSTEM_UI_FLAG_LIGHT_STATUS_BAR and SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        // to force status/navigation icons to be white (high contrast) on the black background
        View decorView = window.getDecorView();
        int flags = decorView.getSystemUiVisibility();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        
        decorView.setSystemUiVisibility(flags);
    }
}
