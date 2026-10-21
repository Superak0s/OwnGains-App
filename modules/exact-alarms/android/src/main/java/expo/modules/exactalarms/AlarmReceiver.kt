package expo.modules.exactalarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(Alarms.EXTRA_ID) ?: return
    when (intent.action) {
      Alarms.ACTION_FIRE -> Alarms.fire(context, id)
      Alarms.ACTION_SNOOZE -> Alarms.snooze(context, id)
      Alarms.ACTION_DISMISS -> Alarms.dismiss(context, id)
      Alarms.ACTION_CANCEL -> Alarms.cancel(context, id)
    }
  }
}

/** AlarmManager forgets every alarm on reboot. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      Alarms.rearmAll(context)
    }
  }
}
