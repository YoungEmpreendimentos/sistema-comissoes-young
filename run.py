# -*- coding: utf-8 -*-
"""Bootstrap: garante venv, dependências e inicia o servidor."""
import os
import sys
import subprocess

_here = os.path.dirname(os.path.abspath(__file__))
os.chdir(_here)
if _here not in sys.path:
    sys.path.insert(0, _here)

_venv = os.path.join(_here, "venv", "Scripts", "python.exe")
if not os.path.exists(_venv):
    _venv = os.path.join(_here, ".venv", "Scripts", "python.exe")

if not os.path.exists(_venv):
    subprocess.run([sys.executable, "-m", "venv", os.path.join(_here, "venv")], check=True, cwd=_here)
    _venv = os.path.join(_here, "venv", "Scripts", "python.exe")

_req = os.path.join(_here, "requirements.txt")
if os.path.exists(_req):
    subprocess.run([_venv, "-m", "pip", "install", "-q", "--upgrade", "-r", _req], cwd=_here)

_start = os.path.join(_here, "start_server.py")
os.execv(_venv, [_venv, _start])
