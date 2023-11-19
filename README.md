# BliveJournal
chrome浏览器插件，用于获取礼物历史、记录录制Bilibili直播间弹幕

摸鱼开发中 ~ Development in progress

# 目标功能（饼）

- 利用浏览器的登录状态，免去为了录制弹幕，需要反复手动提取更新cookies的麻烦
- 添加直播间，后台录制完整弹幕数据，可以随时导出保存的弹幕
- 每天自动记录直播间的舰长列表，可以后续随时导出
- 利用主播端的礼物接口，导出直播间的完整礼物、舰长、SC的营收历史

# 使用安装

## 安装

使用npm编译得到dist，或者从Release或者Github Action的Artifact下载，解压到dist文件夹

在chromium的扩展程序中（chrome://extensions/），启用开发者模式。选择加载已解压的扩展程序，选择dist文件夹添加

## 编译Typescript

[安装npm+nodejs环境](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)后编译为javascript
```bash
npm install
npm run build
```

## Webhook配置

可以添加Webhook地址自动导出浏览器中的弹幕

可用`python server_example.py`运行实例服务器监听本地端口，然后在Webhook地址中填入`http://127.0.0.1:8000/`从而自动导出到文件。


# TODO

## 弹幕数据流

- [x] 从直播间页面直接记录弹幕
- [x] 配置后台直播间列表
- [x] 后台建立弹幕连接监控直播间弹幕
- [x] 录制过滤规则的配置
- [x] 储存弹幕数据
- [x] 基本文件导出
- [ ] 更多导出格式，简单的除重检查
- [x] UI界面
- [x] 自动删除旧弹幕数据
- [x] 从支持的Webhook API接口导出
- [ ] 允许定期连接网盘/执行自定义脚本，用于自动上传导出
- [ ] 简单的弹幕数据分析？

## 静态礼物数据

- [ ] 从礼物历史读取数据用于导出
- [ ] 获取导出舰长列表、场次高能榜列表
- [ ] 后台定时自动更新抓取数据

# References

- [simon300000/bilibili-live-ws](https://github.com/simon300000/bilibili-live-ws)
- [Dixie.js](https://dexie.org/docs/)
- [Access variables and functions defined in page context using a content script](https://stackoverflow.com/questions/9515704)
- [Persistent Service Worker in Chrome Extension](https://stackoverflow.com/questions/66618136)
