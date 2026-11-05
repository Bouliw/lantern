import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, deviceId, serverUrl, session, userId } from '../api/client';
import { catalog, loadCatalog, representative } from '../api/catalog';
import { imageUrl, logoOf, stillOf, trickplayUrl } from '../api/images';
import { overviewOf } from '../ui/meta';
import { SplitText } from '../ui/SplitText';
import type { Item, ItemsResult, MediaSegment, MediaSource, MediaStream, TrickplayInfo } from '../api/types';
import { TICKS_PER_SECOND } from '../api/types';
import { formatClock, t } from '../i18n';
import { KEY, focusElement, focusFirst, isBackKey, pushKeyHandler } from '../nav/spatial';
import { hasHover, isAppleWebKit, isIOS, isTV } from '../platform';
import { goBack, navigate } from '../router';
import { Img } from '../ui/Img';
import {
  IconBack,
  IconCheck,
  IconChapters,
  IconForward10,
  IconFullscreen,
  IconFullscreenExit,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconReplay10,
  IconSubtitles,
  IconVolume,
} from '../ui/icons';
import { caps, deviceProfile } from './profile';
import { playSound } from '../fx/sound';
import { cuesAt, parseVtt, type Cue } from './subtitles';

type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

interface Stream {
  source: MediaSource;
  playSessionId: string;
  method: PlayMethod;
  audio?: number;
  /** subtitle index burned into the video, if any */
  burned: number;
}

const HIDE_AFTER = 3500;
const ticks = (s: number) => Math.max(0, Math.floor(s * TICKS_PER_SECOND));

/**
 * External text subtitles are fetched as WebVTT and drawn by the app. Picture subtitles, and
 * subtitles stored inside the video file, are burned in by the server: extracting them would
 * mean reading the whole file first, which is slow on external or SD-card storage.
 */
function needsBurnIn(s: MediaStream): boolean {
  return !s.IsTextSubtitleStream || !s.IsExternal;
}

function fileDefaultAudio(it: Item): number | undefined {
  const audio = (it.MediaStreams ?? []).filter((s) => s.Type === 'Audio');
  return (audio.find((s) => s.IsDefault) ?? audio[0])?.Index;
}

const playableAudio = () =>
  new Set(['aac', 'mp3', 'vorbis', caps.ac3 && 'ac3', caps.eac3 && 'eac3', caps.opus && 'opus', caps.flac && 'flac'].filter(Boolean) as string[]);

/**
 * The file's default track, unless this device cannot decode it (TrueHD, DTS…): then a track
 * in the same language that it can play, so the server only remuxes instead of transcoding.
 */
function preferredAudio(it: Item): number | undefined {
  const audio = (it.MediaStreams ?? []).filter((s) => s.Type === 'Audio');
  const def = audio.find((s) => s.IsDefault) ?? audio[0];
  if (!def) return undefined;
  const ok = playableAudio();
  if (ok.has((def.Codec ?? '').toLowerCase())) return def.Index;
  const alt = audio.find(
    (s) =>
      s !== def &&
      s.Language === def.Language &&
      ok.has((s.Codec ?? '').toLowerCase()) &&
      !/comment/i.test(`${s.Title ?? ''} ${s.DisplayTitle ?? ''}`),
  );
  return (alt ?? def).Index;
}

function streamLabel(s: MediaStream): string {
  return s.DisplayTitle || s.Title || s.Language || `#${s.Index}`;
}

function pickTrickplay(item: Item | null, sourceId?: string): { info: TrickplayInfo; width: number } | null {
  if (!item?.Trickplay) return null;
  const byWidth = (sourceId && item.Trickplay[sourceId]) || item.Trickplay[item.Id] || Object.values(item.Trickplay)[0];
  if (!byWidth) return null;
  const widths = Object.keys(byWidth)
    .map(Number)
    .sort((a, b) => a - b);
  const width = widths.find((w) => w >= 240) ?? widths[widths.length - 1];
  return width ? { info: byWidth[String(width)], width } : null;
}

