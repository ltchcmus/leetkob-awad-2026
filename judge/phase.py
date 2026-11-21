"""Trusted transport inside the unprivileged container; never used on the host."""
import base64
import json
import math
import os
import resource
import subprocess
import sys

ENV = {"PATH": "/usr/bin:/bin", "HOME": "/work", "LANG": "C.UTF-8", "TMPDIR": "/work"}
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
        compiled = subprocess.run(
            ["/usr/bin/g++", "-std=c++17", "-O2", "/work/main.cpp", "-o", "/work/program"],
            stdin=subprocess.DEVNULL, stdout=sys.stderr, stderr=sys.stderr,
            env=ENV, check=False,
        )
    except FileNotFoundError:
        sys.exit(125)
    if compiled.returncode != 0:
        sys.exit(1)
    with open("/work/program", "rb") as artifact:
        data = artifact.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        sys.exit(125)
    # Artifact transport is separate from bounded compiler diagnostics on stderr.
    sys.stdout.buffer.write(base64.b64encode(data))
    sys.stdout.buffer.flush()
else:
    data = base64.b64decode(payload["artifact"], validate=True)
    with open("/work/program", "wb") as executable:
        executable.write(data)
    os.chmod("/work/program", 0o500)
    with open("/work/input", "wb") as input_file:
        input_file.write(payload["input"].encode("utf-8"))
    input_fd = os.open("/work/input", os.O_RDONLY)
    os.dup2(input_fd, 0)
    os.close(input_fd)
    # PID 1 becomes the submission; no trusted result marker is parsed from its output.
    os.execve("/work/program", ["/work/program"], ENV)
