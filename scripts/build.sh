#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$(pwd)/dist/WPS一键排版.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/addin" build/module-cache
xcrun swiftc -O -target arm64-apple-macos13.0 -module-cache-path "$(pwd)/build/module-cache" Sources/main.swift Sources/FormatterApp.swift Sources/Installer.swift -o "$APP/Contents/MacOS/WPSFormatter"
cp addin/index.html addin/furniture.js addin/core.js addin/main.js addin/ribbon.xml addin/manifest.xml addin/format.png addin/settings.html addin/config.js addin/settings.js addin/settings.css addin/result.html addin/result.js addin/result.css "$APP/Contents/Resources/addin/"
mkdir -p "$APP/Contents/Resources/addin/icons"
cp addin/icons/*.svg "$APP/Contents/Resources/addin/icons/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>WPSFormatter</string>
<key>CFBundleIdentifier</key><string>local.wps.formatter</string>
<key>CFBundleName</key><string>WPS一键排版</string>
<key>CFBundleDisplayName</key><string>WPS一键排版</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.1.0</string>
<key>CFBundleVersion</key><string>5</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
swift scripts/make-icon.swift build/Formatter.iconset
iconutil -c icns build/Formatter.iconset -o "$APP/Contents/Resources/Formatter.icns"
/usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string Formatter" "$APP/Contents/Info.plist"
uuidgen > "$APP/Contents/Resources/build-id"
codesign --force --sign - "$APP"
printf '%s\n' "$APP"
