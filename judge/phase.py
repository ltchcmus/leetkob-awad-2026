"""Trusted transport inside the unprivileged container; never used on the host."""
import base64
import json
import math
import os
import resource
import subprocess
import sys

ENV = {"PATH": "/usr/bin:/bin", "HOME": "/work", "LANG": "C.UTF-8", "TMPDIR": "/work"}
PROGRAM = "/work/program"


def oom_kills():
    try:
        with open("/sys/fs/cgroup/memory.events", encoding="ascii") as events:
            return int(dict(line.split() for line in events)["oom_kill"])
    except (OSError, KeyError, ValueError):
        return None


sys.stdout.write("READY\n")
sys.stdout.flush()
payload = json.load(sys.stdin)
# Defense in depth. The outer controller enforces aggregate cgroup CPU separately.
seconds = math.ceil(payload["cpuTimeMs"] / 1000)
resource.setrlimit(resource.RLIMIT_CPU, (seconds + 1, seconds + 2))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
os.umask(0o077)
if sys.argv[1] == "compile":
    with open("/work/main.cpp", "wb") as source:
        source.write(payload["source"].encode("utf-8"))
    try:
        before_oom = oom_kills()
        compiled = subprocess.run(
            ["/usr/bin/g++", "-std=c++17", "-O2", "/work/main.cpp", "-o", PROGRAM],
            stdin=subprocess.DEVNULL, stdout=sys.stderr, stderr=sys.stderr,
            env=ENV, check=False,
        )
    except FileNotFoundError:
        sys.exit(125)
    if compiled.returncode != 0:
        after_oom = oom_kills()
        if before_oom is not None and after_oom is not None and after_oom > before_oom:
            # The kernel may kill only a compiler subprocess, leaving PID 1 alive.
            sys.exit(124)
        sys.exit(1)
    with open(PROGRAM, "rb") as artifact:
        data = artifact.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        sys.exit(125)
    # Artifact transport is separate from bounded compiler diagnostics on stderr.
    sys.stdout.buffer.write(base64.b64encode(data))
    sys.stdout.buffer.flush()
else:
    data = base64.b64decode(payload["artifact"], validate=True)
    with open(PROGRAM, "wb") as executable:
        executable.write(data)
    os.chmod(PROGRAM, 0o500)
    with open("/work/input", "wb") as input_file:
        input_file.write(payload["input"].encode("utf-8"))
    input_fd = os.open("/work/input", os.O_RDONLY)
    os.dup2(input_fd, 0)
    os.close(input_fd)
    # PID 1 becomes the submission; no trusted result marker is parsed from its output.
    os.execve(PROGRAM, [PROGRAM], ENV)
