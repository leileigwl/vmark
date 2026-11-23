# 平台规则待核实清单（platformSpecs verified:false）

> 来源：`apps/desktop/src/renderer/src/features/publish-flow/platformSpecSources.ts` 的 `SPEC_PENDING`（#68，核查日 2026-11-23，只读公开文档、未登录任何平台）。
> 规则：某平台的待核实项全部确认后，才能把 `platformSpecs.ts` 里该平台改成 `verified: true`；`tests/platformSpecSources.test.ts` 会检查“证据值 = 当前值”和“verified 只给清单为空的平台”。
> 核实方法：登录对应平台的创作者后台按“怎么查”操作；确认后把该项从 `SPEC_PENDING` 挪到 `SPEC_EVIDENCE`（写清后台位置和核实日期），数值不对就同时改 `platformSpecs.ts`。

| 平台 | 当前状态 | 待核实字段（当前值） | 去后台怎么查 |
| --- | --- | --- | --- |
| 微信公众号 | verified:false | 标题上限（64） | mp.weixin.qq.com → 内容管理 → 草稿箱 → 新建图文，标题输入 33 个和 64 个汉字，看计数器与保存是否报错。官方三处说法不一（32 字 / 64 字 / 64 字节）。确认后公众号即可 verified:true |
| 知乎专栏 | verified:false | 标题上限（100）、封面比例（16:9）、封面是否必填（可选） | zhuanlan.zhihu.com/write：标题粘贴 101 字；“添加封面”看裁剪比例；不加封面存草稿看是否拦截 |
| 稀土掘金 | verified:false | 标题上限（100）、摘要 50–100 且必填、封面比例/是否必填、标签必填且最多 3 个；**分类必选**（#70 新增，未登记出处） | juejin.cn/editor/drafts/new：标题 101 字；发布弹窗摘要输入 49 字 / 101 字 / 留空；连续加标签看第几个加不上；不选标签、不传封面看是否拦截；看封面裁剪比例；不选分类看是否拦截 |
| CSDN | verified:false | 标题 5–100、摘要上限（256）、封面比例/是否必填、标签必填且最多 7 个 | mp.csdn.net 编辑器：标题输入 4 字和 101 字；发布设置里摘要计数器、标签个数上限、标签是否必填、封面比例、封面是否必填 |
| 博客园 | verified:false | 标题上限（100）、摘要上限（200） | i.cnblogs.com/posts/edit：标题 101 字、摘要 201 字，保存为草稿看提示 |
| 百家号 | verified:false | 标题上限（30，开放接口写 40）、封面比例（16:9）、封面必填（草稿可不带） | baijiahao.baidu.com → 发布 → 图文：标题 31 字看计数器；封面“单图”看裁剪比例；不选封面点发布看是否拦截 |
| 微博头条文章 | verified:false | 封面是否必填（required） | card.weibo.com/article/v5/editor：不加封面点“下一步/发布”，看是否拦截 |
| B 站专栏 | verified:false | 封面比例（16:9）、标签上限（10） | 专栏编辑器 → 发布设置 → 自定义封面看裁剪比例；话题/标签最多能加几个 |
| 小红书 | verified:false | 封面是否默认第 1 张、裁剪比例（3:4）、话题上限（10） | creator.xiaohongshu.com → 发布图文：看可选裁剪比例；封面是否默认第 1 张、能否单独换；正文 #话题 加到第几个被拦 |
| 抖音图文 | verified:false | 标题上限（20）、**卡片上限（35，开放接口写 30）**、封面默认哪张、推荐比例（3:4）、话题上限（5） | creator.douyin.com → 发布图文：标题 21 字；连续上传 36 张看第几张被拒（结果要改 `packages/shared` 的 `SOCIAL_MAX_CARDS`，high 风险）；封面默认取哪张；推荐比例；#话题 加到第几个被拦 |
| GitHub 博客 | verified:true | — | 自有站点，不需要核实 |

已有官方出处、无需再查的字段（与代码一致）：公众号摘要 120、封面 2.35:1 + 1:1 且必有；百家号标题最少 8；微博标题 32、导语 44、封面 16:9；B 站标题 40、封面可选、标签非必填；小红书标题 20、正文 1000、最多 18 张、话题非必填；抖音正文 1000、话题非必填。详见 `platformSpecSources.ts` 的 `SPEC_EVIDENCE`。

## 各平台后端（主进程 / 适配器）还要顺带确认的点

| 平台 | 后端文件 | 要确认的事 |
| --- | --- | --- |
| 公众号 | `main/publishWeixinDraft.ts`、`main/publishWeixinCover.ts`、`adapters/src/weixin.ts` | 草稿“分享/转发卡片”用的是不是传入的 1:1 方图（网页后台 `cdn_1_1_url0` 非公开接口） |
| 掘金 | `main/publishJuejinDraft.ts`、`adapters/src/juejin.ts` | 带 `category_id` 的草稿是否预选分类；`brief_content` 是否显示为摘要；`tag_ids` 是否显示为标签（搜不到的标签名被跳过，界面不提示） |
| 小红书 / 抖音 | `main/publishSocialDrafts.ts`、`main/socialUploadImages.ts`、`main/socialCardRasterizer.ts` | 草稿里是卡片而非正文原图；上传封面是第 1 张；长文抖音能超过 9 张；含 `![](./assets/x.png)` 的文章卡片里能看到图；打包版 KaTeX 字体能从 asar 加载 |
