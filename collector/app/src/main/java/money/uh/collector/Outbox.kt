package money.uh.collector

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// 보낼 알림을 파일에 먼저 쌓고, 서버가 받았다고 답한 것만 지운다.
// 와이파이가 끊겨도 알림을 잃지 않고 다음 전송 때 다시 보낸다.
class Outbox(private val context: Context) {
    private val file = File(context.filesDir, "outbox.jsonl")
    private val config = Config(context)

    @Synchronized
    fun add(postedAt: Long, title: String, text: String) {
        val json = JSONObject().put("postedAt", postedAt).put("title", title).put("text", text).put("device", DEVICE)
        file.appendText(json.toString() + "\n")
    }

    @Synchronized
    fun pendingCount(): Int = if (file.exists()) file.readLines().count { it.isNotBlank() } else 0

    // 쌓인 알림을 순서대로 보낸다. 네트워크 오류면 남은 것을 그대로 두고 멈춘다
    @Synchronized
    fun flush() {
        if (!file.exists()) return
        val lines = file.readLines().filter { it.isNotBlank() }.toMutableList()
        while (lines.isNotEmpty()) {
            val code = post("/ingest/notification", lines.first()) ?: break
            if (code in 500..599 || code == 401) break // 서버 문제나 토큰 문제는 나중에 다시
            lines.removeAt(0) // 2xx는 성공, 400은 다시 보내도 소용없으니 버린다
            record("알림 전송 $code")
        }
        file.writeText(lines.joinToString("") { it + "\n" })
    }

    fun heartbeat() {
        val code = post("/heartbeat", JSONObject().put("device", DEVICE).toString())
        record(if (code == null) "생존 신호 실패 (네트워크)" else "생존 신호 $code")
    }

    private fun post(path: String, body: String): Int? = try {
        val conn = URL(config.serverUrl + path).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.doOutput = true
        conn.setRequestProperty("content-type", "application/json; charset=utf-8")
        conn.setRequestProperty("authorization", "Bearer ${config.token}")
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        conn.disconnect()
        code
    } catch (e: Exception) {
        null
    }

    private fun record(msg: String) {
        val time = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())
        config.lastResult = "$time $msg"
    }

    companion object {
        val DEVICE: String = "${Build.MANUFACTURER} ${Build.MODEL}"
    }
}
