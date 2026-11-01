package com.music.bitchord.data.sources

import com.music.bitchord.data.Http
import com.music.bitchord.data.innertube.StreamResolver
import com.music.bitchord.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import org.schabi.newpipe.extractor.services.soundcloud.SoundcloudParsingHelper
import java.net.URLEncoder
import com.music.bitchord.playback.StreamContainer
import java.util.concurrent.ConcurrentHashMap

/** Public SoundCloud browsing. All requests stay on the fixed SoundCloud API host. */
object SoundCloudCatalog {
    const val PREFIX = "soundcloud:"
    data class Page(val title: String, val artwork: String?, val songs: List<Song>, val sections: List<HomeShelf>)
    private val resolvedStreams = ConcurrentHashMap<String, Pair<Long, SourceStream>>()
    private val failedStreams = ConcurrentHashMap<String, Int>()
    fun retry(url: String) { resolvedStreams.remove(url); failedStreams[url] = (failedStreams[url] ?: 0) + 1 }
    suspend fun stream(url: String): SourceStream = withContext(Dispatchers.IO) {
        require(url.startsWith("https://soundcloud.com/") || url.startsWith("https://www.soundcloud.com/"))
        resolvedStreams[url]?.takeIf { System.currentTimeMillis() - it.first < 45_000 }?.let { return@withContext it.second }
        val track = api("/resolve?url=${enc(url)}")
        check(track.optString("policy") !in setOf("BLOCK", "SNIP") && track.optBoolean("streamable", true)) { "SoundCloud restricts full playback of this track" }
        val variants = rows(track.optJSONObject("media")?.optJSONArray("transcodings")).filter { item ->
            val format = item.optJSONObject("format")
            val signature = format?.optString("mime_type").orEmpty() + " " + item.optString("preset")
            !signature.contains("opus", true) && !signature.contains("ogg", true) &&
                (signature.contains("mp3") || signature.contains("aac") || signature.contains("audio/mp4") || signature.contains("audio/mpeg;" ) || signature.trim() == "audio/mpeg") &&
                item.optString("quality") != "hq" && !item.optBoolean("snipped") && item.optString("url").startsWith("https://api-v2.soundcloud.com/media/")
        }.sortedByDescending { if (it.optJSONObject("format")?.optString("protocol") == "progressive") 10 else 1 }
        check(variants.isNotEmpty()) { "No public MP3/AAC stream is available for this SoundCloud track" }
        val offset = (failedStreams[url] ?: 0) % variants.size
        var result: SourceStream? = null
        for (index in variants.indices) {
            val variant = variants[(index + offset) % variants.size]
            try {
                val endpoint = variant.getString("url").removePrefix("https://api-v2.soundcloud.com")
                val auth = track.optString("track_authorization").takeUnless { it.isBlank() || it == "null" }
                val response = api(endpoint + (if ('?' in endpoint) "&" else "?") + if (auth != null) "track_authorization=" + enc(auth) else "")
                val media = response.getString("url")
                check(media.startsWith("https://"))
                if (variant.optJSONObject("format")?.optString("protocol") == "hls") StreamContainer.declare(media, "hls")
                val aac = variant.optString("preset").contains("aac") || variant.optJSONObject("format")?.optString("mime_type")?.contains("mp4") == true
                result = SourceStream(url = media, format = StreamFormat(codec = if (aac) "aac" else "mp3"), durationSec = (track.optLong("duration") / 1000).toInt())
                break
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { /* Try another public transcoding, never a preview or paid stream. */ }
        }
        val stream = result ?: error("SoundCloud could not resolve a public stream; try again later")
        if (resolvedStreams.size > 100) resolvedStreams.clear()
        resolvedStreams[url] = System.currentTimeMillis() to stream
        stream
    }
    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun api(path: String): JSONObject {
        require(path.startsWith("/") && !path.contains("\r") && !path.contains("\n"))
        StreamResolver.initializeExtractor()
        val url = "https://api-v2.soundcloud.com$path" + (if ('?' in path) "&" else "?") + "client_id=" + enc(SoundcloudParsingHelper.clientId())
        return Http.client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            check(response.isSuccessful) { "SoundCloud request failed (${response.code})" }
            JSONObject(response.body?.string() ?: error("Empty SoundCloud response"))
        }
    }
    private fun rows(array: JSONArray?): List<JSONObject> = if (array == null) emptyList() else (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    private fun art(item: JSONObject): String? = item.optString("artwork_url").takeUnless { it.isBlank() || it == "null" }
        ?: item.optString("avatar_url").takeUnless { it.isBlank() || it == "null" }
        ?: item.optJSONObject("user")?.optString("avatar_url")?.takeUnless { it.isBlank() || it == "null" }
    private fun configId() = SourceRegistry.configs.value.first { it.kind == SourceKind.SOUNDCLOUD }.id
    fun song(item: JSONObject, source: String = configId()): Song? {
        if (item.optString("policy") in setOf("BLOCK", "SNIP") || !item.optBoolean("streamable", true)) return null
        val link = item.optString("permalink_url"); if (!link.startsWith("https://soundcloud.com/")) return null
        val user = item.optJSONObject("user")
        val artistUrl = user?.optString("permalink_url")?.takeIf { it.startsWith("https://soundcloud.com/") }
        val duration = item.optLong("duration") / 1000
        return Song(videoId = SourceRegistry.trackKey(source, link), title = item.optString("title"), artist = user?.optString("username").orEmpty(),
            thumbnailUrl = art(item), artistId = artistUrl?.let { "${PREFIX}artist:$it" }, durationText = "%d:%02d".format(duration / 60, duration % 60), sourceQuality = "HIGH")
    }
    suspend fun trackInfo(url: String): Song? = withContext(Dispatchers.IO) {
        require(url.startsWith("https://soundcloud.com/") || url.startsWith("https://www.soundcloud.com/"))
        song(api("/resolve?url=${enc(url)}"))
    }
    suspend fun searchTracks(query: String, limit: Int, source: String): List<Song> = withContext(Dispatchers.IO) {
        rows(api("/search/tracks?q=${enc(query)}&limit=${limit.coerceIn(1, 200)}").optJSONArray("collection")).mapNotNull { song(it, source) }.distinctBy { it.videoId }
    }
    private fun shelf(items: List<JSONObject>, artist: Boolean): HomeShelf = HomeShelf(
        title = if (artist) "Artists" else "Albums & Playlists",
        items = items.mapNotNull { item ->
            val url = item.optString("permalink_url"); if (!url.startsWith("https://soundcloud.com/")) return@mapNotNull null
            ShelfItem(title = item.optString(if (artist) "username" else "title"), subtitle = if (artist) "SoundCloud artist" else if (item.optBoolean("is_album")) "Album" else "Playlist",
                thumbnailUrl = art(item), videoId = null, browseId = PREFIX + (if (artist) "artist:" else "playlist:") + url)
        },
    )
    suspend fun page(id: String): Page = withContext(Dispatchers.IO) {
        when {
            id.startsWith("${PREFIX}search:") -> {
                val mode = id.removePrefix("${PREFIX}search:").substringBefore(':')
                val query = id.substringAfter("${PREFIX}search:$mode:")
                val artists = mode == "artists"
                val data = api("/search/${if (artists) "users" else "playlists"}?q=${enc(query)}&limit=100")
                Page(query, null, emptyList(), listOf(shelf(rows(data.optJSONArray("collection")), artists)))
            }
            else -> {
                val artist = id.startsWith("${PREFIX}artist:")
                val url = id.removePrefix(PREFIX + if (artist) "artist:" else "playlist:")
                require(url.startsWith("https://soundcloud.com/") && !url.contains('@')) { "Invalid SoundCloud page" }
                val entity = api("/resolve?url=${enc(url)}")
                if (artist) coroutineScope {
                    val tracks = async { rows(api("/users/${entity.getLong("id")}/tracks?limit=200").optJSONArray("collection")) }
                    val albums = async { rows(api("/users/${entity.getLong("id")}/albums?limit=100").optJSONArray("collection")) }
                    val playlists = async { rows(api("/users/${entity.getLong("id")}/playlists?limit=100").optJSONArray("collection")) }
                    Page(entity.optString("username"), art(entity), tracks.await().mapNotNull { song(it) }, listOf(shelf((albums.await() + playlists.await()).distinctBy { it.optLong("id") }, false)))
                } else {
                    val tracks = rows(entity.optJSONArray("tracks"))
                    // Playlist responses can contain id-only stubs. Resolve those in batches.
                    val full = tracks.chunked(50).flatMap { batch ->
                        if (batch.all { it.has("title") }) batch else {
                            val request = Request.Builder().url("https://api-v2.soundcloud.com/tracks?ids=" + batch.joinToString(",") { it.getLong("id").toString() } + "&client_id=" + enc(SoundcloudParsingHelper.clientId())).build()
                            Http.client.newCall(request).execute().use { response -> check(response.isSuccessful); rows(JSONArray(response.body?.string())) }
                        }
                    }
                    Page(entity.optString("title"), art(entity), full.mapNotNull { song(it)?.copy(albumId = id, albumName = entity.optString("title")) }, emptyList())
                }
            }
        }
    }
}
