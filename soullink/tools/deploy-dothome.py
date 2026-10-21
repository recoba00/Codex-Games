"""Stage immutable Godot files, then publish only after a matching browser pass."""

import argparse
import hashlib
import io
import json
import os
import re
from datetime import datetime, timezone
from ftplib import FTP, error_perm
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build" / "deploy"
HOST = "recoba00.dothome.co.kr"
TARGET = "/html/games/soullink"
URL = "http://recoba00.dothome.co.kr/games/soullink/"
ENGINE_FILES = {"index.html", "index.js", "index.wasm", "index.pck", "index.png",
                "index.icon.png", "index.apple-touch-icon.png", "index.audio.worklet.js",
                "index.audio.position.worklet.js", "host-bridge.js", ".htaccess",
                "index.js.gz", "index.wasm.gz", "index.pck.gz", "audio-bridge.js",
                "intro.js", "intro.css", "intro/cinematic.mp4", "intro/logo.webp", "intro/poster.jpg"}
AUDIO = json.loads((ROOT / "data" / "audio.json").read_text(encoding="utf-8"))
for section in ("music", "sfx"):
    for item in AUDIO[section].values():
        if not re.fullmatch(r"(music|sfx)/[a-z0-9-]+\.(mp3|wav)", item["file"]):
            raise RuntimeError("Invalid audio path")
        ENGINE_FILES.add("audio/" + item["file"])
EXTRAS = {"manifest.webmanifest", "icons/icon-32-v2.png", "icons/apple-touch-icon-v2.png",
          "icons/icon-192-v2.png", "icons/icon-512-v2.png"}


def sha(content):
    return hashlib.sha256(content).hexdigest()


def load_release():
    release = json.loads((BUILD / "release.json").read_text(encoding="utf-8"))
    name = release["release"]
    if not re.fullmatch(r"godot-[0-9a-f]{16}", name) or release["url"] != URL:
        raise RuntimeError("Unexpected release identity or destination")
    expected = {"releases/" + name + "/" + file for file in ENGINE_FILES} | EXTRAS | {"index.html"}
    actual = [file["path"] for file in release["files"]]
    if set(actual) != expected or len(actual) != len(expected):
        raise RuntimeError("Release must contain only the exact runtime allowlist")
    for file in release["files"]:
        content = (BUILD / file["path"]).read_bytes()
        if len(content) != file["bytes"] or sha(content) != file["sha256"]:
            raise RuntimeError("Changed build: " + file["path"])
    reused = release.get("reused_files", {})
    if reused and set(reused) != {"releases/" + name + "/index.wasm", "releases/" + name + "/index.wasm.gz"}:
        raise RuntimeError("Only the fixed immutable WASM pair may be reused")
    source_releases = set()
    for destination, source in reused.items():
        match = re.fullmatch(r"releases/(godot-[0-9a-f]{16})/(index\.wasm(?:\.gz)?)", source)
        if not match or match[1] == name or Path(destination).name != match[2]:
            raise RuntimeError("Unexpected shared engine reference")
        if (BUILD / source).read_bytes() != (BUILD / destination).read_bytes():
            raise RuntimeError("Shared engine bytes differ")
        source_releases.add(match[1])
    if len(source_releases) > 1:
        raise RuntimeError("The engine pair must come from one preserved release")
    return release


def read(ftp, name):
    result = bytearray()
    try:
        ftp.retrbinary("RETR " + name, result.extend)
    except error_perm as error:
        if not str(error).startswith("550"):
            raise
        return None
    return bytes(result)


def write_verified(ftp, name, content, stamp):
    if read(ftp, name) == content:
        print("UNCHANGED " + name, flush=True)
        return
    temporary = name + ".upload-" + stamp
    ftp.storbinary("STOR " + temporary, io.BytesIO(content), blocksize=262144)
    if read(ftp, temporary) != content:
        raise RuntimeError("Upload mismatch: " + name)
    if name == "index.html" and read(ftp, name) is not None:
        ftp.rename(name, "index.backup-" + stamp + ".html")
    ftp.rename(temporary, name)
    if read(ftp, name) != content:
        raise RuntimeError("Published bytes mismatch: " + name)
    print("VERIFIED " + name, flush=True)


def mkdir(ftp, folder):
    # Folder names come exclusively from the checked release allowlist.
    for count in range(1, len(folder.split("/")) + 1):
        name = "/".join(folder.split("/")[:count])
        try:
            ftp.mkd(name)
        except error_perm:
            ftp.cwd(name)
            ftp.cwd(TARGET)


