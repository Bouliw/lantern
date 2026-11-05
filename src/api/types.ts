export interface ImageTags {
  Primary?: string;
  Logo?: string;
  Thumb?: string;
  Banner?: string;
  Art?: string;
}

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  LastPlayedDate?: string;
  PlayedPercentage?: number;
  UnplayedItemCount?: number;
}

export interface Person {
  Name: string;
  Id: string;
  Role?: string;
  Type: string;
  PrimaryImageTag?: string;
}

export type StreamType = 'Video' | 'Audio' | 'Subtitle' | 'EmbeddedImage' | 'Data' | 'Attachment' | 'Lyric';

export interface MediaStream {
  Type: StreamType;
  Index: number;
  Codec?: string;
  Language?: string;
  Title?: string;
  DisplayTitle?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop';
  DeliveryUrl?: string;
  Channels?: number;
  Height?: number;
  Width?: number;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  ETag?: string;
  SupportsDirectPlay: boolean;
  SupportsDirectStream: boolean;
  SupportsTranscoding: boolean;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  MediaStreams: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
  RunTimeTicks?: number;
}

export interface Chapter {
  StartPositionTicks: number;
  Name?: string;
  ImageTag?: string;
}

export interface TrickplayInfo {
  Width: number;
  Height: number;
  TileWidth: number;
  TileHeight: number;
  ThumbnailCount: number;
  Interval: number;
  Bandwidth: number;
}

export interface Item {
  Id: string;
  Name: string;
  Type: string;
  OriginalTitle?: string;
  SortName?: string;
  Overview?: string;
  Taglines?: string[];
  Genres?: string[];
  Tags?: string[];
  Studios?: { Name: string; Id: string }[];
  People?: Person[];
  ProductionYear?: number;
  PremiereDate?: string;
  EndDate?: string;
  DateCreated?: string;
  DateLastMediaAdded?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  CriticRating?: number;
  RunTimeTicks?: number;
  ImageTags?: ImageTags;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  SeriesId?: string;
  SeriesName?: string;
  SeriesPrimaryImageTag?: string;
  SeasonId?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  UserData?: UserData;
  ChildCount?: number;
  RecursiveItemCount?: number;
  ProviderIds?: Record<string, string>;
  MediaSources?: MediaSource[];
  MediaStreams?: MediaStream[];
  Chapters?: Chapter[];
  Trickplay?: Record<string, Record<string, TrickplayInfo>>;
  ExtraType?: string;
  Status?: string;
  ParentId?: string;
}

export interface ItemsResult {
  Items: Item[];
  TotalRecordCount: number;
}

export interface PublicUser {
  Name: string;
  Id: string;
  HasPassword: boolean;
  PrimaryImageTag?: string;
}

export interface MediaSegment {
  Id: string;
  ItemId: string;
  Type: 'Unknown' | 'Commercial' | 'Preview' | 'Recap' | 'Outro' | 'Intro';
  StartTicks: number;
  EndTicks: number;
}

export const TICKS_PER_SECOND = 10_000_000;
