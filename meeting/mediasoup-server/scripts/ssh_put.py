#!/usr/bin/env python3
"""Upload file(s) lên server qua SFTP."""
import sys
import io
import os
import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

HOST = '180.93.115.104'
USER = 'root'
PASSWORD = 'fD5$@r1rC84s'

def upload(local_path: str, remote_path: str) -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    try:
        sftp = client.open_sftp()
        sftp.put(local_path, remote_path)
        size = sftp.stat(remote_path).st_size
        print(f'✅ Uploaded {local_path} → {remote_path} ({size} bytes)')
        sftp.close()
    finally:
        client.close()

if __name__ == '__main__':
    local, remote = sys.argv[1], sys.argv[2]
    upload(local, remote)
