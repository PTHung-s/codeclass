#!/usr/bin/env python3
"""SSH helper — chạy lệnh trên server qua paramiko (vì không có sshpass trên Windows)."""
import sys
import io
import paramiko

# Windows console mặc định cp1252 — ép UTF-8 để in được tiếng Việt
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

HOST = '180.93.115.104'
USER = 'root'
PASSWORD = 'fD5$@r1rC84s'

def run(cmd: str, timeout: int = 120) -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        code = stdout.channel.recv_exit_status()
        if out:
            print(out, end='' if out.endswith('\n') else '\n')
        if err:
            print('[STDERR]', err, end='' if err.endswith('\n') else '\n', file=sys.stderr)
        return code
    finally:
        client.close()

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'echo no command'
    sys.exit(run(cmd))
