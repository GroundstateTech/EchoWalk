package expo.modules.echowalksonar

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

class EchoWalkSonarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EchoWalkSonar")

    AsyncFunction("pingAndMeasure") {
      val context = appContext.reactContext
        ?: return@AsyncFunction reading(null, 0.0, 0.0, SAMPLE_RATE)

      val hasMic = context.checkSelfPermission(
        Manifest.permission.RECORD_AUDIO
      ) == PackageManager.PERMISSION_GRANTED

      if (!hasMic) {
        return@AsyncFunction reading(null, 0.0, 0.0, SAMPLE_RATE)
      }

      measureDistance()
    }
  }

  private fun measureDistance(): Map<String, Any?> {
    val chirp = makeChirp(
      sampleRate = SAMPLE_RATE,
      durationMs = CHIRP_MS,
      startHz = CHIRP_START_HZ,
      endHz = CHIRP_END_HZ
    )

    val recordSamples = SAMPLE_RATE * RECORD_MS / 1000
    val minimumBuffer = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )

    if (minimumBuffer <= 0) {
      return reading(null, 0.0, 0.0, SAMPLE_RATE)
    }

    var recorder: AudioRecord? = null
    var player: AudioTrack? = null

    return try {
      recorder = createRecorder(max(minimumBuffer, recordSamples * 2))
      player = createPlayer(chirp.size * 2)

      if (recorder.state != AudioRecord.STATE_INITIALIZED ||
        player.state != AudioTrack.STATE_INITIALIZED
      ) {
        return reading(null, 0.0, 0.0, SAMPLE_RATE)
      }

      val chirpPcm = ShortArray(chirp.size) { index ->
        (chirp[index].coerceIn(-1.0, 1.0) * Short.MAX_VALUE)
          .toInt()
          .toShort()
      }

      val captured = ShortArray(recordSamples)
      player.write(chirpPcm, 0, chirpPcm.size)

      recorder.startRecording()
      Thread.sleep(PRE_ROLL_MS.toLong())
      player.play()

      var offset = 0
      while (offset < captured.size) {
        val count = recorder.read(captured, offset, captured.size - offset)
        if (count <= 0) break
        offset += count
      }

      if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        recorder.stop()
      }
      if (player.playState == AudioTrack.PLAYSTATE_PLAYING) {
        player.stop()
      }

      val signal = DoubleArray(offset) { i -> captured[i].toDouble() / Short.MAX_VALUE }
      val result = findEcho(signal, chirp)
        ?: return reading(null, 0.0, 0.0, SAMPLE_RATE)

      val delaySeconds = result.delaySamples.toDouble() / SAMPLE_RATE.toDouble()
      val meters = delaySeconds * SPEED_OF_SOUND_MPS / 2.0

      val accepted = meters.takeIf {
        it.isFinite() &&
          it in MIN_DISTANCE_METERS..MAX_DISTANCE_METERS &&
          result.confidence >= MIN_CONFIDENCE
      }

      reading(accepted, result.confidence, result.peakScore, SAMPLE_RATE)
    } catch (_: Throwable) {
      reading(null, 0.0, 0.0, SAMPLE_RATE)
    } finally {
      try { recorder?.release() } catch (_: Throwable) {}
      try { player?.release() } catch (_: Throwable) {}
    }
  }

  private fun createRecorder(bufferBytes: Int): AudioRecord {
    val sources = listOf(
      MediaRecorder.AudioSource.UNPROCESSED,
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      MediaRecorder.AudioSource.DEFAULT
    )

    for (source in sources) {
      try {
        val record = AudioRecord(
          source,
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          bufferBytes
        )
        if (record.state == AudioRecord.STATE_INITIALIZED) return record
        record.release()
      } catch (_: Throwable) {}
    }

    return AudioRecord(
      MediaRecorder.AudioSource.DEFAULT,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferBytes
    )
  }

  private fun createPlayer(bufferBytes: Int): AudioTrack {
    return AudioTrack(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build(),
      AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build(),
      bufferBytes,
      AudioTrack.MODE_STATIC,
      AudioManager.AUDIO_SESSION_ID_GENERATE
    )
  }

  private fun makeChirp(
    sampleRate: Int,
    durationMs: Int,
    startHz: Double,
    endHz: Double
  ): DoubleArray {
    val count = sampleRate * durationMs / 1000
    val output = DoubleArray(count)
    val durationSeconds = durationMs / 1000.0
    val sweep = (endHz - startHz) / durationSeconds

    for (i in 0 until count) {
      val t = i.toDouble() / sampleRate
      val progress = i.toDouble() / max(1.0, count - 1.0)
      val phase = 2.0 * PI * (startHz * t + 0.5 * sweep * t * t)
      val window = sin(PI * progress).coerceAtLeast(0.0)
      output[i] = sin(phase) * window * CHIRP_AMPLITUDE
    }
    return output
  }

  private data class EchoResult(
    val delaySamples: Int,
    val peakScore: Double,
    val confidence: Double
  )

  private fun findEcho(signal: DoubleArray, chirp: DoubleArray): EchoResult? {
    if (signal.size <= chirp.size + 1) return null

    val firstSample = (SAMPLE_RATE * MIN_ECHO_DELAY_MS / 1000.0).toInt()
    val finalSample = minOf(
      signal.size - chirp.size - 1,
      (SAMPLE_RATE * MAX_ECHO_DELAY_MS / 1000.0).toInt()
    )
    if (finalSample <= firstSample) return null

    var peakIndex = -1
    var peak = 0.0
    var runnerUp = 0.0

    var i = firstSample
    while (i <= finalSample) {
      var dot = 0.0
      var signalEnergy = 0.0
      var chirpEnergy = 0.0

      for (j in chirp.indices) {
        val sample = signal[i + j]
        val reference = chirp[j]
        dot += sample * reference
        signalEnergy += sample * sample
        chirpEnergy += reference * reference
      }

      val normalized = abs(dot) / sqrt((signalEnergy * chirpEnergy) + 1e-12)
      if (normalized > peak) {
        runnerUp = peak
        peak = normalized
        peakIndex = i
      } else if (normalized > runnerUp) {
        runnerUp = normalized
      }
      i += CORRELATION_STEP
    }

    if (peakIndex < 0 || peak <= 0.0) return null

    val prominence = ((peak - runnerUp) / peak).coerceIn(0.0, 1.0)
    val confidence = (peak * 0.7 + prominence * 0.3).coerceIn(0.0, 1.0)

    return EchoResult(
      delaySamples = peakIndex,
      peakScore = peak,
      confidence = confidence
    )
  }

  private fun reading(
    distanceMeters: Double?,
    confidence: Double,
    peakScore: Double,
    sampleRate: Int
  ): Map<String, Any?> = mapOf(
    "distanceMeters" to distanceMeters,
    "confidence" to confidence,
    "peakScore" to peakScore,
    "sampleRate" to sampleRate
  )

  companion object {
    private const val SAMPLE_RATE = 48_000
    private const val CHIRP_MS = 8
    private const val RECORD_MS = 100
    private const val PRE_ROLL_MS = 8
    private const val CHIRP_START_HZ = 17_000.0
    private const val CHIRP_END_HZ = 20_000.0
    private const val CHIRP_AMPLITUDE = 0.45
    private const val SPEED_OF_SOUND_MPS = 343.0
    private const val MIN_DISTANCE_METERS = 0.20
    private const val MAX_DISTANCE_METERS = 4.00
    private const val MIN_ECHO_DELAY_MS = 1.2
    private const val MAX_ECHO_DELAY_MS = 25.0
    private const val MIN_CONFIDENCE = 0.12
    private const val CORRELATION_STEP = 2
  }
}
