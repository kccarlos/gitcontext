cask "gitcontext" do
  version "@VERSION@"
  sha256 "@SHA256@"

  url "https://github.com/kccarlos/gitcontext/releases/download/v#{version}/GitContext_#{version}_universal.dmg"
  name "GitContext"
  desc "Package Git diffs and code into LLM-ready context, fully offline"
  homepage "https://github.com/kccarlos/gitcontext"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on :macos

  app "GitContext.app"

  uninstall quit: "xyz.gitcontext.desktop"

  zap trash: [
    "~/Library/Application Support/xyz.gitcontext.desktop",
    "~/Library/Caches/xyz.gitcontext.desktop",
    "~/Library/Preferences/xyz.gitcontext.desktop.plist",
    "~/Library/Saved Application State/xyz.gitcontext.desktop.savedState",
    "~/Library/WebKit/xyz.gitcontext.desktop",
  ]
end