def remote_directory(ftp):
    # Dothome prefixes its quoted PWD path with Korean text, which ftplib.pwd()
    # does not parse. Validate the actual quoted path, never accept an empty PWD.
    response = ftp.sendcmd("PWD")
    match = re.search(r'"(/[^"\r\n]*)"', response)
    return match.group(1).rstrip("/") if match else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("manifest", "inspect", "discard-unused-stage", "stage", "publish", "verify"))
    parser.add_argument("--discard-release")
    args = parser.parse_args()
    release = load_release()
    if args.action == "manifest":
        print(json.dumps(release, indent=2))
        return
    if args.action == "publish":
        report = json.loads((ROOT / "artifacts" / "web-staging-report.json").read_text(encoding="utf-8"))
        if not report.get("passed") or report["errors"] or not any(check["url"] == release["staging_url"] and check["real_timeout_and_ai"] and check.get("production_without_qa_flag")
                                       and check.get("host_visibility_clock_frozen") and check.get("host_back_and_exit_confirmation")
                                       and check.get("turn_banner") and check.get("clock_unspent_during_intro")
                                       and check.get("visual_ai_swap") and check.get("exact_effect_presentation")
                                       and check.get("tactical_hud") and check.get("textured_impact_nonblank")
                                       and check.get("combat_audio") and check.get("audio", {}).get("decodedEffects") == 13
                                       and check.get("audio", {}).get("backgroundSilence") and check.get("audio", {}).get("persistedAfterReload")
                                       and check.get("cinematic_intro", {}).get("fullCycleAndLoop")
                                       and check.get("cinematic_intro", {}).get("videoTrackSilent")
                                       and check.get("cinematic_intro", {}).get("introBgm")
                                       and check.get("cinematic_intro", {}).get("skipAndLoadingGate")
                                       and check.get("full_duel", {}).get("actualRepeatedSkills", 0) >= 2
                                       and check.get("full_duel", {}).get("actualGoldenHealing", 0) > 0
                                       and check.get("full_duel", {}).get("actualResultScreen")
                                       and len(check.get("transfers", [])) == 3
                                       and all(item["contentEncoding"] == "gzip" for item in check["transfers"])
                                       for check in report["checks"]):
            raise RuntimeError("A successful browser check of this exact staged release is required")
    username = os.environ.get("DOTHOME_FTP_USER")
    password = os.environ.get("DOTHOME_FTP_PASSWORD")
    if not username or not password:
        raise RuntimeError("Set DOTHOME_FTP_USER and DOTHOME_FTP_PASSWORD in the process environment")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    with FTP(HOST, timeout=120) as ftp:
        ftp.login(username, password)
        ftp.cwd(TARGET)
        if remote_directory(ftp) != TARGET:
            raise RuntimeError("Refusing to write outside the exact Soul Link target")
        previous = read(ftp, "index.html")
        if previous and b"<title>SOUL LINK</title>" not in previous:
            raise RuntimeError("Destination belongs to a different page")
        if args.action == "discard-unused-stage":
            name = args.discard_release or ""
            if not re.fullmatch(r"godot-[0-9a-f]{16}", name) or name == release["release"]:
                raise RuntimeError("An exact, non-current candidate release must be specified")
            for root_file in ftp.nlst():
                if re.fullmatch(r"index(?:\.backup-[0-9]+)?\.html", root_file):
                    root_html = read(ftp, root_file)
                    if root_html is None:
                        raise RuntimeError("Cannot verify a root HTML reference")
                    if name.encode() in root_html:
                        raise RuntimeError("Refusing to discard a current or backed-up release")
            for other, facts in ftp.mlsd("releases"):
                if re.fullmatch(r"godot-[0-9a-f]{16}", other) and facts.get("type") == "dir" and other != name:
                    rules = read(ftp, "releases/" + other + "/.htaccess") or b""
                    if name.encode() in rules:
                        raise RuntimeError("Refusing to discard a shared engine dependency")
            folder = "releases/" + name
            mirror = (BUILD / folder).resolve()
            if mirror.parent != (BUILD / "releases").resolve():
                raise RuntimeError("Unexpected local recovery path")
            checked = []
            directories = []
            allowed_dirs = {str(parent).replace("\\", "/") for file in ENGINE_FILES for parent in Path(file).parents if str(parent) != "."}
            def check_abandoned(relative=""):
                current = folder + ("/" + relative if relative else "")
                for child, facts in ftp.mlsd(current):
                    if child in (".", ".."):
                        continue
                    if "/" in child or "\\" in child:
                        raise RuntimeError("Unexpected remote path component")
                    name_in_stage = relative + "/" + child if relative else child
                    if facts.get("type") == "dir" and name_in_stage in allowed_dirs:
                        directories.append(name_in_stage)
                        check_abandoned(name_in_stage)
                        continue
                    partial = re.fullmatch(r"(index\.(?:wasm|js|pck))\.upload-[0-9]+", name_in_stage)
                    if facts.get("type") != "file" or (name_in_stage not in ENGINE_FILES and not partial):
                        raise RuntimeError("Only known abandoned runtime paths may be discarded")
                    local = mirror / (partial[1] if partial else name_in_stage)
                    content = local.read_bytes()
                    remote = read(ftp, folder + "/" + name_in_stage)
                    matches = remote is not None and content.startswith(remote) if partial else remote == content
                    if not matches:
                        raise RuntimeError("Local recovery bytes do not match " + name_in_stage)
                    checked.append({"file": name_in_stage, "bytes": len(remote), "sha256": sha(remote), "partial": bool(partial)})
            check_abandoned()
            if not checked:
                raise RuntimeError("Empty stage; nothing to discard")
            receipt = {"discarded": name, "recovery": str(mirror), "files": checked,
                       "current_and_backup_html_preserved": True}
            (ROOT / "artifacts" / "discard-unused-stage.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
            for item in checked:
                ftp.delete(folder + "/" + item["file"])
            for directory in sorted(directories, key=lambda value: value.count("/"), reverse=True):
                ftp.rmd(folder + "/" + directory)
            ftp.rmd(folder)
            # A failed upload is disposable only when it is an exact prefix of
            # the still-present local file for this current candidate.
            current_folder = "releases/" + release["release"]
            try:
                current_children = list(ftp.mlsd(current_folder))
            except error_perm as error:
                if not str(error).startswith("550"):
                    raise
                current_children = []
            for child, facts in current_children:
                match = re.fullmatch(r"(index\.(?:wasm|js|pck))\.upload-[0-9]+", child)
                if match and facts.get("type") == "file":
                    partial = read(ftp, current_folder + "/" + child)
                    complete = (BUILD / current_folder / match.group(1)).read_bytes()
                    if partial is not None and complete.startswith(partial):
                        ftp.delete(current_folder + "/" + child)
                        print("DISCARDED_FAILED_TEMP " + child)
            print(json.dumps({"discarded": name, "local_recovery_verified": True,
                              "bytes": sum(item["bytes"] for item in checked), "files": len(checked)}))
            return
        if args.action == "inspect":
            try:
                print("QUOTA " + ftp.sendcmd("SITE QUOTA"))
            except error_perm as error:
                print("QUOTA_UNAVAILABLE " + str(error))
            referenced = set()
            for name in ftp.nlst():
                if re.fullmatch(r"index(?:\.backup-[0-9]+)?\.html", name):
                    html = read(ftp, name) or b""
                    identities = re.findall(rb"godot-[0-9a-f]{16}", html)
                    referenced.update(item.decode() for item in identities)
                    print("ROOT_REF " + name + " " + str([item.decode() for item in identities]))
            def inspect(folder):
                total = 0
                for name, facts in ftp.mlsd(folder):
                    if name in (".", ".."):
                        continue
                    child = folder + "/" + name
                    if facts.get("type") == "dir":
                        total += inspect(child)
                    elif facts.get("type") == "file":
                        total += int(facts.get("size", 0))
                        if ".upload-" in name:
                            print("TEMP " + child + " " + facts.get("size", "?"))
                return total
            for name, facts in ftp.mlsd("releases"):
                if re.fullmatch(r"godot-[0-9a-f]{16}", name) and facts.get("type") == "dir":
                    print("RELEASE " + name + " bytes=" + str(inspect("releases/" + name)) + " referenced=" + str(name in referenced))
            return
        if args.action == "stage":
            for destination, source in release.get("reused_files", {}).items():
                if read(ftp, source) != (BUILD / destination).read_bytes():
                    raise RuntimeError("Remote shared engine mismatch: " + source)
            for folder in sorted({str(Path(file["path"]).parent).replace("\\", "/") for file in release["files"]} - {"."}):
                mkdir(ftp, folder)
            for file in release["files"]:
                if file["path"] in release.get("reused_files", {}):
                    print("REUSED " + file["path"], flush=True)
                elif file["path"] != "index.html":
                    write_verified(ftp, file["path"], (BUILD / file["path"]).read_bytes(), stamp)
            print("STAGED " + release["staging_url"])
        else:
            for file in release["files"]:
                if file["path"] == "index.html" and args.action == "publish":
                    continue
                source = release.get("reused_files", {}).get(file["path"], file["path"])
                if read(ftp, source) != (BUILD / file["path"]).read_bytes():
                    raise RuntimeError("Remote runtime mismatch: " + file["path"])
            if args.action == "publish":
                write_verified(ftp, "index.html", (BUILD / "index.html").read_bytes(), stamp)
            receipt = {"release": release["release"], "url": URL, "directory": TARGET,
                       "action": args.action, "timestamp_utc": stamp, "files": len(release["files"]),
                       "total_bytes": release["total_bytes"], "new_storage_bytes": release.get("new_storage_bytes", release["total_bytes"]),
                       "reused_files": release.get("reused_files", {}), "sha256_verified": True}
            (ROOT / "artifacts" / ("deploy-" + args.action + ".json")).write_text(json.dumps(receipt, indent=2), encoding="utf-8")
            print(json.dumps(receipt))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error)) from None
