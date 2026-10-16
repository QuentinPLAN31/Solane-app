#!/bin/bash
# Usage : bash deploy_solane.sh   (le zip doit être dans ~/Downloads)
set -e
REPO="$HOME/Solane-app"
ZIP="$(ls -t "$HOME"/Downloads/solane_auto_v3*.zip | head -1)"
[ -d "$REPO/.git" ] || git clone https://github.com/QuentinPLAN31/Solane-app.git "$REPO"
TMP="$(mktemp -d)"
unzip -q "$ZIP" -d "$TMP"
cp -R "$TMP/solane-app/." "$REPO/"
cd "$REPO"
git add -A
git commit -m "SEO : articles conseils, sitemap, robots, icones" || echo "Rien de nouveau a envoyer"
git push
echo "OK : Vercel redeploie dans ~1 minute"
