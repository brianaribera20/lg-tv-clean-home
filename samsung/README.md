# Home on a Samsung TV

The same Home screen as the LG version, packaged as a Samsung (Tizen) app. It reuses the
files in `launcher/`; `build.py` copies them and swaps in a small Tizen stand-in
(`tizen-boot.js`) for the webOS calls that have a Samsung equivalent: the app list, opening
an app and the Wi-Fi name.

What Samsung does not allow, so this version leaves out: replacing Smart Hub, taking over the
Home button, starting when the TV turns on, switching inputs, turning the TV off (Good night)
and the LG settings panel. Open Home from Smart Hub's app row. The score cards are left out
too.

Tested on a 2020 Q70 (Tizen 5.5).

## Install

1. **Tizen tools on the Mac.** Install Samsung's Tizen Studio command-line tools to
   `~/tizen-studio` (`web-cli_Tizen_Studio_*_macos-64.bin --accept-license ~/tizen-studio`
   from download.tizen.org). On Apple silicon:
   - Install Rosetta (`softwareupdate --install-rosetta --agree-to-license`); `sdb` is Intel-only.
   - If the installer stops with "Bad CPU type", put Azul's arm64 Zulu 8 (with JavaFX) at
     `~/.package-manager/jdk` and `~/tizen-studio/jdk`.
2. **Developer Mode on the TV.** Open Apps, enter 1 2 3 4 5 (the remote's 123 button opens
   a number pad), turn Developer Mode On, enter the Mac's IP address, then turn the TV off
   and on.
3. **A signing profile.** A plain Tizen certificate is accepted in Developer Mode; no
   Samsung account is needed:

   ```bash
   T=~/tizen-studio/tools/ide/bin/tizen
   $T certificate -a HomeAuthor -n Home -p <password> -f home-author
   $T security-profiles add -n tizenhome -a ~/tizen-studio-data/keystore/author/home-author.p12 -p <password>
   $T cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
   ```

4. **Install.** Set `SAMSUNG_TV_HOST` in `tv.local.env` (or pass the address), then:

   ```bash
   ./samsung/install.sh
   ```

## Change it

- Dock, row two and hidden apps: `samsung/config.js`, by the app's title on the TV.
  `SAMSUNG_APPS` lists other spellings of a title and which full-colour tile it borrows.
- Preview in a desktop browser: `python3 samsung/build.py --preview`, then serve
  `samsung/build/widget/` (a fake Tizen app list stands in for the TV's).

Undo: Apps → Settings (gear) → select Home → Delete, and turn Developer Mode off the same way it was turned on.
