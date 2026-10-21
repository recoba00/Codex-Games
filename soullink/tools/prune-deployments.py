"""Explicit, user-approved retirement of one old Soul Link release, with recovery ZIP."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import zipfile
from ftplib import FTP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("deploy", ROOT / "tools/deploy-dothome.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def references(content):
    return {value.decode() for value in re.findall(rb"godot-[0-9a-f]{16}", content)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", required=True)
    parser.add_argument("--apply", action="store_true", help="Requires direct user approval to retire old server history")
    args = parser.parse_args()
    name = args.release
    if not re.fullmatch(r"godot-[0-9a-f]{16}", name):
        raise RuntimeError("Exact release identity required")
    recovery_root = (ROOT / "build/hosting-backup").resolve()
    mirror = (ROOT / "build/deploy/releases" / name).resolve()
    if mirror.parent != (ROOT / "build/deploy/releases").resolve():
        raise RuntimeError("Unexpected local mirror path")
    recovery_root.mkdir(parents=True, exist_ok=True)
    archive = recovery_root / (name + ".zip")
    with FTP(deploy.HOST, timeout=120) as ftp:
        ftp.login(os.environ["DOTHOME_FTP_USER"], os.environ["DOTHOME_FTP_PASSWORD"])
        ftp.cwd(deploy.TARGET)
        if deploy.remote_directory(ftp) != deploy.TARGET:
            raise RuntimeError("Wrong remote target")
        current_html = deploy.read(ftp, "index.html")
        if not current_html or b"<title>SOUL LINK</title>" not in current_html:
            raise RuntimeError("Soul Link root not identified")
        backups = sorted(value for value in ftp.nlst() if re.fullmatch(r"index\.backup-[0-9]+\.html", value))
        previous_html = deploy.read(ftp, backups[-1]) if backups else b""
        protected = references(current_html) | references(previous_html or b"")
        if name in protected:
            raise RuntimeError("Current and immediate previous recovery release must be kept")
        for other, facts in ftp.mlsd("releases"):
            if re.fullmatch(r"godot-[0-9a-f]{16}", other) and facts.get("type") == "dir" and other != name:
                rules = deploy.read(ftp, "releases/" + other + "/.htaccess") or b""
                if name in references(rules):
                    raise RuntimeError("A shared engine dependency cannot be retired")
        contents = {}
        folder = "releases/" + name
        for child, facts in ftp.mlsd(folder):
            if child in (".", ".."):
                continue
            if facts.get("type") != "file" or child not in deploy.ENGINE_FILES or "/" in child or "\\" in child:
                raise RuntimeError("Only the known flat old runtime may be retired")
            remote = deploy.read(ftp, folder + "/" + child)
            if remote is None or remote != (mirror / child).read_bytes():
                raise RuntimeError("Local mirror mismatch: " + child)
            contents[folder + "/" + child] = remote
        if not contents:
            raise RuntimeError("Release is empty")
        obsolete_backups = []
        for backup in backups:
            html = deploy.read(ftp, backup)
            refs = references(html or b"")
            if name in refs:
                if refs != {name}:
                    raise RuntimeError("A root backup references more than the retired release")
                contents[backup] = html
                obsolete_backups.append(backup)
        if archive.exists():
            with zipfile.ZipFile(archive) as saved:
                if set(saved.namelist()) != set(contents) or any(saved.read(key) != value for key, value in contents.items()):
                    raise RuntimeError("Existing recovery ZIP differs; refusing overwrite")
        else:
            with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as saved:
                for key, value in contents.items():
                    saved.writestr(key, value)
        with zipfile.ZipFile(archive) as saved:
            if saved.testzip() or any(saved.read(key) != value for key, value in contents.items()):
                raise RuntimeError("Recovery ZIP verification failed")
        receipt = {"release": name, "applied": args.apply, "protected": sorted(protected),
                   "archive": str(archive), "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                   "bytes": sum(map(len, contents.values())), "files": len(contents), "otherGamesUntouched": True,
                   "retiredRootBackups": obsolete_backups}
        if args.apply:
            if deploy.read(ftp, "index.html") != current_html or (backups and deploy.read(ftp, backups[-1]) != previous_html):
                raise RuntimeError("Public root changed during audit")
            for key, value in contents.items():
                if deploy.read(ftp, key) != value:
                    raise RuntimeError("Remote changed during audit: " + key)
            for key in contents:
                if key.startswith(folder + "/"):
                    ftp.delete(key)
            ftp.rmd(folder)
            for backup in obsolete_backups:
                ftp.delete(backup)
        (ROOT / "artifacts/prune-old-release.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print(json.dumps(receipt))


if __name__ == "__main__":
    main()
