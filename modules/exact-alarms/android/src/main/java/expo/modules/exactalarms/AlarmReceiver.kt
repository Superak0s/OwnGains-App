package expo.modules.exactalarms

import android.app.AlarmManager
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

/** AlarmManager forgets every alarm on reboot, and alarms set while exact ones were denied stay inexact until re-armed. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> Alarms.rearmAll(context)
      Intent.ACTION_TIMEZONE_CHANGED -> Alarms.rearmAll(context, zoneChanged = true)
    }
  }
}
