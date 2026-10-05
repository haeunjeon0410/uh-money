package money.uh.collector

import android.app.Notification
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.HandlerThread
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

// 케이뱅크 앱 알림만 골라 서버로 보낸다. 다른 앱 알림은 읽기만 하고 아무 데도 보내지 않는다.
class CollectorService : NotificationListenerService() {
    private lateinit var worker: Handler
    private lateinit var outbox: Outbox

    // 네트워크가 끊겼다가 돌아오는 순간 바로 대기열을 보낸다 (밖에서 데이터가 오락가락할 때)
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            worker.post {
                outbox.heartbeat()
                outbox.flush()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        outbox = Outbox(this)
        worker = Handler(HandlerThread("uh-money").apply { start() }.looper)
    }

    override fun onListenerConnected() {
        val cm = getSystemService(ConnectivityManager::class.java)
        runCatching { cm.unregisterNetworkCallback(networkCallback) }
        cm.registerDefaultNetworkCallback(networkCallback)
        HeartbeatReceiver.schedule(this)
        HeartbeatReceiver.run(this)
    }

    override fun onListenerDisconnected() {
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        if (!isKbank(sbn.packageName, title)) return

        // 여러 줄 알림은 펼친 본문(bigText)에 전체가 들어 있다
        val text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n")
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: return
        outbox.add(sbn.postTime, title, text)
        worker.post { outbox.flush() }
    }

    private fun isKbank(pkg: String, title: String) =
        pkg.contains("kbank", ignoreCase = true) || title.contains("케이뱅크")
}
