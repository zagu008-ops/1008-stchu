# SillyTavern ComfyUI 转发补丁

角色编辑页读取模型目录、新地址检测和预设测试状态使用酒馆服务器转发，避免浏览器跨域失败。本补丁提供 `/api/sd/comfy/object-info`、`/api/sd/comfy/loras`，并为现有 `/api/sd/comfy/generate` 增加可选的 NDJSON 状态流；未启用状态流的请求仍返回原有 JSON 图片结果。

补丁基于 SillyTavern 1.19.0（release，06bde93）。在 **SillyTavern 根目录**执行，路径替换成插件仓库中的真实补丁路径：

```sh
git apply --check /path/to/1008-stchu/patches/sillytavern-comfy-relay.patch
git apply /path/to/1008-stchu/patches/sillytavern-comfy-relay.patch
```

然后重启酒馆，更新插件并刷新浏览器。本机连接预设使用 `http://127.0.0.1:8188`，ComfyUI 必须在酒馆服务器所在电脑运行。本地地址自动使用酒馆转发模式。不同版本如无法应用，请按补丁手动合并，勿强制覆盖现有文件。

状态区分准备提交、后端接收、排队与执行，显示任务编号和等待时间；“执行”覆盖加载模型、采样和解码阶段，不代表逐步采样百分比。生成成功后返回图片并保存到插件缓存；ComfyUI 输出文件仍由其输出目录配置决定。

仓库不包含用户配置、配对密钥、API 凭据、世界书、聊天记录或生成图片。Anima 模型、文本编码器、VAE 和 LoRA 需要在自己的 ComfyUI 上另行配置。
