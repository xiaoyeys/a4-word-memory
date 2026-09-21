# A4词忆

基于“A4纸随机位置回忆法”的响应式背单词 PWA。

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址由 Vite 输出。当前验收使用 `http://localhost:4173/`。

## 验证

```bash
npm test
npm run build
npm audit --omit=dev
```

## 已实现

- 每词完成3遍后进入拼写，拼写正确才能落纸；
- 手动选点预览和自动无碰撞随机放置；
- 每新增3词，从第一个已放单词开始累积回忆；
- 错序点击、位置提示、三档评价及忘词后立即重学；
- FSRS 长期排程、随机/薄弱词优先/今日复习抽词；
- IndexedDB 中断恢复、历史统计、备份与恢复；
- TXT、CSV、XLSX、JSON和文本粘贴导入；
- 字段自动识别、手动列映射、重复与错误预览；
- 自定义词库增删改、PWA离线缓存和响应式布局；
- 在线美音/英音播放，并在失败时回退到浏览器本地朗读；
- 纯英文自定义清单可从内置词库自动匹配音标、词性和释义；
- 分步新手引导、PWA 更新提示、离线状态检查和版本化备份恢复。

## Netlify 自动部署

将 Netlify 站点连接到本仓库的 `main` 分支后，Netlify 会读取根目录的 `netlify.toml`，执行 `npm run build` 并发布 `dist`。后续推送到 `main` 会自动触发部署。

## 内置词库

仓库包含 14 套正式词库，共 56,678 个词条，覆盖 CET-4、CET-6、考研、IELTS、TOEFL、GRE、GMAT 和 SAT。原始 JSON 位于 `public/vocabularies/`，首次运行时会写入浏览器 IndexedDB，后续仅在词库版本升级时更新。

词库数据由 [ECDICT](https://github.com/skywind3000/ECDICT) 派生，采用 MIT License。完整来源与商标声明见 `public/vocabularies/NOTICE.md`。

统一词条结构：

```json
{
  "id": "stable-id",
  "libraryId": "builtin-cet4",
  "word": "maintain",
  "normalizedWord": "maintain",
  "phonetic": "/meɪnˈteɪn/",
  "partOfSpeech": "v.",
  "meaning": "维持；保养",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

正式词条必须保持稳定 ID，避免升级词库后丢失既有学习记录。
