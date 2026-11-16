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

export interface ImageBedConfig {
  strategy: 'platform_private' | 'custom_oss';
  provider?: 'aliyun_oss' | 'tencent_cos' | 's3' | 'github';
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

export type ThemeId = 'apple-light' | 'bloom-lapis' | 'bloom-wheat' | 'typora-white' | 'custom-typora';

export interface ContextMenuOptions {
  inTable: boolean;
  hasSelection: boolean;
}

export interface ElectronAPI {
  selectWorkspace: () => Promise<string | null>;
  getWorkspacePath: () => Promise<string | null>;
  getRecentWorkspaces: () => Promise<string[]>;
  switchWorkspace: (dirPath: string) => Promise<string | null>;
  showInFinder: (relativePath?: string) => Promise<void>;
  listArticles: () => Promise<ArticleMeta[]>;
  readArticle: (relativePath: string) => Promise<string>;
  saveArticle: (relativePath: string, content: string) => Promise<{ updatedAt: number }>;
  createArticle: (fileName?: string) => Promise<ArticleMeta>;
  saveLocalImage: (
    base64Data: string,
    ext: string
  ) => Promise<{ relativeMarkdownPath: string; fullPath: string }>;
  getImageBedConfig: () => Promise<ImageBedConfig>;
  saveImageBedConfig: (config: ImageBedConfig) => Promise<void>;
  openPlatformLogin: (platformId: PlatformId, loginUrl: string) => Promise<boolean>;
  getPlatformAuthStates: () => Promise<Partial<Record<PlatformId, boolean>>>;
  getGitStatus: () => Promise<GitStatusInfo>;
  pushGitWorkspace: (commitMessage: string) => Promise<{ ok: boolean; message: string }>;
  onMenuAction: (callback: (action: string, payload?: string) => void) => () => void;
  showEditorContextMenu: (options: ContextMenuOptions) => Promise<void>;
  importTyporaThemeCss: () => Promise<{ name: string; css: string } | null>;
}
