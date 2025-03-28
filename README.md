# IntelliRead - AI增强阅读体验

IntelliRead是一个Chrome浏览器扩展，利用AI模型帮助用户从网页内容中提取和突出显示关键信息，提升阅读体验。

## 安装方法

1. 克隆或下载本仓库到本地
2. 打开Chrome浏览器，访问`chrome://extensions/`
3. 开启"开发者模式"（右上角开关）
4. 点击"加载已解压的扩展程序"
5. 选择本项目文件夹

## 使用方法

1. 安装扩展后，点击浏览器工具栏中的IntelliRead图标
2. 首次使用前，点击"设置"按钮配置您的API信息：
   - API请求地址（默认为OpenAI API）
   - API密钥
   - 模型名称（如gpt-4o-mini）
   - 高亮颜色（默认为蓝色）
3. 打开任意内容网页，可通过以下方式触发分析：
   - 点击浏览器工具栏中的IntelliRead图标，然后点击"Analyze the current page"
   - 在页面上右键点击，选择"Use IntelliRead to analyze page"
   - 使用快捷键Ctrl+Shift+I（可在Chrome扩展快捷键设置中修改）
4. 分析完成后，关键内容将被高亮显示

## 技术栈

- JavaScript (ES6+)
- Chrome Extensions API
- 外部AI API (如OpenAI API)

## 注意事项

- 插件需要API密钥才能工作，请确保配置有效的API密钥
- 分析耗时取决于页面内容长度和API响应速度
- API调用可能会产生费用，请参考您所使用的AI服务提供商的价格政策

## 隐私声明

IntelliRead会收集您正在浏览的网页的文本内容以发送给AI服务进行分析。您的API凭据存储在本地浏览器中，不会传输到除您配置的API服务之外的任何地方。

## 贡献

欢迎提交问题和改进建议！

## 许可证

MIT 