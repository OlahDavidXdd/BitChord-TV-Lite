package com.music.bitchord.data.sources

import android.net.Uri
import com.music.bitchord.data.innertube.StreamResolver
import com.music.bitchord.data.model.Song
import com.music.bitchord.playback.StreamContainer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.stream.ContentAvailability
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/** Public SoundCloud catalogue through the already-bundled NewPipe extractor. No OAuth/server. */
class SoundCloudSource(override val config: SourceConfig) : MusicSource, SourceRegistry.ConfigBacked {
    override val configId get() = config.id
    override val kind get() = SourceKind.SOUNDCLOUD
    override val displayName get() = "SoundCloud"
    private data class Cached(val at: Long, val rows: List<Song>)
    private val searches = ConcurrentHashMap<String, Cached>()
    override suspend fun health(): SourceHealth = SourceHealth.Ok("Free public tracks · no account required")

    override suspend fun search(query: String, limit: Int, waitForAll: Boolean, request: StreamRequest?): List<Song> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        val key = query.trim()
        searches[key]?.takeIf { android.os.SystemClock.elapsedRealtime() - it.at < 300_000 }?.let { return@withContext it.rows.take(limit) }
        val rows = SoundCloudCatalog.searchTracks(key, limit.coerceAtMost(200), configId)
        if (searches.size >= 100) searches.clear()
        searches[key] = Cached(android.os.SystemClock.elapsedRealtime(), rows)
        rows.take(limit)
    }

    override suspend fun stream(trackId: String, request: StreamRequest): SourceStream? = withContext(Dispatchers.IO) {
        if (request is StreamRequest.Lossless) return@withContext null
        val uri = Uri.parse(trackId)
        require(uri.scheme == "https" && uri.host in setOf("soundcloud.com", "www.soundcloud.com") && uri.userInfo == null) { "Invalid SoundCloud track URL" }
        SoundCloudCatalog.stream(trackId)
    }
}
