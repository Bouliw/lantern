import { isTV } from '../platform';

/**
 * Describes what this browser can decode, so Jellyfin picks direct play whenever possible
 * and otherwise remuxes (copying the video) or transcodes into HLS.
 */
const video = document.createElement('video');
const can = (type: string) => {
  try {
    return video.canPlayType(type).replace('no', '') !== '';
  } catch {
    return false;
  }
};
const mse = (type: string) => {
  try {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
  } catch {
    return false;
  }
};
const either = (type: string) => can(type) || mse(type);

export const caps = {
  hevc: isTV || either('video/mp4; codecs="hvc1.1.6.L150.90"') || either('video/mp4; codecs="hev1.1.6.L150.90"'),
  av1: either('video/mp4; codecs="av01.0.08M.08"'),
  vp9: either('video/webm; codecs="vp9"'),
  ac3: isTV || either('audio/mp4; codecs="ac-3"'),
  eac3: isTV || either('audio/mp4; codecs="ec-3"'),
  opus: either('audio/webm; codecs="opus"') || either('audio/mp4; codecs="opus"'),
  flac: can('audio/flac') || either('audio/mp4; codecs="flac"'),
  mkv: isTV || can('video/x-matroska') || can('video/mkv'),
  nativeHls: can('application/vnd.apple.mpegurl') || can('application/x-mpegURL'),
};

/** `safe`: H.264 only, used as a fallback when the device fails to decode what it claimed to support. */
export function deviceProfile(opts: { safe?: boolean; maxBitrate?: number } = {}) {
  const safe = !!opts.safe;
  const max = opts.maxBitrate ?? 200_000_000;
  const videoCodecs = safe ? 'h264' : ['h264', caps.hevc && 'hevc', caps.av1 && 'av1', caps.vp9 && 'vp9'].filter(Boolean).join(',');
  const audioCodecs = ['aac', 'mp3', caps.ac3 && 'ac3', caps.eac3 && 'eac3', caps.opus && 'opus', caps.flac && 'flac']
    .filter(Boolean)
    .join(',');
  const direct: Record<string, string>[] = [
    { Container: 'mp4,m4v,mov', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs },
  ];
  if (caps.mkv) direct.push({ Container: 'mkv', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs });
  if (caps.vp9) direct.push({ Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' });
  if (isTV) direct.push({ Container: 'ts,mpegts,m2ts', Type: 'Video', VideoCodec: 'h264,hevc,mpeg2video', AudioCodec: audioCodecs });

  // TV: keep surround (eac3/ac3). Computers and phones: stereo AAC is the safe choice.
  const hlsAudio = isTV ? ['eac3', 'ac3', 'aac'].filter((c) => c === 'aac' || (caps as any)[c]).join(',') : 'aac';
  return {
    Name: 'Lantern',
    MaxStreamingBitrate: max,
    MaxStaticBitrate: 200_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: direct,
    TranscodingProfiles: [
      {
        Container: 'mp4',
        Type: 'Video',
        Protocol: 'hls',
        VideoCodec: caps.hevc && !safe ? 'h264,hevc' : 'h264',
        AudioCodec: hlsAudio,
        MaxAudioChannels: isTV ? '6' : '2',
        Context: 'Streaming',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
      { Format: 'dvbsub', Method: 'Encode' },
    ],
  };
}
