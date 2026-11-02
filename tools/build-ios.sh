#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
xcodebuild -version
xcodebuild \
  -workspace mobile/ios/Yudu.xcworkspace \
  -scheme Yudu \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath .cache/ios-build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  build
app='.cache/ios-build/Build/Products/Release-iphoneos/Yudu.app'
test -d "$app"
test -f "$app/main.jsbundle"
test -f "$app/PlugIns/ExpoWidgetsTarget.appex/ExpoWidgetsTarget"
# Keep the requested shared-group entitlement inside both executables so
# third-party signing tools can read and preserve it when re-signing the IPA.
# Ad-hoc signatures contain no developer certificate and still require re-signing.
python3 - <<'PY'
import plistlib
from pathlib import Path
group = 'group.app.quotadeck.mobile'
for target in ['Yudu/Yudu.entitlements', 'ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements']:
    entitlements = plistlib.loads((Path('mobile/ios') / target).read_bytes())
    if group not in entitlements.get('com.apple.security.application-groups', []):
        raise RuntimeError(f'Missing shared group in {target}')
print('Application and widget generated entitlements agree')
PY
while IFS= read -r -d '' library; do
  codesign --force --sign - --generate-entitlement-der "$library"
done < <(find "$app" -depth \( -name '*.framework' -o -name '*.dylib' \) -print0)
codesign --force --sign - --generate-entitlement-der \
  --entitlements mobile/ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements \
  "$app/PlugIns/ExpoWidgetsTarget.appex"
codesign --force --sign - --generate-entitlement-der \
  --entitlements mobile/ios/Yudu/Yudu.entitlements "$app"
codesign --verify --deep --strict "$app"
mkdir -p artifacts/ipa/Payload
ditto "$app" artifacts/ipa/Payload/Yudu.app
(cd artifacts/ipa && zip -qry ../Yudu-unsigned.ipa Payload)
unzip -t artifacts/Yudu-unsigned.ipa
