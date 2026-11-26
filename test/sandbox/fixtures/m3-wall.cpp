#include <cstdio>
#include <sys/wait.h>
#include <unistd.h>
int main() {
  pid_t child = fork();
  if (child < 0) return 20;
  if (child == 0) { sleep(20); _exit(0); }
  std::printf("CHILD_STARTED=%ld\n", static_cast<long>(child));
  std::fflush(stdout);
  sleep(20);
  waitpid(child, nullptr, 0);
}
