# 1008-stchu 迭代仓库

基于 st-chatu8 3.1.4，上游提交 fe2639d（https://gitee.com/damoshen2/st-chatu8.git）。保留原作者署名、原文档和 LICENSE，分发继续遵循原许可证。

本仓库收录 2026-10-07 至 2026-10-08 的本地改动：

- 每次 AI 回复规划 1～6 张连续剧情分镜，默认 3 张。
- 校验分镜数量、重复提示词、原文锚点及剧情顺序，失败后有限重试。
- 切换聊天或正文变化后，不插入旧请求结果。
- ComfyUI 设置增加测试生图按钮。

设置和限制见 LOCAL-UPGRADE.md。运行检查：`node tests/storyboard.test.mjs`。

安装地址：https://github.com/zagu008-ops/1008-stchu

本仓库仅包含插件代码，不包含酒馆聊天、API 凭据、个人设置或生成图片。手机安装本仓库后，扩展更新将从本仓库拉取；安装新副本前请导出原插件设置，避免同时启用两个副本。
