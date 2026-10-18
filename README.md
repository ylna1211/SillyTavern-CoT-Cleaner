# SillyTavern-CoT-Cleaner

SillyTavern 思维链修复插件：处理「无标记、直接出现」的思维过程文字。

## 问题

部分模型（如切换 preset 后的某些设置）会在回复正文中直接输出「无标记思维文字」，导致：

- 切换 preset 后，前一 preset 的思维过程残留到正文
- 阅读时被大段思维干扰

## 功能

- ✅ **模式 A：UI 折叠** — 思维文字被折叠成可展开区块，不删除
- ✅ **模式 B：正文剥离** — 思维文字直接从消息中移除
- ✅ 两者可独立开关；同时开启时先剥离后折叠
- ✅ 自定义思维起始关键字（支持正则）
- ✅ 自动检测结束标记（`---`、`Answer:`、`回答：` 等）

## 安装

### 方法 1：通过 SillyTavern 扩展管理器（推荐）

1. 打开 SillyTavern → 扩展功能（Extensions）
2. 点击「Install Extension」
3. 输入：`https://github.com/your-name/SillyTavern-CoT-Cleaner`
4. 刷新页面

### 方法 2：手动安装

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/your-name/SillyTavern-CoT-Cleaner.git