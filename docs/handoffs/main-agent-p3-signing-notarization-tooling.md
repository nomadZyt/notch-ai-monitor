# Main Agent Handoff: P3 Signing / Notarization Tooling

日期：2026-06-09

## 1. 目标

本轮目标是把上一轮 `.app/.dmg` artifact tooling 接到真实 signed/notarized release gate：

- 保持默认 `package:mac` / `smoke:artifact` 可生成 unsigned 本地 smoke artifact。
- 新增 signed/notarized release 命令，缺证书或凭据时 fail-fast。
- 给 Electron Developer ID signing 准备 hardened runtime entitlements。
- 将 notarization 分成 app zip notarization/staple 与 DMG notarization/staple。
- 新增 artifact verification 脚本，能结构化检查 codesign、spctl、stapler、DMG mount 和 mounted app。

## 2. 当前环境事实

本机当前不能完成真实 Developer ID signing/notarization：

- `security find-identity -v -p codesigning` 返回 `0 valid identities found`。
- `xcrun notarytool --help` 可用。

因此本轮已完成的是 tooling 和 release gate，不是可正式分发的签名包。

## 3. 已完成

- 新增 Electron hardened runtime entitlements：
  - `apps/electron/build/entitlements.mac.plist`
- 扩展 mac packaging script：
  - `scripts/package-electron-mac.mjs`
  - 支持 `--preflight-signing`
  - 支持 `NOTCH_MAC_SIGN_IDENTITY`
  - 支持 `NOTCH_MAC_REQUIRE_SIGNED=1`
  - 支持 `NOTCH_MAC_NOTARIZE=1`
  - 支持 app zip notarization/staple
  - 支持 DMG signing/notarization/staple
  - JSON 输出 signing/notarization 状态
- 新增 artifact verification script：
  - `scripts/verify-mac-artifact.mjs`
  - 默认 structural verify 不要求签名。
  - `--require-signed --require-notarized` 时作为 signed release gate。
- 新增 npm scripts：
  - `package:mac:signed`
  - `verify:artifact`
  - `verify:artifact:signed`
  - `smoke:artifact:signed`

## 4. Release 命令

Unsigned 本地 artifact：

```sh
npm run smoke:artifact
npm run verify:artifact
```

Signed/notarized artifact：

```sh
export NOTCH_MAC_SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)"
export NOTCH_NOTARY_KEYCHAIN_PROFILE="<profile-name>"
npm run smoke:artifact:signed
```

也支持 notarytool Apple ID 凭据：

```sh
export NOTCH_NOTARY_APPLE_ID="<apple-id>"
export NOTCH_NOTARY_PASSWORD="<app-specific-password>"
export NOTCH_NOTARY_TEAM_ID="<TEAMID>"
```

也支持 App Store Connect API key：

```sh
export NOTCH_NOTARY_KEY="/path/to/AuthKey_<KEYID>.p8"
export NOTCH_NOTARY_KEY_ID="<KEYID>"
export NOTCH_NOTARY_ISSUER="<ISSUER-UUID>"
```

优先建议使用 keychain profile：

```sh
xcrun notarytool store-credentials "<profile-name>"
```

## 5. 验证结果

已通过：

- `node --check scripts/package-electron-mac.mjs`
- `node --check scripts/verify-mac-artifact.mjs`
- `node --check scripts/electron-packaging-smoke.mjs`
- `npm run smoke:artifact`
- `npm run verify:artifact`

预期失败并已验证：

- `npm run package:mac:signed`
  - 失败原因：`NOTCH_MAC_SIGN_IDENTITY` 未设置，且本机无 codesigning identity。
- `npm run verify:artifact:signed`
  - 失败原因：当前 artifact 不是 Developer ID signed，也没有 stapled notarization ticket。

## 6. 关键实现细节

- `package:mac:signed` 先运行 `node scripts/package-electron-mac.mjs --preflight-signing`，再进入 build/package，避免缺证书时白跑完整 build。
- Electron app signing 通过 Packager `osxSign` 执行：
  - `identity`
  - `hardenedRuntime: true`
  - `entitlements`
  - `entitlementsInherit`
  - `signatureFlags: "library"`
- app notarization flow：
  - packager signed app
  - `ditto -c -k --keepParent` 生成 app zip
  - `xcrun notarytool submit <zip> --wait`
  - `xcrun stapler staple <app>`
  - `xcrun stapler validate <app>`
- DMG notarization flow：
  - 从 signed/stapled app 生成 UDZO DMG
  - `codesign --force --sign <identity> <dmg>`
  - `xcrun notarytool submit <dmg> --wait`
  - `xcrun stapler staple <dmg>`
  - `xcrun stapler validate <dmg>`
- `verify-mac-artifact.mjs` 会挂载 DMG，并单独检查 mounted app 的签名和 stapled 状态。

## 7. 未解决问题

- 当前机器没有 Developer ID Application certificate，所以没有真实 signed/notarized artifact。
- 签名后的 Electron entitlements 尚未在真实 Developer ID 环境验证。
- 尚未做 Applications 安装、覆盖安装、Gatekeeper quarantine、升级迁移 QA。
- 尚未接自动更新。

## 8. 下一步

1. 在有 Developer ID certificate 的机器上配置：
   - `NOTCH_MAC_SIGN_IDENTITY`
   - `NOTCH_NOTARY_KEYCHAIN_PROFILE` 或其他 notary credentials
2. 运行：
   - `npm run smoke:artifact:signed`
3. 若 Electron signing/notarization 失败，优先检查 entitlements 与 nested helper signing。
4. signed smoke 通过后，再做 Applications 安装/升级迁移 QA。
