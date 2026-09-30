package com.evidencelocker.mobile;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class ScreenCaptureService extends Service {

    private static final String TAG = "ScreenCaptureService";
    public static final String CHANNEL_ID = "evidencelocker_capture_channel";
    public static final int NOTIFICATION_ID = 2002;
    private static final long CAPTURE_DELAY_MS = 2200L;
    private static final long CAPTURE_RETRY_DELAY_MS = 500L;
    private static final int MAX_CAPTURE_ATTEMPTS = 6;

    public static final String ACTION_START = "com.evidencelocker.mobile.START_CAPTURE";
    public static final String ACTION_STOP = "com.evidencelocker.mobile.STOP_CAPTURE";
    public static final String ACTION_TRIGGER_CAPTURE = "com.evidencelocker.mobile.TRIGGER_CAPTURE";

    public static final String EXTRA_RESULT_CODE = "RESULT_CODE";
    public static final String EXTRA_RESULT_DATA = "RESULT_DATA";

    private MediaProjectionManager mediaProjectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private WindowManager windowManager;
    private View floatingCaptureButton;
    private boolean captureInProgress;

    private int resultCode;
    private Intent resultData;
    private int screenWidth;
    private int screenHeight;
    private int screenDensity;

    @Override
    public void onCreate() {
        super.onCreate();
        mediaProjectionManager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        getScreenMetrics();
        createNotificationChannel();
    }

    private void getScreenMetrics() {
        WindowManager windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics metrics = new DisplayMetrics();
        if (windowManager != null) {
            windowManager.getDefaultDisplay().getRealMetrics(metrics);
            screenWidth = metrics.widthPixels;
            screenHeight = metrics.heightPixels;
            screenDensity = metrics.densityDpi;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_START.equals(action)) {
                resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
                } else {
                    resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
                }
                startForegroundServiceNotification();
                initMediaProjection();
                showFloatingCaptureButton();
            } else if (ACTION_TRIGGER_CAPTURE.equals(action)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundServiceNotification();
                }
                captureScreen();
            } else if (ACTION_STOP.equals(action)) {
                stopForegroundService();
            }
        }
        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Evidence Locker Screen Capture",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Persistent notification for Evidence Locker MediaProjection evidence capture");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundServiceNotification() {
        Intent captureIntent = new Intent(this, CaptureReceiver.class);
        PendingIntent pCaptureIntent = PendingIntent.getBroadcast(
                this,
                0,
                captureIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent pStopIntent = PendingIntent.getService(
                this,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("Evidence Locker Evidence Capture")
                .setContentText("Active — Tap [Capture Screenshot] from any app")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Service", pStopIntent)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void initMediaProjection() {
        if (mediaProjectionManager != null && resultData != null && resultCode == Activity.RESULT_OK) {
            mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, resultData);
            if (mediaProjection != null) {
                imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
                virtualDisplay = mediaProjection.createVirtualDisplay(
                        "Evidence LockerDisplay",
                        screenWidth,
                        screenHeight,
                        screenDensity,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                        imageReader.getSurface(),
                        null,
                        null
                );
            }
        }
    }

    private void showFloatingCaptureButton() {
                if (floatingCaptureButton != null || windowManager == null
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && !android.provider.Settings.canDrawOverlays(this))) {
                    return;
                }

                View button = new View(this);
                GradientDrawable background = new GradientDrawable();
                background.setShape(GradientDrawable.OVAL);
                background.setColor(Color.rgb(14, 165, 233));
                background.setStroke(3, Color.WHITE);
                button.setBackground(background);
                button.setContentDescription("Capture screenshot");
                button.setElevation(12f);
                button.setOnTouchListener(new View.OnTouchListener() {
                    private float downX;
                    private float downY;
                    private int startX;
                    private int startY;

                    @Override
                    public boolean onTouch(View view, MotionEvent event) {
                        WindowManager.LayoutParams params = (WindowManager.LayoutParams) view.getLayoutParams();
                        if (event.getAction() == MotionEvent.ACTION_DOWN) {
                            downX = event.getRawX();
                            downY = event.getRawY();
                            startX = params.x;
                            startY = params.y;
                            return true;
                        }
                        if (event.getAction() == MotionEvent.ACTION_MOVE) {
                            params.x = startX + (int) (event.getRawX() - downX);
                            params.y = startY + (int) (event.getRawY() - downY);
                            windowManager.updateViewLayout(view, params);
                            return true;
                        }
                        if (event.getAction() == MotionEvent.ACTION_UP
                                && Math.abs(event.getRawX() - downX) < 20
                                && Math.abs(event.getRawY() - downY) < 20) {
                            triggerFloatingCapture();
                            return true;
                        }
                        return true;
                    }
                });

                int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        64,
                        64,
                        overlayType,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT
                );
                params.gravity = Gravity.TOP | Gravity.END;
                params.x = 24;
                params.y = 220;
                windowManager.addView(button, params);
                floatingCaptureButton = button;
            }

    private void triggerFloatingCapture() {
                if (captureInProgress) {
                    return;
                }
                captureInProgress = true;
                removeFloatingCaptureButton();
                captureScreen();
            }

    private void removeFloatingCaptureButton() {
                if (floatingCaptureButton != null && windowManager != null) {
                    windowManager.removeView(floatingCaptureButton);
                    floatingCaptureButton = null;
            }
        }
    private void captureScreen() {
        if (imageReader == null) {
            Log.e(TAG, "ImageReader is null. Initializing projection...");
            initMediaProjection();
        }
        if (imageReader == null) {
            Log.e(TAG, "Cannot capture screen: MediaProjection is not initialized.");
            return;
        }

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                acquireImage(1);
            }
        }, CAPTURE_DELAY_MS);
    }

    private void acquireImage(int attempt) {
        try {
            Image image = imageReader != null ? imageReader.acquireLatestImage() : null;
            if (image != null) {
                processAndSaveImage(image);
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error acquiring capture frame (attempt " + attempt + "): " + e.getMessage(), e);
        }

        if (attempt < MAX_CAPTURE_ATTEMPTS) {
            new Handler(Looper.getMainLooper()).postDelayed(
                    () -> acquireImage(attempt + 1),
                    CAPTURE_RETRY_DELAY_MS
            );
        } else {
            Log.e(TAG, "Failed to acquire a screen frame after " + MAX_CAPTURE_ATTEMPTS + " attempts.");
        }
    }

    private void processAndSaveImage(Image image) {
        try {
            Image.Plane[] planes = image.getPlanes();
            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * screenWidth;

            Bitmap bitmap = Bitmap.createBitmap(
                    screenWidth + rowPadding / pixelStride,
                    screenHeight,
                    Bitmap.Config.ARGB_8888
            );
            bitmap.copyPixelsFromBuffer(buffer);
            image.close();

            Bitmap croppedBitmap = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight);

            String timeStampStr = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            String fileName = "evidence_" + timeStampStr + ".png";
            File outputFile = new File(getCacheDir(), fileName);

            FileOutputStream fos = new FileOutputStream(outputFile);
            croppedBitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
            fos.flush();
            fos.close();

            String sha256 = calculateSHA256(outputFile);

            SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US);
            isoFormat.setTimeZone(TimeZone.getDefault());

            JSONObject meta = new JSONObject();
            meta.put("evidenceId", UUID.randomUUID().toString());
            meta.put("capturedAt", isoFormat.format(new Date()));
            meta.put("timezone", TimeZone.getDefault().getID());
            meta.put("fileName", fileName);
            meta.put("fileSize", outputFile.length());
            meta.put("mimeType", "image/png");
            meta.put("sha256", sha256);
            meta.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            meta.put("androidVersion", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            meta.put("screenResolution", screenWidth + "x" + screenHeight);
            meta.put("captureMethod", "MEDIA_PROJECTION");
            meta.put("sourceApp", "unknown");
            meta.put("uploadStatus", "PENDING");

            Log.i(TAG, "Screenshot captured: " + outputFile.getAbsolutePath()
                    + " (" + outputFile.length() + " bytes, SHA-256 " + sha256 + ")");

            Intent previewIntent = new Intent(this, MainActivity.class);
            previewIntent.setAction("ACTION_SHOW_EVIDENCE_PREVIEW");
            previewIntent.putExtra("CAPTURED_FILE_PATH", outputFile.getAbsolutePath());
            previewIntent.putExtra("METADATA_JSON", meta.toString());
            previewIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(previewIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error processing captured image: " + e.getMessage(), e);
        }
    }

    private String calculateSHA256(File file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            InputStream is = new FileInputStream(file);
            while ((read = is.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
            is.close();
            byte[] hash = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private void stopForegroundService() {
        removeFloatingCaptureButton();
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopForegroundService();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
