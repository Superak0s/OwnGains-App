package expo.modules.exactalarms

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.text.format.DateFormat
import android.util.Log
import org.json.JSONObject
import java.util.Calendar

/** Scheduling, reboot re-arm and ringing all happen natively, so an alarm opens
 * its full-screen page without waiting for JS to start. */
object Alarms {
  const val DEFAULT_SNOOZE_SECONDS = 600
  // Clock apps stop ringing after 10 minutes so a missed alarm doesn't drain the battery.
  const val RING_TIMEOUT_MS = 10 * 60_000L
  const val EXTRA_ID = "alarmId"
  const val EXTRA_TITLE = "title"
  const val EXTRA_BODY = "body"
  const val EXTRA_SNOOZE_SECONDS = "snoozeSeconds"
  const val ACTION_FIRE = "expo.modules.exactalarms.FIRE"
  const val ACTION_SNOOZE = "expo.modules.exactalarms.SNOOZE"
  const val ACTION_DISMISS = "expo.modules.exactalarms.DISMISS"
  const val ACTION_CANCEL = "expo.modules.exactalarms.CANCEL"
  private const val SNOOZED_CHANNEL = "alarm-snoozed"
  private const val SNOOZE_SUFFIX = "-snooze"
  private const val TAG = "ExactAlarms"

  data class Alarm(
    val id: String,
    val at: Long,
    val daily: Boolean,
    val title: String,
    val body: String,
    val channelId: String,
    val snoozeSeconds: Int,
  )

  private fun prefs(context: Context) =
    context.getSharedPreferences("owngains_alarms", Context.MODE_PRIVATE)

  private fun save(context: Context, alarm: Alarm) {
    val json = JSONObject()
      .put("at", alarm.at)
      .put("daily", alarm.daily)
      .put("title", alarm.title)
      .put("body", alarm.body)
      .put("channelId", alarm.channelId)
      .put("snoozeSeconds", alarm.snoozeSeconds)
    prefs(context).edit().putString(alarm.id, json.toString()).apply()
  }

  private fun load(context: Context, id: String): Alarm? {
    val json = prefs(context).getString(id, null)?.let(::JSONObject) ?: return null
    return Alarm(
      id,
      json.getLong("at"),
      json.getBoolean("daily"),
      json.getString("title"),
      json.getString("body"),
      json.getString("channelId"),
      json.optInt("snoozeSeconds", DEFAULT_SNOOZE_SECONDS),
    )
  }

  private fun remove(context: Context, id: String) =
    prefs(context).edit().remove(id).apply()

  /** Adding calendar days keeps the wall-clock time across DST changes. */
  private fun nextFuture(at: Long): Long {
    val calendar = Calendar.getInstance().apply { timeInMillis = at }
    do calendar.add(Calendar.DAY_OF_YEAR, 1) while (calendar.timeInMillis <= System.currentTimeMillis())
    return calendar.timeInMillis
  }

