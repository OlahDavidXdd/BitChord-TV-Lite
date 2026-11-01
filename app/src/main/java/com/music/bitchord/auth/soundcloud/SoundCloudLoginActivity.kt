package com.music.bitchord.auth.soundcloud

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.content.SharedPreferences
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.music.bitchord.BuildConfig
import com.music.bitchord.data.sources.SourceConfig
import com.music.bitchord.data.sources.SourceKind
import com.music.bitchord.data.sources.SourceRegistry
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Login stays in the user's browser; OAuth application secrets stay on the server. */
class SoundCloudLoginActivity : ComponentActivity() {
    private lateinit var prefs: SharedPreferences
    private lateinit var status: TextView
    private lateinit var login: Button
    private lateinit var disconnect: Button
    private var polling: Job? = null
    private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
    private val base get() = BuildConfig.SOUNDCLOUD_AUTH_URL.trimEnd('/')

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (24 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
        }
        layout.addView(TextView(this).apply { text = "SoundCloud"; textSize = 30f })
        status = TextView(this).apply { textSize = 18f; setPadding(0, 24, 0, 24) }
        layout.addView(status)
        login = Button(this).apply { text = "Sign in with SoundCloud"; setOnClickListener { signIn() } }
        disconnect = Button(this).apply { text = "Disconnect SoundCloud"; setOnClickListener { disconnectAccount() } }
        layout.addView(login); layout.addView(disconnect)
        layout.addView(Button(this).apply { text = "Back to BitChord"; setOnClickListener { finish() } })
        setContentView(layout)
        try {
            val key = MasterKey.Builder(this).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            prefs = EncryptedSharedPreferences.create(this, "soundcloud_login", key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
        } catch (_: Exception) {
            status.text = "Secure storage is unavailable on this device. Sign-in is disabled."
            login.isEnabled = false; disconnect.isEnabled = false; return
        }
        val uri = Uri.parse(base)
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || !uri.path.isNullOrEmpty() || uri.query != null || uri.fragment != null || uri.userInfo != null) {
            status.text = "This build's SoundCloud login service has not been configured. Ask the app publisher for a configured build."
            login.isEnabled = false; disconnect.isEnabled = false; return
        }
        showState()
    }

    private fun showState() {
        val connected = prefs.getBoolean("connected", false)
        status.text = if (connected) "Connected. SoundCloud is available in BitChord's addon search and playback. Your session refreshes automatically."
            else "Sign in once using SoundCloud's website. BitChord never sees your password. Return here after signing in."
        disconnect.isEnabled = connected; login.text = if (connected) "Sign in again" else "Sign in with SoundCloud"
    }

    private suspend fun request(path: String, method: String = "GET", key: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(base + path)
        if (key != null) builder.header("Authorization", "Bearer $key")
        if (method == "POST") builder.post(ByteArray(0).toRequestBody())
        if (method == "DELETE") builder.delete()
        client.newCall(builder.build()).execute().use { response ->
            // Deliberately omit URLs/keys and upstream bodies from exceptions and logs.
            if (!response.isSuccessful) error(if (response.code == 401) "Sign-in expired. Please sign in again." else "SoundCloud service unavailable (${response.code}). Try again.")
            JSONObject(response.body?.string() ?: error("Empty login response"))
        }
    }

    private fun signIn() {
        polling?.cancel(); login.isEnabled = false
        lifecycleScope.launch {
            try {
                val data = request("/pair", "POST")
                val loginUri = Uri.parse(data.getString("loginUrl"))
                val serviceUri = Uri.parse(base)
                require(loginUri.scheme == "https" && loginUri.host == serviceUri.host && loginUri.port == serviceUri.port && loginUri.path == "/authorize")
                prefs.edit().putString("pair", data.getString("pairId")).putString("pending_key", data.getString("key")).apply()
                startActivity(Intent(Intent.ACTION_VIEW, loginUri))
                status.text = "Finish signing in with SoundCloud, then return to BitChord."
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { status.text = e.message ?: "Could not open SoundCloud sign-in" }
            finally { login.isEnabled = true }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!::prefs.isInitialized || !::login.isInitialized || !login.isEnabled) return
        val pair = prefs.getString("pair", null) ?: return
        val key = prefs.getString("pending_key", null) ?: return
        polling?.cancel()
        polling = lifecycleScope.launch {
            repeat(300) {
                try {
                    val data = request("/pair/$pair", key = key)
                    if (data.optBoolean("failed")) {
                        prefs.edit().remove("pair").remove("pending_key").apply()
                        status.text = "SoundCloud sign-in was cancelled or failed. You can try again."; return@launch
                    }
                    if (data.optBoolean("connected")) {
                        val expected = "$base/addon/$key"
                        require(data.getString("addonUrl") == expected)
                        val source = SourceConfig(id = "soundcloud-login", kind = SourceKind.ADDON,
                            label = "SoundCloud", baseUrl = expected, enabled = true, allowDownloads = false)
                        if (SourceRegistry.config(source.id) == null) SourceRegistry.add(source) else SourceRegistry.update(source)
                        prefs.edit().putString("key", key).putBoolean("connected", true).remove("pair").remove("pending_key").apply()
                        showState(); return@launch
                    }
                    status.text = "Waiting for SoundCloud sign-in… Finish in the browser, then return here."
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { status.text = e.message ?: "Could not check sign-in"; return@launch }
                delay(2000)
            }
            status.text = "Sign-in expired. Please start again."
        }
    }
    override fun onPause() { polling?.cancel(); super.onPause() }

    private fun disconnectAccount() {
        val key = prefs.getString("key", null) ?: return
        disconnect.isEnabled = false
        lifecycleScope.launch {
            try {
                request("/session", "DELETE", key)
                SourceRegistry.remove("soundcloud-login")
                prefs.edit().clear().apply(); showState()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { status.text = e.message ?: "Disconnect failed"; disconnect.isEnabled = true }
        }
    }
}
