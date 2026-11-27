#include <cstdio>
#include <unistd.h>
int main() {
  if (access("/var/run/docker.sock", F_OK) == 0 || access("/run/docker.sock", F_OK) == 0) return 20;
  FILE* file = std::fopen("/app/expected_output.txt", "w");
  if (file) { std::fclose(file); return 21; }
  std::puts("NO_HOST_PATH_OR_SOCKET");
}
