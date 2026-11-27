#include <unistd.h>
int main() {
  char chunk[4096];
  for (char& c : chunk) c = 'X';
  // 32 MiB fallback bound; runner must stop at its much smaller combined byte cap.
  for (int i = 0; i < 8192; ++i) if (write(1, chunk, sizeof(chunk)) < 0) return 1;
}
