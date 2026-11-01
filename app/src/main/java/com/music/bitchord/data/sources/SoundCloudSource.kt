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
        StreamResolver.initializeExtractor()
        val extractor = ServiceList.SoundCloud.getSearchExtractor(key, listOf("tracks"), "")
        extractor.fetchPage()
        val items = extractor.initialPage.items.toMutableList()
        var next = extractor.initialPage.nextPage
        var pages = 1
        while (items.size < limit.coerceAtMost(50) && org.schabi.newpipe.extractor.Page.isValid(next) && pages < 5) {
            val page = runCatching { extractor.getPage(next) }.getOrNull() ?: break
            items.addAll(page.items)
            next = page.nextPage
            pages++
        }
        val rows = items.filterIsInstance<StreamInfoItem>()
            .filter { it.contentAvailability != ContentAvailability.PAID && it.contentAvailability != ContentAvailability.MEMBERSHIP }
            .map { item ->
                Song(videoId = SourceRegistry.trackKey(configId, item.url), title = item.name,
                    artist = item.uploaderName, thumbnailUrl = item.thumbnails.maxByOrNull { it.width }?.url,
                    durationText = item.duration.takeIf { it > 0 }?.let { String.format(Locale.ROOT, "%d:%02d", it / 60, it % 60) }, sourceQuality = "HIGH")
            }
        if (searches.size >= 100) searches.clear()
        searches[key] = Cached(android.os.SystemClock.elapsedRealtime(), rows)
        rows.take(limit)
    }

    override suspend fun stream(trackId: String, request: StreamRequest): SourceStream? = withContext(Dispatchers.IO) {
        if (request is StreamRequest.Lossless) return@withContext null
        val uri = Uri.parse(trackId)
        require(uri.scheme == "https" && uri.host in setOf("soundcloud.com", "www.soundcloud.com") && uri.userInfo == null) { "Invalid SoundCloud track URL" }
        StreamResolver.initializeExtractor()
        val info = StreamInfo.getInfo(ServiceList.SoundCloud, trackId)
        require(info.contentAvailability != ContentAvailability.PAID && info.contentAvailability != ContentAvailability.MEMBERSHIP) { "This track is restricted on SoundCloud" }
        val candidates = info.audioStreams.filter {
            it.isUrl && it.content.startsWith("https://") &&
                it.format?.suffix?.lowercase(Locale.ROOT) in setOf("mp3", "m4a", "mp4", "aac")
        }
        val cap = (request as? StreamRequest.Capped)?.maxKbps
        val selected = (if (cap != null) candidates.filter { it.averageBitrate <= cap } else candidates)
            .maxByOrNull { it.averageBitrate } ?: candidates.minByOrNull { it.averageBitrate } ?: return@withContext null
        val url = selected.content
        if (selected.deliveryMethod == DeliveryMethod.HLS) StreamContainer.declare(url, "hls")
        SourceStream(url = url, format = StreamFormat(codec = selected.format?.suffix ?: "mp3", kbps = selected.averageBitrate.takeIf { it > 0 }), durationSec = info.duration.takeIf { it > 0 }?.toInt())
    }
}
