"""Drive the local preview with the agent-browser CLI and fake credentials.

Requires tools/mock-api.py and Expo at localhost:8088. Every action resolves
an up-to-date accessibility snapshot. Uses the isolated 'quotadeck' session.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = shutil.which('agent-browser')

def run(*args):
    proc = subprocess.run([CLI, '--session', 'quotadeck', *args], capture_output=True, encoding='utf-8', errors='replace', cwd=ROOT, timeout=35)
    if proc.returncode: raise RuntimeError(proc.stdout + proc.stderr)
    return proc.stdout

def ref(role, name):
    snapshot = run('snapshot', '-i')
    for line in snapshot.splitlines():
        if re.search(r'- ' + role + ' "' + re.escape(name) + r'"(?: |$)', line):
            match = re.search(r'ref=(e\d+)', line)
            if match: return '@' + match[1]
    raise RuntimeError('Missing ' + role + ' ' + name + '\n' + snapshot)

def click(name, role='button'):
    target = ref(role, name)
    run('scrollintoview', target)
    run('click', ref(role, name))

def fill(name, value): run('fill', ref('textbox', name), value)

if __name__ == '__main__':
    if sys.argv[1] == 'admin':
        fill('站点地址', 'http://127.0.0.1:8091/admin')
        fill('输入管理密钥', 'test-only-admin')
        click('验证连接')
        run('wait', '--text', '连接成功')
        print(run('snapshot', '-i'))
        click('测试反代 42 #42 · openai', 'checkbox')
        click('测试反代 43 #43 · openai', 'checkbox')
        click('添加 2 个账号')
        run('wait', '--text', '全部额度')
        print(run('snapshot', '-i'))
    else:
        raise SystemExit('Unknown smoke scenario')
