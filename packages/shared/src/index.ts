export * from './ipcContract.ts';

/** Core platform identifiers supported by VCat Publisher. */
export type PlatformId =
  | 'weixin'
  | 'xiaohongshu'
  | 'x'
  | 'linuxdo'
  | 'cnblogs'
  | 'juejin'
  | 'bilibili'
  | 'douyin'
  | 'csdn'
  | 'zhihu'
  | 'baijiahao'
  | 'weibo'
  | 'github_static';

export type PublishMode = 'draft' | 'direct';

export type SyncStatus = 'idle' | 'draft' | 'published' | 'failed';

export interface SyncRecord {
  id?: number;
  articlePath: string;
  platformId: PlatformId;
  mode: PublishMode;
  status: SyncStatus;
  remotePostId?: string;
  remoteUrl?: string;
  lastError?: string;
  syncedAt: number;
}

export interface OutlineNode {
  level: number;
  text: string;
  line: number;
}

export interface ArticleMeta {
  relativePath: string;
  fullPath: string;
  title: string;
  wordCount: number;
  localImageCount: number;
  updatedAt: number;
  syncRecords: Partial<Record<PlatformId, SyncRecord>>;
}

export type ImageBedProvider =
  | 'picgo_core'
  | 'aliyun_oss'
  | 'tencent_cos'
  | 's3'
  | 'github'
  | 'qiniu'
  | 'smms'
  | 'imgur';

export interface ImageBedConfig {
  strategy: 'platform_private' | 'custom_oss';
  provider?: ImageBedProvider;
  defaultImageScale?: 50 | 75 | 100;
  picgoPath?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  customDomain?: string;
  repo?: string;
  branch?: string;
  token?: string;
}

export type StartupMode = 'last_opened' | 'new_file' | 'specific_dir';

export interface StartupConfig {
  mode: StartupMode;
  lastArticlePath?: string;
  defaultDir?: string;
}

export type PipelineStepId =
  | 'PRECHECK'
  | 'IMAGE_TRANSFER'
  | 'TRANSFORM'
  | 'PUSH'
  | 'VERIFY_DELIVERY';

export interface PipelineProgressEvent {
  platformId: PlatformId;
  step: PipelineStepId;
  status: 'pending' | 'running' | 'done' | 'error';
  message: string;
}

export interface GitStatusInfo {
  isGitRepo: boolean;
  branch?: string;
  changedFiles: number;
}

export type ThemeId =
  | 'apple-light'
  | 'custom-typora'
  | 'bloom-amber'
  | 'bloom-amber-dark'
  | 'bloom-cinnabar'
  | 'bloom-cinnabar-dark'
  | 'bloom-ink'
  | 'bloom-ink-dark'
  | 'bloom-lapis'
  | 'bloom-lapis-dark'
  | 'bloom-mist'
  | 'bloom-mist-dark'
  | 'bloom-petal'
  | 'bloom-petal-dark'
  | 'bloom-ripple'
  | 'bloom-ripple-dark'
  | 'bloom-sage'
  | 'bloom-sage-dark'
  | 'bloom-spring'
  | 'bloom-spring-dark'
  | 'bloom-stone'
  | 'bloom-stone-dark'
  | 'bloom-verdant'
  | 'bloom-verdant-dark'
  | 'bloom-wheat'
  | 'bloom-wheat-dark';

export interface ContextMenuOptions {
  inTable: boolean;
  inImage?: boolean;
  imageScale?: number;
  hasSelection: boolean;
  readOnly?: boolean;
}

export interface EditorPreferences {
  autoPairSymbols: boolean;
  copyFormat: 'markdown' | 'plain' | 'html';
  defaultExportFormat: 'docx' | 'html' | 'pdf';
}

export interface ExportArticleOptions {
  format: 'md' | 'html' | 'pdf' | 'docx';
  title: string;
  markdown: string;
  htmlContent?: string;
}

export interface ArticleSearchResult {
  relativePath: string;
  title: string;
  snippet: string;
  matchCount: number;
}

export interface MultiPlatformPublishTarget {
  platformId: PlatformId;
  mode: PublishMode;
}

export type SocialCoverRatio = '3:4' | '2:3' | '9:16' | '16:9' | '2.35:1';

export interface MultiPlatformPublishPayload {
  title: string;
  markdown: string;
  author?: string;
  digest?: string;
  coverImageUrl?: string;
  showCoverInBody?: boolean;
  sourceUrl?: string;
  tags?: string[];
  includeRemoteImages?: boolean;
  socialThemeId?: string;
  socialCoverRatio?: SocialCoverRatio;
  /** 卡片类平台（小红书/抖音）：用户上传的封面，工作区相对路径；作为第 1 张图插在卡片前。 */
  socialCoverImagePath?: string;
  /** 公众号：按焦点裁好的 1:1 转发图，工作区相对路径；不传时由公众号从 2.35:1 封面居中裁。 */
  weixinSquareCoverImagePath?: string;
  /** 掘金：文章分类 id（见 adapters 的 JUEJIN_CATEGORIES）；不传时草稿分类为空。 */
  juejinCategoryId?: string;
  /** 小红书/抖音：用户在分区里单独写的纯文本正文；不传时由主进程从 Markdown 生成。 */
  socialBody?: string;
  targets: MultiPlatformPublishTarget[];
}

