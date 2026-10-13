# Civit LoRA 下载链路测试

将此目录复制到目标 ComfyUI 的 `custom_nodes`，创建仅本机可读的 `config.json`，再重启 ComfyUI：

```json
{
  "pairing_key": "用随机生成的至少32字符密钥替换",
  "allowed_origins": ["http://酒馆电脑IP:8000"],
  "lora_root": "/目标电脑/已配置的/models/loras",
  "civitai_token": "",
  "oauth_client_id": ""
}
```

ComfyUI 还需要监听自己的局域网 IP，并为上述酒馆来源开启 CORS。配对密钥在浏览器页面内存中暂存；刷新后重新填写，不保存到角色预设。Token 可在下载对话框中配置，只保存到目标电脑的 `config.json`，不返回原文。

在酒馆“角色 / 服装”的 Civit 链接旁点击“下载 LoRA 到目标 ComfyUI”，填写配对密钥，读取模型，确认版本、基础模型和保存子文件夹后提交。默认使用 `Civit测试` 子文件夹；可改为作品名称。这一阶段不自动识别角色/作品，也不创建服装。

推荐通过“Civitai 网页授权”连接账号。管理员需先在 Civitai 的 Security & Apps 中为本插件注册支持设备授权的 Public OAuth 应用，允许 UserRead 与 ModelsRead，将获得的 Client ID 写入 `oauth_client_id`。客户端 ID不是秘密。不要复用其他应用的客户端 ID。

设备授权从 `auth.civitai.com` 获取带验证码的网页地址，用户在该网页登录并确认，助手按官方返回间隔轮询并自动保存访问与刷新凭据。请求权限值为 5（UserRead + ModelsRead）；UserRead 是平台强制的基本权限。无需公开回调地址，适合手机与局域网电脑。凭据过期时服务端自动刷新；刷新授权被撤销时提示重新连接。手填 Token 保留为折叠的备用方式。

仅支持带 SHA256 的主 safetensors LoRA 文件，单文件最多 2 GiB，每次一个任务。下载失败清理临时文件，成功后校验哈希；已有相同文件复用，冲突文件不覆盖。下载跳转仅允许 Civit 和指定存储域名，认证头不转发给存储域名。

关闭手机页面不停止任务；“查询上次任务”可恢复状态查询。测试版任务记录存于 ComfyUI 内存，重启会清空；暂不实现断点续传、任务取消、自动重试或模型兼容性自动判定。

此测试沿用当前局域网 HTTP，配对密钥和 Token 经该连接传输；跨公网部署需要 HTTPS。`config.json` 含密钥，不得提交或分享。
