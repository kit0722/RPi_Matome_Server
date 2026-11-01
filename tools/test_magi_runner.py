#!/usr/bin/env python3
"""No project sources required. Verify that MAGI never reports FAIL/SKIP as PASS."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("magi_runner", Path(__file__).with_name("magi_runner.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / 'Tools').mkdir()
        self.root = root

    def make_plan(self, checks):
        path = self.root / 'Tools' / 'magi_plan.json'
        path.write_text(json.dumps({'schema': 1, 'checks': checks}), encoding='utf8')
        return path

    def make(self, id, script, required=True, depends_on=(), category='safety'):
        return {'id': id, 'category': category, 'required': required,
                'command': [sys.executable, '-c', script], 'depends_on': list(depends_on)}

    def test_collects_multiple_failures(self):
        p = self.make_plan([self.make('f1', 'raise SystemExit(1)'), self.make('ok', 'print("OK")'), self.make('f2', 'raise SystemExit(3)')])
        code = runner.run(p, self.root / '.build/magi')
        out = json.loads((self.root / '.build/magi/report.json').read_text())
        self.assertEqual((code, out['summary']), (1, {'PASS': 1, 'FAIL': 2, 'SKIP': 0}))
        self.assertEqual(out['overall'], 'FAIL')

    def test_required_skip_incomplete(self):
        missing = self.make('unavailable', 'print(5)')
        missing['command'] = ['unavailable-magi-exe-99', 'hey']
        p = self.make_plan([missing])
        self.assertEqual(runner.run(p, self.root / 'out'), 2)
        self.assertEqual(json.loads((self.root / 'out/report.json').read_text())['overall'], 'INCOMPLETE')

    def test_optional_skip_remains_visible(self):
        missing = self.make('optional', 'print(5)', required=False)
        missing['command'] = ['unavailable-magi-exe-99']
        p = self.make_plan([self.make('ok', 'pass'), missing])
        self.assertEqual(runner.run(p, self.root / 'out'), 2)
        out = json.loads((self.root / 'out/report.json').read_text())
        self.assertEqual(out['summary']['SKIP'], 1)
        self.assertEqual(out['overall'], 'INCOMPLETE')

    def test_failed_dependency_not_run(self):
        sentinel = self.root / 'must_not_write'
        p = self.make_plan([self.make('f1', 'exit(1)'), self.make('blocked', f'open({str(sentinel)!r}, "w").write("bad")',depends_on=['f1'])])
        self.assertEqual(runner.run(p, self.root / 'out'), 1)
        self.assertFalse(sentinel.exists())
        self.assertEqual(json.loads((self.root / 'out/report.json').read_text())['results'][1]['status'], 'SKIP')

    def test_duplicate_and_forward_dependencies_fail(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            runner.validate({'schema':1, 'checks':[self.make('foo','pass'), self.make('foo','pass')]})
        with self.assertRaisesRegex(ValueError, 'ordered'):
            runner.validate({'schema':1, 'checks':[self.make('bar','pass', depends_on=['baz']), self.make('baz','pass')]})

    def test_timeout_is_fail(self):
        a = self.make('long','import time; time.sleep(1)')
        a['timeout'] = 0.01
        p = self.make_plan([a])
        self.assertEqual(runner.run(p, self.root / 'out'), 1)

    def test_capture_records_binary_inspection(self):
        a = self.make('macho','print("mach-header")')
        a['capture_path'] = '.build/verification/macho.txt'
        p = self.make_plan([a])
        self.assertEqual(runner.run(p, self.root / 'out'), 0)
        self.assertEqual((self.root / '.build/verification/macho.txt').read_text().strip(), 'mach-header')

    def test_skip_clears_stale_log(self):
        a = self.make('x', 'print("ok")')
        plan = self.make_plan([a])
        out = self.root / 'out'
        self.assertEqual(runner.run(plan, out), 0)
        self.assertTrue((out / 'x.log').exists())
        a['command'] = ['unavailable-magi-exe-99']
        plan = self.make_plan([a])
        self.assertEqual(runner.run(plan, out), 2)
        self.assertFalse((out / 'x.log').exists())

    def test_failed_capture_does_not_overwrite_good_binary_header(self):
        target = self.root / '.build/verification/macho.txt'
        target.parent.mkdir(parents=True)
        target.write_text('known-good')
        a = self.make('macho', 'raise SystemExit(7)')
        a['capture_path'] = '.build/verification/macho.txt'
        self.assertEqual(runner.run(self.make_plan([a]), self.root / 'out'), 1)
        self.assertEqual(target.read_text(), 'known-good')

    def test_boolean_timeout_rejected(self):
        a = self.make('bad', 'pass')
        a['timeout'] = True
        with self.assertRaisesRegex(ValueError, 'timeout'):
            runner.validate({'schema':1, 'checks':[a]})

    def test_ios_sdk_absent_is_skip_not_false_compile_fail(self):
        sentinel = self.root / 'compiled'
        a = self.make('ios', f'open({str(sentinel)!r}, "w").write("wrong")',category='build')
        a['preflight'] = {'command':[sys.executable,'-c','print("linux only")'],'contains':'arm64-apple-ios'}
        self.assertEqual(runner.run(self.make_plan([a]), self.root / 'out'), 2)
        self.assertFalse(sentinel.exists())
        self.assertEqual(json.loads((self.root / 'out/report.json').read_text())['results'][0]['status'],'SKIP')

    def test_ios_sdk_present_runs_command(self):
        a = self.make('ios', 'print("compiled")',category='build')
        a['preflight'] = {'command':[sys.executable,'-c','print("arm64-apple-ios")'],'contains':'arm64-apple-ios'}
        self.assertEqual(runner.run(self.make_plan([a]), self.root / 'out'), 0)

    def test_bad_preflight_rejected(self):
        a = self.make('ios', 'pass')
        a['preflight'] = {'command':[], 'contains':'something'}
        with self.assertRaisesRegex(ValueError, 'preflight'):
            runner.validate({'schema':1,'checks':[a]})

    def test_bad_plan_does_not_run_command(self):
        with self.assertRaisesRegex(ValueError, 'invalid'):
            runner.validate({'schema':1, 'checks':[self.make('../bad','pass')]})

if __name__=='__main__':
    unittest.main(verbosity=2)
