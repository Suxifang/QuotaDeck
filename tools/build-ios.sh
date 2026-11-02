#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
xcodebuild -version
xcodebuild \
  -workspace mobile/ios/QuotaDeck.xcworkspace \
  -scheme QuotaDeck \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .cache/ios-build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  build
app='.cache/ios-build/Build/Products/Release-iphoneos/QuotaDeck.app'
test -d "$app"
test -f "$app/main.jsbundle"
test -f "$app/PlugIns/ExpoWidgetsTarget.appex/ExpoWidgetsTarget"
mkdir -p artifacts/ipa/Payload
ditto "$app" artifacts/ipa/Payload/QuotaDeck.app
(cd artifacts/ipa && zip -qry ../QuotaDeck-unsigned.ipa Payload)
unzip -t artifacts/QuotaDeck-unsigned.ipa
