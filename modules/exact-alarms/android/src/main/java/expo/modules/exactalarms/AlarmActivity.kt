package expo.modules.exactalarms

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/** The ringing alarm. Only this activity shows over the lock screen, never the rest of the app. */
class AlarmActivity : ReactActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private val alarmId: String?
    get() = intent.getStringExtra(Alarms.EXTRA_ID)
  private val silence = Runnable {
    alarmId?.let { Alarms.dismiss(this, it) }
    finish()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    super.onCreate(null)
    // Opened by the fallback notification's full-screen intent: the page replaces
    // the notification and takes over the ringing.
    alarmId?.let {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(it, 0)
    }
    Alarms.startRinging(applicationContext)
    handler.postDelayed(silence, Alarms.RING_TIMEOUT_MS)
  }

  /** A second alarm while one is ringing snoozes the first and shows the new one,
   * so neither dose is lost. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val previous = alarmId
    if (previous != null && previous != intent.getStringExtra(Alarms.EXTRA_ID)) {
      Alarms.snooze(this, previous)
    }
    setIntent(intent)
    recreate()
  }

  override fun onDestroy() {
    handler.removeCallbacks(silence)
    Alarms.stopRinging()
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "AlarmScreen"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
      override fun getLaunchOptions(): Bundle = Bundle().apply {
        val intent = this@AlarmActivity.intent
        putString("notificationId", intent.getStringExtra(Alarms.EXTRA_ID))
        putString("title", intent.getStringExtra(Alarms.EXTRA_TITLE))
        putString("body", intent.getStringExtra(Alarms.EXTRA_BODY))
        putInt("snoozeSeconds", intent.getIntExtra(Alarms.EXTRA_SNOOZE_SECONDS, Alarms.DEFAULT_SNOOZE_SECONDS))
      }
    }
}
