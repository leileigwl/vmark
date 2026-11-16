import type { PlatformId, PublishMode } from '@vcat/shared';

export interface PlatformDescriptor {
  id: PlatformId;
  name: string;
  supportedModes: PublishMode[];
  defaultMode: PublishMode;
  authChannel: 'metaweblog' | 'partition_cookie' | 'discourse' | 'isolated_profile';
  riskLevel: 'low' | 'medium' | 'high';
  referenceSource: string;
}

export interface AdapterPushPayload {
  title: string;
  markdown: string;
  html: string;
  tags: string[];
  mode: PublishMode;
  categoryId?: string;
}

export interface AdapterPushResult {
  postId: string;
  url: string;
  mode: PublishMode;
  verified: boolean;
}

/** Contract that all platform adapters must implement for 5-step observable delivery. */
export interface PlatformAdapter {
  readonly descriptor: PlatformDescriptor;
  checkAuth(): Promise<boolean>;
  uploadImage(buffer: Buffer, fileName: string): Promise<string>;
  push(payload: AdapterPushPayload): Promise<AdapterPushResult>;
  verifyDelivery(postId: string): Promise<boolean>;
}

/** Registry metadata for priority platforms (referencing Wechatsync & siyuan-plugin-publisher). */
export const PLATFORM_CATALOG: PlatformDescriptor[] = [
  {
    id: 'weixin',
    name: '微信公众号',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/weixin.ts',
  },
  {
    id: 'cnblogs',
    name: '博客园 (Cnblogs)',
    supportedModes: ['draft', 'direct'],
    defaultMode: 'draft',
    authChannel: 'metaweblog',
    riskLevel: 'low',
    referenceSource: 'references/siyuan-plugin-publisher/src/adaptors/api/cnblogs',
  },
  {
    id: 'linuxdo',
    name: 'Linux.do (Discourse)',
    supportedModes: ['direct', 'draft'],
    defaultMode: 'direct',
    authChannel: 'discourse',
    riskLevel: 'low',
    referenceSource: 'Discourse REST API (/posts.json & /drafts.json)',
  },
  {
    id: 'juejin',
    name: '稀土掘金',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/juejin.ts',
  },
  {
    id: 'csdn',
    name: 'CSDN',
    supportedModes: ['draft', 'direct'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/csdn.ts',
  },
  {
    id: 'zhihu',
    name: '知乎',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'low',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/zhihu.ts',
  },
  {
    id: 'baijiahao',
    name: '百家号',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/baijiahao.ts',
  },
  {
    id: 'weibo',
    name: '微博头条文章',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/weibo.ts',
  },
  {
    id: 'bilibili',
    name: 'B 站专栏',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync/packages/core/src/adapters/platforms/bilibili.ts',
  },
  {
    id: 'douyin',
    name: '抖音图文',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'isolated_profile',
    riskLevel: 'high',
    referenceSource: 'references/Wechatsync & 小V猫独立 Profile 规范',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    supportedModes: ['direct', 'draft'],
    defaultMode: 'direct',
    authChannel: 'partition_cookie',
    riskLevel: 'medium',
    referenceSource: 'references/Wechatsync (X / Thread 拆分规范)',
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    supportedModes: ['draft'],
    defaultMode: 'draft',
    authChannel: 'isolated_profile',
    riskLevel: 'high',
    referenceSource: 'references/siyuan-plugin-publisher/src/adaptors/web/xiaohongshu & 小V猫规范',
  },
];