/** 卡片类平台单篇最多可上传的图片张数（含封面）。界面与主进程共用这一份。 */
export const SOCIAL_MAX_CARDS: Partial<Record<PlatformId, number>> = { xiaohongshu: 18, douyin: 35 };

export interface MultiPlatformPublishResultItem {
  platformId: PlatformId;
  ok: boolean;
  mode: PublishMode;
  postId?: string;
  /** 推送成功后「打开草稿」的地址：urlKind 为 draft 时是这篇草稿的编辑页，为 list 时是草稿列表页（拿不到草稿 id 时的兜底）。 */
  url?: string;
  urlKind?: 'draft' | 'list';
  verified?: boolean;
  uploadedImagesCount?: number;
  message: string;
}

export interface ElectronAPI {
  selectWorkspace: () => Promise<string | null>;
  getWorkspacePath: () => Promise<string | null>;
  getRecentWorkspaces: () => Promise<string[]>;
  switchWorkspace: (dirPath: string) => Promise<string | null>;
  showInFinder: (relativePath?: string) => Promise<void>;
  listArticles: () => Promise<ArticleMeta[]>;
  listFolders: () => Promise<string[]>;
  createFolder: (folderName: string) => Promise<string>;
  deleteFolder?: (folderPath: string) => Promise<void>;
  moveFolder: (oldFolderPath: string, targetParentFolder: string) => Promise<string>;
  readArticle: (relativePath: string) => Promise<string>;
  saveArticle: (relativePath: string, content: string) => Promise<{ updatedAt: number }>;
  createArticle: (fileName?: string) => Promise<ArticleMeta>;
  renameArticle: (oldRelativePath: string, newFileName: string) => Promise<ArticleMeta>;
  moveArticle: (oldRelativePath: string, targetFolder: string) => Promise<ArticleMeta>;
  deleteArticle: (relativePath: string) => Promise<void>;
  duplicateArticle: (relativePath: string) => Promise<ArticleMeta>;
  searchArticlesContent: (query: string) => Promise<ArticleSearchResult[]>;
  saveLocalImage: (
    base64Data: string,
    ext: string
  ) => Promise<{ relativeMarkdownPath: string; fullPath: string }>;
  uploadRemoteImage?: (base64Data: string, fileName: string) => Promise<{ url: string }>;
  getImageBedConfig: () => Promise<ImageBedConfig>;
  saveImageBedConfig: (config: ImageBedConfig) => Promise<void>;
  testImageBedUpload: (config: ImageBedConfig) => Promise<{ ok: boolean; url?: string; message: string }>;
  getStartupConfig: () => Promise<StartupConfig>;
  saveStartupConfig: (config: StartupConfig) => Promise<void>;
  openPlatformLogin: (platformId: PlatformId, loginUrl: string) => Promise<boolean>;
  logoutPlatform: (platformId: PlatformId) => Promise<boolean>;
  getPlatformAuthStates: () => Promise<Partial<Record<PlatformId, boolean>>>;
  getGitStatus: () => Promise<GitStatusInfo>;
  pushGitWorkspace: (commitMessage: string) => Promise<{ ok: boolean; message: string }>;
  onMenuAction: (callback: (action: string, payload?: string) => void) => () => void;
  showEditorContextMenu: (options: ContextMenuOptions) => Promise<void>;
  importTyporaThemeCss: () => Promise<{ name: string; css: string } | null>;
  exportArticle: (options: ExportArticleOptions) => Promise<{ ok: boolean; filePath?: string; message?: string }>;
  setRecentFiles?: (paths: string[]) => void;
  copyImage?: (src: string) => Promise<boolean>;
  saveImageAs?: (src: string) => Promise<{ ok: boolean; filePath?: string }>;
  openWorkspaceLink?: (
    href: string,
    currentRelativePath?: string
  ) => Promise<{ ok: boolean; kind?: 'article' | 'external'; relativePath?: string; target?: string }>;
  publishWeixinDraft?: (payload: {
    title: string;
    markdown: string;
    author?: string;
    digest?: string;
    coverImageUrl?: string;
    showCoverInBody?: boolean;
    sourceUrl?: string;
  }) => Promise<{ ok: true; postId: string; url: string; verified: boolean } | { ok: false; message: string }>;
  publishMultiPlatform?: (
    payload: MultiPlatformPublishPayload
  ) => Promise<{ results: MultiPlatformPublishResultItem[] }>;
  getPlatformAccounts?: () => Promise<Record<string, unknown>>;
  onPlatformAuthUpdated?: (
    callback: (states: Partial<Record<PlatformId, boolean>>) => void
  ) => () => void;
}
