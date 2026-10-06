package expo.modules.hydrationtiles

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// The task name and URL must match src/features/tracking/hydrationTiles.tsx.
private const val TASK_NAME = "HydrationTileLog"
private const val LOG_WATER_URL = "owngains://log-water"
private const val EXTRA_ML = "ml"
private const val TASK_TIMEOUT_MS = 15_000L

abstract class HydrationTileService : TileService() {
  override fun onStartListening() {
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }
}

abstract class AddWaterTileService(private val ml: Int) : HydrationTileService() {
  override fun onClick() {
    try {
      startService(Intent(this, HydrationTileTaskService::class.java).putExtra(EXTRA_ML, ml))
    } catch (e: IllegalStateException) {
      Toast.makeText(this, "Open OwnGains to log water.", Toast.LENGTH_SHORT).show()
    }
  }
}

class AddWater250TileService : AddWaterTileService(250)

class AddWater500TileService : AddWaterTileService(500)

class LogWaterTileService : HydrationTileService() {
  override fun onClick() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(LOG_WATER_URL))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val open = {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startActivityAndCollapse(
          PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE),
        )
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(intent)
      }
    }
    if (isLocked) unlockAndRun { open() } else open()
  }
}

class HydrationTileTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val ml = intent?.getIntExtra(EXTRA_ML, 0) ?: 0
    if (ml <= 0) return null
    val data = Arguments.createMap().apply { putInt(EXTRA_ML, ml) }
    return HeadlessJsTaskConfig(TASK_NAME, data, TASK_TIMEOUT_MS, true)
  }
}
