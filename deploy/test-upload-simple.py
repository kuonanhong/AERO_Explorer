"""Offline integration tests: real local bare remotes; mocked GitHub CLI/network."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('upload-aero.sh')
MANIFEST = '.aero-release-manifest.json'

class SimpleUpload(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='aero-simple-test-')
        self.base = Path(self.temp.name)
        self.remote = self.base/'remote.git'
        self.seed = self.base/'seed'
        self.package = self.base/'AERO_Drone_Web_FullPackage_v5_1'
        self.release = self.package/'AERO_Explorer'
        self.release.mkdir(parents=True)
        self.script = self.package/'upload-aero.sh'
        shutil.copyfile(SCRIPT, self.script)
        self.work = self.base/'AERO_Explorer-publish'
        self.env = dict(os.environ, GIT_CONFIG_GLOBAL=str(self.base/'gitconfig'), GIT_CONFIG_NOSYSTEM='1', GIT_AUTHOR_NAME='AERO test', GIT_AUTHOR_EMAIL='aero@example.invalid', GIT_COMMITTER_NAME='AERO test', GIT_COMMITTER_EMAIL='aero@example.invalid')
        self.run_cmd('git','config','--file',self.env['GIT_CONFIG_GLOBAL'],'user.name','AERO test')
        self.run_cmd('git','config','--file',self.env['GIT_CONFIG_GLOBAL'],'user.email','aero@example.invalid')
        self.run_cmd('git','init','--bare','--initial-branch=main',str(self.remote))
        self.run_cmd('git','init','--initial-branch=main',str(self.seed))
        (self.seed/'index.html').write_text('old\n')
        (self.seed/'README.md').write_text('Unrelated README\n')
        (self.seed/'custom.txt').write_text('Keep user file\n')
        self.run_cmd('git','-C',str(self.seed),'add','.')
        self.run_cmd('git','-C',str(self.seed),'commit','-m','seed')
        self.run_cmd('git','-C',str(self.seed),'remote','add','origin',str(self.remote))
        self.run_cmd('git','-C',str(self.seed),'push','origin','main')
        (self.release/'index.html').write_text('<h1>v5.1</h1>  \n')
        (self.release/'game.js').write_text('const version = "v5.1";\n')

    def tearDown(self):
        self.temp.cleanup()

    def run_cmd(self,*args):
        return subprocess.check_output(args,env=self.env,stderr=subprocess.STDOUT,text=True).strip()

    def upload(self,*args,ok=True,env=None,github=False):
        repo = 'https://github.com/kuonanhong/AERO_Explorer.git' if github else str(self.remote)
        r = subprocess.run(['bash',str(self.script),'--repo',repo,*args],cwd=self.package,env=env or self.env,capture_output=True,text=True)
        self.assertEqual(r.returncode==0,ok,r.stdout+'\n'+r.stderr)
        return r.stdout+r.stderr

    def clone(self):
        self.run_cmd('git','clone',str(self.remote),str(self.work))

    def stage(self):
        self.clone()
        files = {}
        for src in self.release.iterdir():
            shutil.copyfile(src,self.work/src.name)
            files[src.name]=hashlib.sha256(src.read_bytes()).hexdigest()
        (self.work/'.nojekyll').write_text('')
        files['.nojekyll']=hashlib.sha256(b'').hexdigest()
        (self.work/MANIFEST).write_text(json.dumps({'format':'aero-owned-files-v1','files':files}))
        self.run_cmd('git','-C',str(self.work),'add','index.html','game.js','.nojekyll',MANIFEST)

    def head(self):
        return self.run_cmd('git','--git-dir',str(self.remote),'rev-parse','main')

    def test_default_autodetect_publish_idempotent_and_whitespace(self):
        self.assertIn('上傳成功',self.upload())
        first=self.head()
        self.assertEqual((self.work/'README.md').read_text(),'Unrelated README\n')
        self.assertEqual((self.work/'custom.txt').read_text(),'Keep user file\n')
        self.assertIn('最新版本',self.upload())
        self.assertEqual(first,self.head())

    def test_script_in_deploy_autodetect(self):
        (self.package/'deploy').mkdir()
        new=self.package/'deploy'/'upload-aero.sh'
        shutil.move(self.script,new)
        self.script=new
        self.upload()

    def test_resume_committed_update(self):
        self.stage()
        self.run_cmd('git','-C',str(self.work),'commit','-m','Publish AERO Explorer v5')
        original=self.run_cmd('git','-C',str(self.work),'rev-parse','HEAD')
        self.assertIn('已 commit',self.upload())
        self.assertIn(original,self.run_cmd('git','--git-dir',str(self.remote),'rev-list','main'))

    def test_resume_staged_update(self):
        self.stage()
        self.assertIn('前次暫存',self.upload())
        self.assertEqual((self.work/'game.js').read_bytes(),(self.release/'game.js').read_bytes())

    def test_resume_staged_then_updated_release(self):
        self.stage()
        (self.release/'game.js').write_text('newer release\n')
        self.upload()
        self.assertEqual((self.work/'game.js').read_text(),'newer release\n')

    def test_unrelated_dirty_preserved(self):
        self.clone()
        (self.work/'custom.txt').write_text('uncommitted user edit')
        self.assertIn('非本腳本',self.upload(ok=False))
        self.assertEqual((self.work/'custom.txt').read_text(),'uncommitted user edit')

    def test_unrelated_staged_preserved(self):
        self.stage()
        (self.work/'custom.txt').write_text('staged user edit')
        self.run_cmd('git','-C',str(self.work),'add','custom.txt')
        self.assertIn('非 AERO',self.upload(ok=False))
        self.assertIn('custom.txt',self.run_cmd('git','-C',str(self.work),'diff','--cached','--name-only'))

    def test_unrelated_commit_not_pushed(self):
        self.clone()
        before=self.head()
        (self.work/'custom.txt').write_text('user commit')
        self.run_cmd('git','-C',str(self.work),'add','custom.txt')
        self.run_cmd('git','-C',str(self.work),'commit','-m','user commit')
        self.assertIn('缺少 AERO',self.upload(ok=False))
        self.assertEqual(before,self.head())

    def test_wrong_origin(self):
        self.clone()
        self.run_cmd('git','-C',str(self.work),'remote','set-url','origin',str(self.base/'other.git'))
        self.assertIn('其他倉庫',self.upload(ok=False))
        self.assertEqual((self.work/'index.html').read_text(),'old\n')

    def test_delete_only_previously_owned_assets(self):
        self.upload()
        (self.release/'game.js').unlink()
        self.upload()
        self.assertFalse((self.work/'game.js').exists())
        self.assertTrue((self.work/'custom.txt').exists())

    def test_modified_obsolete_asset_not_deleted(self):
        self.upload()
        (self.work/'game.js').write_text('user-modified')
        self.run_cmd('git','-C',str(self.work),'add','game.js')
        self.run_cmd('git','-C',str(self.work),'commit','-m','manual change')
        self.run_cmd('git','-C',str(self.work),'push','origin','main')
        (self.release/'game.js').unlink()
        self.assertIn('已被您修改',self.upload(ok=False))
        self.assertEqual((self.work/'game.js').read_text(),'user-modified')

    def wrappers(self,code):
        bindir=self.base/'bin'
        bindir.mkdir(exist_ok=True)
        real=shutil.which('git')
        (bindir/'git').write_text('#!/usr/bin/env python3\nimport os,sys\nfrom pathlib import Path\nargs=sys.argv[1:]\n'+code+'\nos.execv('+repr(real)+',['+repr(real)+',*args])\n')
        (bindir/'git').chmod(0o755)
        return dict(self.env,PATH=str(bindir)+os.pathsep+self.env['PATH'])

    def test_interrupted_own_stage_resumes(self):
        flag=self.base/'interrupted'
        env=self.wrappers("if 'add' in args and not Path("+repr(str(flag))+").exists():\n    Path("+repr(str(flag))+").write_text('1')\n    sys.exit(79)")
        self.upload(env=env,ok=False)
        self.assertTrue((self.work/'.git/aero-upload-state.json').exists())
        self.upload(env=env)
        self.assertFalse((self.work/'.git/aero-upload-state.json').exists())
        self.assertEqual(self.run_cmd('git','--git-dir',str(self.remote),'show','main:game.js'), 'const version = \"v5.1\";')
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'status','--porcelain'),'')

    def test_interrupted_after_partial_stage_resumes(self):
        flag=self.base/'addcount'
        env=self.wrappers("if 'add' in args:\n    p=Path("+repr(str(flag))+")\n    n=int(p.read_text()) if p.exists() else 0\n    p.write_text(str(n+1))\n    if n == 1: sys.exit(79)")
        self.upload(env=env,ok=False)
        self.upload(env=env)
        self.assertEqual(self.run_cmd('git','--git-dir',str(self.remote),'show','main:game.js'), 'const version = \"v5.1\";')
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'status','--porcelain'),'')

    def test_interrupted_then_new_release_removes_pending_asset(self):
        flag=self.base/'interrupted'
        env=self.wrappers("if 'add' in args and not Path("+repr(str(flag))+").exists():\n    Path("+repr(str(flag))+").write_text('1')\n    sys.exit(79)")
        self.upload(env=env,ok=False)
        (self.release/'game.js').unlink()
        self.upload(env=env)
        self.assertFalse((self.work/'game.js').exists())
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'status','--porcelain'),'')
        listed=self.run_cmd('git','--git-dir',str(self.remote),'ls-tree','--name-only','main')
        self.assertNotIn('game.js',listed)

    def test_interrupt_then_user_edit_stops(self):
        flag=self.base/'interrupted'
        env=self.wrappers("if 'add' in args and not Path("+repr(str(flag))+").exists():\n    Path("+repr(str(flag))+").write_text('1')\n    sys.exit(79)")
        self.upload(env=env,ok=False)
        (self.work/'game.js').write_text('manual after interruption')
        self.assertIn('非本腳本',self.upload(env=env,ok=False))

    def test_diverged_remote_keeps_local_commit(self):
        self.stage()
        self.run_cmd('git','-C',str(self.work),'commit','-m','Publish AERO Explorer v5')
        (self.seed/'custom.txt').write_text('new remote')
        self.run_cmd('git','-C',str(self.seed),'add','custom.txt')
        self.run_cmd('git','-C',str(self.seed),'commit','-m','remote update')
        self.run_cmd('git','-C',str(self.seed),'push','origin','main')
        old=self.run_cmd('git','-C',str(self.work),'rev-parse','HEAD')
        self.assertIn('遠端已有其他更新',self.upload(ok=False))
        self.assertEqual(old,self.run_cmd('git','-C',str(self.work),'rev-parse','HEAD'))

    def github_mock(self,deny=False):
        self.clone()
        self.run_cmd('git','-C',str(self.work),'remote','set-url','origin','https://github.com/kuonanhong/AERO_Explorer.git')
        # url.insteadOf provides a real bare-remote push while remote config stays GitHub.
        self.run_cmd('git','config','--file',self.env['GIT_CONFIG_GLOBAL'],'url.'+str(self.remote)+'.insteadOf','https://github.com/kuonanhong/aero_explorer.git')
        flag=self.base/'push-denied'
        code="if 'push' in args and not Path("+repr(str(flag))+").exists():\n    Path("+repr(str(flag))+").write_text('1')\n    sys.stderr.write('remote: Permission denied 403\\n')\n    sys.exit(128)" if deny else ''
        env=self.wrappers(code)
        bindir=self.base/'bin'
        ghlog=self.base/'gh.log'
        (bindir/'gh').write_text('#!/usr/bin/env python3\nimport sys,json\nfrom pathlib import Path\nargs=sys.argv[1:]\np=Path('+repr(str(ghlog))+')\nwith p.open("a") as f:f.write(" ".join(args)+"\\n")\nif args==["api","user"]:print(json.dumps({"login":"kuonanhong","id":42}))\nelif args[:1]==["api"]:print(json.dumps({"permissions":{"push":True}}))\n')
        (bindir/'gh').chmod(0o755)
        return env,ghlog

    def test_github_auth_and_repo_local_helper(self):
        env,log=self.github_mock()
        self.assertIn('寫入角色',self.upload(env=env,github=True))
        self.assertIn('auth setup-git',log.read_text())
        helpers=self.run_cmd('git','-C',str(self.work),'config','--local','--get-all','credential.https://github.com.helper')
        self.assertIn('gh auth git-credential',helpers)

    def test_403_keeps_commit_and_reports_relogin(self):
        env,log=self.github_mock(deny=True)
        out=self.upload(env=env,github=True,ok=False)
        self.assertIn('403',out)
        self.assertIn('互動式終端機',out)
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'rev-list','--count','origin/main..HEAD'),'1')
        # The next invocation uses the same preserved commit and succeeds.
        self.upload(env=env,github=True)
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'rev-parse','HEAD'),self.head())

    @unittest.skipUnless(os.name == 'posix', 'PTY requires POSIX')
    def test_403_browser_login_then_push_in_same_invocation(self):
        import errno, fcntl, pty, termios
        env,log=self.github_mock(deny=True)
        master,slave=pty.openpty()
        def session():
            os.setsid()
            fcntl.ioctl(slave,termios.TIOCSCTTY,0)
        process=subprocess.Popen(['bash',str(self.script),'--repo','https://github.com/kuonanhong/AERO_Explorer.git'],cwd=self.package,env=env,stdin=slave,stdout=slave,stderr=slave,preexec_fn=session)
        os.close(slave)
        process.wait(timeout=20)
        output=b''
        while True:
            try:
                chunk=os.read(master,4096)
                if not chunk:break
                output+=chunk
            except OSError as e:
                if e.errno != errno.EIO:raise
                break
        os.close(master)
        self.assertEqual(process.returncode,0,output.decode())
        self.assertIn('auth login --hostname github.com --git-protocol https --web',log.read_text())
        self.assertIn('上傳成功',output.decode())
        self.assertEqual(self.run_cmd('git','-C',str(self.work),'rev-parse','HEAD'),self.head())

    def test_env_token_denied_is_not_echoed(self):
        env,log=self.github_mock(deny=True)
        env['GH_TOKEN']='SECRET-DO-NOT-PRINT'
        out=self.upload(env=env,github=True,ok=False)
        self.assertIn('unset GH_TOKEN',out)
        self.assertNotIn('SECRET-DO-NOT-PRINT',out)

if __name__=='__main__':
    unittest.main(verbosity=2)
