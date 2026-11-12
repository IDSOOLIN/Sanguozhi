# 三国抽卡簿

使用 Expo + React Native 开发的 iPhone 版《三国志·战略版》抽卡记录 MVP。

## 运行

```bash
npm install
npm run ios
```

iPhone 安装 Expo Go 后扫描 `npm run start` 生成的二维码；Mac 上也可运行 `npm run ios` 打开 iOS 模拟器。

真机调试时，请确保 iPhone 与 Mac 连接同一个局域网，然后运行：

```bash
npm run start:device
```

不要使用 `expo start --localhost`：其中的 `localhost` 在真机上指向 iPhone 自己，会导致原生调试包无法加载 JavaScript，表现为启动后白屏。如果仍无法连接，请暂时关闭 VPN，或允许 Node/Expo 通过 macOS 防火墙。

如果希望安装后的 App 脱离 Mac 和 Metro 也能直接打开，请连接 iPhone 后安装 Release 版本：

```bash
npm run ios:device:release
```

## 使用 Xcode 打开并安装

请打开 `ios/app.xcworkspace`，不要打开 `app.xcodeproj`。

1. 在 Xcode 顶部选择 `app` Scheme。
2. 选择一个 iPhone 模拟器，点击运行按钮即可安装。
3. 安装到真实 iPhone 时，先用数据线连接手机。
4. 在 `app` Target 的 `Signing & Capabilities` 中选择自己的 Team。
5. 确认 Bundle Identifier 唯一，然后选择已连接的 iPhone 并点击运行。

首次原生配置已经完成，CocoaPods 依赖位于 `ios/Pods`。

## 当前能力

- 本赛季抽卡数、五星数及五星率统计
- 保底进度展示
- 手动添加武将、星级与卡包
- 全部抽卡历史
- AsyncStorage 本地持久化
