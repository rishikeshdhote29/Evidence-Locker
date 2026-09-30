package com.evidencelocker.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.net.Uri;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 112;
    private static final int REQUEST_CODE_MEDIA_PROJECTION = 1002;

    private MediaProjectionManager mediaProjectionManager;
    private String pendingPreviewData = null;
    private boolean waitingForOverlayPermission;

    public class AndroidNativeBridge {
        @JavascriptInterface
        public void requestMediaProjection() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    requestScreenCapturePermission();
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST_CODE);
            }
        }

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    public void requestScreenCapturePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(this)) {
            waitingForOverlayPermission = true;
            Intent overlayIntent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(overlayIntent);
            postWebViewScript("window.dispatchEvent(new CustomEvent('screenCapturePermissionDenied', { detail: { message: 'Allow display over other apps, then return to Evidence Locker.' } }));");
            return;
        }
        if (mediaProjectionManager != null) {
            startActivityForResult(mediaProjectionManager.createScreenCaptureIntent(), REQUEST_CODE_MEDIA_PROJECTION);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_MEDIA_PROJECTION) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
                serviceIntent.setAction(ScreenCaptureService.ACTION_START);
                serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode);
                serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }

                postWebViewScript("window.dispatchEvent(new CustomEvent('screenCapturePermissionGranted'));");
            } else {
                postWebViewScript("window.dispatchEvent(new CustomEvent('screenCapturePermissionDenied'));");
            }
        }
    }

    private void handleIntent(Intent intent) {
        if (intent != null) {
            if ("ACTION_SHOW_EVIDENCE_PREVIEW".equals(intent.getAction())) {
                String filePath = intent.getStringExtra("CAPTURED_FILE_PATH");
                String metadataJson = intent.getStringExtra("METADATA_JSON");
                if (filePath != null && metadataJson != null) {
                    final String js = "window.dispatchEvent(new CustomEvent('openPreviewModal', { detail: { filePath: "
                            + JSONObject.quote(filePath) + ", metadataJson: " + metadataJson + " } }));";
                    pendingPreviewData = js;
                    postWebViewScript(js);
                }
            } else if ("ACTION_TRIGGER_MEDIA_PROJECTION_CAPTURE".equals(intent.getAction())) {
                Intent triggerIntent = new Intent(this, ScreenCaptureService.class);
                triggerIntent.setAction(ScreenCaptureService.ACTION_TRIGGER_CAPTURE);
                startService(triggerIntent);
            } else if ("ACTION_REQUEST_MEDIA_PROJECTION".equals(intent.getAction())) {
                requestScreenCapturePermission();
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AndroidNativeBridge(), "AndroidNative");
        }

        if (pendingPreviewData != null) {
            final String js = pendingPreviewData;
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    postWebViewScript(js);
                }
            }, 800);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (waitingForOverlayPermission
                && (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this))) {
            waitingForOverlayPermission = false;
            requestScreenCapturePermission();
        }
    }

    private void postWebViewScript(final String script) {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().post(new Runnable() {
                @Override
                public void run() {
                    bridge.getWebView().evaluateJavascript(script, null);
                }
            });
        }
    }
}
