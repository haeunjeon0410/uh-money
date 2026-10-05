package money.uh.collector

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

// 생존 신호와 대기열 재전송. 일반 타이머(Handler)는 절전 모드(Doze)에서 멈추기 때문에,
// 절전 중에도 깨어나는 알람으로 주기적으로 실행한다. 부팅 직후에도 다시 시작한다.
class HeartbeatReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        schedule(context)
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) return
        run(context)
    }

    companion object {
        private const val INTERVAL_MS = 15 * 60 * 1000L

        // 알람은 한 번만 울리므로 울릴 때마다 다음 알람을 다시 건다
        fun schedule(context: Context) {
            val alarms = context.getSystemService(AlarmManager::class.java)
            val pi = PendingIntent.getBroadcast(
                context, 1, Intent(context, HeartbeatReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + INTERVAL_MS, pi)
        }

        // 네트워크 요청은 메인 스레드에서 못 하므로 별도 스레드에서, 끝날 때까지 CPU가 꺼지지 않게 잡아 둔다
        fun run(context: Context) {
            val wake = context.getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uh-money:heartbeat")
            wake.acquire(60_000)
            Thread {
                try {
                    val outbox = Outbox(context)
                    outbox.heartbeat()
                    outbox.flush()
                } finally {
                    if (wake.isHeld) wake.release()
                }
            }.start()
        }
    }
}
