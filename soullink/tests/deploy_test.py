"""Local-only regression tests for the exact deployment manifest boundary."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).resolve().parents[1] / "tools/deploy-dothome.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        test_root = (deploy.ROOT / "build/deploy-test").resolve()
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        def cleanup():
            if Path(self.temp.name).resolve().parent != test_root:
                raise RuntimeError("Refusing cleanup outside deployment test workspace")
            self.temp.cleanup()
        self.addCleanup(cleanup)
        self.build = Path(self.temp.name)
        self.name = "godot-" + "1" * 16
        self.old = "godot-" + "2" * 16
        paths = {"releases/" + self.name + "/" + name for name in deploy.ENGINE_FILES} | deploy.EXTRAS | {"index.html"}
        files = []
        for name in sorted(paths):
            content = Path(name).name.encode()
            target = self.build / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            files.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        self.manifest = {"release": self.name, "url": deploy.URL, "files": files, "reused_files": {}}

    def save(self):
        (self.build / "release.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def validate(self):
        self.save()
        with patch.object(deploy, "BUILD", self.build):
            return deploy.load_release()

    def alias(self):
        for name in ("index.wasm", "index.wasm.gz"):
            source = "releases/" + self.old + "/" + name
            destination = "releases/" + self.name + "/" + name
            target = self.build / source
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((self.build / destination).read_bytes())
            self.manifest["reused_files"][destination] = source

    def test_complete_local_manifest(self):
        self.assertEqual(self.validate()["release"], self.name)

    def test_byte_identical_fixed_engine_pair(self):
        self.alias()
        self.assertEqual(len(self.validate()["reused_files"]), 2)

    def test_changed_source_is_rejected(self):
        self.alias()
        (self.build / "releases" / self.old / "index.wasm").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "bytes differ"):
            self.validate()

    def test_escape_and_other_runtime_aliases_are_rejected(self):
        self.alias()
        destination = "releases/" + self.name + "/index.wasm"
        self.manifest["reused_files"][destination] = "../other-game/index.wasm"
        with self.assertRaisesRegex(RuntimeError, "Unexpected shared"):
            self.validate()
        self.manifest["reused_files"] = {"releases/" + self.name + "/index.pck": "somewhere/index.pck"}
        with self.assertRaisesRegex(RuntimeError, "fixed immutable"):
            self.validate()

    def test_mixed_engine_sources_are_rejected(self):
        self.alias()
        other = "releases/godot-" + "3" * 16 + "/index.wasm.gz"
        target = self.build / other
        target.parent.mkdir(parents=True)
        target.write_bytes(b"index.wasm.gz")
        self.manifest["reused_files"]["releases/" + self.name + "/index.wasm.gz"] = other
        with self.assertRaisesRegex(RuntimeError, "one preserved"):
            self.validate()

    def test_wrong_destination_and_unknown_files_are_rejected(self):
        self.manifest["url"] = "http://example.com/another-game/"
        with self.assertRaisesRegex(RuntimeError, "destination"):
            self.validate()
        self.manifest["url"] = deploy.URL
        self.manifest["files"].append({"path": "secrets.txt"})
        with self.assertRaisesRegex(RuntimeError, "allowlist"):
            self.validate()


if __name__ == "__main__":
    unittest.main()
