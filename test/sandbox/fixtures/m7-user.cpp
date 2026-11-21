#include <cstdio>
#include <fstream>
#include <string>
#include <sys/prctl.h>
#include <unistd.h>
int main() {
  if (getuid() == 0 || geteuid() == 0 || setuid(0) == 0) return 20;
  if (prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) != 1) return 21;
  std::ifstream status("/proc/self/status");
  std::string line;
  bool no_caps = false;
  while (std::getline(status, line))
    if (line.rfind("CapEff:", 0) == 0)
      no_caps = line.find("0000000000000000") != std::string::npos;
  if (!no_caps) return 22;
  std::puts("NONROOT_NO_ESCALATION");
}
