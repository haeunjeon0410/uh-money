package money.uh.collector

import android.content.Context

// 서버 주소와 토큰. 토큰은 코드에 넣지 않고 설치할 때 PC에서 adb로 넣는다 (MainActivity 참고)
class Config(context: Context) {
    private val prefs = context.getSharedPreferences("config", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("serverUrl", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(v) = prefs.edit().putString("serverUrl", v.trimEnd('/')).apply()

    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(v) = prefs.edit().putString("token", v).apply()

    var lastResult: String
        get() = prefs.getString("lastResult", "아직 없음") ?: ""
        set(v) = prefs.edit().putString("lastResult", v).apply()

    companion object {
        const val DEFAULT_SERVER = "https://uh-money.uh-money-server.workers.dev"
    }
}
