package com.evidencelocker.mobile;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

public class CaptureTrampolineActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent triggerIntent = new Intent(this, ScreenCaptureService.class);
        triggerIntent.setAction(ScreenCaptureService.ACTION_TRIGGER_CAPTURE);
        startService(triggerIntent);

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
                overridePendingTransition(0, 0);
            }
        }, 1000);
    }
}
