#include <cerrno>
#include <cstdio>
#include <sys/wait.h>
#include <unistd.h>
int main() {
  int created = 0, blocked = 0, reaped = 0;
  // Bounded test, never a recursive fork bomb. Still only run inside isolation.
  for (int i = 0; i < 80; ++i) {
    pid_t child = fork();
    if (child == 0) { sleep(2); _exit(0); }
    if (child < 0) { blocked = (errno == EAGAIN); break; }
    ++created;
  }
  while (waitpid(-1, nullptr, 0) > 0) ++reaped;
  std::fprintf(stderr, "created=%d blocked=%d reaped=%d\n", created, blocked, reaped);
  std::puts("PIDS_LIMIT_ENFORCED");
  return blocked && created > 0 && reaped == created ? 0 : 20;
}