  private fun broadcast(context: Context, action: String, id: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(action)
      .setData(Uri.fromParts("alarm", id, null))
      .putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(
      context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun screenIntent(context: Context, alarm: Alarm): Intent =
    Intent(context, AlarmActivity::class.java)
      .setData(Uri.fromParts("alarm", alarm.id, null))
      .putExtra(EXTRA_ID, alarm.id)
      .putExtra(EXTRA_TITLE, alarm.title)
      .putExtra(EXTRA_BODY, alarm.body)
      .putExtra(EXTRA_SNOOZE_SECONDS, alarm.snoozeSeconds)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun notificationManager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun arm(context: Context, alarm: Alarm) {
    val manager = alarmManager(context)
    val operation = broadcast(context, ACTION_FIRE, alarm.id)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.at, null), operation)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, operation)
    }
  }

  fun schedule(context: Context, alarm: Alarm) {
    save(context, alarm)
    arm(context, alarm)
  }

  fun cancel(context: Context, id: String) {
    for (alarmId in listOf(id, id + SNOOZE_SUFFIX)) {
      alarmManager(context).cancel(broadcast(context, ACTION_FIRE, alarmId))
      notificationManager(context).cancel(alarmId, 0)
      remove(context, alarmId)
    }
  }

  fun cancelWithPrefix(context: Context, prefixes: List<String>) {
    val shown = notificationManager(context).activeNotifications.mapNotNull { it.tag }
    for (id in prefs(context).all.keys + shown) {
      if (prefixes.any { id.startsWith(it) }) cancel(context, id)
    }
  }

  fun rearmAll(context: Context) {
    val now = System.currentTimeMillis()
    for (id in prefs(context).all.keys) {
      val alarm = load(context, id) ?: continue
      when {
        alarm.at > now -> arm(context, alarm)
        alarm.daily -> schedule(context, alarm.copy(at = nextFuture(alarm.at)))
        else -> remove(context, id)
      }
    }
  }

  /** A fired one-shot stays stored until Snooze or Dismiss, which need its text. */
  fun fire(context: Context, id: String) {
    val alarm = load(context, id) ?: return
    if (alarm.daily) schedule(context, alarm.copy(at = nextFuture(alarm.at)))
    // "Display over other apps" is what lets an app start an activity from the
    // background. Without it, the full-screen intent only takes over a locked screen.
    if (Settings.canDrawOverlays(context)) {
      context.startActivity(screenIntent(context, alarm))
    } else {
      notificationManager(context).notify(alarm.id, 0, buildNotification(context, alarm))
    }
  }

  fun dismiss(context: Context, id: String) {
    stopRinging()
    notificationManager(context).cancel(id, 0)
    if (load(context, id)?.daily == false) remove(context, id)
  }

  fun snooze(context: Context, id: String) {
    val alarm = load(context, id) ?: return dismiss(context, id)
    dismiss(context, id)
    val snoozed = alarm.copy(
      id = id.removeSuffix(SNOOZE_SUFFIX) + SNOOZE_SUFFIX,
      at = System.currentTimeMillis() + alarm.snoozeSeconds * 1000L,
      daily = false,
    )
    schedule(context, snoozed)
    // Same tag as the ringing notification, so firing replaces it.
    notificationManager(context).notify(snoozed.id, 0, buildSnoozedNotification(context, snoozed))
  }

  private fun buildSnoozedNotification(context: Context, alarm: Alarm): Notification {
    // Low importance: the alarm channel would sound and pop up for a status notice.
    notificationManager(context).createNotificationChannel(
      NotificationChannel(SNOOZED_CHANNEL, "Snoozed alarms", NotificationManager.IMPORTANCE_LOW),
    )
    val time = DateFormat.getTimeFormat(context).format(alarm.at)
    return Notification.Builder(context, SNOOZED_CHANNEL)
      .setSmallIcon(notificationIcon(context))
      .setContentTitle("Snoozed: ${alarm.title}")
      .setContentText("Rings again at $time")
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setWhen(alarm.at)
      .setShowWhen(true)
      .addAction(Notification.Action.Builder(null as Icon?, "Cancel", broadcast(context, ACTION_CANCEL, alarm.id)).build())
      .build()
  }

  // Generated by the expo-notifications config plugin from its `icon` option.
  private fun notificationIcon(context: Context) =
    context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 } ?: context.applicationInfo.icon

  private fun buildNotification(context: Context, alarm: Alarm): Notification {
    val screen = PendingIntent.getActivity(
      context, 0, screenIntent(context, alarm),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val snooze = broadcast(context, ACTION_SNOOZE, alarm.id)
    val dismiss = broadcast(context, ACTION_DISMISS, alarm.id)
    return Notification.Builder(context, alarm.channelId)
      .setSmallIcon(notificationIcon(context))
      .setContentTitle(alarm.title)
      .setContentText(alarm.body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setContentIntent(screen)
      .setFullScreenIntent(screen, true)
      .setTimeoutAfter(RING_TIMEOUT_MS)
      .addAction(Notification.Action.Builder(null as Icon?, "Snooze ${snoozeLabel(alarm.snoozeSeconds)}", snooze).build())
      .addAction(Notification.Action.Builder(null as Icon?, "Dismiss", dismiss).build())
      .build()
      .apply { flags = flags or Notification.FLAG_INSISTENT }
  }

  private fun snoozeLabel(seconds: Int) =
    if (seconds < 60) "$seconds sec" else "${seconds / 60} min"

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  fun startRinging(context: Context) {
    if (player != null) return
    // The settings URIs play the system's cached copy of the tone. The actual tone
    // URI is often a user file in shared media, which the app has no permission to read.
    for (uri in listOf(Settings.System.DEFAULT_ALARM_ALERT_URI, Settings.System.DEFAULT_NOTIFICATION_URI)) {
      val candidate = MediaPlayer()
      try {
        candidate.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        candidate.setDataSource(context, uri)
        candidate.isLooping = true
        candidate.prepare()
        candidate.start()
        player = candidate
        break
      } catch (error: Exception) {
        candidate.release()
        Log.w(TAG, "Alarm sound failed for $uri", error)
      }
    }
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 800, 800), 0))
  }

  fun stopRinging() {
    player?.run {
      stop()
      release()
    }
    player = null
    vibrator?.cancel()
    vibrator = null
  }
}
