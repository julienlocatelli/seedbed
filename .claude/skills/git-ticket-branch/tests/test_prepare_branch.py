import fcntl
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/prepare_branch.py'
PAGE = '00000000-0000-4000-8000-000000000011'


class BranchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / 'repo'
        self.repo.mkdir()
        self.git('init', '-b', 'main')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                 'commit', '--allow-empty', '-m', 'fixture')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.PIPE, text=True).strip()

    def run_helper(self, *extra, expected=None):
        r = subprocess.run(['python3', str(SCRIPT), '--repo', str(self.repo), '--page-id', PAGE,
                            '--ticket', '11', '--type', 'chore', '--description', 'specify-process', *extra],
                           capture_output=True, text=True)
        d = json.loads(r.stdout)
        if expected:
            self.assertNotEqual(r.returncode, 0)
            self.assertEqual(d['error']['code'], expected)
        else:
            self.assertEqual(r.returncode, 0, d)
        self.assertFalse((self.repo / 'specs').exists())
        return d

    def test_creation_resume(self):
        sha = self.git('rev-parse', 'main')
        self.assertEqual(self.run_helper()['BASE_COMMIT'], sha)
        for _ in range(3):
            self.assertEqual(self.run_helper()['ACTION'], 'reused')
        self.assertEqual(self.git('rev-parse', 'HEAD'), sha)

    def test_types(self):
        for i, kind in enumerate(('feature', 'fix', 'bugfix', 'hotfix', 'release', 'docs', 'chore')):
            self.git('switch', 'main')
            self.assertTrue(self.run_helper('--type', kind, '--ticket', str(20+i))['BRANCH_NAME'].startswith(kind+'/'))

    def test_missing_main(self):
        self.git('branch', '-m', 'other')
        self.run_helper(expected='MAIN_MISSING')

    def test_invalid(self):
        for a in [('--ticket', '0'), ('--ticket', '1;echo'), ('--page-id', 'bad'),
                  ('--description', '../oops'), ('--description', 'one-two-three-four-five'),
                  ('--branch-name', 'feature/11-other')]:
            self.run_helper(*a, expected='INVALID_INPUT')

    def test_dirty(self):
        f = self.repo / 'work.txt'
        f.write_text('precious')
        self.run_helper(expected='DIRTY_WORKTREE')
        self.assertEqual(f.read_text(), 'precious')
        f.unlink()
        self.run_helper()
        f.write_text('precious')
        self.assertEqual(self.run_helper()['ACTION'], 'reused')
        self.assertEqual(f.read_text(), 'precious')

    def test_detached_operation(self):
        self.git('checkout', '--detach')
        self.run_helper(expected='DETACHED_HEAD')
        self.git('switch', 'main')
        (self.repo/'.git'/'CHERRY_PICK_HEAD').write_text(self.git('rev-parse', 'HEAD'))
        self.run_helper(expected='GIT_OPERATION_IN_PROGRESS')

    def test_remote(self):
        self.git('update-ref', 'refs/remotes/origin/chore/11-specify-process', self.git('rev-parse', 'HEAD'))
        self.run_helper(expected='REMOTE_ONLY_BRANCH')

    def test_worktree(self):
        self.git('branch', 'chore/11-specify-process')
        self.git('worktree', 'add', str(Path(self.tmp.name)/'other'), 'chore/11-specify-process')
        self.run_helper('--branch-name', 'chore/11-specify-process', expected='BRANCH_IN_OTHER_WORKTREE')

    def test_lock(self):
        with (self.repo/'.git'/'specify-branch.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.run_helper(expected='CONCURRENT_RUN')

    def test_association(self):
        self.run_helper()
        self.git('switch', 'main')
        a = Path(self.tmp.name)/'association.json'
        a.write_text(json.dumps({'page_id':PAGE, 'ticket_number':11, 'branch_name':'chore/11-specify-process'}))
        self.assertEqual(self.run_helper('--association',str(a),'--description','new-title')['ACTION'],'reused')
        a.write_text(json.dumps({'page_id':'00000000-0000-4000-8000-000000000012'}))
        self.run_helper('--association',str(a),expected='ASSOCIATION_CONFLICT')

    def test_candidates(self):
        self.git('branch','chore/11-first')
        self.git('branch','fix/11-second')
        self.run_helper(expected='ASSOCIATION_CONFLICT')

    def test_not_repo(self):
        p=Path(self.tmp.name)/'empty'
        p.mkdir()
        self.run_helper('--repo',str(p),expected='NOT_GIT_REPOSITORY')

    def test_tracked_dirty_preserves_head(self):
        f = self.repo / 'tracked'
        f.write_text('original')
        self.git('add', 'tracked')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'tracked')
        sha = self.git('rev-parse', 'HEAD')
        f.write_text('modified')
        d = self.run_helper(expected='DIRTY_WORKTREE')
        self.assertIn('tracked', d['error']['affected_files'])
        self.assertEqual(self.git('rev-parse', 'HEAD'), sha)
        self.assertEqual(f.read_text(), 'modified')

    def test_operation_markers(self):
        for marker in ('MERGE_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer'):
            p = self.repo / '.git' / marker
            p.mkdir() if marker in ('rebase-merge', 'rebase-apply', 'sequencer') else p.write_text('fixture')
            self.run_helper(expected='GIT_OPERATION_IN_PROGRESS')
            p.rmdir() if p.is_dir() else p.unlink()

    def test_legacy_and_collisions(self):
        self.run_helper()
        specs = self.repo / 'specs' / '001-old'
        specs.mkdir(parents=True)
        a = specs / 'notion-source.json'
        a.write_text(json.dumps({'page_id': PAGE, 'url': 'https://app.notion.com/p/'+PAGE}))
        # This test intentionally has an existing specs directory.
        r = subprocess.run(['python3', str(SCRIPT), '--repo', str(self.repo), '--page-id', PAGE,
                            '--ticket', '11', '--type', 'chore', '--description', 'specify-process'], capture_output=True, text=True)
        self.assertEqual(json.loads(r.stdout)['ACTION'], 'reused')
        self.assertIsNone(json.loads(r.stdout)['BASE_COMMIT'])
        b = self.repo / 'specs' / '002-other'
        b.mkdir()
        (b/'notion-source.json').write_text(a.read_text())
        r = subprocess.run(['python3', str(SCRIPT), '--repo', str(self.repo), '--page-id', PAGE,
                            '--ticket', '11', '--type', 'chore', '--description', 'specify-process'], capture_output=True, text=True)
        self.assertEqual(json.loads(r.stdout)['error']['code'], 'ASSOCIATION_CONFLICT')

    def test_switch_hook_not_executed(self):
        marker = self.repo / 'hook-ran'
        hook = self.repo / '.git' / 'hooks' / 'post-checkout'
        hook.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\n')
        hook.chmod(0o755)
        self.run_helper()
        self.assertFalse(marker.exists())

    def test_explicit_candidate_unknown_origin(self):
        self.git('branch', 'chore/11-specify-process')
        d = self.run_helper('--branch-name', 'chore/11-specify-process')
        self.assertEqual(d['ACTION'], 'reused')
        self.assertIsNone(d['BASE_COMMIT'])