function Thumb({ item, sourceId, time, scale }: { item: Item; sourceId: string; time: number; scale: number }) {
  const tp = pickTrickplay(item, sourceId);
  if (!tp) return null;
  const { info, width } = tp;
  const idx = Math.min(info.ThumbnailCount - 1, Math.max(0, Math.floor((time * 1000) / info.Interval)));
  const perSheet = info.TileWidth * info.TileHeight;
  const sheet = Math.floor(idx / perSheet);
  const within = idx % perSheet;
  const col = within % info.TileWidth;
  const row = Math.floor(within / info.TileWidth);
  const w = info.Width * scale;
  const h = info.Height * scale;
  return (
    <span
      class="trickplay"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url("${trickplayUrl(item.Id, width, sheet, sourceId)}")`,
        backgroundSize: `${info.TileWidth * w}px ${info.TileHeight * h}px`,
        backgroundPosition: `-${col * w}px -${row * h}px`,
      }}
    />
  );
}

export function Player({ id, startTicks }: { id: string; startTicks: number | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const hls = useRef<any>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [segments, setSegments] = useState<MediaSegment[]>([]);
  const [nextEp, setNextEp] = useState<Item | null>(null);
  const [subIndex, setSubIndex] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);
  const [error, setError] = useState(false);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pauseInfo, setPauseInfo] = useState(false);
  const lastPoke = useRef(0);
  const [pulse, setPulse] = useState<{ kind: 'play' | 'pause' | 'fwd' | 'back'; n: number; label?: string } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<null | 'tracks' | 'chapters'>(null);
  const [preview, setPreview] = useState<{ time: number; x: number } | null>(null);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [creditsDismissed, setCreditsDismissed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const pendingStart = useRef<number>(0);
  const safeMode = useRef(false);
  const forceHlsJs = useRef(false);
  const nativeHls = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout>>();
  const seekGuard = useRef<ReturnType<typeof setTimeout>>();
  /** Set when the device ignores seeks in a direct-played file (e.g. no index in the file). */
  const directSeekBroken = useRef(false);
  const started = useRef(false);
  const lastReport = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const seekTimer = useRef<ReturnType<typeof setTimeout>>();
  const scrubberRef = useRef<HTMLDivElement>(null);

  // Latest values for event handlers.
  const st = useRef({ stream, item, subIndex, controls, menu, seekTarget, nextEp, duration });
  st.current = { stream, item, subIndex, controls, menu, seekTarget, nextEp, duration };

  // ---- Reporting -------------------------------------------------------------

  const report = (path: string, extra: Record<string, unknown> = {}, keepalive = false) => {
    const s = st.current.stream;
    const v = video.current;
    if (!s || !v) return Promise.resolve();
    return api(path, {
      method: 'POST',
      keepalive,
      body: {
        ItemId: id,
        MediaSourceId: s.source.Id,
        PlaySessionId: s.playSessionId,
        PositionTicks: ticks(v.currentTime),
        IsPaused: v.paused,
        IsMuted: v.muted,
        VolumeLevel: Math.round(v.volume * 100),
        PlayMethod: s.method,
        AudioStreamIndex: s.audio ?? s.source.DefaultAudioStreamIndex,
        SubtitleStreamIndex: st.current.subIndex,
        CanSeek: true,
        ...extra,
      },
    }).catch(() => {});
  };

  const stopReport = (keepalive = false) => {
    const s = st.current.stream;
    if (!s || !started.current) return;
    started.current = false;
    void report('/Sessions/Playing/Stopped', {}, keepalive);
    if (s.method !== 'DirectPlay') {
      void api('/Videos/ActiveEncodings', {
        method: 'DELETE',
        query: { DeviceId: deviceId, PlaySessionId: s.playSessionId },
        keepalive,
      }).catch(() => {});
    }
  };

  // ---- Loading ---------------------------------------------------------------

  const destroyHls = () => {
    hls.current?.destroy?.();
    hls.current = null;
  };

  const attach = async (url: string, at: number) => {
    const v = video.current!;
    destroyHls();
    pendingStart.current = at;
    const isHls = /\.m3u8/i.test(url);
    // Safari and TVs play HLS natively first; elsewhere hls.js is more dependable.
    const useHlsJs = isHls && (!caps.nativeHls || (!isAppleWebKit && !isTV) || forceHlsJs.current);
    nativeHls.current = isHls && !useHlsJs;
    // A stream that never starts is treated as a failure.
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      const el = video.current;
      if (el && el.readyState < 3 && !el.paused) fail();
    }, 25_000);
    if (useHlsJs) {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        const h = new Hls({ startPosition: at, maxBufferLength: 40, backBufferLength: 30 });
        h.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => data.fatal && fail());
        h.loadSource(url);
        h.attachMedia(v);
        hls.current = h;
      } else v.src = url;
    } else v.src = url;
    v.play().catch(() => setPaused(true));
  };

  /**
   * Some files cannot be seeked when played directly (no index); if a seek is ignored, the same
   * position is served by the server instead, which can always seek.
   */
  const guardSeek = (target: number) => {
    const s = st.current.stream;
    if (!s || s.method !== 'DirectPlay' || target < 1) return;
    clearTimeout(seekGuard.current);
    seekGuard.current = setTimeout(() => {
      const v = video.current;
      if (!v || v.seeking || Math.abs(v.currentTime - target) < 5) return;
      directSeekBroken.current = true;
      void start(target, s.audio, s.burned);
    }, 2500);
  };

  /** A stream that fails to decode is retried once as a plain H.264 transcode. */
  const fail = () => {
    const v = video.current;
    clearTimeout(watchdog.current);
    console.warn('lantern: playback failed', v?.error?.code ?? 'hls', safeMode.current ? '(safe mode)' : '');
    const s = st.current.stream;
    const at = v?.currentTime || pendingStart.current || 0;
    // 1. native HLS failed: same stream through hls.js. 2. Then a plain H.264 transcode.
    if (nativeHls.current && !forceHlsJs.current && st.current.item) {
      forceHlsJs.current = true;
      void start(at, s?.audio, s?.burned ?? -1);
      return;
    }
    if (!safeMode.current && st.current.item) {
      safeMode.current = true;
      void start(at, s?.audio, s?.burned ?? -1);
      return;
    }
    setError(true);
    setWaiting(false);
  };

  const start = async (at: number, audio?: number, sub = -1) => {
    const it = st.current.item;
    if (!it) return;
    setWaiting(true);
    setError(false);
    const safe = safeMode.current;
    // The track flagged as default in the file is what direct play uses; ask for it explicitly
    // so a remux or transcode keeps the same language.
    const defaultAudio = fileDefaultAudio(it);
    if (audio == null) audio = preferredAudio(it);
    const subStream = it.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === sub);
    const burn = sub >= 0 && !!subStream && needsBurnIn(subStream);
    const noDirect =
      safe || burn || directSeekBroken.current || (audio != null && defaultAudio != null && audio !== defaultAudio);
    // When the video has to be re-encoded, ask for a bitrate that fits its size: hardware
    // encoders refuse absurd targets (e.g. 200 Mb/s for a DVD-sized picture).
    const height = it.MediaStreams?.find((s) => s.Type === 'Video')?.Height ?? 1080;
    const encodeRate = height <= 576 ? 8_000_000 : height <= 720 ? 12_000_000 : height <= 1080 ? 20_000_000 : 50_000_000;
    const maxRate = safe || burn ? encodeRate : 200_000_000;
    try {
      const info = await api<{ MediaSources: MediaSource[]; PlaySessionId: string }>(`/Items/${id}/PlaybackInfo`, {
        method: 'POST',
        query: { UserId: userId() },
        body: {
          UserId: userId(),
          DeviceProfile: deviceProfile({ safe, maxBitrate: maxRate }),
          StartTimeTicks: ticks(at),
          MediaSourceId: it.MediaSources?.[0]?.Id,
          AudioStreamIndex: audio,
          SubtitleStreamIndex: burn ? sub : -1,
          EnableDirectPlay: !noDirect,
          EnableDirectStream: !safe,
          EnableTranscoding: true,
          AllowVideoStreamCopy: !safe,
          AllowAudioStreamCopy: true,
          AutoOpenLiveStream: true,
          MaxStreamingBitrate: maxRate,
        },
      });
      const src = info.MediaSources[0];
      let url: string;
      let method: PlayMethod;
      if (src.SupportsDirectPlay && !noDirect) {
        const q = new URLSearchParams({
          Static: 'true',
          MediaSourceId: src.Id,
          DeviceId: deviceId,
          ApiKey: session.value?.token ?? '',
        });
        if (src.ETag) q.set('Tag', src.ETag);
        url = `${serverUrl.value}/Videos/${id}/stream?${q}`;
        method = 'DirectPlay';
      } else if (src.TranscodingUrl) {
        // Always start the playlist at 0 and seek, so the timeline stays absolute.
        // Hardware H.264 encoders reject low levels inherited from old sources (e.g. 3.0 for a
        // DVD rip); 4.0 is accepted everywhere and still plays on every device.
        url = (serverUrl.value + src.TranscodingUrl.replace(/([?&])StartTimeTicks=\d+&?/i, '$1')).replace(
          /h264-level=(\d+)/i,
          (_m, n) => `h264-level=${Math.max(Number(n), 40)}`,
        );
        method = /videocodec=copy|AllowVideoStreamCopy=true/i.test(src.TranscodingUrl) && !burn ? 'DirectStream' : 'Transcode';
      } else throw new Error('no stream');
      stopReport();
      setStream({ source: src, playSessionId: info.PlaySessionId, method, audio, burned: burn ? sub : -1 });
      st.current.stream = { source: src, playSessionId: info.PlaySessionId, method, audio, burned: burn ? sub : -1 };
      await attach(url, at);
    } catch {
      setError(true);
      setWaiting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    started.current = false;
    (async () => {
      try {
        const it = await api<Item>(`/Users/${userId()}/Items/${id}`, {
          query: { Fields: 'Chapters,Trickplay,MediaSources,MediaStreams,Overview' },
        });
        if (!alive) return;
        setItem(it);
        st.current.item = it;
        const pos = it.UserData?.PlaybackPositionTicks ?? 0;
        const runtime = it.RunTimeTicks ?? 0;
        const resume = startTicks ?? (pos > 0 && (!runtime || pos < runtime * 0.95) ? pos : 0);
        void start(resume / TICKS_PER_SECOND);
        api<{ Items: MediaSegment[] }>(`/MediaSegments/${id}`)
          .then((r) => alive && setSegments(r.Items ?? []))
          .catch(() => {});
        if (it.Type === 'Episode' && it.SeriesId) {
          api<ItemsResult>(`/Shows/${it.SeriesId}/Episodes`, { query: { UserId: userId(), Fields: 'Overview' } })
            .then((r) => {
              if (!alive) return;
              const i = r.Items.findIndex((e) => e.Id === id);
              setNextEp(i >= 0 ? r.Items[i + 1] ?? null : null);
            })
            .catch(() => {});
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    const onUnload = () => stopReport(true);
    window.addEventListener('pagehide', onUnload);
    return () => {
      alive = false;
      window.removeEventListener('pagehide', onUnload);
      stopReport(true);
      destroyHls();
      clearTimeout(hideTimer.current);
      clearTimeout(seekTimer.current);
      clearTimeout(watchdog.current);
      clearTimeout(seekGuard.current);
      void loadCatalog(true);
    };
  }, [id]);

  // ---- Video events ----------------------------------------------------------

  useEffect(() => {
    const v = video.current!;
    // Some TVs ignore a seek made before the media can play: retry until the start point is reached.
    const applyStart = () => {
      const at = pendingStart.current;
      if (at <= 0) return;
      if (Math.abs(v.currentTime - at) > 2) {
        v.currentTime = at;
        guardSeek(at);
      } else pendingStart.current = 0;
    };
    const onMeta = () => {
      setDuration(v.duration || (st.current.item?.RunTimeTicks ?? 0) / TICKS_PER_SECOND);
      applyStart();
    };
    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      const now = Date.now();
      if (started.current && now - lastReport.current > 10_000) {
        lastReport.current = now;
        void report('/Sessions/Playing/Progress', { EventName: 'TimeUpdate' });
      }
    };
    const onPlaying = () => {
      clearTimeout(watchdog.current);
      setWaiting(false);
      setPaused(false);
      if (!started.current && st.current.stream) {
        started.current = true;
        lastReport.current = Date.now();
        void report('/Sessions/Playing');
      }
    };
    const onPause = () => {
      setPaused(true);
      setControls(true);
      if (started.current) void report('/Sessions/Playing/Progress', { EventName: 'Pause' });
    };
    const onPlay = () => {
      setPaused(false);
      if (started.current) void report('/Sessions/Playing/Progress', { EventName: 'Unpause' });
    };
    const onWaiting = () => setWaiting(true);
    const onCanPlay = () => {
      setWaiting(false);
      applyStart();
    };
    const onSeeked = () => {
      if (pendingStart.current && Math.abs(v.currentTime - pendingStart.current) < 3) pendingStart.current = 0;
    };
    const onVolume = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onEnded = () => {
      if (st.current.nextEp) goNext();
      else exit();
    };
    const onError = () => {
      // With hls.js, decoding errors arrive through hls.js; element errors there are leftovers
      // of the previous source being torn down. Aborts are not failures either.
      if (hls.current || !v.error || v.error.code === 1 || !v.currentSrc) return;
      fail();
    };
    const events: [string, () => void][] = [
      ['loadedmetadata', onMeta],
      ['timeupdate', onTime],
      ['playing', onPlaying],
      ['pause', onPause],
      ['play', onPlay],
      ['waiting', onWaiting],
      ['canplay', onCanPlay],
      ['seeked', onSeeked],
      ['volumechange', onVolume],
      ['ended', onEnded],
      ['error', onError],
    ];
    events.forEach(([e, f]) => v.addEventListener(e, f));
    return () => events.forEach(([e, f]) => v.removeEventListener(e, f));
  }, []);

  // ---- Controls visibility -----------------------------------------------------

  const poke = () => {
    lastPoke.current = performance.now();
    setPauseInfo(false);
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = video.current;
      if (v && !v.paused && !st.current.menu) setControls(false);
    }, HIDE_AFTER);
  };

  useEffect(() => {
    poke();
  }, [paused, menu]);

  useEffect(() => {
    if (!isTV) return;
    requestAnimationFrame(() => {
      if (menu) focusFirst();
      else if (controls && root.current && !root.current.contains(document.activeElement)) focusFirst(root.current);
      else if (controls && document.activeElement?.closest('.player-menu')) focusFirst(root.current!);
    });
  }, [controls, menu]);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // ---- Actions -----------------------------------------------------------------

  const fire = (kind: 'play' | 'pause' | 'fwd' | 'back', label?: string) =>
    setPulse((p) => ({ kind, label, n: (p?.n ?? 0) + 1 }));

  const togglePlay = () => {
    const v = video.current!;
    const kind = v.paused ? 'play' : 'pause';
    fire(kind);
    playSound(kind);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  };

  const seekTo = (s: number) => {
    const v = video.current!;
    const max = (duration || v.duration || 0) - 0.5;
    v.currentTime = Math.max(0, Math.min(s, max > 0 ? max : s));
    guardSeek(v.currentTime);
    setTime(v.currentTime);
    poke();
  };

  const seekLabel = (delta: number) => (delta > 0 ? `+${delta}` : `−${-delta}`);
  const seekBy = (delta: number) => {
    fire(delta > 0 ? 'fwd' : 'back', seekLabel(delta));
    playSound('toggle');
    seekTo((video.current?.currentTime ?? 0) + delta);
  };

  /** TV: arrow presses accumulate, the jump happens once the user stops pressing. */
  const nudge = (delta: number) => {
    fire(delta > 0 ? 'fwd' : 'back', seekLabel(delta));
    playSound('move');
    const base = st.current.seekTarget ?? video.current?.currentTime ?? 0;
    const target = Math.max(0, Math.min(base + delta, (st.current.duration || 1) - 1));
    setSeekTarget(target);
    st.current.seekTarget = target;
    setControls(true);
    clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      seekTo(target);
      setSeekTarget(null);
      st.current.seekTarget = null;
    }, 700);
  };

  const exit = () => {
    stopReport();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    goBack();
  };

  const goNext = () => {
    const next = st.current.nextEp;
    if (!next) return;
    stopReport();
    navigate(`/play/${next.Id}?t=0`, { replace: true });
  };

  const toggleFullscreen = () => {
    const v = video.current as any;
    if (isIOS && v?.webkitEnterFullscreen) return v.webkitEnterFullscreen();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  };

  const chooseAudio = (index: number) => {
    setMenu(null);
    const s = st.current.stream;
    if (!s || s.audio === index) return;
    void start(video.current?.currentTime ?? 0, index, s.burned);
  };

  const chooseSubtitle = async (index: number) => {
    setMenu(null);
    const s = st.current.stream;
    const it = st.current.item;
    if (!s || !it) return;
    const at = video.current?.currentTime ?? 0;
    setSubIndex(index);
    st.current.subIndex = index;
    setCues([]);
    if (index < 0) {
      if (s.burned >= 0) void start(at, s.audio, -1);
      return;
    }
    const meta = s.source.MediaStreams.find((x) => x.Type === 'Subtitle' && x.Index === index);
    if (meta && needsBurnIn(meta)) {
      void start(at, s.audio, index);
      return;
    }
    if (s.burned >= 0) void start(at, s.audio, -1);
    const path = meta?.DeliveryUrl && /\.vtt/i.test(meta.DeliveryUrl) ? meta.DeliveryUrl : `/Videos/${id}/${s.source.Id}/Subtitles/${index}/0/Stream.vtt`;
    try {
      const res = await fetch(serverUrl.value + path, { headers: { Authorization: `MediaBrowser Token="${session.value?.token}"` } });
      const text = await res.text();
      if (st.current.subIndex === index) setCues(parseVtt(text));
    } catch {
      /* leave subtitles off */
    }
  };

  // ---- Keys ----------------------------------------------------------------------

  useEffect(
    () =>
      pushKeyHandler((e) => {
        const v = video.current;
        if (!v) return false;
        const { menu: m, controls: c } = st.current;
        if (isBackKey(e) || e.key === 'Escape' || (isTV && e.keyCode === KEY.backspace)) {
          if (m) setMenu(null);
          else if (document.fullscreenElement && !isTV) return false;
          else if (isTV && c && !v.paused) setControls(false);
          else exit();
          return true;
        }
        if (e.keyCode === KEY.play) return v.play().catch(() => {}), true;
        if (e.keyCode === KEY.pause) return v.pause(), true;
        if (e.keyCode === KEY.playPause) return togglePlay(), true;
        if (e.keyCode === KEY.stop) return exit(), true;
        if (e.keyCode === KEY.forward) return isTV ? nudge(30) : seekBy(30), true;
        if (e.keyCode === KEY.rewind) return isTV ? nudge(-10) : seekBy(-10), true;
        if (m) return false;
        if (!isTV) {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT') return false;
          switch (e.key) {
            case ' ':
            case 'k':
              if (target.tagName === 'BUTTON' && e.key === ' ') return false;
              togglePlay();
              return true;
            case 'ArrowLeft':
              seekBy(-10);
              return true;
            case 'ArrowRight':
              seekBy(10);
              return true;
            case 'ArrowUp':
              v.volume = Math.min(1, v.volume + 0.1);
              poke();
              return true;
            case 'ArrowDown':
              v.volume = Math.max(0, v.volume - 0.1);
              poke();
              return true;
            case 'f':
              toggleFullscreen();
              return true;
            case 'm':
              v.muted = !v.muted;
              return true;
          }
          return false;
        }
        // TV remote
        const onScrubber = document.activeElement === scrubberRef.current;
        if (!c) {
          if (e.keyCode === 37 || e.keyCode === 39) {
            nudge(e.keyCode === 37 ? -10 : 10);
            requestAnimationFrame(() => focusElement(scrubberRef.current));
            return true;
          }
          poke();
          return true;
        }
        poke();
        if (onScrubber && (e.keyCode === 37 || e.keyCode === 39)) {
          nudge(e.keyCode === 37 ? -10 : 10);
          return true;
        }
        if (onScrubber && e.keyCode === KEY.enter) {
          togglePlay();
          return true;
        }
        return false;
      }),
    [],
  );

  // ---- Derived -----------------------------------------------------------------

  const active = useMemo(() => (cues.length ? cuesAt(cues, time) : []), [cues, time]);
  const segAt = (type: MediaSegment['Type']) =>
    segments.find((s) => s.Type === type && time >= s.StartTicks / TICKS_PER_SECOND && time < s.EndTicks / TICKS_PER_SECOND - 1);
  const intro = segAt('Intro');
  const outro = segAt('Outro');
  const creditsAt = (() => {
    const o = segments.find((s) => s.Type === 'Outro');
    return o ? o.StartTicks / TICKS_PER_SECOND : duration > 60 ? duration - 20 : Infinity;
  })();
  const showNext = !!nextEp && !creditsDismissed && time >= creditsAt && duration > 0;

  useEffect(() => {
    if (!showNext) {
      setCountdown(null);
      return;
    }
    if (paused) return;
    setCountdown((c) => (c == null ? 10 : c));
    const timer = setInterval(() => setCountdown((c) => (c == null ? 10 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [showNext, paused]);

  useEffect(() => {
    if (countdown != null && countdown <= 0) goNext();
  }, [countdown]);

  // Paused for a while without touching anything: a "You're watching" screen.
  useEffect(() => {
    if (!paused || menu || error || showNext) {
      setPauseInfo(false);
      return;
    }
    lastPoke.current = performance.now();
    const id = setInterval(() => {
      if (performance.now() - lastPoke.current > 10000) setPauseInfo(true);
    }, 1000);
    const wake = () => {
      lastPoke.current = performance.now();
      setPauseInfo(false);
    };
    window.addEventListener('keydown', wake, true);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', wake, true);
    };
  }, [paused, menu, !!error, showNext]);

  // Skip buttons take the focus on TV when they appear.
  useEffect(() => {
    if (isTV && (intro || outro || showNext)) requestAnimationFrame(() => focusElement(document.querySelector<HTMLElement>('.skip-btn')));
  }, [!!intro, !!outro, showNext]);

  const chapters = item?.Chapters ?? [];
  const runtime = duration || (item?.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
  const shown = seekTarget ?? time;
  const pct = (s: number) => (runtime ? Math.min(100, (s / runtime) * 100) : 0);
  const chapterAt = (s: number) => {
    let c: (typeof chapters)[number] | undefined;
    for (const ch of chapters) if (ch.StartPositionTicks / TICKS_PER_SECOND <= s) c = ch;
    return c;
  };

  const audioTracks = stream?.source.MediaStreams.filter((s) => s.Type === 'Audio') ?? [];
  const subTracks = stream?.source.MediaStreams.filter((s) => s.Type === 'Subtitle') ?? [];
  const currentAudio = stream?.audio;

  const title = item
    ? item.Type === 'Episode'
      ? { main: item.SeriesName ?? '', sub: `${item.SeasonName ?? ''} · ${item.IndexNumber ?? ''}. ${item.Name}` }
      : { main: item.Name, sub: '' }
    : { main: '', sub: '' };

  const unit = item ? (catalog.value?.byId.get(item.SeriesId ?? item.Id) ?? item) : null;
  const pauseLogo = unit ? imageUrl(logoOf(unit, representative(unit)), 600) : undefined;

  // Scrubber pointer handling (mouse and touch).
  const timeFromX = (clientX: number) => {
    const r = scrubberRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { time: f * runtime, x: f * r.width };
  };
  const dragging = useRef(false);

  const previewTime = seekTarget ?? preview?.time ?? null;
  const previewX = preview?.x ?? (scrubberRef.current ? (pct(seekTarget ?? 0) / 100) * scrubberRef.current.clientWidth : 0);

  return (
    <div
      ref={root}
      class={
        'player' +
        (controls || paused ? ' show-controls' : '') +
        (menu ? ' has-menu' : '') +
        (showNext && nextEp && !menu ? ' credits' : '') +
        (pauseInfo ? ' pause-info' : '')
      }
      data-nav-layer
      onMouseMove={poke}
      onTouchStart={poke}
    >
      {showNext && nextEp && !menu && (
        <div class="credits-bg">
          <Img src={imageUrl(stillOf(nextEp), 1280)} eager />
        </div>
      )}
      <video
        ref={video}
        class="player-video"
        playsInline
        autoPlay
        preload="auto"
        crossOrigin={undefined}
        onClick={() => (hasHover ? togglePlay() : poke())}
        onDblClick={toggleFullscreen}
      />

      {active.length > 0 && (
        <div class="subs" aria-live="off">
          {active.map((c, i) => (
            <span key={i} class="sub-line" dangerouslySetInnerHTML={{ __html: c.html }} />
          ))}
        </div>
      )}

      {pulse && (
        <div key={pulse.n} class={'player-pulse ' + pulse.kind} aria-hidden="true">
          {pulse.kind === 'play' ? <IconPlay size={46} /> : pulse.kind === 'pause' ? <IconPause size={46} /> : <span>{pulse.label}</span>}
        </div>
      )}

      {pauseInfo && item && (
        <div class="pause-screen" aria-live="polite">
          <span class="pause-label">{t('player.watching')}</span>
          {pauseLogo ? <Img src={pauseLogo} class="pause-logo" eager /> : <h1 class="pause-title"><SplitText text={title.main} /></h1>}
          {title.sub && <p class="pause-sub">{title.sub}</p>}
          {overviewOf(item) && <p class="pause-overview">{overviewOf(item)}</p>}
        </div>
      )}

      {waiting && !error && (
        <div class="player-center">
          <span class="spinner" />
        </div>
      )}

      {error && (
        <div class="player-center player-error">
          <p>{t('player.error')}</p>
          <button class="btn btn-secondary" data-nav data-nav-autofocus onClick={exit}>
            {t('common.back')}
          </button>
        </div>
      )}

      <div class="player-top">
        <button class="icon-btn" data-nav onClick={exit} aria-label={t('common.back')}>
          <IconBack size={28} />
        </button>
        <div class="player-title">
          <strong>{title.main}</strong>
          {title.sub && <span>{title.sub}</span>}
        </div>
      </div>

      <div class="player-bottom">
        <div
          ref={scrubberRef}
          class="scrubber"
          data-nav
          tabIndex={0}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(runtime)}
          aria-valuenow={Math.round(shown)}
          onPointerMove={(e) => {
            if (!hasHover && !dragging.current) return;
            setPreview(timeFromX(e.clientX));
          }}
          onPointerLeave={() => !dragging.current && setPreview(null)}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setPreview(timeFromX(e.clientX));
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            dragging.current = false;
            seekTo(timeFromX(e.clientX).time);
            if (!hasHover) setPreview(null);
          }}
        >
          <div class="scrubber-rail">
            <div class="scrubber-buffered" style={{ width: `${pct(buffered)}%` }} />
            <div class="scrubber-played" style={{ width: `${pct(shown)}%` }} />
            {chapters.slice(1).map((ch, i) => (
              <span key={i} class="scrubber-chapter" style={{ left: `${pct(ch.StartPositionTicks / TICKS_PER_SECOND)}%` }} />
            ))}
          </div>
          <div class="scrubber-knob" style={{ left: `${pct(shown)}%` }} />
          {previewTime != null && item && stream && (
            <div class="scrub-preview" style={{ left: `${previewX}px` }}>
              <Thumb item={item} sourceId={stream.source.Id} time={previewTime} scale={isTV ? 1.1 : 0.9} />
              <span class="scrub-time">{formatClock(previewTime)}</span>
              {chapterAt(previewTime)?.Name && <span class="scrub-chapter">{chapterAt(previewTime)!.Name}</span>}
            </div>
          )}
        </div>

        <div class="player-row">
          <button class="icon-btn big" data-nav data-nav-autofocus data-sound="none" onClick={togglePlay} aria-label={paused ? t('player.play') : t('player.pause')}>
            {paused ? <IconPlay size={34} /> : <IconPause size={34} />}
          </button>
          <button class="icon-btn" data-nav data-sound="none" onClick={() => (isTV ? nudge(-10) : seekBy(-10))} aria-label={t('player.back10')}>
            <IconReplay10 size={30} />
          </button>
          <button class="icon-btn" data-nav data-sound="none" onClick={() => (isTV ? nudge(10) : seekBy(10))} aria-label={t('player.fwd10')}>
            <IconForward10 size={30} />
          </button>
          {hasHover && (
            <span class="volume">
              <button
                class="icon-btn"
                onClick={() => {
                  const v = video.current!;
                  v.muted = !v.muted;
                }}
                aria-label={t('player.mute')}
              >
                {muted || volume === 0 ? <IconMute size={28} /> : <IconVolume size={28} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onInput={(e) => {
                  const v = video.current!;
                  v.volume = Number((e.target as HTMLInputElement).value);
                  v.muted = v.volume === 0;
                }}
                aria-label="Volume"
              />
            </span>
          )}
          <span class="player-time">
            {formatClock(shown)} / {formatClock(runtime)}
          </span>
          <span class="spacer" />
          {chapters.length > 1 && (
            <button class="icon-btn" data-nav onClick={() => setMenu('chapters')} aria-label={t('player.chapters')}>
              <IconChapters size={28} />
            </button>
          )}
          {(audioTracks.length > 1 || subTracks.length > 0) && (
            <button class="icon-btn" data-nav onClick={() => setMenu('tracks')} aria-label={t('player.tracks')}>
              <IconSubtitles size={28} />
            </button>
          )}
          {nextEp && (
            <button class="icon-btn" data-nav onClick={goNext} aria-label={t('player.next')}>
              <IconNext size={28} />
            </button>
          )}
          {!isTV && (
            <button class="icon-btn" data-nav onClick={toggleFullscreen} aria-label={t('player.fullscreen')}>
              {fullscreen ? <IconFullscreenExit size={28} /> : <IconFullscreen size={28} />}
            </button>
          )}
        </div>
      </div>

      {intro && !menu && (
        <button class="skip-btn" data-nav onClick={() => seekTo(intro.EndTicks / TICKS_PER_SECOND)}>
          {t('player.skipIntro')}
        </button>
      )}
      {outro && !showNext && !menu && (
        <button class="skip-btn" data-nav onClick={() => seekTo(outro.EndTicks / TICKS_PER_SECOND)}>
          {t('player.skipCredits')}
        </button>
      )}
      {showNext && nextEp && !menu && (
        <div class="next-card">
          <span class="next-still">
            <Img src={imageUrl(nextEp.ImageTags?.Primary ? { id: nextEp.Id, type: 'Primary', tag: nextEp.ImageTags.Primary } : null, 320)} />
          </span>
          <span class="next-text">
            <span class="next-label">{countdown != null && countdown > 0 ? t('player.nextIn', { n: countdown }) : t('player.next')}</span>
            <strong>{nextEp.Name}</strong>
            {nextEp.Overview && <span class="next-overview">{nextEp.Overview}</span>}
          </span>
          <span class="next-actions">
            <button class="skip-btn inline" data-nav onClick={goNext}>
              <IconPlay size={20} /> {t('player.next')}
            </button>
            <button class="btn btn-ghost" data-nav onClick={() => setCreditsDismissed(true)}>
              {t('common.close')}
            </button>
          </span>
        </div>
      )}

      {menu === 'tracks' && (
        <div class="player-menu" data-nav-layer role="dialog" aria-label={t('player.tracks')}>
          <div class="menu-col">
            <h3>{t('player.audio')}</h3>
            {audioTracks.map((a) => (
              <button key={a.Index} class="menu-item" data-nav data-nav-autofocus={a.Index === currentAudio || undefined} onClick={() => chooseAudio(a.Index)}>
                <span class="menu-check">{a.Index === currentAudio && <IconCheck size={18} />}</span>
                {streamLabel(a)}
              </button>
            ))}
          </div>
          <div class="menu-col">
            <h3>{t('player.subtitles')}</h3>
            <button class="menu-item" data-nav onClick={() => chooseSubtitle(-1)}>
              <span class="menu-check">{subIndex < 0 && <IconCheck size={18} />}</span>
              {t('player.off')}
            </button>
            {subTracks.map((s) => (
              <button key={s.Index} class="menu-item" data-nav onClick={() => chooseSubtitle(s.Index)}>
                <span class="menu-check">{subIndex === s.Index && <IconCheck size={18} />}</span>
                {streamLabel(s)}
              </button>
            ))}
          </div>
          <button class="menu-close btn btn-ghost" data-nav onClick={() => setMenu(null)}>
            {t('common.close')}
          </button>
        </div>
      )}

      {menu === 'chapters' && (
        <div class="player-menu chapters" data-nav-layer role="dialog" aria-label={t('player.chapters')}>
          <h3>{t('player.chapters')}</h3>
          <div class="chapter-list">
            {chapters.map((ch, i) => {
              const at = ch.StartPositionTicks / TICKS_PER_SECOND;
              const current = chapterAt(time) === ch;
              return (
                <button
                  key={i}
                  class={'chapter' + (current ? ' current' : '')}
                  data-nav
                  data-nav-autofocus={current || undefined}
                  onClick={() => {
                    setMenu(null);
                    seekTo(at);
                  }}
                >
                  <span class="chapter-img">
                    {ch.ImageTag && <Img src={imageUrl({ id, type: 'Chapter', index: i, tag: ch.ImageTag }, 320)} />}
                  </span>
                  <span class="chapter-name">{ch.Name || t('player.chapter', { n: i + 1 })}</span>
                  <span class="chapter-time">{formatClock(at)}</span>
                </button>
              );
            })}
          </div>
          <button class="menu-close btn btn-ghost" data-nav onClick={() => setMenu(null)}>
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  );
}
