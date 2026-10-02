package money.uh.collector

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

// 상태 확인용 화면. 설정은 PC에서 adb로 넣는다:
//   adb shell am start -n money.uh.collector/.MainActivity --es token <COLLECTOR_TOKEN>
class MainActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val config = Config(this)
        intent.getStringExtra("token")?.let { config.token = it }
        intent.getStringExtra("serverUrl")?.let { config.serverUrl = it }

        status = TextView(this).apply { textSize = 16f; setPadding(0, 0, 0, 48) }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 96, 48, 48)
            addView(status)
            addView(button("1. 알림 접근 허용") { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) })
            addView(button("2. 배터리 최적화 제외") { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) })
            addView(button("서버 연결 테스트") {
                Thread { Outbox(this@MainActivity).heartbeat(); runOnUiThread { refresh() } }.start()
            })
        }
        setContentView(layout)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val config = Config(this)
        val listening = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.contains(ComponentName(this, CollectorService::class.java).flattenToString()) == true
        val battery = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        status.text = buildString {
            appendLine("Uh Money 수집기\n")
            appendLine("알림 접근: ${if (listening) "허용됨 ✅" else "필요 ❌"}")
            appendLine("배터리 최적화 제외: ${if (battery) "됨 ✅" else "필요 ❌"}")
            appendLine("토큰: ${if (config.token.isNotEmpty()) "설정됨 ✅" else "없음 ❌"}")
            appendLine("보낼 알림 대기: ${Outbox(this@MainActivity).pendingCount()}개")
            appendLine("마지막 결과: ${config.lastResult}")
        }
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        setOnClickListener { onClick() }
    }
}
