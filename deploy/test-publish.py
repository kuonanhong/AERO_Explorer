"""Offline integration tests; all pushes go to a temporary local bare repository."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('publish-aero.sh')

class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='aero-publish-test-')
        self.base = Path(self.temp.name)
        self.remote = self.base / 'remote.git'
        self.seed = self.base / 'seed'
        self.work = self.base / 'work'
        self.release = self.base / 'release'
        self.release.mkdir()
        (self.release / 'index.html').write_text('<!doctype html><h1>v5</h1>\n')
        self.cmd('git','init','--bare','--initial-branch=main',str(self.remote))
        self.cmd('git','init','--initial-branch=main',str(self.seed))
        for key,val in [('user.name','AERO Test'),('user.email','aero-test@example.invalid')]:
            self.cmd('git','-C',str(self.seed),'config',key,val)
        (self.seed / 'README.md').write_text('Unrelated user content\n')
        (self.seed / 'index.html').write_text('old\n')
        self.cmd('git','-C',str(self.seed),'add','.')
        self.cmd('git','-C',str(self.seed),'commit','-m','seed')
        self.cmd('git','-C',str(self.seed),'remote','add','origin',str(self.remote))
        self.cmd('git','-C',str(self.seed),'push','origin','main')

    def tearDown(self):
        self.temp.cleanup()

    def cmd(self,*args):
        return subprocess.check_output(args,stderr=subprocess.STDOUT,text=True).strip()

    def publish(self,*args,ok=True):
        result=subprocess.run(['bash',str(SCRIPT),'--release',str(self.release),'--workdir',str(self.work),'--repo',str(self.remote),*args],capture_output=True,text=True)
        self.assertEqual(result.returncode==0,ok,result.stdout+'\n'+result.stderr)
        return result.stdout+result.stderr

    def ready(self):
        self.publish()
        for key,val in [('user.name','AERO Test'),('user.email','aero-test@example.invalid')]:
            self.cmd('git','-C',str(self.work),'config',key,val)

    def test_preview_apply_owned_cleanup_and_idempotence(self):
        self.ready()
        self.assertEqual((self.work/'index.html').read_text(),'old\n')
        (self.release/'obsolete.js').write_text('old asset\n')
        self.publish('--apply')
        first=self.cmd('git','--git-dir',str(self.remote),'rev-parse','main')
        self.assertEqual((self.work/'README.md').read_text(),'Unrelated user content\n')
        self.assertTrue((self.work/'.nojekyll').exists())
        self.assertEqual((self.work/'index.html').read_bytes(),(self.release/'index.html').read_bytes())
        self.publish('--apply')
        self.assertEqual(first,self.cmd('git','--git-dir',str(self.remote),'rev-parse','main'))
        (self.release/'obsolete.js').unlink()
        self.publish('--apply')
        self.assertFalse((self.work/'obsolete.js').exists())
        self.assertTrue((self.work/'README.md').exists())

    def test_dirty_worktree_is_never_reset(self):
        self.ready()
        (self.work/'README.md').write_text('unsaved work\n')
        self.assertIn('local changes',self.publish('--apply',ok=False))
        self.assertEqual((self.work/'README.md').read_text(),'unsaved work\n')

    def test_origin_mismatch_stops(self):
        self.ready()
        self.cmd('git','-C',str(self.work),'remote','set-url','origin',str(self.base/'different.git'))
        self.assertIn('does not match',self.publish('--apply',ok=False))

    def test_large_model_stops_before_clone(self):
        with (self.release/'too-large.onnx').open('wb') as f:
            f.truncate(100*1024*1024+1)
        self.assertIn('exceeds 100 MiB',self.publish('--apply',ok=False))
        self.assertFalse(self.work.exists())

    def test_token_url_rejected(self):
        self.assertIn('Do not put a token',self.publish('--repo','https://test-token@github.com/example/repo.git',ok=False))
        self.assertFalse(self.work.exists())

    def test_migration_hash_guard(self):
        self.ready()
        manifest=self.base/'cleanup.json'
        manifest.write_text(json.dumps({'format':'aero-owned-files-v1','files':{'README.md':hashlib.sha256(b'other').hexdigest()}}))
        self.assertIn('refusing to delete',self.publish('--cleanup-manifest',str(manifest),'--apply',ok=False))
        self.assertTrue((self.work/'README.md').exists())

    def test_valid_legacy_cleanup_preserves_unlisted_files(self):
        self.ready()
        (self.work/'legacy.txt').write_text('legacy\n')
        self.cmd('git','-C',str(self.work),'add','legacy.txt')
        self.cmd('git','-C',str(self.work),'commit','-m','legacy')
        self.cmd('git','-C',str(self.work),'push','origin','main')
        manifest=self.base/'cleanup.json'
        manifest.write_text(json.dumps({'format':'aero-owned-files-v1','files':{'legacy.txt':hashlib.sha256(b'legacy\n').hexdigest()}}))
        self.publish('--cleanup-manifest',str(manifest),'--apply')
        self.assertFalse((self.work/'legacy.txt').exists())
        self.assertTrue((self.work/'README.md').exists())

    def test_unpushed_local_commits_stop(self):
        self.ready()
        (self.work/'mine.txt').write_text('local only\n')
        self.cmd('git','-C',str(self.work),'add','mine.txt')
        self.cmd('git','-C',str(self.work),'commit','-m','private local change')
        self.assertIn('local commits',self.publish('--apply',ok=False))

    def test_symlink_cannot_escape_workdir(self):
        self.ready()
        (self.release/'outside.js').symlink_to(self.base/'outside')
        self.assertIn('symlinks',self.publish('--apply',ok=False))

    def test_git_lfs_pointer_rejected(self):
        (self.release/'weight.onnx').write_text('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 999\n')
        self.assertIn('LFS pointer',self.publish('--apply',ok=False))

if __name__=='__main__':
    unittest.main(verbosity=2)
