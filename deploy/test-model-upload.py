"""Offline adapter tests: fake hf/aws executables, no external uploads."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).with_name('upload-models.sh')

class UploadTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='aero-upload-test-')
        self.base=Path(self.temp.name)
        self.models=self.base/'model files'
        self.models.mkdir()
        (self.models/'README.md').write_text('Test model, public domain, revision 1\n')
        (self.models/'model.onnx').write_bytes(b'test bytes')
        self.bin=self.base/'bin'
        self.bin.mkdir()
        self.log=self.base/'commands.jsonl'
        self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],'AERO_TEST_COMMAND_LOG':str(self.log)}
        for name in ['hf','aws']:
            f=self.bin/name
            f.write_text('#!/usr/bin/env python3\nimport os,sys,json\nwith open(os.environ["AERO_TEST_COMMAND_LOG"],"a") as f: f.write(json.dumps(sys.argv)+"\\n")\n')
            f.chmod(0o755)

    def tearDown(self): self.temp.cleanup()

    def call(self,*extra,ok=True):
        result=subprocess.run(['bash',str(SCRIPT),'--models',str(self.models),*extra],env=self.env,text=True,capture_output=True)
        self.assertEqual(result.returncode==0,ok,result.stdout+result.stderr)
        return result.stdout+result.stderr

    def test_preview_never_invokes_network_cli(self):
        self.call('--provider','hf','--target','test-user/test-model')
        self.assertFalse(self.log.exists())

    def test_hf_apply_preserves_paths_and_never_deletes(self):
        self.call('--provider','hf','--target','test-user/test-model','--apply')
        commands=[json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual(commands[0][1:],['auth','whoami'])
        self.assertEqual(commands[1][1:5],['upload','test-user/test-model',str(self.models),'.'])
        self.assertNotIn('--delete',commands[1])

    def test_r2_apply_uses_named_profile_without_delete(self):
        self.call('--provider','r2','--target','aero-models/models/test','--account-id','a'*32,'--apply')
        command=json.loads(self.log.read_text())
        self.assertEqual(command[1:5],['s3','sync',str(self.models),'s3://aero-models/models/test/'])
        self.assertIn('--profile',command)
        self.assertNotIn('--delete',command)

    def test_missing_model_card_stops(self):
        (self.models/'README.md').unlink()
        self.assertIn('README.md',self.call('--provider','hf','--target','test-user/test-model','--apply',ok=False))
        self.assertFalse(self.log.exists())

    def test_secret_file_stops(self):
        (self.models/'.env').write_text('EXAMPLE=not-real\n')
        self.assertIn('credentials',self.call('--provider','hf','--target','test-user/test-model','--apply',ok=False))
        self.assertFalse(self.log.exists())

if __name__=='__main__': unittest.main(verbosity=2)
