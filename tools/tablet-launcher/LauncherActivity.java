package za.co.anglowindows.factory;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.widget.Toast;

public class LauncherActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            int station = getPackageManager().getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA).metaData.getInt("station");
            if (station != 4 && station != 8) throw new IllegalStateException("Invalid factory station");
            Intent chrome = new Intent(Intent.ACTION_VIEW, Uri.parse("http://192.168.0.84:3300/cover.html?station=" + station));
            chrome.setPackage("com.android.chrome");
            Bundle extras = new Bundle();
            extras.putBinder("android.support.customtabs.extra.SESSION", null);
            chrome.putExtras(extras);
            chrome.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", 0xfff6c945);
            chrome.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
            chrome.putExtra("androidx.browser.customtabs.extra.SHARE_STATE", 2);
            chrome.putExtra("androidx.browser.customtabs.extra.CLOSE_BUTTON_ENABLED", false);
            startActivity(chrome);
        } catch (Exception error) {
            Toast.makeText(this, "Factory Terminal could not open in Chrome", Toast.LENGTH_LONG).show();
            finish();
        }
    }
    // Keep the Chrome task while in use; close the empty launcher when the user exits it.
    @Override protected void onRestart() { super.onRestart(); finish(); }
}
