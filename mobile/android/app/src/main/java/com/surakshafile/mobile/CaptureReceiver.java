package com.evidencelocker.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class CaptureReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        // A notification action automatically closes the shade. Keep this as a
        // broadcast so Android leaves the app underneath in the foreground.
        Intent serviceIntent = new Intent(context, ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_TRIGGER_CAPTURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
